// ---------------------------------------------------------------------------
// haiphen-checkout — GCP Cloud Run entry point
//
// Express server wrapping the CF Worker's fetch(). Builds synthetic env with:
//  - Firestore-backed D1 adapter
//  - Firestore-backed KV adapters (REVOKE_KV, ENTITLE_KV)
//  - StatusDO stub (WebSocket disabled during failover)
//  - Secrets from Secret Manager
// ---------------------------------------------------------------------------

import express from "express";
import { Firestore } from "@google-cloud/firestore";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { FirestoreD1Adapter } from "./shared/firestore-d1.js";
import { FirestoreKVAdapter } from "./shared/firestore-kv.js";
import { FirestoreStatusNamespace } from "./shared/firestore-status-do.js";

// ── Singletons ──────────────────────────────────────────────────────────────

let _firestore: Firestore | null = null;
function getFirestore(): Firestore {
  if (!_firestore) _firestore = new Firestore();
  return _firestore;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || "united-lane-361102";

const SECRET_NAMES = [
  "HAIPHEN_JWT_SECRET",
  "HAIPHEN_STRIPE_SECRET_KEY",
  "HAIPHEN_STRIPE_WEBHOOK_SECRET",
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
    STATUS_DO: new FirestoreStatusNamespace(db),
    REVOKE_KV: new FirestoreKVAdapter(db, "revoke_kv"),
    ENTITLE_KV: new FirestoreKVAdapter(db, "entitle_kv"),
    JWT_SECRET: secrets.HAIPHEN_JWT_SECRET ?? "",
    STRIPE_SECRET_KEY: secrets.HAIPHEN_STRIPE_SECRET_KEY ?? "",
    STRIPE_WEBHOOK_SECRET: secrets.HAIPHEN_STRIPE_WEBHOOK_SECRET ?? "",
    STRIPE_PROMO_CODE_ID: process.env.STRIPE_PROMO_CODE_ID ?? "",
    WELCOME_HMAC_SECRET: process.env.WELCOME_HMAC_SECRET ?? "",
    CONTACT_ORIGIN: process.env.CONTACT_ORIGIN ?? "https://contact.haiphen.io",
    PUBLIC_SITE_ORIGIN: process.env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io",
    CHECKOUT_SUCCESS_URL: process.env.CHECKOUT_SUCCESS_URL ?? "https://haiphen.io/#/success",
    CHECKOUT_CANCEL_URL: process.env.CHECKOUT_CANCEL_URL ?? "https://haiphen.io/#/cancel",
    ONBOARDING_REDIRECT_URL: process.env.ONBOARDING_REDIRECT_URL ?? "https://haiphen.io/#onboarding",
  };
}

// ── Express → Web Request/Response adapter ──────────────────────────────────

function expressToWebRequest(req: express.Request): Request {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "checkout.haiphen.io";
  const url = `${protocol}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (typeof val === "string") headers.set(key, val);
    else if (Array.isArray(val)) headers.set(key, val.join(", "));
  }

  // For Stripe webhooks, preserve raw body for signature verification
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

let _workerModule: any = null;

async function getWorkerModule() {
  if (!_workerModule) {
    _workerModule = await import("./worker/index.js");
  }
  return _workerModule!;
}

// ── Express app ─────────────────────────────────────────────────────────────

const app = express();

// Stripe webhooks need raw body for HMAC verification.
// We use express.raw for the webhook path and express.json for everything else.
app.use("/v1/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "haiphen-checkout", runtime: "gcp-cloudrun" });
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
    console.error("Checkout handler error:", err);
    res.status(500).json({ error: { code: "internal", message: "Internal error" } });
  }
});

const PORT = parseInt(process.env.PORT ?? "8080", 10);
app.listen(PORT, () => {
  console.log(`haiphen-checkout Cloud Run listening on port ${PORT}`);
});
