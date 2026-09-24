import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type McpTool = { name: string; description?: string; inputSchema?: Record<string, unknown>; readOnly?: boolean; write?: boolean; annotations?: { readOnlyHint?: boolean } };

type OAuthToken = { accessToken: string; expiresAt: number };
let cachedToken: OAuthToken | undefined;
let tokenPromise: Promise<string> | undefined;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function timeoutMs() {
  const parsed = Number(process.env.MCP_TIMEOUT_MS || 15000);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 60000 ? parsed : 15000;
}

async function getHaloAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.accessToken;

  const tokenUrl = new URL(requiredEnv("HALO_TOKEN_URL"));
  if (tokenUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("HALO_TOKEN_URL must use HTTPS in production");
  }

  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: requiredEnv("HALO_CLIENT_ID"),
      client_secret: requiredEnv("HALO_CLIENT_SECRET"),
    });
    if (process.env.HALO_SCOPE) body.set("scope", process.env.HALO_SCOPE);

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Halo OAuth token request failed (${response.status})`);
    const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("Halo OAuth response did not contain an access token");
    const lifetime = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3600;
    cachedToken = { accessToken: payload.access_token, expiresAt: now + lifetime * 1000 };
    return payload.access_token;
  } finally {
    clearTimeout(timer);
  }
  })();
  try { return await tokenPromise; } finally { tokenPromise = undefined; }
}

export async function withMcp<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const url = new URL(requiredEnv("MCP_URL"));
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error("MCP_URL must use HTTPS in production");
  const token = await getHaloAccessToken();
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const client = new Client({ name: "halopsa-chat-integration", version: "1.0.0" });
  try { await client.connect(transport); return await operation(client); }
  finally { await client.close().catch(() => undefined); }
}

export async function listMcpTools() { return withMcp(async client => (await client.listTools()).tools as McpTool[]); }
export async function callMcpTool(name: string, args: Record<string, unknown>) { return withMcp(client => client.callTool({ name, arguments: args })); }
