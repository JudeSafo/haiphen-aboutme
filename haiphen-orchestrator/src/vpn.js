// vpn.js
import { json } from "itty-router";
import { verifyAndRead } from "./utils";

export async function handleVpnPreauth(req, env) {
  const { valid, body } = await verifyAndRead(req, env.INGEST_HMAC_SECRET);
  if (!valid) return json({ error: "unauthorized" }, 401);

  const urls = (env.HEADSCALE_URLS || env.HEADSCALE_BASE_URL || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!urls.length) return json({ error: "Headscale URLs not configured" }, 500);

  const expiry = body?.expiry || "24h";
  const user = body?.user || "orchestrator";

  let lastErr = null;
  for (const base of urls) {
    try {
      const resp = await fetch(`${base}/api/v1/preauthkey`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.HEADSCALE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user,
          reusable: false,
          ephemeral: true,
          expiration: expiry
        })
      });
      if (!resp.ok) {
        lastErr = new Error(`Headscale ${base} -> ${resp.status}`);
        continue;
      }
      const { preAuthKey } = await resp.json();
      const subnetId = crypto.randomUUID();
      const record = {
        authKey: preAuthKey.key,
        expireAt: preAuthKey.expiresAt,
        createdAt: Date.now(),
        base
      };
      await env.STATE_KV.put(`subnet:${subnetId}`, JSON.stringify(record), { expirationTtl: 24 * 3600 });
      return json({ ok: true, subnetId, authKey: record.authKey, expireAt: record.expireAt, base });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("no-headscale-endpoint-reachable");
}
