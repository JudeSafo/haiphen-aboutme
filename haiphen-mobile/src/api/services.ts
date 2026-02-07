import { apiGet, apiPost } from './client';

// Auth
export const fetchMe = () => apiGet('/v1/me');

// Metrics
export const fetchKPIs = () => apiGet('/v1/metrics/kpis');
export const fetchSeries = () => apiGet('/v1/metrics/series');
export const fetchPortfolioAssets = () => apiGet('/v1/metrics/portfolio-assets');

// 6 Intelligence Services
export const runSecureScan = (body: any) => apiPost('/v1/secure/scan', body);
export const getSecureScan = (scanId: string) => apiGet(`/v1/secure/scan/${scanId}`);
export const runNetworkTrace = (body: any) => apiPost('/v1/network/trace', body);
export const getNetworkTrace = (traceId: string) => apiGet(`/v1/network/trace/${traceId}`);
export const upsertGraphEntities = (body: any) => apiPost('/v1/graph/entities', body);
export const queryGraph = (body: any) => apiPost('/v1/graph/query', body);
export const runRiskAssessment = (body: any) => apiPost('/v1/risk/assess', body);
export const ingestCausalEvents = (body: any) => apiPost('/v1/causal/events', body);
export const analyzeCausal = (body: any) => apiPost('/v1/causal/analyze', body);
export const upsertSuppliers = (body: any) => apiPost('/v1/supply/suppliers', body);
export const assessSupplyRisk = (body: any) => apiPost('/v1/supply/assess', body);

// API Keys
export const listApiKeys = () => apiGet('/v1/keys/list');
