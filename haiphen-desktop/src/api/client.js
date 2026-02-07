/**
 * Haiphen API Client
 *
 * Fetch wrapper that attaches JWT auth, handles 401 redirects,
 * enforces request timeouts, and normalises responses into
 * { ok, data, error, status } envelopes.
 */

const API_BASE = process.env.REACT_APP_API_BASE || "https://api.haiphen.io";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Read the stored JWT token from localStorage.
 * Returns null when no token is present.
 */
function getToken() {
  try {
    return localStorage.getItem("haiphen_token");
  } catch {
    return null;
  }
}

/**
 * Clear local auth state and redirect to the login page.
 * Called automatically when the API returns a 401.
 */
function handleUnauthorised() {
  try {
    localStorage.removeItem("haiphen_token");
  } catch {
    /* noop - localStorage may be unavailable */
  }
  // Use window.location so it works regardless of router context
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

/**
 * Build a query-string from a plain object.
 * Undefined / null values are omitted.
 */
function buildQuery(params) {
  if (!params || typeof params !== "object") return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries).toString();
}

/**
 * Core request function.
 *
 * @param {string}  method   HTTP method
 * @param {string}  path     API path (e.g. "/v1/me")
 * @param {object}  [options]
 * @param {object}  [options.body]    JSON body (POST / PUT)
 * @param {object}  [options.params]  Query-string params (GET / DELETE)
 * @param {number}  [options.timeout] Request timeout in ms
 * @returns {Promise<{ok: boolean, data: any, error: string|null, status: number}>}
 */
async function request(method, path, options = {}) {
  const { body, params, timeout = DEFAULT_TIMEOUT_MS } = options;

  const url = `${API_BASE}${path}${buildQuery(params)}`;

  const headers = {
    Accept: "application/json",
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    // Handle 401 globally
    if (resp.status === 401) {
      handleUnauthorised();
      return { ok: false, data: null, error: "Unauthorised", status: 401 };
    }

    // Attempt to parse JSON; fall back to null when the body is empty
    let data = null;
    const text = await resp.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!resp.ok) {
      // Prefer the structured error message from the API response body
      const errorMsg =
        (data && data.error && (data.error.message || data.error)) ||
        resp.statusText ||
        "Request failed";
      return { ok: false, data: null, error: errorMsg, status: resp.status };
    }

    return { ok: true, data, error: null, status: resp.status };
  } catch (err) {
    clearTimeout(timer);

    if (err.name === "AbortError") {
      return {
        ok: false,
        data: null,
        error: `Request timed out after ${timeout}ms`,
        status: 0,
      };
    }

    return {
      ok: false,
      data: null,
      error: err.message || "Network error",
      status: 0,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Public helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * GET request.
 * @param {string} path    API path
 * @param {object} [params] Query-string parameters
 */
export function apiGet(path, params) {
  return request("GET", path, { params });
}

/**
 * POST request with JSON body.
 * @param {string} path API path
 * @param {object} body JSON payload
 */
export function apiPost(path, body) {
  return request("POST", path, { body });
}

/**
 * PUT request with JSON body.
 * @param {string} path API path
 * @param {object} body JSON payload
 */
export function apiPut(path, body) {
  return request("PUT", path, { body });
}

/**
 * DELETE request.
 * @param {string} path    API path
 * @param {object} [params] Optional query-string parameters
 */
export function apiDelete(path, params) {
  return request("DELETE", path, { params });
}
