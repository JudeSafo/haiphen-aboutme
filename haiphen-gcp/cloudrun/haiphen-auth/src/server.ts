// ---------------------------------------------------------------------------
// haiphen-auth — GCP Cloud Run entry point
//
// Express server that wraps the CF Worker's fetch() handler. Builds a
// synthetic env with Firestore-backed D1 and KV adapters + secrets from
// Secret Manager so the original auth worker code runs unmodified.
// ---------------------------------------------------------------------------

import express from "express";
import { Firestore } from "@google-cloud/firestore";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { FirestoreD1Adapter } from "./shared/firestore-d1.js";
import { FirestoreKVAdapter } from "./shared/firestore-kv.js";

// The worker module is copied in by the build script as an ESM .js file.
// We dynamic-import it so the build script can copy the raw JS without TS needing to parse it.
let _workerModule: typeof import("./worker/index.js") | null = null;

async function getWorkerModule() {
  if (!_workerModule) {
    _workerModule = await import("./worker/index.js");
  }
  return _workerModule!;
}

// ── Singletons ──────────────────────────────────────────────────────────────

let _firestore: Firestore | null = null;
function getFirestore(): Firestore {
  if (!_firestore) _firestore = new Firestore();
  return _firestore;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || "united-lane-361102";

const SECRET_NAMES = [
  "HAIPHEN_JWT_SECRET",
  "HAIPHEN_SENDGRID_API_KEY",
  "HAIPHEN_GITHUB_CLIENT_ID",
  "HAIPHEN_GITHUB_CLIENT_SECRET",
  "HAIPHEN_GOOGLE_CLIENT_ID",
  "HAIPHEN_GOOGLE_CLIENT_SECRET",
];

let _secrets: Record<string, string> | null = null;

async function loadSecrets(): Promise<Record<string, string>> {
  if (_secrets) return _secrets;
  const client = new SecretManagerServiceClient();
  const secrets: Record<string, string> = {};
  for (const name of SECRET_NAMES) {
    try {
      const [version] = await client.accessSecretVersion({
        name: `projects/${PROJECT_ID}/secrets/${name}/versions/latest`,
      });
      secrets[name] = version.payload?.data?.toString() ?? "";
    } catch {
      console.warn(`Secret ${name} not found`);
    }
  }
  _secrets = secrets;
  return secrets;
}

// ── Env builder ─────────────────────────────────────────────────────────────

async function buildEnv() {
  const db = getFirestore();
  const secrets = await loadSecrets();

  return {
    DB: new FirestoreD1Adapter(db),
    REVOKE_KV: new FirestoreKVAdapter(db, "revoke_kv"),
    ENTITLE_KV: new FirestoreKVAdapter(db, "entitle_kv"),
    JWT_SECRET: secrets.HAIPHEN_JWT_SECRET ?? "",
    SENDGRID_API_KEY: secrets.HAIPHEN_SENDGRID_API_KEY ?? "",
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? secrets.HAIPHEN_GITHUB_CLIENT_ID ?? "",
    GITHUB_CLIENT_SECRET: secrets.HAIPHEN_GITHUB_CLIENT_SECRET ?? "",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? secrets.HAIPHEN_GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: secrets.HAIPHEN_GOOGLE_CLIENT_SECRET ?? "",
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ?? "https://auth.haiphen.io/callback/google",
    OWNER_EMAIL: process.env.OWNER_EMAIL ?? "jude@haiphen.io",
    FROM_EMAIL: process.env.FROM_EMAIL ?? "jude@haiphen.io",
    FROM_NAME: process.env.FROM_NAME ?? "Haiphen",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io",
  };
}

// ── Express → Web Request/Response adapter ──────────────────────────────────

function expressToWebRequest(req: express.Request): Request {
  const protocol = req.protocol || "https";
  // During failover, requests arrive via auth.haiphen.io DNS CNAME → Cloud Run.
  // Use the original Host header so the worker's hostname dispatch works.
  const host = req.get("host") || "auth.haiphen.io";
  const url = `${protocol}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (typeof val === "string") headers.set(key, val);
    else if (Array.isArray(val)) headers.set(key, val.join(", "));
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody && req.body
    ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body))
    : undefined;

  return new Request(url, { method: req.method, headers, body });
}

async function webResponseToExpress(webRes: Response, res: express.Response): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    // Skip hop-by-hop headers
    if (key.toLowerCase() !== "transfer-encoding") {
      res.setHeader(key, value);
    }
  });
  const text = await webRes.text();
  res.send(text);
}

// ── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (doesn't need auth env)
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "haiphen-auth", runtime: "gcp-cloudrun" });
});

// Cache env promise across requests (warm instances)
let _envPromise: Promise<any> | null = null;

app.all("*", async (req: express.Request, res: express.Response) => {
  try {
    if (!_envPromise) _envPromise = buildEnv();
    const env = await _envPromise;
    const workerModule = await getWorkerModule();

    const webReq = expressToWebRequest(req);
    // Provide a minimal ctx (waitUntil is a no-op in Cloud Run)
    const ctx = { waitUntil: (_p: Promise<any>) => {} };
    const webRes = await workerModule.default.fetch(webReq, env, ctx);
    await webResponseToExpress(webRes, res);
  } catch (err) {
    console.error("Auth handler error:", err);
    res.status(500).json({ error: { code: "internal", message: "Internal error" } });
  }
});

const PORT = parseInt(process.env.PORT ?? "8080", 10);
app.listen(PORT, () => {
  console.log(`haiphen-auth Cloud Run listening on port ${PORT}`);
});
