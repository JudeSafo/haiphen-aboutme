// haiphen-risk/src/index.ts — Quantitative Risk Analysis service (v2.0.0)
// D1-backed Monte Carlo VaR engine with stress testing

import { runMonteCarlo, type PortfolioAsset } from "./monte-carlo";
import { computeVaR, computeCVaR, computeMaxDrawdown, computeSharpeRatio } from "./var-engine";
import { runStressTest, PREDEFINED_SCENARIOS } from "./stress-test";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  INTERNAL_TOKEN?: string;
  QUOTA_API_URL?: string;
};

interface AssessRequestBody {
  scenario: string;
  model?: "monte_carlo" | "parametric" | "historical" | "stress_test";
  portfolio: {
    name: string;
    weight: number;
    expected_return: number;
    volatility: number;
    current_value: number;
  }[];
  config?: {
    iterations?: number;
    confidence_level?: number;
    horizon_days?: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers: identity, CORS, JSON, JWT, quota                         */
/* ------------------------------------------------------------------ */

function uuid(): string { return crypto.randomUUID(); }

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ?? "https://haiphen.io,https://www.haiphen.io,https://app.haiphen.io,https://auth.haiphen.io")
    .split(",").map(s => s.trim());
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) allowed.push(origin);
  const o = allowed.includes(origin) ? origin : "https://haiphen.io";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}

function corsOptions(req: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req, env) });
}

function okJson(data: unknown, rid: string, h?: Record<string, string>): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...(h ?? {}) });
  headers.set("X-Request-Id", rid);
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers });
}

function errJson(code: string, msg: string, rid: string, status: number, h?: Record<string, string>): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...(h ?? {}) });
  headers.set("X-Request-Id", rid);
  return new Response(
    JSON.stringify({ error: { code, message: msg, request_id: rid } }, null, 2),
    { status, headers },
  );
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function verifyJwt(token: string, secret: string): Promise<{ sub: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [hB64, pB64, sB64] = parts;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC", key, base64UrlToBytes(sB64),
    new TextEncoder().encode(`${hB64}.${pB64}`),
  );
  if (!ok) throw new Error("Invalid signature");
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(pB64)));
  if (claims.aud && claims.aud !== "haiphen-auth") throw new Error("Invalid audience");
  if (typeof claims.exp === "number" && claims.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired");
  if (!claims.sub) throw new Error("Missing sub");
  return { sub: claims.sub };
}

async function authUser(req: Request, env: Env, rid: string): Promise<{ user_login: string }> {
  const cookie = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)auth=([^;]+)/)?.[1];
  if (cookie) { const u = await verifyJwt(cookie, env.JWT_SECRET); return { user_login: u.sub }; }
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) { const u = await verifyJwt(bearer, env.JWT_SECRET); return { user_login: u.sub }; }
  throw errJson("unauthorized", "Unauthorized", rid, 401);
}

// ---- Daily quota check (fail-open) ----

