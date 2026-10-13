import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCheck,
  FileText,
  FileUp,
  FolderOpen,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

async function api(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Can't reach the DocuMind API. Start the server with `npm run dev`, then refresh the page.");
    }
    throw error;
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error ?? "The request could not be completed.");
  }
  return response.status === 204 ? null : response.json();
}

function formatFileSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getProviderName(provider) {
  return provider === "gemini" ? "Gemini" : "OpenAI";
}

const questionSuggestions = [
  "What are the key takeaways?",
  "Summarize this document",
  "What should I pay attention to?",
];

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedIds, setSelectedIds] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState("local");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  async function refreshDocuments() {
    const result = await api("/api/documents");
    setDocuments(result);
  }

  useEffect(() => {
    Promise.all([refreshDocuments(), api("/api/health")])
      .then(([, health]) => {
        setAiEnabled(health.aiEnabled);
        setAiProvider(health.aiProvider ?? "local");
      })
      .catch((issue) => setError(issue.message));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        startNewConversation();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const visibleDocuments = documents.filter((document) =>
    document.filename.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedCount = selectedIds === null ? documents.length : selectedIds.length;

  function startNewConversation() {
    setMessages([]);
    setError("");
    inputRef.current?.focus();
  }

  function toggleDocument(id) {
    const next = new Set(selectedIds ?? documents.map((document) => document.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds([...next]);
  }

  function selectAllDocuments() {
    setSelectedIds(selectedIds === null ? [] : null);
  }

  async function uploadFiles(files) {
    const file = files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const added = await api("/api/documents", { method: "POST", body: formData });
      await refreshDocuments();
      setSelectedIds((current) =>
        current === null ? null : [...new Set([...current, added.id])],
      );
      setMessages((current) =>
        current.length
          ? current
          : [{
              role: "assistant",
              answer: `“${added.filename}” is ready. Ask me anything about it.`,
              mode: "system",
            }],
      );
    } catch (issue) {
      setError(issue.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeDocument(id) {
    setError("");
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      setDocuments((current) => current.filter((document) => document.id !== id));
      setSelectedIds((current) => current?.filter((selectedId) => selectedId !== id) ?? null);
    } catch (issue) {
      setError(issue.message);
    }
  }

  async function sendQuestion(value = question) {
    const text = value.trim();
    if (!text || busy || uploading) return;
    if (documents.length === 0) {
      setError("Upload a document before starting a conversation.");
      return;
    }
    if (selectedCount === 0) {
      setError("Select at least one document before asking a question.");
      return;
    }

    const userMessage = { role: "user", answer: text };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setError("");
    setBusy(true);

    try {
      const result = await api("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          ...(selectedIds === null ? {} : { documentIds: selectedIds }),
        }),
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", answer: result.answer, mode: result.mode },
      ]);
    } catch (issue) {
      setMessages((current) => current.filter((message) => message !== userMessage));
      setQuestion(text);
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendQuestion();
  }

  function handleQuestionKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion();
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDragging(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    uploadFiles(event.dataTransfer.files);
  }

  function handleAiSetupClick() {
    const providerName = getProviderName(aiProvider);
    setError(
      aiEnabled
        ? `${providerName} answers are enabled for this workspace.`
        : "Add your Gemini or OpenAI API key to .env and restart the server to enable AI answers.",
    );
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar${mobileLibraryOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-brand-row">
          <a className="brand" href="/" aria-label="DocuMind home">
            <span className="brand-mark">
              <BookOpen size={20} strokeWidth={2.1} />
            </span>
            <span className="brand-copy">
              documind<span>AI</span>
            </span>
          </a>
          <button
            className="mobile-library-close icon-button"
            onClick={() => setMobileLibraryOpen(false)}
            aria-label="Close library"
          >
            <X size={17} />
          </button>
        </div>

        <button className="new-chat-button" onClick={startNewConversation}>
          <Plus size={16} />
          New conversation
          <span>⌘ K</span>
        </button>

        <div className="sidebar-section">
          <div className="section-heading">
            <span>
              YOUR LIBRARY <span className="count-pill">{documents.length}</span>
            </span>
            <button
              className="icon-button add-document"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add a document"
            >
              <Plus size={16} />
            </button>
          </div>

          {documents.length > 0 && (
            <label className="search-field">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a document"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={13} />
                </button>
              )}
            </label>
          )}

          {documents.length === 0 ? (
            <div className="library-empty">
              <FolderOpen size={19} />
              <p>Your library is waiting.</p>
              <span>Upload a document to get started.</span>
            </div>
          ) : visibleDocuments.length === 0 ? (
            <p className="no-results">No documents match “{query}”.</p>
          ) : (
            <div className="document-list">
              {visibleDocuments.map((document) => {
                const isSelected = selectedIds === null || selectedIds.includes(document.id);
                return (
                  <div
                    className={`document-row${isSelected ? " selected" : ""}`}
                    key={document.id}
                  >
                    <button
                      className="document-main"
                      onClick={() => toggleDocument(document.id)}
                      title={`${isSelected ? "Remove" : "Add"} ${document.filename} ${
                        isSelected ? "from" : "to"
                      } chat`}
                    >
                      <span className={`selection-check${isSelected ? " checked" : ""}`}>
                        {isSelected && <Check size={12} />}
                      </span>
                      <span className="doc-icon">
                        <FileText size={16} />
                      </span>
                      <span className="document-copy">
                        <span className="document-name" title={document.filename}>
                          {document.filename}
                        </span>
                        <span className="document-meta">
                          {document.chunkCount} passages · {formatFileSize(document.size)}
                        </span>
                      </span>
                    </button>
                    <button
                      className="remove-document icon-button"
                      onClick={() => removeDocument(document.id)}
                      aria-label={`Remove ${document.filename}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {documents.length > 0 && (
          <button className="selection-toggle" onClick={selectAllDocuments}>
            <CheckCheck size={14} />
            {selectedIds === null ? "Deselect all" : "Select all documents"}
          </button>
        )}

        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck size={16} />
            <span>
              <strong>Your documents stay yours.</strong>
              <br />
              Stored locally on this machine.
            </span>
          </div>
          <div className="profile">
            <div className="avatar">D</div>
            <div>
              <strong>Your workspace</strong>
              <span>Personal library</span>
            </div>
            <button className="icon-button profile-menu" aria-label="Workspace options">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>Ask documents</strong>
          </div>
          <div className="topbar-right">
            <button
              className="mobile-library-button"
              onClick={() => setMobileLibraryOpen(true)}
              aria-label={`Open library with ${documents.length} documents`}
            >
              <FolderOpen size={14} />
              <span>Library</span>
              <span className="mobile-library-count">{documents.length}</span>
            </button>
            <span className={`connection-status${aiEnabled ? "" : " local"}`}>
              <span />
              {aiEnabled ? `${getProviderName(aiProvider)} connected` : "Local mode"}
            </span>
            <button className="upgrade-button" onClick={handleAiSetupClick}>
            <Sparkles size={14} />
            {aiEnabled ? "AI enabled" : "Set up AI"}
            </button>
          </div>
        </header>

        <div
          className={`chat-area${dragging ? " dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dragging && (
            <div className="drop-overlay">
              <FileUp size={25} />
              <strong>Drop to add to your library</strong>
              <span>PDF, DOCX, or TXT · up to 15 MB</span>
            </div>
          )}
          <div className="conversation">
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-eyebrow">
                  <span className="eyebrow-sparkle">
                    <Sparkles size={13} />
                  </span>
                  YOUR DOCUMENTS, IN A NEW LIGHT
                </div>
                <h1>
                  A better way to
                  <br />
                  <span>find your answers.</span>
                </h1>
                <p className="welcome-description">
                  Bring your documents. Ask the questions you actually have.
                  <br />
                  Get answers you can trace back to the source.
                </p>
                <div className="welcome-divider">
                  <span />
                  <ArrowDown size={13} />
                  <span />
                </div>

                {documents.length === 0 ? (
                  <button className="upload-card" onClick={() => fileInputRef.current?.click()}>
                    <span className="upload-icon">
                      {uploading ? (
                        <LoaderCircle className="spin" size={21} />
                      ) : (
                        <FileUp size={21} />
                      )}
                    </span>
                    <span className="upload-copy">
                      <strong>
                        {uploading ? "Reading your document…" : "Start with a document"}
                      </strong>
                      <span>Drop a file here, or browse your files</span>
                    </span>
                    <span className="upload-arrow">
                      <ArrowRight size={17} />
                    </span>
                  </button>
                ) : (
                  <div className="ready-card">
                    <span className="ready-icon">
                      <Check size={18} />
                    </span>
                    <div>
                      <strong>
                        {selectedCount} {selectedCount === 1 ? "document" : "documents"} ready to
                        explore
                      </strong>
                      <span>Choose a question below, or ask your own.</span>
                    </div>
                  </div>
                )}
                <div className="suggestions">
                  <span className="suggestion-label">A good place to start</span>
                  <div className="suggestion-list">
                    {questionSuggestions.map((suggestion, index) => (
                      <button
                        key={suggestion}
                        disabled={!documents.length || selectedCount === 0}
                        onClick={() => sendQuestion(suggestion)}
                        className="suggestion-chip"
                      >
                        <span className="suggestion-number">0{index + 1}</span>
                        {suggestion}
                        <ArrowRight size={13} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="trust-note">
                  <ShieldCheck size={13} />
                  Answers grounded in your documents. Nothing invented.
                </div>
              </div>
            ) : (
              <div className="message-list">
                <div className="conversation-title">
                  <div className="conversation-title-icon">
                    <MessageSquareText size={15} />
                  </div>
                  <span>Document conversation</span>
                  <span className="message-date">TODAY</span>
                </div>
                {messages.map((message, index) => (
                  <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                    {message.role === "assistant" && (
                      <div className="message-brand-icon"><BookOpen size={15} /></div>
                    )}
                    <div className="message-content">
                      <div className="message-author">
                        {message.role === "assistant" ? "DocuMind" : "You"}
                        {message.role === "assistant" && message.mode !== "system" && (
                          <span
                            className={`answer-mode ${
                              message.mode === "local" ? "local" : "ai"
                            }`}
                          >
                            {message.mode === "local" ? (
                              <>LOCAL · EXTRACTIVE</>
                            ) : (
                              <>
                                <Sparkles size={11} />
                                AI answer
                              </>
                            )}
                          </span>
                        )}
                      </div>
                      <p className="message-text">{message.answer}</p>
                    </div>
                  </article>
                ))}
                {busy && (
                  <div className="message assistant typing">
                    <div className="message-brand-icon">
                      <BookOpen size={15} />
                    </div>
                    <div>
                      <div className="message-author">
                        DocuMind{" "}
                        <span className="working-label">FINDING THE RELEVANT PASSAGES</span>
                      </div>
                      <div className="typing-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="composer-wrap">
            <form className={`composer${busy || !documents.length ? " disabled" : ""}`} onSubmit={handleSubmit}>
              <textarea
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleQuestionKeyDown}
                placeholder={
                  documents.length
                    ? `Ask anything about your ${
                        selectedCount === 1 ? "document" : "documents"
                      }…`
                    : "Add a document to start asking questions…"
                }
                rows={1}
                aria-label="Ask a question about your documents"
                disabled={!documents.length || busy}
              />
              <div className="composer-footer">
                <div className="composer-tools">
                  <button
                    type="button"
                    className="attach-button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach a document"
                    disabled={uploading}
                  >
                    {uploading ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                  </button>
                  <span className="composer-context">
                    <span className="context-dot" />
                    {documents.length
                      ? `${selectedCount} ${
                          selectedCount === 1 ? "source" : "sources"
                        } selected`
                      : "PDF, DOCX, TXT"}
                  </span>
                  {documents.length > 0 && selectedCount === 0 && (
                    <span className="selection-warning">Select a document first</span>
                  )}
                </div>
                <div className="composer-actions">
                  <span className="enter-hint">
                    <kbd>↵</kbd> send
                  </span>
                  <button
                    className="send-button"
                    type="submit"
                    aria-label="Send question"
                    disabled={
                      !question.trim() || busy || !documents.length || selectedCount === 0
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <ArrowUp size={17} />
                    )}
                  </button>
                </div>
              </div>
            </form>
            <p className="disclaimer">DocuMind can make mistakes. Verify important information against the original source.</p>
          </div>
        </div>
      </section>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => uploadFiles(event.target.files)}
      />
      {mobileLibraryOpen && <button className="mobile-library-overlay" onClick={() => setMobileLibraryOpen(false)} aria-label="Close library" />}
    </main>
  );
}
