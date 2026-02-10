// haiphen-api/src/portal.ts
import { requireUserFromAuthCookie } from "./auth";
import { sha256Hex, uuid } from "./crypto";

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  API_KEY_PEPPER: string;
};

type PlanRow = { plan: "free" | "pro" | "enterprise"; active: number; updated_at: string };
type ApiKeyRow = {
  key_id: string;
  key_prefix: string;
  scopes: string;
  status: "active" | "revoked";
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export async function getWhoami(req: Request, env: Env) {
  const user = await requireUserFromAuthCookie(req, env.JWT_SECRET);

  // Upsert user with name/email from JWT claims
  await env.DB.prepare(
    `INSERT INTO users (user_login, name, email, last_seen_at)
     VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(user_login) DO UPDATE SET
       name = COALESCE(excluded.name, users.name),
       email = COALESCE(excluded.email, users.email),
       last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
  ).bind(user.login, user.name ?? null, user.email ?? null).run();

  // plans table is canonical here (you also have entitlements; you can unify later)
  const plan = await env.DB.prepare(
    `SELECT plan, active, updated_at FROM plans WHERE user_login = ?`
  ).bind(user.login).first<PlanRow>();

  const effectivePlan = (plan?.active ? plan.plan : "free") as "free" | "pro" | "enterprise";

  return {
    user,
    plan: { tier: effectivePlan, active: plan?.active === 1, updated_at: plan?.updated_at ?? null },
  };
}

export async function getPortal(req: Request, env: Env) {
  const who = await getWhoami(req, env);

  const keys = await env.DB.prepare(
    `SELECT key_id, key_prefix, scopes, status, created_at, revoked_at, last_used_at
     FROM api_keys
     WHERE user_login = ?
     ORDER BY created_at DESC`
  ).bind(who.user.login).all<ApiKeyRow>();

  return {
    ...who,
    keys: (keys.results || []).map((k) => ({
      key_id: k.key_id,
      key_prefix: k.key_prefix,
      scopes: safeJsonArray(k.scopes),
      status: k.status,
      created_at: k.created_at,
      revoked_at: k.revoked_at,
      last_used_at: k.last_used_at,
    })),
  };
}

function safeJsonArray(v: string): string[] {
  try {
    const x = JSON.parse(v);
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
}

function makeRawApiKey(prefix: string) {
  // Raw key: prefix + random, e.g. hp_live_ab12cd34_xxxxxxxxxxxxx
  const rnd = crypto.randomUUID().replaceAll("-", "");
  return `${prefix}_${rnd}`;
}

export async function postIssueKey(req: Request, env: Env) {
  const who = await getWhoami(req, env);
  const tier = who.plan.tier;

  // Basic gating: only paid users can issue keys
  if (tier === "free") throw Object.assign(new Error("Plan does not allow API keys"), { status: 403 });

  const body = await req.json().catch(() => ({})) as { scopes?: string[] };
  const scopes = Array.isArray(body.scopes) && body.scopes.length ? body.scopes : ["metrics:read"];

  const keyId = uuid();
  const prefix = tier === "enterprise" ? "hp_ent" : "hp_live";
  const keyPrefix = `${prefix}_${keyId.slice(0, 8)}`;
  const rawKey = makeRawApiKey(keyPrefix);
  const keyHash = await sha256Hex(`${rawKey}:${env.API_KEY_PEPPER}`);

  await env.DB.prepare(
    `INSERT INTO api_keys (key_id, user_login, key_prefix, key_hash, scopes, status)
     VALUES (?, ?, ?, ?, ?, 'active')`
  ).bind(keyId, who.user.login, keyPrefix, keyHash, JSON.stringify(scopes)).run();

  // Return raw key ONCE
  return {
    key_id: keyId,
    api_key: rawKey,
    key_prefix: keyPrefix,
    scopes,
  };
}

export async function postRevokeKey(req: Request, env: Env) {
  const who = await getWhoami(req, env);
  const body = await req.json().catch(() => null) as null | { key_id?: string };
  const keyId = body?.key_id;
  if (!keyId) throw Object.assign(new Error("Missing key_id"), { status: 400 });

  await env.DB.prepare(
    `UPDATE api_keys
     SET status='revoked', revoked_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     WHERE key_id = ? AND user_login = ?`
  ).bind(keyId, who.user.login).run();

  return { ok: true };
}