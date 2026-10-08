import { createHash } from "node:crypto";
import { RequestError, type Context } from "./security.ts";

// Redis operations are atomic across workers. Never fall back on store failure.
async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.SECURITY_REDIS_REST_URL;
  const token = process.env.SECURITY_REDIS_REST_TOKEN;
  if (!url || !token || new URL(url).protocol !== "https:") throw new RequestError(503, "The security store is unavailable.");
  const response = await fetch(url, { method: "POST", redirect: "error", cache: "no-store",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(command), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new RequestError(503, "The security store is unavailable.");
  const value = await response.json() as { result?: unknown; error?: unknown };
  if (value.error || !("result" in value)) throw new RequestError(503, "The security store is unavailable.");
  return value.result;
}

const memory = new Map<string, { expires: number; count: number }>();
function localOnly(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SECURITY_STORE === "memory";
}
function prune() {
  for (const [key, value] of memory) if (value.expires <= Date.now()) memory.delete(key);
  if (memory.size >= 10_000) throw new RequestError(503, "The security store is unavailable.");
}
function key(value: string): string { return `halochat:${createHash("sha256").update(value).digest("hex")}`; }

export async function takeApproval(nonce: string, expires: number): Promise<boolean> {
  const name = key(`approval:${nonce}`);
  const ttl = Math.ceil((expires - Date.now()) / 1000);
  if (ttl <= 0) return false;
  if (localOnly()) {
    prune();
    if (memory.has(name)) return false;
    memory.set(name, { count: 1, expires });
    return true;
  }
  return await redis(["SET", name, "1", "EX", ttl, "NX"]) === "OK";
}

export async function enforceRateLimit(context: Context): Promise<void> {
  const configured = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 30);
  const limit = Number.isInteger(configured) && configured > 0 && configured <= 1000 ? configured : 30;
  // Agent-wide key: minting another session, changing ticket, or spoofing IP does not reset it.
  const name = key(`rate:${context.aud}:${context.agentId}:${Math.floor(Date.now() / 60_000)}`);
  let count: unknown;
  if (localOnly()) {
    prune();
    const value = memory.get(name) || { count: 0, expires: Date.now() + 120_000 };
    count = ++value.count;
    memory.set(name, value);
  } else {
    count = await redis(["EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n", 1, name]);
  }
  if (typeof count !== "number" || !Number.isFinite(count)) throw new RequestError(503, "The security store is unavailable.");
  if (count > limit) throw new RequestError(429, "Too many requests. Please wait a moment.");
}
