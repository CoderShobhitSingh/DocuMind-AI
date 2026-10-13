import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import cors from "cors";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { extractText, splitIntoChunks } from "./lib/documents.js";
import { answerQuestion, getAiProviderName, HttpError, prepareChunks } from "./lib/rag.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(directory, "data");
const storePath = path.join(dataDirectory, "store.json");
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedExtensions = new Set([".pdf", ".txt", ".docx"]);

await mkdir(dataDirectory, { recursive: true });
let store = fs.existsSync(storePath)
  ? JSON.parse(await readFile(storePath, "utf8"))
  : { documents: [] };
let writeQueue = Promise.resolve();

async function persistStore() {
  const serialized = JSON.stringify(store, null, 2);
  const write = writeQueue
    .catch(() => {})
    .then(async () => {
      const temporaryPath = `${storePath}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporaryPath, serialized, "utf8");
      await rename(temporaryPath, storePath);
    });
  writeQueue = write;
  await write;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!allowedExtensions.has(path.extname(file.originalname).toLowerCase())) {
      callback(new HttpError(400, "Unsupported file type. Upload a PDF, TXT, or DOCX file."));
      return;
    }
    callback(null, true);
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  const aiProvider = getAiProviderName();
  response.json({
    status: "ok",
    aiEnabled: Boolean(aiProvider),
    aiProvider,
    documentCount: store.documents.length,
  });
});

app.get("/api/documents", (_request, response) => {
  response.json(
    store.documents.map(({ id, filename, size, chunks, createdAt }) => ({
      id,
      filename,
      size,
      chunkCount: chunks.length,
      createdAt,
    })),
  );
});

app.post("/api/documents", upload.single("file"), async (request, response) => {
  if (!request.file) throw new HttpError(400, "Choose a PDF, TXT, or DOCX file to upload.");

  const text = await extractText(request.file);
  if (!text) throw new HttpError(422, "No readable text was found in this document.");

  let chunks = splitIntoChunks(text);
  if (chunks.length === 0) throw new HttpError(422, "This document does not contain enough text to index.");

  chunks = await prepareChunks(chunks);
  const document = {
    id: crypto.randomUUID(),
    filename: path.basename(request.file.originalname),
    size: request.file.size,
    createdAt: new Date().toISOString(),
    chunks: chunks.map((content, index) =>
      typeof content === "string"
        ? { id: `${index}`, content }
        : {
            id: `${index}`,
            content: content.content,
            embedding: content.embedding,
            embeddingProfile: content.embeddingProfile,
          },
    ),
  };

  store.documents.unshift(document);
  try {
    await persistStore();
  } catch (error) {
    store.documents = store.documents.filter((item) => item.id !== document.id);
    throw error;
  }

  response.status(201).json({
    id: document.id,
    filename: document.filename,
    size: document.size,
    chunkCount: document.chunks.length,
    createdAt: document.createdAt,
  });
});

app.delete("/api/documents/:id", async (request, response) => {
  const idSchema = z.string().uuid();
  const id = idSchema.parse(request.params.id);
  const previousDocuments = store.documents;
  store.documents = previousDocuments.filter((document) => document.id !== id);

  if (store.documents.length === previousDocuments.length) {
    throw new HttpError(404, "Document not found.");
  }

  try {
    await persistStore();
  } catch (error) {
    store.documents = previousDocuments;
    throw error;
  }
  response.status(204).end();
});

app.post("/api/chat", async (request, response) => {
  response.json(await answerQuestion(request.body, store.documents, persistStore));
});

const frontendDirectory = path.join(directory, "..", "dist");
if (fs.existsSync(frontendDirectory)) {
  app.use(express.static(frontendDirectory));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(frontendDirectory, "index.html")));
}

app.use((error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: error.issues[0]?.message ?? "Invalid request." });
    return;
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "That file is too large. The maximum upload size is 15 MB."
      : "The upload could not be processed. Please try again.";
    response.status(400).json({ error: message });
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  console.error("Request failed:", error);
  response.status(500).json({ error: "Something went wrong while processing your request. Please try again." });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`DocuMind API listening on http://localhost:${port}`);
});
