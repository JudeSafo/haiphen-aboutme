// src/edge-crawler.js

/**
 * Cloudflare Worker: edge-crawler (JavaScript only)
 *
 * - cron pulls Shodan candidates -> store in KV
 * - /api/candidates    : GET list for probe executors (GH Actions)
 * - /api/ingest        : POST probe results back
 * - /api/feed.rss/json : public feeds
 * - /api/health        : liveness
 */

const CANDIDATES_KEY = "candidates:latest";
const RESULTS_KEY = "results:latest";
const FEED_TITLE = "Open MQTT Retained Feed (CF edge orchestrated)";
const FEED_LINK = "https://crawler.haiphen.io/api/feed.rss";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    try {
      if (url.pathname.startsWith("/api/health")) {
        return json({ ok: true, now: new Date().toISOString() });
      }

      if (url.pathname.startsWith("/api/candidates") && req.method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
        const list = await getCandidates(env, limit);
        return json({ total: list.length, candidates: list.slice(0, limit) });
      }

     if (url.pathname.startsWith("/api/ingest") && req.method === "POST") {
        // --- HMAC verify ---
        const timestamp = req.headers.get("x-timestamp");
        const signature = req.headers.get("x-signature"); // hex-encoded HMAC
        if (!timestamp || !signature) {
          return json({ error: "Missing x-timestamp or x-signature" }, 401);
        }

        // Prevent replay (5 min window)
        const now = Date.now();
        const ts = Date.parse(timestamp);
        if (isNaN(ts) || Math.abs(now - ts) > 5 * 60 * 1000) {
          return json({ error: "Timestamp too old or invalid" }, 401);
        }

        // Read the raw body text so we can verify before parsing.
        const rawBody = await req.text();
        const expected = await hmacHex(env.INGEST_HMAC_SECRET, `${timestamp}.${rawBody}`);
        if (!timingSafeEqualHex(signature, expected)) {
          return json({ error: "Bad signature" }, 401);
        }

        let body;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        if (!Array.isArray(body)) {
          return json({ error: "POST expects an array of ProbeResult" }, 400);
        }

        await storeResults(env, body);
        return json({ ok: true, stored: body.length });
      }

      if (url.pathname.startsWith("/api/feed.rss")) {
        const results = await getResults(env);
        const rss = renderRSS(results);
        return new Response(rss, {
          status: 200,
          headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
        });
      }

      if (url.pathname.startsWith("/api/feed.json")) {
        const results = await getResults(env);
        return json({ title: FEED_TITLE, link: FEED_LINK, items: results });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("❌ edge-crawler error", err);
      return json({ error: "Internal error", detail: String(err?.message || err) }, 500);
    }
  },

  async scheduled(_event, env, _ctx) {
    try {
      const fresh = await fetchShodanCandidates(env);
      await env.CRAWL_KV.put(CANDIDATES_KEY, JSON.stringify(fresh), {
        expirationTtl: 60 * 60, // 1h
      });
      console.log(`✅ cron: stored ${fresh.length} candidates`);
    } catch (e) {
      console.error("❌ cron error", e);
    }
  },
};

// ----------------------- helpers -----------------------

async function getCandidates(env, limit) {
  const cached = await env.CRAWL_KV.get(CANDIDATES_KEY);
  if (cached) {
    const arr = JSON.parse(cached);
    return arr.slice(0, limit);
  }
  const fresh = await fetchShodanCandidates(env);
  await env.CRAWL_KV.put(CANDIDATES_KEY, JSON.stringify(fresh), {
    expirationTtl: 60 * 60,
  });
  return fresh.slice(0, limit);
}

async function fetchShodanCandidates(env) {
  const q = 'port:1883 mqtt "Topics:"';
  const endpoint = `https://api.shodan.io/shodan/host/search?key=${encodeURIComponent(
    env.SHODAN_API_KEY
  )}&query=${encodeURIComponent(q)}&page=1`;

  const r = await fetch(endpoint);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Shodan error: ${r.status} ${txt}`);
  }
  const json = await r.json();
  return (json.matches || []).map((m) => ({
    ip: m.ip_str,
    port: m.port,
    firstSeen: new Date().toISOString(),
  }));
}

async function storeResults(env, batch) {
  const prevRaw = await env.CRAWL_KV.get(RESULTS_KEY);
  const prev = prevRaw ? JSON.parse(prevRaw) : [];
  const merged = [...batch, ...prev].slice(0, 200);
  await env.CRAWL_KV.put(RESULTS_KEY, JSON.stringify(merged), {
    expirationTtl: 24 * 60 * 60,
  });
}

async function getResults(env) {
  const raw = await env.CRAWL_KV.get(RESULTS_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

function renderRSS(items) {
  const now = new Date().toUTCString();
  const body = items
    .map(
      (i) => `
    <item>
      <title>${xmlEscape(`${i.ip} – ${truncate(i.topic || "", 64)}`)}</title>
      <description><![CDATA[${i.payload || ""}]]></description>
      <link>mqtt://${xmlEscape(i.ip || "")}/${xmlEscape(i.topic || "")}</link>
      <pubDate>${new Date(i.ts || Date.now()).toUTCString()}</pubDate>
    </item>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
 <channel>
  <title>${xmlEscape(FEED_TITLE)}</title>
  <link>${xmlEscape(FEED_LINK)}</link>
  <description>First retained message observed for open brokers</description>
  <lastBuildDate>${now}</lastBuildDate>
  ${body}
 </channel>
</rss>`;
}

function xmlEscape(s) {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

function truncate(s, n) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bufToHex(sig);
}

function bufToHex(buf) {
  const bytes = new Uint8Array(buf);
  const hex = [];
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16).padStart(2, "0");
    hex.push(h);
  }
  return hex.join("");
}

// constant-time compare for hex strings
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}