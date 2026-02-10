// haiphen-api/src/auth.ts
export type AuthedUser = {
  login: string; // GitHub login / sub
  name?: string | null;
  avatar?: string | null;
  email?: string | null;
};

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmacSha256Verify(secret: string, data: string, sigB64Url: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sig = base64UrlToBytes(sigB64Url);
  // @ts-expect-error TS 5.7 Uint8Array<ArrayBufferLike> compat — safe at runtime
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(data));
}

export function parseCookie(req: Request, name: string): string | null {
  const h = req.headers.get("Cookie") || "";
  // simple, safe-ish cookie parsing
  const parts = h.split(";").map((x) => x.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const k = p.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(p.slice(idx + 1));
  }
  return null;
}

export type JwtClaims = {
  sub: string;
  name?: string | null;
  avatar?: string | null;
  email?: string | null;
  aud?: string | null;
  iat?: number;
  exp?: number;
  jti?: string;
};

export type VerifiedJwt = AuthedUser & { jti?: string | null };

export async function verifyUserFromJwt(token: string, jwtSecret: string): Promise<VerifiedJwt> {
  if (!token) throw Object.assign(new Error("Missing token"), { status: 401 });

  const parts = token.split(".");
  if (parts.length !== 3) throw Object.assign(new Error("Malformed JWT"), { status: 401 });

  const [hB64, pB64, sB64] = parts;
  const signed = `${hB64}.${pB64}`;

  const ok = await hmacSha256Verify(jwtSecret, signed, sB64);
  if (!ok) throw Object.assign(new Error("Invalid JWT signature"), { status: 401 });

  const payloadJson = new TextDecoder().decode(base64UrlToBytes(pB64));
  const claims = JSON.parse(payloadJson) as JwtClaims;

  if (claims.aud && claims.aud !== "haiphen-auth") {
    throw Object.assign(new Error("Invalid JWT audience"), { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) {
    throw Object.assign(new Error("Expired session"), { status: 401 });
  }

  if (!claims.sub) throw Object.assign(new Error("JWT missing sub"), { status: 401 });

  return {
    login: claims.sub,
    name: claims.name ?? null,
    avatar: claims.avatar ?? null,
    email: claims.email ?? null,
    jti: claims.jti ?? null,
  };
}

export async function requireUserFromAuthCookie(req: Request, jwtSecret: string): Promise<AuthedUser> {
  const token = parseCookie(req, "auth");
  if (!token) throw Object.assign(new Error("Missing auth cookie"), { status: 401 });

  const parts = token.split(".");
  if (parts.length !== 3) throw Object.assign(new Error("Malformed JWT"), { status: 401 });

  const [hB64, pB64, sB64] = parts;
  const signed = `${hB64}.${pB64}`;

  const ok = await hmacSha256Verify(jwtSecret, signed, sB64);
  if (!ok) throw Object.assign(new Error("Invalid JWT signature"), { status: 401 });

  const payloadJson = new TextDecoder().decode(base64UrlToBytes(pB64));
  const claims = JSON.parse(payloadJson) as JwtClaims;

  // Optional but recommended: pin the audience to your auth app
  // Your cookie shows aud = "haiphen-auth"
  if (claims.aud && claims.aud !== "haiphen-auth") {
    throw Object.assign(new Error("Invalid JWT audience"), { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) {
    throw Object.assign(new Error("Expired session"), { status: 401 });
  }

  if (!claims.sub) throw Object.assign(new Error("JWT missing sub"), { status: 401 });

  return {
    login: claims.sub,
    name: claims.name ?? null,
    avatar: claims.avatar ?? null,
    email: claims.email ?? null,
  };
}