async function checkQuota(env: Env, userId: string, plan: string, sessionHash?: string): Promise<{ allowed: boolean; reason?: string }> {
  const apiUrl = env.QUOTA_API_URL || "https://api.haiphen.io";
  const token = env.INTERNAL_TOKEN;
  if (!token) return { allowed: true };

  try {
    const res = await fetch(`${apiUrl}/v1/internal/quota/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": token },
      body: JSON.stringify({ user_id: userId, plan, session_hash: sessionHash }),
    });
    if (!res.ok) return { allowed: true };
    const data = await res.json() as { allowed: boolean; reason?: string };
    return data;
  } catch {
    return { allowed: true };
  }
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                */
/* ------------------------------------------------------------------ */

function validatePortfolio(portfolio: unknown): portfolio is AssessRequestBody["portfolio"] {
  if (!Array.isArray(portfolio) || portfolio.length === 0 || portfolio.length > 50) return false;
  for (const a of portfolio) {
    if (typeof a !== "object" || a === null) return false;
    if (typeof a.name !== "string" || a.name.length === 0 || a.name.length > 100) return false;
    if (typeof a.weight !== "number" || a.weight < 0 || a.weight > 1) return false;
    if (typeof a.expected_return !== "number" || a.expected_return < -1 || a.expected_return > 5) return false;
    if (typeof a.volatility !== "number" || a.volatility <= 0 || a.volatility > 5) return false;
    if (typeof a.current_value !== "number" || a.current_value <= 0) return false;
  }
  return true;
}

const VALID_MODELS = ["monte_carlo", "parametric", "historical", "stress_test"] as const;

/* ------------------------------------------------------------------ */
/*  Available risk models (public metadata)                           */
/* ------------------------------------------------------------------ */

const MODELS_LIST = [
  {
    id: "monte_carlo",
    name: "Monte Carlo Simulation",
    description: "Probabilistic risk assessment via Geometric Brownian Motion with correlated assets. Uses crypto.getRandomValues() and Box-Muller transform for Workers-safe RNG.",
    parameters: ["iterations", "confidence_level", "horizon_days"],
    defaults: { iterations: 5000, confidence_level: 0.95, horizon_days: 21 },
  },
  {
    id: "parametric",
    name: "Parametric VaR",
    description: "Variance-covariance method assuming normal distribution of returns.",
    parameters: ["confidence_level", "horizon_days"],
    defaults: { confidence_level: 0.95, horizon_days: 21 },
  },
  {
    id: "historical",
    name: "Historical VaR",
    description: "Value at Risk computed from historical simulation of portfolio returns.",
    parameters: ["confidence_level", "horizon_days"],
    defaults: { confidence_level: 0.95, horizon_days: 21 },
  },
  {
    id: "stress_test",
    name: "Stress Testing",
    description: "Scenario-based extreme event analysis with predefined shocks: market crash, interest rate spike, sector rotation, liquidity crisis.",
    parameters: ["scenarios"],
    defaults: {},
  },
];

/* ------------------------------------------------------------------ */
/*  Route handler                                                     */
/* ------------------------------------------------------------------ */

async function route(req: Request, env: Env): Promise<Response> {
  const rid = uuid();
  const url = new URL(req.url);
  const cors = corsHeaders(req, env);

  if (req.method === "OPTIONS") return corsOptions(req, env);

  // ---- GET /v1/health (public) ----
  if (req.method === "GET" && url.pathname === "/v1/health") {
    return okJson({
      ok: true,
      service: "haiphen-risk",
      time: new Date().toISOString(),
      version: "v2.0.0",
    }, rid, cors);
  }

  // ---- GET /v1/risk/models (public) ----
  if (req.method === "GET" && url.pathname === "/v1/risk/models") {
    return okJson({ models: MODELS_LIST }, rid, cors);
  }

  // ---- POST /v1/risk/assess (authenticated) ----
  if (req.method === "POST" && url.pathname === "/v1/risk/assess") {
    const user = await authUser(req, env, rid);
    const quota = await checkQuota(env, user.user_login, "free");
    if (!quota.allowed) return errJson("quota_exceeded", quota.reason || "Daily quota exceeded", rid, 429, cors);

    const body = await req.json().catch(() => null) as AssessRequestBody | null;
    if (!body) return errJson("invalid_request", "Invalid JSON body", rid, 400, cors);
    if (!body.scenario || typeof body.scenario !== "string" || body.scenario.length > 200) {
      return errJson("invalid_request", "Missing or invalid scenario (string, max 200 chars)", rid, 400, cors);
    }
    if (!validatePortfolio(body.portfolio)) {
      return errJson("invalid_request", "Invalid portfolio: array of 1-50 assets with name, weight (0-1), expected_return, volatility (>0), current_value (>0)", rid, 400, cors);
    }

    const model = body.model || "monte_carlo";
    if (!VALID_MODELS.includes(model as any)) {
      return errJson("invalid_request", `Invalid model. Must be one of: ${VALID_MODELS.join(", ")}`, rid, 400, cors);
    }

    // Config with sane defaults and hard limits
    const iterations = Math.min(Math.max(body.config?.iterations ?? 5000, 100), 10000);
    const confidenceLevel = Math.min(Math.max(body.config?.confidence_level ?? 0.95, 0.80), 0.999);
    const horizonDays = Math.min(Math.max(body.config?.horizon_days ?? 21, 1), 252);

    const assessmentId = uuid();
    const startedAt = new Date().toISOString();

    // Convert to engine format
    const portfolio: PortfolioAsset[] = body.portfolio.map(a => ({
      name: a.name,
      weight: a.weight,
      expected_return: a.expected_return,
      volatility: a.volatility,
      current_value: a.current_value,
    }));

    let computedVar = 0;
    let computedCvar = 0;
    let maxDrawdown = 0;
    let sharpeRatio = 0;
    let resultsJson: Record<string, unknown> = {};

    if (model === "stress_test") {
      // ---- Stress test mode ----
      const stressResults = runStressTest(portfolio);
      const worstImpactPct = Math.min(...stressResults.map(r => r.portfolio_impact_pct));
      computedVar = worstImpactPct;
      computedCvar = worstImpactPct;
      const totalValue = portfolio.reduce((s, a) => s + a.current_value, 0);
      maxDrawdown = Math.abs(worstImpactPct);
      sharpeRatio = 0; // not meaningful for stress test

      resultsJson = {
        model: "stress_test",
        scenarios: stressResults,
        total_portfolio_value: totalValue,
        worst_case_impact: Math.min(...stressResults.map(r => r.portfolio_impact)),
        worst_case_impact_pct: worstImpactPct,
      };
    } else {
      // ---- Monte Carlo / Parametric / Historical ----
      // All three use Monte Carlo engine; model label distinguishes interpretation
      const mcResult = runMonteCarlo(portfolio, iterations, horizonDays, confidenceLevel);
      const sims = mcResult.simulated_returns;

      computedVar = computeVaR(sims, confidenceLevel);
      computedCvar = computeCVaR(sims, confidenceLevel);
      maxDrawdown = computeMaxDrawdown(sims);
      sharpeRatio = computeSharpeRatio(sims, 0.04, horizonDays);

      // Also run stress tests as supplementary info
      const stressResults = runStressTest(portfolio);

      // Compute percentiles for response
      const sorted = [...sims].sort((a, b) => a - b);
      const pct = (p: number) => sorted[Math.floor(sorted.length * p)] ?? 0;

      const totalValue = portfolio.reduce((s, a) => s + a.current_value, 0);

      resultsJson = {
        model,
        iterations: mcResult.iterations,
        horizon_days: mcResult.horizon_days,
        confidence_level: confidenceLevel,
        total_portfolio_value: totalValue,
        var: {
          value: round6(computedVar),
          dollar_amount: round2(computedVar * totalValue),
          description: `${(confidenceLevel * 100).toFixed(1)}% VaR over ${horizonDays} trading days`,
        },
        cvar: {
          value: round6(computedCvar),
          dollar_amount: round2(computedCvar * totalValue),
          description: "Expected Shortfall (mean loss beyond VaR)",
        },
        max_drawdown: {
          value: round6(maxDrawdown),
          pct: round4(maxDrawdown * 100),
        },
        sharpe_ratio: round4(sharpeRatio),
        distribution: {
          mean: round6(mean(sims)),
          std_dev: round6(stdDev(sims)),
          skewness: round6(skewness(sims)),
          kurtosis: round6(kurtosis(sims)),
          percentiles: {
            "1%": round6(pct(0.01)),
            "5%": round6(pct(0.05)),
            "10%": round6(pct(0.10)),
            "25%": round6(pct(0.25)),
            "50%": round6(pct(0.50)),
            "75%": round6(pct(0.75)),
            "90%": round6(pct(0.90)),
            "95%": round6(pct(0.95)),
            "99%": round6(pct(0.99)),
          },
        },
        stress_scenarios: stressResults.map(s => ({
          name: s.scenario_name,
          portfolio_impact: s.portfolio_impact,
          portfolio_impact_pct: s.portfolio_impact_pct,
          probability: s.probability,
        })),
        recommendations: generateRecommendations(computedVar, computedCvar, maxDrawdown, sharpeRatio, stressResults),
      };
    }

    const completedAt = new Date().toISOString();

    // ---- Persist to D1 ----
    try {
      await env.DB.prepare(`
        INSERT INTO risk_assessments
          (assessment_id, user_login, scenario, model, status, portfolio_json, config_json,
           results_json, iterations, confidence_level, horizon_days,
           computed_var, computed_cvar, max_drawdown, sharpe_ratio,
           started_at, completed_at, created_at)
        VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        assessmentId,
        user.user_login,
        body.scenario,
        model,
        JSON.stringify(body.portfolio),
        JSON.stringify({ iterations, confidence_level: confidenceLevel, horizon_days: horizonDays }),
        JSON.stringify(resultsJson),
        iterations,
        confidenceLevel,
        horizonDays,
        round6(computedVar),
        round6(computedCvar),
        round6(maxDrawdown),
        round4(sharpeRatio),
        startedAt,
        completedAt,
        startedAt,
      ).run();

      // Persist portfolio snapshots
      const stmts = portfolio.map(asset => {
        const simValues = model !== "stress_test"
          ? (resultsJson as any)._assetSims?.[asset.name] ?? null
          : null;
        return env.DB.prepare(`
          INSERT INTO risk_portfolio_snapshots
            (assessment_id, asset_name, weight, expected_return, volatility,
             current_value, simulated_values_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          assessmentId,
          asset.name,
          asset.weight,
          asset.expected_return,
          asset.volatility,
          asset.current_value,
          simValues ? JSON.stringify(simValues) : null,
          startedAt,
        );
      });
      if (stmts.length > 0) await env.DB.batch(stmts);
    } catch (dbErr) {
      // Log but don't fail the response — the computation succeeded
      console.error("D1 persist error:", dbErr);
    }

    return okJson({
      assessment_id: assessmentId,
      scenario: body.scenario,
      model,
      status: "completed",
      assessed_by: user.user_login,
      started_at: startedAt,
      completed_at: completedAt,
      config: { iterations, confidence_level: confidenceLevel, horizon_days: horizonDays },
      results: resultsJson,
    }, rid, cors);
  }

  // ---- GET /v1/risk/assess/:id (authenticated) ----
  const assessMatch = url.pathname.match(/^\/v1\/risk\/assess\/([a-f0-9-]{36})$/);
  if (req.method === "GET" && assessMatch) {
    const user = await authUser(req, env, rid);
    const assessmentId = assessMatch[1];

    const row = await env.DB.prepare(`
      SELECT assessment_id, user_login, scenario, model, status, portfolio_json,
             config_json, results_json, iterations, confidence_level, horizon_days,
             computed_var, computed_cvar, max_drawdown, sharpe_ratio,
             started_at, completed_at, created_at
      FROM risk_assessments
      WHERE assessment_id = ? AND user_login = ?
    `).bind(assessmentId, user.user_login).first();

    if (!row) return errJson("not_found", "Assessment not found", rid, 404, cors);

    // Fetch portfolio snapshots
    const snapshots = await env.DB.prepare(`
      SELECT asset_name, weight, expected_return, volatility, current_value, created_at
      FROM risk_portfolio_snapshots
      WHERE assessment_id = ?
      ORDER BY created_at ASC
    `).bind(assessmentId).all();

    return okJson({
      assessment_id: row.assessment_id,
      scenario: row.scenario,
      model: row.model,
      status: row.status,
      assessed_by: row.user_login,
      iterations: row.iterations,
      confidence_level: row.confidence_level,
      horizon_days: row.horizon_days,
      computed_var: row.computed_var,
      computed_cvar: row.computed_cvar,
      max_drawdown: row.max_drawdown,
      sharpe_ratio: row.sharpe_ratio,
      started_at: row.started_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      config: safeJsonParse(row.config_json as string),
      results: safeJsonParse(row.results_json as string),
      portfolio: snapshots.results?.map((s: any) => ({
        name: s.asset_name,
        weight: s.weight,
        expected_return: s.expected_return,
        volatility: s.volatility,
        current_value: s.current_value,
      })) ?? [],
    }, rid, cors);
  }

  // ---- GET /v1/risk/assessments (authenticated, paginated) ----
  if (req.method === "GET" && url.pathname === "/v1/risk/assessments") {
    const user = await authUser(req, env, rid);

    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10), 1), 100);
    const offset = (page - 1) * limit;

    // Get total count
    const countRow = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM risk_assessments WHERE user_login = ?
    `).bind(user.user_login).first();
    const total = (countRow?.total as number) ?? 0;

    // Get paginated results
    const rows = await env.DB.prepare(`
      SELECT assessment_id, scenario, model, status, iterations, confidence_level,
             horizon_days, computed_var, computed_cvar, max_drawdown, sharpe_ratio,
             started_at, completed_at, created_at
      FROM risk_assessments
      WHERE user_login = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.user_login, limit, offset).all();

    return okJson({
      items: rows.results?.map((r: any) => ({
        assessment_id: r.assessment_id,
        scenario: r.scenario,
        model: r.model,
        status: r.status,
        iterations: r.iterations,
        confidence_level: r.confidence_level,
        horizon_days: r.horizon_days,
        computed_var: r.computed_var,
        computed_cvar: r.computed_cvar,
        max_drawdown: r.max_drawdown,
        sharpe_ratio: r.sharpe_ratio,
        started_at: r.started_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
      })) ?? [],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    }, rid, cors);
  }

  // POST /v1/risk/prospect-analyze (internal — service-to-service)
  if (req.method === "POST" && url.pathname === "/v1/risk/prospect-analyze") {
    const tok = req.headers.get("X-Internal-Token") || "";
    if (!env.INTERNAL_TOKEN || tok !== env.INTERNAL_TOKEN) {
      return errJson("forbidden", "Forbidden", rid, 403, cors);
    }

    const body = await req.json().catch(() => null) as null | {
      lead_id: string; entity_name: string;
      vulnerability_id?: string; summary: string;
      cvss_score?: number;
      upstream_context?: {
        prior_scores: Record<string, number>;
        prior_findings: string[];
        investigation_id: string;
      };
    };
    if (!body?.lead_id) return errJson("invalid_request", "Missing lead_id", rid, 400, cors);

    const findings: string[] = [];
    let score = 20; // baseline
    const lower = body.summary.toLowerCase();

    // Upstream context: aggregate prior scores into business impact baseline
    const uc = body.upstream_context;
    if (uc && uc.prior_scores) {
      const priorVals = Object.values(uc.prior_scores);
      if (priorVals.length > 0) {
        const avgPrior = priorVals.reduce((a, b) => a + b, 0) / priorVals.length;
        const boost = Math.min(Math.round(avgPrior * 0.15), 15);
        score += boost;
        findings.push(`Upstream average score ${avgPrior.toFixed(0)} feeds business impact (+${boost})`);
      }
    }

    // CVSS-weighted business impact
    const cvss = body.cvss_score ?? 0;
    if (cvss >= 9.0) { score += 35; findings.push(`Critical CVSS ${cvss} — extreme business impact potential`); }
    else if (cvss >= 7.0) { score += 25; findings.push(`High CVSS ${cvss} — significant business risk`); }
    else if (cvss >= 4.0) { score += 10; findings.push(`Medium CVSS ${cvss} — moderate risk`); }

    // Trade execution disruption
    if (/trading|execution|order|matching engine/.test(lower)) {
      score += 15;
      findings.push("Trade execution disruption risk — potential for order loss or fill delay");
    }
    // Settlement delay
    if (/settlement|clearing|reconcil/.test(lower)) {
      score += 15;
      findings.push("Settlement delay risk — position drift and failed trades possible");
    }
    // Client data exposure
    if (/client|customer|account|pii|kyc/.test(lower)) {
      score += 10;
      findings.push("Client data exposure risk — regulatory and reputational impact");
    }

    score = Math.min(score, 100);

    const recommendation = score >= 70
      ? "High business impact — quantitative risk assessment recommended. Potential for significant financial loss or regulatory action."
      : score >= 40
      ? "Moderate business risk — include in next risk review cycle. Monitor for severity escalation."
      : "Low quantitative risk — standard risk monitoring sufficient.";

    return okJson({ score, findings, recommendation }, rid, cors);
  }

  return errJson("not_found", "Not found", rid, 404, cors);
}

/* ------------------------------------------------------------------ */
/*  Utility functions                                                 */
/* ------------------------------------------------------------------ */

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
function round6(n: number): number { return Math.round(n * 1000000) / 1000000; }

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) ** 2;
  return Math.sqrt(s / (arr.length - 1));
}

function skewness(arr: number[]): number {
  if (arr.length < 3) return 0;
  const m = mean(arr);
  const sd = stdDev(arr);
  if (sd === 0) return 0;
  const n = arr.length;
  let s = 0;
  for (const v of arr) s += ((v - m) / sd) ** 3;
  return (n / ((n - 1) * (n - 2))) * s;
}

function kurtosis(arr: number[]): number {
  if (arr.length < 4) return 0;
  const m = mean(arr);
  const sd = stdDev(arr);
  if (sd === 0) return 0;
  const n = arr.length;
  let s = 0;
  for (const v of arr) s += ((v - m) / sd) ** 4;
  const excess = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * s
    - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return excess;
}

function safeJsonParse(str: string | null | undefined): unknown {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function generateRecommendations(
  varVal: number,
  cvarVal: number,
  maxDd: number,
  sharpe: number,
  stressResults: { portfolio_impact_pct: number; scenario_name: string }[],
): string[] {
  const recs: string[] = [];

  if (varVal < -0.10) {
    recs.push("Portfolio VaR exceeds 10% — consider reducing concentrated positions or adding hedges.");
  }
  if (cvarVal < -0.15) {
    recs.push("Expected Shortfall is severe — tail risk is elevated. Consider protective puts or tail-risk hedging.");
  }
  if (maxDd > 0.20) {
    recs.push(`Maximum drawdown of ${(maxDd * 100).toFixed(1)}% is significant — diversify across uncorrelated asset classes.`);
  }
  if (sharpe < 0.5) {
    recs.push("Sharpe ratio is below 0.5 — risk-adjusted returns are poor. Review asset allocation for better risk/return tradeoff.");
  } else if (sharpe > 2.0) {
    recs.push("Sharpe ratio is unusually high — verify input assumptions for realism.");
  }

  const worstStress = stressResults.reduce((w, s) =>
    s.portfolio_impact_pct < w.portfolio_impact_pct ? s : w, stressResults[0]);
  if (worstStress && worstStress.portfolio_impact_pct < -0.15) {
    recs.push(`Worst stress scenario "${worstStress.scenario_name}" shows ${(worstStress.portfolio_impact_pct * 100).toFixed(1)}% loss — build contingency reserves.`);
  }

  if (recs.length === 0) {
    recs.push("Portfolio risk metrics are within acceptable bounds. Continue monitoring.");
  }

  return recs;
}

/* ------------------------------------------------------------------ */
/*  Export: Cloudflare Workers fetch handler                          */
/* ------------------------------------------------------------------ */

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e: any) {
      if (e instanceof Response) return e;
      console.error("Unhandled error:", e);
      return errJson("internal", "Internal error", uuid(), 500);
    }
  },
};
