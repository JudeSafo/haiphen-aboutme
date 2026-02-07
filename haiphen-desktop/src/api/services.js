/**
 * Haiphen Service API Functions
 *
 * Pre-built wrappers for every Haiphen API endpoint.  All functions delegate
 * to the shared client in ./client.js and return the standard envelope:
 *   { ok: boolean, data: any, error: string|null, status: number }
 */

import { apiGet, apiPost } from "./client";

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

/** Fetch the authenticated user profile. */
export const fetchMe = () => apiGet("/v1/me");

/* ------------------------------------------------------------------ */
/*  Metrics / Dashboard KPIs                                           */
/* ------------------------------------------------------------------ */

/** Retrieve the current set of KPI values. */
export const fetchKPIs = () => apiGet("/v1/metrics/kpis");

/**
 * Retrieve a time-series data set.
 * @param {object|string} paramsOrType  Query params object **or** legacy seriesType string
 * @param {string} [range]             Legacy range param (e.g. "7d")
 */
export const fetchSeries = (paramsOrType, range) => {
  // Support both the new object form and the legacy (seriesType, range) signature
  if (typeof paramsOrType === "string") {
    return apiGet("/v1/metrics/series", { type: paramsOrType, range: range || "30d" });
  }
  return apiGet("/v1/metrics/series", paramsOrType);
};

/** List portfolio assets for the current user. */
export const fetchPortfolioAssets = () => apiGet("/v1/metrics/portfolio-assets");

/* ------------------------------------------------------------------ */
/*  Portfolio / Trades                                                  */
/* ------------------------------------------------------------------ */

/**
 * Fetch detail for a single asset.
 * @param {string} assetId
 */
export const fetchAssetDetail = (assetId) => apiGet(`/v1/portfolio/assets/${assetId}`);

/**
 * Fetch recent trades.
 * @param {number} [limit=10]
 */
export const fetchRecentTrades = (limit = 10) => apiGet("/v1/trades/recent", { limit });

/* ------------------------------------------------------------------ */
/*  API Keys                                                           */
/* ------------------------------------------------------------------ */

/** List all API keys for the authenticated user. */
export const listApiKeys = () => apiGet("/v1/keys/list");

/**
 * Create a new API key.
 * @param {object} body  { name, scopes }
 */
export const createApiKey = (body) => apiPost("/v1/keys/create", body);

/**
 * Revoke an API key by ID.
 * @param {string} keyId
 */
export const revokeApiKey = (keyId) => apiPost("/v1/keys/revoke", { key_id: keyId });

/* ------------------------------------------------------------------ */
/*  Services - Secure Scan                                             */
/* ------------------------------------------------------------------ */

/**
 * Launch a new security scan.
 * @param {object} body  { target, options }
 */
export const runSecureScan = (body) => apiPost("/v1/secure/scan", body);

/**
 * Get the result of a specific scan.
 * @param {string} scanId
 */
export const getSecureScan = (scanId) => apiGet(`/v1/secure/scan/${scanId}`);

/** List all scans for the authenticated user. */
export const listSecureScans = () => apiGet("/v1/secure/scans");

/* ------------------------------------------------------------------ */
/*  Services - Network Trace                                           */
/* ------------------------------------------------------------------ */

/**
 * Start a network trace.
 * @param {object} body  { target, depth, filters }
 */
export const runNetworkTrace = (body) => apiPost("/v1/network/trace", body);

/**
 * Retrieve a completed trace result.
 * @param {string} traceId
 */
export const getNetworkTrace = (traceId) => apiGet(`/v1/network/trace/${traceId}`);

/* ------------------------------------------------------------------ */
/*  Services - Knowledge Graph                                         */
/* ------------------------------------------------------------------ */

/**
 * Upsert entities into the knowledge graph.
 * @param {object} body  { entities: [...] }
 */
export const upsertGraphEntities = (body) => apiPost("/v1/graph/entities", body);

/**
 * Query the knowledge graph.
 * @param {object} body  { query, filters }
 */
export const queryGraph = (body) => apiPost("/v1/graph/query", body);

/**
 * Create edges between graph entities.
 * @param {object} body  { edges: [...] }
 */
export const createGraphEdges = (body) => apiPost("/v1/graph/edges", body);

/* ------------------------------------------------------------------ */
/*  Services - Risk Assessment                                         */
/* ------------------------------------------------------------------ */

/**
 * Run a risk assessment.
 * @param {object} body  { assets, parameters }
 */
export const runRiskAssessment = (body) => apiPost("/v1/risk/assess", body);

/* ------------------------------------------------------------------ */
/*  Services - Causal Analysis                                         */
/* ------------------------------------------------------------------ */

/**
 * Ingest events for causal analysis.
 * @param {object} body  { events: [...] }
 */
export const ingestCausalEvents = (body) => apiPost("/v1/causal/events", body);

/**
 * Trigger causal analysis on ingested events.
 * @param {object} body  { window, parameters }
 */
export const analyzeCausal = (body) => apiPost("/v1/causal/analyze", body);

/* ------------------------------------------------------------------ */
/*  Services - Supply Chain                                            */
/* ------------------------------------------------------------------ */

/**
 * Upsert supplier records.
 * @param {object} body  { suppliers: [...] }
 */
export const upsertSuppliers = (body) => apiPost("/v1/supply/suppliers", body);

/**
 * Assess supply-chain risk.
 * @param {object} body  { supplier_ids, parameters }
 */
export const assessSupplyRisk = (body) => apiPost("/v1/supply/assess", body);
