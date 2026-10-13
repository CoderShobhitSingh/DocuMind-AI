import path from "node:path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { HttpError } from "./rag.js";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 180;

export async function extractText(file) {
  const extension = path.extname(file.originalname).toLowerCase();

  if (extension === ".pdf") {
    try {
      const result = await pdfParse(file.buffer);
      return result.text.trim();
    } catch (error) {
      console.error("PDF text extraction failed:", error);
      throw new HttpError(422, "This PDF could not be read. Check that it is a valid, text-based PDF.");
    }
  }

  if (extension === ".docx") {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value.trim();
    } catch (error) {
      console.error("DOCX text extraction failed:", error);
      throw new HttpError(422, "This Word document could not be read. Check that it is a valid DOCX file.");
    }
  }

  return file.buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
}

export function splitIntoChunks(text) {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);

    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end);
      if (boundary > start + CHUNK_SIZE * 0.6) end = boundary;
    }

    const content = normalized.slice(start, end).trim();
    if (content) chunks.push(content);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }

  return chunks;
}
