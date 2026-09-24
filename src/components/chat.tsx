"use client";

import { FormEvent, useMemo, useState } from "react";

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

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setInput(""); setError(""); setBusy(true);
    try {
      const message = await requestAssistant(next);
      if (message !== null) setMessages([...next, { role: "assistant", content: message }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setBusy(false); }
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
    <header className="chat-header"><div><h1>AI Assistant</h1><p>{params.ticketId ? `Ticket #${params.ticketId}` : "No ticket selected"}</p></div><span className="status">● Secure</span></header>
    <div className="messages" aria-live="polite">
      {messages.length === 0 && <div className="welcome"><strong>How can I help?</strong><span>Ask about this ticket or request an action in HaloPSA.</span></div>}
      {messages.map((message, index) => <div className={`bubble ${message.role}`} key={`${message.role}-${index}`}>{message.content}</div>)}
      {busy && <div className="bubble assistant">Thinking…</div>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {confirmation && <div className="confirmation" role="alert"><span>Confirm action: {confirmation.summary}</span><div><button type="button" onClick={approveAction} disabled={busy}>Confirm</button><button type="button" onClick={() => setConfirmation(null)} disabled={busy}>Cancel</button></div></div>}
    <form onSubmit={send} className="composer"><textarea value={input} onChange={event => setInput(event.target.value)} placeholder="Ask the assistant…" rows={2} maxLength={4000} disabled={busy || Boolean(confirmation)} aria-label="Message" /><button type="submit" disabled={busy || Boolean(confirmation) || !input.trim()}>Send</button></form>
    <style jsx>{`.chat-shell{display:flex;flex-direction:column;height:100vh;max-width:900px;margin:auto;background:rgba(255,255,255,.72);border:1px solid #e2e8f0}.chat-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0}.chat-header h1{font-size:17px;margin:0}.chat-header p{font-size:12px;color:#64748b;margin:4px 0 0}.status{font-size:12px;color:#15803d}.messages{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:12px}.welcome{margin:auto;display:flex;flex-direction:column;gap:8px;color:#64748b;text-align:center}.welcome strong{font-size:20px;color:inherit}.bubble{max-width:85%;padding:11px 14px;border-radius:14px;white-space:pre-wrap;line-height:1.45;font-size:14px}.bubble.user{align-self:flex-end;background:#2563eb;color:white;border-bottom-right-radius:4px}.bubble.assistant{align-self:flex-start;background:#e2e8f0;color:#0f172a;border-bottom-left-radius:4px}.composer{display:flex;gap:10px;padding:14px;border-top:1px solid #e2e8f0}.composer textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:transparent;color:inherit;outline:none}.composer textarea:focus{border-color:#2563eb}.composer button,.confirmation button{border:0;border-radius:10px;padding:8px 18px;background:#2563eb;color:white;font-weight:600}.composer button:disabled,.confirmation button:disabled{opacity:.5}.confirmation{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#fef3c7;color:#92400e;font-size:13px}.confirmation div{display:flex;gap:8px}.confirmation button:last-child{background:#64748b}.error{color:#b91c1c;font-size:13px;padding:0 16px}@media(prefers-color-scheme:dark){.chat-shell{background:rgba(15,23,42,.72);border-color:#334155}.chat-header,.composer{border-color:#334155}.bubble.assistant{background:#1e293b;color:#e2e8f0}.composer textarea{border-color:#475569}.confirmation{background:#422006;color:#fed7aa}}`}</style>
  </section>;
}
