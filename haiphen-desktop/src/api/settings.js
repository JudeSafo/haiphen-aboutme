/**
 * Haiphen Desktop - Settings / Profile / Quota API client
 *
 * Delegates to the shared client in ./client.js.
 * Returns the standard envelope: { ok, data, error, status }.
 */

import { apiGet, apiPost, apiDelete } from "./client";

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Fetch the authenticated user profile. */
export const getProfile = () => apiGet("/v1/me");

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

/** List all API keys for the authenticated user. */
export const listApiKeys = () => apiGet("/v1/keys/list");

/** Create a new API key. */
export const createApiKey = (body) => apiPost("/v1/keys/create", body);

/** Revoke an API key by ID. */
export const revokeApiKey = (keyId) => apiPost("/v1/keys/revoke", { key_id: keyId });

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

/** Fetch the current quota usage. */
export const getQuota = () => apiGet("/v1/quota");
