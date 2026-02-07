#!/usr/bin/env node
/**
 * Stripe Products & Prices Setup for Haiphen Services Catalogue
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js
 *
 * Idempotent: checks for existing products by metadata.service_id before creating.
 * Safe to re-run.
 */

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error("ERROR: STRIPE_SECRET_KEY environment variable is required");
  process.exit(1);
}

const STRIPE_API = "https://api.stripe.com";

// ── Service Catalogue ───────────────────────────────────────────────────────

const SERVICES = [
  // FEATURED
  {
    service_id: "haiphen_cli",
    name: "Haiphen CLI",
    description: "Command Center for Edge Intelligence — telemetry, data ingestion, manipulation, and command/control hub.",
    prices: [
      { lookup_key: "haiphen_cli_pro",        unit_amount: 2900,  interval: "month", nickname: "Pro" },
      { lookup_key: "haiphen_cli_enterprise",  unit_amount: 9900,  interval: "month", nickname: "Enterprise" },
    ],
  },
  // FINTECH
  {
    service_id: "haiphen_webapp",
    name: "Haiphen WebApp",
    description: "Browser-based trading dashboard with real-time data visualization and portfolio management.",
    prices: [
      { lookup_key: "haiphen_webapp_standard", unit_amount: 1900,  interval: "month", nickname: "Standard" },
    ],
  },
  {
    service_id: "daily_newsletter",
    name: "Daily Newsletter",
    description: "Daily market intelligence digest with curated signals and analysis.",
    prices: [], // Free — no Stripe price needed
  },
  {
    service_id: "haiphen_mobile",
    name: "Haiphen Mobile",
    description: "iOS and Android app for on-the-go portfolio monitoring and alerts.",
    prices: [
      { lookup_key: "haiphen_mobile_standard", unit_amount: 999,   interval: "month", nickname: "Standard" },
    ],
  },
  {
    service_id: "haiphen_desktop",
    name: "Haiphen Desktop",
    description: "Cross-platform desktop application with advanced charting and local data processing.",
    prices: [
      { lookup_key: "haiphen_desktop_standard", unit_amount: 1499, interval: "month", nickname: "Standard" },
    ],
  },
  {
    service_id: "slackbot_discord",
    name: "Slack/Discord Integration",
    description: "Real-time alerts and commands in your team's Slack or Discord workspace.",
    prices: [], // Bundled — no standalone price
  },
  // TECH
  {
    service_id: "haiphen_secure",
    name: "Haiphen Secure",
    description: "Automated security scanning and vulnerability assessment for edge infrastructure.",
    prices: [
      { lookup_key: "haiphen_secure_standard", unit_amount: 3900,  interval: "month", nickname: "Standard" },
    ],
  },
  {
    service_id: "network_trace",
    name: "Network Trace",
    description: "Deep packet inspection and protocol analysis for industrial networks.",
    prices: [
      { lookup_key: "network_trace_standard",  unit_amount: 999,   interval: "month", nickname: "Standard" },
    ],
  },
  {
    service_id: "knowledge_graph",
    name: "Knowledge Graph",
    description: "Entity extraction, relationship mapping, and semantic knowledge base for your data.",
    prices: [
      { lookup_key: "knowledge_graph_standard", unit_amount: 9900, interval: "month", nickname: "Standard" },
    ],
  },
  {
    service_id: "risk_analysis",
    name: "Risk Analysis",
    description: "Quantitative risk assessment and scenario modeling for portfolio and infrastructure.",
    prices: [
      { lookup_key: "risk_analysis_standard",  unit_amount: 4900,  interval: "month", nickname: "Standard" },
    ],
  },
  {
    service_id: "causal_chain",
    name: "Causal Chain",
    description: "Root cause analysis and causal inference engine for complex event chains.",
    prices: [
      { lookup_key: "causal_chain_standard",   unit_amount: 2900,  interval: "month", nickname: "Standard" },
    ],
  },
  {
    service_id: "supply_chain",
    name: "Supply Chain Intel",
    description: "Supply chain visibility, risk scoring, and disruption intelligence.",
    prices: [
      { lookup_key: "supply_chain_standard",   unit_amount: 7900,  interval: "month", nickname: "Standard" },
    ],
  },
];

// ── Stripe API helpers ──────────────────────────────────────────────────────

async function stripeGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${STRIPE_API}${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  return res.json();
}

async function stripePost(path, body = {}) {
  const form = new URLSearchParams();
  flattenToForm(body, form, "");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Stripe ${path}: ${data.error.message}`);
  }
  return data;
}

function flattenToForm(obj, form, prefix) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      flattenToForm(v, form, key);
    } else {
      form.set(key, String(v));
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function findExistingProduct(serviceId) {
  // Search by metadata — Stripe doesn't support metadata search directly,
  // so we list all active products and filter client-side.
  let hasMore = true;
  let startingAfter = undefined;

  while (hasMore) {
    const params = { limit: "100", active: "true" };
    if (startingAfter) params.starting_after = startingAfter;

    const list = await stripeGet("/v1/products", params);
    for (const p of list.data) {
      if (p.metadata && p.metadata.service_id === serviceId) {
        return p;
      }
    }
    hasMore = list.has_more;
    if (list.data.length > 0) {
      startingAfter = list.data[list.data.length - 1].id;
    }
  }
  return null;
}

async function findExistingPrice(lookupKey) {
  // lookup_keys must be passed as an array param: lookup_keys[]=...
  const qs = new URLSearchParams();
  qs.set("lookup_keys[]", lookupKey);
  qs.set("limit", "1");
  const url = `${STRIPE_API}/v1/prices?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  const list = await res.json();
  return (list.data && list.data.length > 0) ? list.data[0] : null;
}

async function main() {
  console.log("Haiphen Stripe Setup — creating products & prices\n");

  let created = 0;
  let skipped = 0;

  for (const svc of SERVICES) {
    process.stdout.write(`[${svc.service_id}] ${svc.name} ... `);

    // 1. Find or create product
    let product = await findExistingProduct(svc.service_id);
    if (product) {
      console.log(`product exists (${product.id})`);
    } else {
      product = await stripePost("/v1/products", {
        name: svc.name,
        description: svc.description,
        type: "service",
        metadata: { service_id: svc.service_id },
      });
      console.log(`product CREATED (${product.id})`);
      created++;
    }

    // 2. Create prices
    for (const pr of svc.prices) {
      process.stdout.write(`  price [${pr.lookup_key}] ... `);

      const existing = await findExistingPrice(pr.lookup_key);
      if (existing) {
        console.log(`exists (${existing.id})`);
        skipped++;
        continue;
      }

      const price = await stripePost("/v1/prices", {
        product: product.id,
        unit_amount: String(pr.unit_amount),
        currency: "usd",
        recurring: { interval: pr.interval },
        lookup_key: pr.lookup_key,
        nickname: pr.nickname,
        metadata: { service_id: svc.service_id },
        transfer_lookup_key: "true",
      });
      console.log(`CREATED (${price.id})`);
      created++;
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped (existing): ${skipped}`);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
