// ---------------------------------------------------------------------------
// haiphen-auth — GCP Cloud Function entry point (gen2)
//
// Wraps the CF Auth Worker's fetch() handler with Firestore-backed
// D1 and KV adapters.  The original worker source (.js) is copied into
// src/worker/ by the build script and dynamic-imported at runtime.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";
import { FirestoreD1Adapter } from "./shared/firestore-d1";
import { FirestoreKVAdapter } from "./shared/firestore-kv";

// Lazy-init Firestore
let _db: Firestore | null = null;
function getDb(): Firestore {
  if (!_db) _db = new Firestore();
  return _db;
}

// Worker module loaded lazily — it's the original CF auth worker JS
let _workerModule: any = null;
async function getWorkerModule() {
  if (!_workerModule) {
    // @ts-ignore — .mjs extension required for ESM worker source
    _workerModule = await import("./worker/index.mjs");
  }
  return _workerModule;
}

// Build the synthetic env object that the CF auth worker expects
function buildEnv() {
  const db = getDb();
  return {
    DB:            new FirestoreD1Adapter(db),
    REVOKE_KV:     new FirestoreKVAdapter(db, "revoke_kv"),
    ENTITLE_KV:    new FirestoreKVAdapter(db, "entitle_kv"),
    JWT_SECRET:    process.env.JWT_SECRET ?? "",
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ?? "",
    GITHUB_CLIENT_ID:     process.env.GITHUB_CLIENT_ID ?? "",
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? "",
    GOOGLE_CLIENT_ID:     process.env.GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
    GOOGLE_REDIRECT_URI:  process.env.GOOGLE_REDIRECT_URI ?? "https://auth.haiphen.io/callback/google",
    OWNER_EMAIL:   process.env.OWNER_EMAIL ?? "jude@haiphen.io",
    FROM_EMAIL:    process.env.FROM_EMAIL ?? "jude@haiphen.io",
    FROM_NAME:     process.env.FROM_NAME ?? "Haiphen",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io",
  };
}

// ---------------------------------------------------------------------------
// Cloud Function entry point
// ---------------------------------------------------------------------------
ff.http("handler", async (req, res) => {
  try {
    const env = buildEnv();
    const workerModule = await getWorkerModule();

    // Convert Express request to Web Request
    const protocol = req.protocol || "https";
    // Always use auth.haiphen.io as host — the CF worker dispatches by hostname
    const host = "auth.haiphen.io";
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

    const webReq = new Request(url, { method: req.method, headers, body });

    // Call the CF worker's fetch handler
    const ctx = { waitUntil: (_p: Promise<any>) => {} };
    const webRes: Response = await workerModule.default.fetch(webReq, env, ctx);

    // Convert Web Response back to Express response
    res.status(webRes.status);
    webRes.headers.forEach((value: string, key: string) => {
      if (key.toLowerCase() !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    });
    res.send(await webRes.text());
  } catch (e) {
    if (e instanceof Response) {
      res.status(e.status);
      e.headers.forEach((value: string, key: string) => res.setHeader(key, value));
      res.send(await e.text());
    } else {
      console.error("Auth handler error:", e);
      res.status(500).json({ error: { code: "internal", message: "Internal error" } });
    }
  }
});
