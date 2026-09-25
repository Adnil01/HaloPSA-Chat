"use client";

import { FormEvent, KeyboardEvent, useMemo, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Confirmation = { token: string; toolName: string; args: Record<string, unknown>; summary: string };

export default function Chat() {
  const params = useMemo(() => {
    if (typeof window === "undefined") return { ticketId: "", agentId: "", ticketSummary: "", ticketDescription: "", contextSignature: "" };
    const query = new URLSearchParams(window.location.search);
    return {
      ticketId: query.get("ticket_id") || "",
      agentId: query.get("agent_id") || "",
      ticketSummary: query.get("ticket_summary") || "",
      ticketDescription: query.get("ticket_description") || "",
      contextSignature: query.get("context_signature") || "",
    };
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const suggestions = ["Summarise this ticket", "What should I do next?", "Show available actions"];

  async function requestAssistant(history: Message[], approvedAction?: Confirmation) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticketId: params.ticketId,
        agentId: params.agentId,
        ticketSummary: params.ticketSummary,
        ticketDescription: params.ticketDescription,
        contextSignature: params.contextSignature,
        messages: history,
        approvedAction: approvedAction ? { token: approvedAction.token, toolName: approvedAction.toolName, args: approvedAction.args } : undefined,
      }),
    });
    const data = await response.json();
    if (response.status === 409 && data.confirmationRequired) {
      setConfirmation(data.confirmationRequired);
      return null;
    }
    if (!response.ok) throw new Error(data.error || "The assistant could not respond.");
    return String(data.message || "");
  }

  async function sendText(text: string) {
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setInput(""); setError(""); setBusy(true);
    try {
      const message = await requestAssistant(next);
      if (message !== null) setMessages([...next, { role: "assistant", content: message }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    await sendText(input.trim());
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendText(input.trim());
    }
  }

  async function approveAction() {
    if (!confirmation || busy) return;
    setBusy(true); setError("");
    try {
      const message = await requestAssistant(messages, confirmation);
      setConfirmation(null);
      if (message !== null) setMessages([...messages, { role: "assistant", content: message }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return <section className="chat-shell" aria-label="HaloPSA AI assistant">
    <header className="chat-header">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true"><span>H</span></div>
        <div><h1>HaloPSA Assistant</h1><p>{params.ticketId ? `Ticket #${params.ticketId}` : "Ready to help with your tickets"}</p></div>
      </div>
      <div className="header-meta"><span className="status-dot" aria-hidden="true" /> <span>Secure</span></div>
    </header>
    <div className="messages" aria-live="polite">
      {messages.length === 0 && <div className="welcome">
        <div className="welcome-mark" aria-hidden="true">H</div>
        <h2>How can I help today?</h2>
        <p>Ask me to understand the current ticket, find information, or take an action in HaloPSA.</p>
        <div className="suggestions">
          {suggestions.map(suggestion => <button type="button" key={suggestion} onClick={() => void sendText(suggestion)} disabled={busy}>{suggestion}<span aria-hidden="true">→</span></button>)}
        </div>
      </div>}
      {messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${message.role}-${index}`}>
        {message.role === "assistant" && <div className="message-avatar" aria-hidden="true">H</div>}
        <div className={`bubble ${message.role}`}>{message.content}</div>
      </div>)}
      {busy && <div className="message-row assistant"><div className="message-avatar" aria-hidden="true">H</div><div className="bubble assistant typing"><span /><span /><span /></div></div>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {confirmation && <div className="confirmation" role="alert"><div><strong>Confirmation required</strong><span>{confirmation.summary}</span></div><div className="confirmation-actions"><button type="button" onClick={approveAction} disabled={busy}>Confirm</button><button type="button" onClick={() => setConfirmation(null)} disabled={busy}>Cancel</button></div></div>}
    <form onSubmit={send} className="composer">
      <div className="composer-box"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder="Message HaloPSA Assistant" rows={1} maxLength={4000} disabled={busy || Boolean(confirmation)} aria-label="Message" /><span className="composer-hint">Enter to send · Shift+Enter for a new line</span></div>
      <button className="send-button" type="submit" disabled={busy || Boolean(confirmation) || !input.trim()} aria-label="Send message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>
    </form>
  </section>;
}
