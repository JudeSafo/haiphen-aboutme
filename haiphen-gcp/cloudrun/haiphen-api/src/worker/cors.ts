// haiphen-api/src/cors.ts
export function corsHeaders(req: Request, allowedOriginsCsv?: string): Headers {
  const origin = req.headers.get("Origin") || "";
  const allowed = (allowedOriginsCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const h = new Headers();
  // If you have an allowlist, reflect only if allowed; else reflect same-origin-ish
  const allowOrigin = allowed.length === 0 ? origin : (allowed.includes(origin) ? origin : "");
  if (allowOrigin) h.set("Access-Control-Allow-Origin", allowOrigin);

  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
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