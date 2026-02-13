// haiphen-api/src/cors.ts

const DEFAULT_ALLOWED = [
  "https://haiphen.io",
  "https://www.haiphen.io",
  "https://app.haiphen.io",
  "https://auth.haiphen.io",
];

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function corsHeaders(req: Request, allowedOriginsCsv?: string): Headers {
  const origin = req.headers.get("Origin") || "";
  const allowed = (allowedOriginsCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Fail-closed: if no allowlist configured, use strict defaults — never reflect arbitrary origin
  const effectiveAllowed = allowed.length > 0 ? allowed : DEFAULT_ALLOWED;

  // Allow localhost for dev
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    effectiveAllowed.push(origin);
  }

  const h = new Headers();
  const allowOrigin = effectiveAllowed.includes(origin) ? origin : "";
  if (allowOrigin) h.set("Access-Control-Allow-Origin", allowOrigin);

  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");

  // Append security headers to every response
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);

  return h;
}

export function withCors(req: Request, res: Response, allowedOriginsCsv?: string): Response {
  const h = corsHeaders(req, allowedOriginsCsv);
  const out = new Response(res.body, res);
  h.forEach((v, k) => out.headers.set(k, v));
  return out;
}

export function handleOptions(req: Request, allowedOriginsCsv?: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req, allowedOriginsCsv) });
}