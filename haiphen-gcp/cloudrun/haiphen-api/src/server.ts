// ---------------------------------------------------------------------------
// haiphen-api — GCP Cloud Run entry point
//
// Express server wrapping the CF Worker's fetch(). Builds synthetic env with:
//  - Firestore-backed D1 adapter
//  - Firestore-backed KV adapters (REVOKE_KV, CACHE_KV)
//  - Firestore-backed RateLimiterDO + QuotaDO replacements
//  - Secrets from Secret Manager
// ---------------------------------------------------------------------------

import express from "express";
import { Firestore } from "@google-cloud/firestore";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { FirestoreD1Adapter } from "./shared/firestore-d1.js";
import { FirestoreKVAdapter } from "./shared/firestore-kv.js";
import { FirestoreRateLimiterNamespace } from "./shared/firestore-rate-limiter.js";
import { FirestoreQuotaNamespace } from "./shared/firestore-quota.js";

// ── Singletons ──────────────────────────────────────────────────────────────

let _firestore: Firestore | null = null;
function getFirestore(): Firestore {
  if (!_firestore) _firestore = new Firestore();
  return _firestore;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || "united-lane-361102";

const SECRET_NAMES = [
  "HAIPHEN_JWT_SECRET",
  "HAIPHEN_API_KEY_PEPPER",
  "HAIPHEN_ADMIN_TOKEN",
  "HAIPHEN_INTERNAL_TOKEN",
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
    CACHE_KV: new FirestoreKVAdapter(db, "cache_kv"),
    RATE_LIMITER: new FirestoreRateLimiterNamespace(db),
    QUOTA_DO: new FirestoreQuotaNamespace(db),
    JWT_SECRET: secrets.HAIPHEN_JWT_SECRET ?? "",
    API_KEY_PEPPER: secrets.HAIPHEN_API_KEY_PEPPER ?? "",
    ADMIN_TOKEN: secrets.HAIPHEN_ADMIN_TOKEN ?? "",
    INTERNAL_TOKEN: secrets.HAIPHEN_INTERNAL_TOKEN ?? "",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io",
    ONBOARDING_APP_URL: process.env.ONBOARDING_APP_URL ?? "https://haiphen.io",
    ONBOARDING_DOCS_URL: process.env.ONBOARDING_DOCS_URL ?? "https://haiphen.io/#docs",
    ONBOARDING_PROFILE_URL: process.env.ONBOARDING_PROFILE_URL ?? "https://haiphen.io/#profile",
    ONBOARDING_COHORT_URL: process.env.ONBOARDING_COHORT_URL ?? "https://haiphen.io/#cohort",
  };
}

// ── Express → Web Request/Response adapter ──────────────────────────────────

function expressToWebRequest(req: express.Request): Request {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "api.haiphen.io";
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
    if (key.toLowerCase() !== "transfer-encoding") {
      res.setHeader(key, value);
    }
  });
  const text = await webRes.text();
  res.send(text);
}

// ── Worker module import ────────────────────────────────────────────────────

// The API worker is TypeScript — the build script copies + compiles all source
// files. We import the compiled default export.
let _workerModule: any = null;

async function getWorkerModule() {
  if (!_workerModule) {
    _workerModule = await import("./worker/index.js");
  }
  return _workerModule!;
}

// ── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "haiphen-api", runtime: "gcp-cloudrun" });
});

let _envPromise: Promise<any> | null = null;

app.all("*", async (req: express.Request, res: express.Response) => {
  try {
    if (!_envPromise) _envPromise = buildEnv();
    const env = await _envPromise;
    const workerModule = await getWorkerModule();

    const webReq = expressToWebRequest(req);
    const ctx = { waitUntil: (_p: Promise<any>) => {} };
    const webRes = await workerModule.default.fetch(webReq, env, ctx);
    await webResponseToExpress(webRes, res);
  } catch (err) {
    console.error("API handler error:", err);
    res.status(500).json({ error: { code: "internal", message: "Internal error" } });
  }
});

const PORT = parseInt(process.env.PORT ?? "8080", 10);
app.listen(PORT, () => {
  console.log(`haiphen-api Cloud Run listening on port ${PORT}`);
});
