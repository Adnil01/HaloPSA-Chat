import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const ancestors = (process.env.FRAME_ANCESTORS || "").split(/\s+/).filter(Boolean);
  // Exact tenant origins only; a Halo wildcard permits unrelated tenants to frame approvals.
  if (ancestors.some(value => { try { return new URL(value).origin !== value || !value.startsWith("https://") || value.includes("*"); } catch { return true; } })) {
    return new NextResponse("Invalid frame origin configuration.", { status: 503 });
  }
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' ${ancestors.join(" ")}`;
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
