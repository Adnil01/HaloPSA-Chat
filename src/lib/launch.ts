import { randomUUID } from "node:crypto";
import { numericId, signPayload, type Context } from "./security.ts";

/** SERVER ONLY. The caller must authenticate the agent and authorize the ticket/tools first. */
export function issueAuthorizedLaunch(input: { ticketId: string; agentId: string; tools: string[] }): string {
  const origin = process.env.APP_ORIGIN;
  if (!origin || new URL(origin).origin !== origin || (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))) throw new Error("Invalid APP_ORIGIN");
  if (!numericId(input.ticketId) || !numericId(input.agentId) || !Array.isArray(input.tools) || input.tools.length > 128
    || input.tools.some(tool => !/^[A-Za-z0-9_-]{1,64}$/.test(tool))) throw new Error("Invalid authorized launch context");
  const now = Math.floor(Date.now() / 1000);
  const context: Context = { v: 2, aud: origin, ticketId: input.ticketId, agentId: input.agentId,
    tools: input.tools, sessionId: randomUUID(), iat: now, exp: now + 900 };
  const url = new URL(origin);
  url.searchParams.set("ticket_id", input.ticketId);
  url.hash = new URLSearchParams({ context_token: signPayload(context, "IFRAME_CONTEXT_SECRET", "context-v2") }).toString();
  return url.toString();
}
