import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export type Context = {
  v: 2; aud: string; ticketId: string; agentId: string;
  sessionId: string; tools: string[]; iat: number; exp: number;
};
export type Message = { role: "user" | "assistant"; content: string };
export type Action = { token: string; toolName: string; args: Record<string, unknown> };

export function secret(name: string): string {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value) < 32) throw new RequestError(503, "Security configuration is incomplete.");
  return value;
}

function mac(payload: string, name: string, purpose: string): string {
  return createHmac("sha256", secret(name)).update(`${purpose}:${payload}`).digest("base64url");
}

export function signPayload(value: unknown, name: string, purpose: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${mac(payload, name, purpose)}`;
}

export function verifyPayload(token: unknown, name: string, purpose: string): Record<string, unknown> | null {
  if (typeof token !== "string" || token.length > 250_000) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const expected = Buffer.from(mac(parts[0], name, purpose));
  const provided = Buffer.from(parts[1]);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return isObject(value) ? value : null;
  } catch { return null; }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function numericId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,14}$/.test(value) && Number.isSafeInteger(Number(value));
}

export function authenticate(request: Request): Context {
  const audience = process.env.APP_ORIGIN;
  if (!audience || new URL(audience).origin !== audience || (process.env.NODE_ENV === "production" && !audience.startsWith("https://"))) throw new RequestError(503, "Security configuration is incomplete.");
  secret("IFRAME_CONTEXT_SECRET");
  secret("CONFIRMATION_SECRET");
  const origin = request.headers.get("origin");
  if (origin && origin !== audience) throw new RequestError(403, "Request origin is not permitted.");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new RequestError(403, "Request origin is not permitted.");
  const header = request.headers.get("authorization") || "";
  const value = header.startsWith("Bearer ") ? verifyPayload(header.slice(7), "IFRAME_CONTEXT_SECRET", "context-v2") : null;
  const now = Math.floor(Date.now() / 1000);
  if (!value || value.v !== 2 || value.aud !== audience || !numericId(value.ticketId) || !numericId(value.agentId)
    || typeof value.sessionId !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(value.sessionId)
    || !Number.isInteger(value.iat) || !Number.isInteger(value.exp) || Number(value.iat) > now + 30
    || Number(value.exp) <= now || Number(value.exp) - Number(value.iat) > 900 || Number(value.exp) <= Number(value.iat)
    || !Array.isArray(value.tools) || value.tools.length > 128
    || value.tools.some(tool => typeof tool !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(tool))) {
    throw new RequestError(401, "Open the assistant through an authenticated HaloPSA launch.");
  }
  return value as Context;
}

export function binding(context: Context): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

export async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RequestError(415, "JSON content is required.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RequestError(413, "The request is too large.");
  if (!request.body) throw new RequestError(400, "A request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RequestError(413, "The request is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!isObject(value)) throw new Error();
    return value;
  } catch { throw new RequestError(400, "Invalid JSON request."); }
}

export function restoreHistory(token: unknown, context: Context): Message[] {
  if (token === undefined || token === "") return [];
  const value = verifyPayload(token, "CONFIRMATION_SECRET", "history-v1");
  if (!value || value.binding !== binding(context) || value.exp !== context.exp || !Array.isArray(value.messages)
    || value.messages.length > 30 || value.messages.some(message => !isObject(message)
      || !["user", "assistant"].includes(String(message.role)) || typeof message.content !== "string" || message.content.length > 8000)) {
    throw new RequestError(403, "Conversation history is invalid. Reopen the assistant.");
  }
  return value.messages as Message[];
}

export function trimHistory(messages: Message[]): Message[] {
  const kept = messages.slice(-28);
  while (kept.length > 1 && Buffer.byteLength(JSON.stringify(kept)) > 120_000) kept.shift();
  return kept;
}

export function historyToken(messages: Message[], context: Context): string {
  return signPayload({ binding: binding(context), exp: context.exp, messages: trimHistory(messages) }, "CONFIRMATION_SECRET", "history-v1");
}

export function createConfirmation(toolCallId: string, toolName: string, args: Record<string, unknown>, context: Context, history: Message[]): string {
  return signPayload({ exp: Math.min(context.exp * 1000, Date.now() + 300_000), nonce: randomUUID(),
    binding: binding(context), history: createHash("sha256").update(JSON.stringify(history)).digest("hex"),
    toolCallId, toolName, args }, "CONFIRMATION_SECRET", "approval-v2");
}

export function verifyConfirmation(action: Action, context: Context, history: Message[]): { nonce: string; exp: number; toolCallId: string } {
  const value = verifyPayload(action.token, "CONFIRMATION_SECRET", "approval-v2");
  if (!value || typeof value.exp !== "number" || value.exp <= Date.now() || value.exp > context.exp * 1000
    || value.binding !== binding(context) || value.history !== createHash("sha256").update(JSON.stringify(history)).digest("hex")
    || value.toolName !== action.toolName || JSON.stringify(value.args) !== JSON.stringify(action.args)
    || typeof value.nonce !== "string" || typeof value.toolCallId !== "string") {
    throw new RequestError(403, "The approval is invalid or expired.");
  }
  return value as { nonce: string; exp: number; toolCallId: string };
}
