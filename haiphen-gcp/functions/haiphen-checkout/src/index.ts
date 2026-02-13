// ---------------------------------------------------------------------------
// haiphen-checkout — GCP Cloud Function entry point (gen2)
//
// Wraps the CF Checkout Worker's fetch() handler with Firestore-backed
// D1, KV, and StatusDO adapters.  The checkout worker TypeScript is compiled
// to CJS alongside this file and loaded via require().
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import * as ff from "@google-cloud/functions-framework";
import { FirestoreD1Adapter } from "./shared/firestore-d1";
import { FirestoreKVAdapter } from "./shared/firestore-kv";
import { FirestoreStatusNamespace } from "./shared/firestore-status-do";

// ---------------------------------------------------------------------------
// Lazy-init Firestore
// ---------------------------------------------------------------------------

let _db: Firestore | null = null;
function getDb(): Firestore {
  if (!_db) _db = new Firestore();
  return _db;
}

// ---------------------------------------------------------------------------
// Worker module — loaded lazily via require (CJS-to-CJS, no ESM interop)
// ---------------------------------------------------------------------------

function getWorkerModule(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("./worker/index");
}

// ---------------------------------------------------------------------------
// Build the synthetic env object that the CF checkout worker expects
// ---------------------------------------------------------------------------

function buildEnv() {
  const db = getDb();
  return {
    DB:                    new FirestoreD1Adapter(db),
    REVOKE_KV:             new FirestoreKVAdapter(db, "revoke_kv"),
    ENTITLE_KV:            new FirestoreKVAdapter(db, "entitle_kv"),
    STATUS_DO:             new FirestoreStatusNamespace(db),
    JWT_SECRET:            process.env.JWT_SECRET ?? "",
    STRIPE_SECRET_KEY:     process.env.STRIPE_SECRET_KEY ?? "",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    STRIPE_PROMO_CODE_ID:  process.env.STRIPE_PROMO_CODE_ID ?? "",
    WELCOME_HMAC_SECRET:   process.env.WELCOME_HMAC_SECRET ?? "",
    CONTACT_ORIGIN:        process.env.CONTACT_ORIGIN ?? "https://haiphen-contact.pi-307.workers.dev",
    PUBLIC_SITE_ORIGIN:    process.env.PUBLIC_SITE_ORIGIN ?? "https://haiphen.io",
    CHECKOUT_SUCCESS_URL:  process.env.CHECKOUT_SUCCESS_URL ?? "",
    CHECKOUT_CANCEL_URL:   process.env.CHECKOUT_CANCEL_URL ?? "",
    ONBOARDING_REDIRECT_URL: process.env.ONBOARDING_REDIRECT_URL ?? "",
    ALLOWED_ORIGINS:       process.env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io",
  };
}

// ---------------------------------------------------------------------------
// Cloud Function entry point
// ---------------------------------------------------------------------------

ff.http("handler", async (req, res) => {
  try {
    const env = buildEnv();
    const workerModule = getWorkerModule();

    // Convert Express request to Web Request
    const protocol = req.protocol || "https";
    // Always use checkout.haiphen.io as host — the CF worker dispatches by hostname
    const host = "checkout.haiphen.io";
    const url = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === "string") headers.set(key, val);
      else if (Array.isArray(val)) headers.set(key, val.join(", "));
    }

    // Body handling — Stripe webhooks need the raw body for HMAC verification.
    // Cloud Functions v2 provides req.rawBody (Buffer) for the original payload.
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    let body: string | undefined;

    if (hasBody) {
      if ((req as any).rawBody) {
        // rawBody is a Buffer — convert to string for the Web Request
        body = (req as any).rawBody.toString("utf-8");
      } else if (req.body) {
        body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }
    }

    const webReq = new Request(url, { method: req.method, headers, body });

    // Call the CF worker's fetch handler
    const ctx = { waitUntil: (_p: Promise<any>) => {} };
    const webRes: Response = await workerModule.default.fetch(webReq, env, ctx);

    // Convert Web Response back to Express response
    res.status(webRes.status);
    webRes.headers.forEach((value: string, key: string) => {
      // Skip transfer-encoding — Express/Cloud Functions handles this
      if (key.toLowerCase() !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    });
    res.send(await webRes.text());
  } catch (e) {
    // The checkout worker sometimes throws Response objects (e.g. from errJson patterns)
    if (e instanceof Response) {
      res.status(e.status);
      e.headers.forEach((value: string, key: string) => res.setHeader(key, value));
      res.send(await e.text());
    } else {
      console.error("Checkout handler error:", e);
      res.status(500).json({ error: { code: "internal", message: "Internal error" } });
    }
  }
});
