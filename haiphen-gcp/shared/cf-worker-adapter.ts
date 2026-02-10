// ---------------------------------------------------------------------------
// CF Worker → Cloud Function adapter
//
// Wraps a CF Worker's fetch(Request, env) handler into a Cloud Function
// (req, res) handler. Builds a synthetic env object with Firestore-backed
// D1 and KV adapters so the original worker code runs unmodified.
// ---------------------------------------------------------------------------

import { Firestore } from "@google-cloud/firestore";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { FirestoreD1Adapter } from "./firestore-d1";
import { FirestoreKVAdapter } from "./firestore-kv";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

// Singleton instances
let _firestore: Firestore | null = null;
let _secrets: Record<string, string> = {};
let _secretsLoaded = false;

function getFirestore(): Firestore {
  if (!_firestore) _firestore = new Firestore();
  return _firestore;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || "united-lane-361102";

async function loadSecrets(names: string[]): Promise<Record<string, string>> {
  if (_secretsLoaded) return _secrets;
  const client = new SecretManagerServiceClient();
  for (const name of names) {
    try {
      const [version] = await client.accessSecretVersion({
        name: `projects/${PROJECT_ID}/secrets/${name}/versions/latest`,
      });
      _secrets[name] = version.payload?.data?.toString() ?? "";
    } catch {
      console.warn(`Secret ${name} not found`);
    }
  }
  _secretsLoaded = true;
  return _secrets;
}

/** Env shape matching CF Worker bindings. */
export interface WorkerEnv {
  DB: FirestoreD1Adapter;
  JWT_SECRET: string;
  ALLOWED_ORIGINS: string;
  INTERNAL_TOKEN: string;
  QUOTA_API_URL: string;
  // KV namespaces (used by core workers)
  REVOKE_KV?: FirestoreKVAdapter;
  ENTITLE_KV?: FirestoreKVAdapter;
  CACHE_KV?: FirestoreKVAdapter;
  // Auth-specific
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  SENDGRID_API_KEY?: string;
  // Checkout-specific
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  API_KEY_PEPPER?: string;
  ADMIN_TOKEN?: string;
  [key: string]: unknown;
}

/**
 * Build the env object with Firestore adapters and secrets.
 *
 * @param secretNames  Which HAIPHEN_* secrets this service needs.
 * @param kvNamespaces Map of env key → Firestore collection name for KV adapters.
 */
export async function buildEnv(
  secretNames: string[] = ["HAIPHEN_JWT_SECRET", "HAIPHEN_INTERNAL_TOKEN"],
  kvNamespaces: Record<string, string> = {},
): Promise<WorkerEnv> {
  const db = getFirestore();
  const secrets = await loadSecrets(secretNames);

  const env: WorkerEnv = {
    DB: new FirestoreD1Adapter(db),
    JWT_SECRET: secrets.HAIPHEN_JWT_SECRET ?? "",
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io",
    INTERNAL_TOKEN: secrets.HAIPHEN_INTERNAL_TOKEN ?? "",
    QUOTA_API_URL: process.env.QUOTA_API_URL ?? "https://api.haiphen.io",
  };

  // Wire up KV namespaces
  for (const [key, collection] of Object.entries(kvNamespaces)) {
    (env as Record<string, unknown>)[key] = new FirestoreKVAdapter(db, collection);
  }

  // Map any other secrets
  for (const [name, value] of Object.entries(secrets)) {
    const envKey = name.replace("HAIPHEN_", "");
    if (!(envKey in env)) {
      (env as Record<string, unknown>)[envKey] = value;
    }
  }

  return env;
}

/**
 * Convert an Express request to a Web Request (for CF Worker handlers).
 */
function expressToWebRequest(req: ExpressRequest): Request {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "localhost";
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

  return new Request(url, {
    method: req.method,
    headers,
    body,
  });
}

/**
 * Write a Web Response back to Express response.
 */
async function webResponseToExpress(webRes: Response, res: ExpressResponse): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const text = await webRes.text();
  res.send(text);
}

/**
 * Create a Cloud Function handler that wraps a CF Worker's fetch handler.
 *
 * @param workerFetch  The CF Worker's fetch function: (req: Request, env: Env) => Promise<Response>
 * @param secretNames  Which secrets to load from Secret Manager.
 * @param kvNamespaces Map of env binding name → Firestore collection for KV adapters.
 */
export function createCloudFunctionHandler(
  workerFetch: (req: Request, env: WorkerEnv) => Promise<Response>,
  secretNames?: string[],
  kvNamespaces?: Record<string, string>,
): (req: ExpressRequest, res: ExpressResponse) => Promise<void> {
  let envPromise: Promise<WorkerEnv> | null = null;

  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    try {
      // Lazy-init env (cached across invocations in warm instances)
      if (!envPromise) {
        envPromise = buildEnv(secretNames, kvNamespaces);
      }
      const env = await envPromise;

      const webReq = expressToWebRequest(req);
      const webRes = await workerFetch(webReq, env);
      await webResponseToExpress(webRes, res);
    } catch (err) {
      console.error("Cloud Function handler error:", err);
      if (err instanceof Response) {
        await webResponseToExpress(err, res);
      } else {
        res.status(500).json({ error: { code: "internal", message: "Internal error" } });
      }
    }
  };
}
