# DocuMind AI

DocuMind AI is a document question-answering workspace. Upload PDF, TXT, and DOCX files and ask questions about their contents. Relevant passages are retrieved internally to ground answers, without displaying search sources in the conversation.

## Requirements

- Node.js 20 or newer
- A Gemini or OpenAI API key for semantic embeddings and AI-generated answers (optional)

## Run locally

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The API runs on port `3001`.

Keep `npm run dev` running while you use the app; it starts both the frontend and API. If the server stops, the app will tell you to restart it and refresh the page.

To enable Gemini AI answers, add your Google AI Studio key to `.env`:

```dotenv
GEMINI_API_KEY=your-key
```

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Keep it in your local `.env` file, never paste it into chat or commit it. Restart `npm run dev` after changing `.env`. Gemini uses `gemini-embedding-2` for semantic retrieval and `gemini-3.8-flash` for cited answers by default; you can override either model in `.env`. Documents uploaded before configuring Gemini are automatically re-embedded the first time you ask a question about them.

Alternatively, set `OPENAI_API_KEY` for OpenAI. If both provider keys are set, Gemini takes precedence. Without either key, DocuMind uses a local TF-IDF search index and gives extractive answers with the original passages. No external AI requests are made in local mode. OpenAI model and compatible endpoint settings can be overridden in `.env`.

## Features

- Upload and remove PDF, TXT, and DOCX documents (up to 15 MB each).
- Search and select which documents to include in a conversation.
- Ground answers in semantically retrieved passages without displaying search sources or citation markers.
- Persistent, local document text and embeddings in `server/data/store.json`.
- AI-provider failures and unsupported or unreadable files are reported explicitly.
- Express API: `GET /api/health`, `GET /api/documents`, `POST /api/documents`, `DELETE /api/documents/:id`, and `POST /api/chat`.

The document store is intended for a single-user local workspace. Don't expose this development server to untrusted networks; authentication and access control are not included.

## Production build

```bash
npm run build
npm start
```

The Express server serves the built frontend when `dist/` exists.
