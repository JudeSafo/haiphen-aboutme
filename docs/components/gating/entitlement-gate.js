/* components/gating/entitlement-gate.js
 *
 * Centralized entitlement checks + routing.
 * Used by Services, Docs "Try it", header/sidebar actions.
 *
 * Contract:
 * - "logged in" is determined by auth cookie check: AUTH_ORIGIN /me
 * - entitlements are determined by API /v1/me (same as ApiAccess)
 *
 * Routing:
 * - Not logged in => auth login (preserve return url)
 * - Logged in but not entitled => send to app paywall (or Stripe checkout)
 */
(function () {
  'use strict';

  const AUTH_ORIGIN = 'https://auth.haiphen.io';
  const API_ORIGIN = 'https://api.haiphen.io';

  // Change this to whatever your real “Payment Required” page is.
  // If you already have app.haiphen.io handling subscriptions, route there.
  const PAYWALL_URL = 'https://app.haiphen.io/subscribe';

  function currentUrl() {
    return window.location.href;
  }

  function toUrl(base, params) {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  async function isLoggedInViaAuthCookie() {
    try {
      const r = await fetch(`${AUTH_ORIGIN}/me`, {
        credentials: 'include',
        cache: 'no-store',
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function apiMe() {
    const r = await fetch(`${API_ORIGIN}/v1/me`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
    });

    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    return { ok: r.ok, status: r.status, json, text };
  }

  function redirectToLogin(returnTo = currentUrl()) {
    // Your auth worker(s) in other places use either `to=` or `return_to=`.
    // Here we’ll support `to` (matches session-profile-template.js).
    const login = toUrl(`${AUTH_ORIGIN}/login`, { to: returnTo });
    window.location.assign(login);
  }

  function redirectToPaywall({ feature = 'unknown', returnTo = currentUrl() } = {}) {
    const url = toUrl(PAYWALL_URL, {
      feature,
      return_to: returnTo,
      // helpful for debugging / analytics
      ts: Date.now(),
    });
    window.location.assign(url);
  }

  function getEntitled(sessionJson, feature) {
    // Prefer explicit entitlements from backend:
    // sessionJson.entitlements = { active: boolean, plan: string, features?: {...} }
    const ent = sessionJson?.entitlements || null;
    if (!ent) return { entitled: false, plan: sessionJson?.plan || sessionJson?.tier || '—' };

    // If your backend supports per-feature flags, use them; else fallback to ent.active.
    const features = ent.features || ent.scopes || null;
    if (features && typeof features === 'object' && feature) {
      const v = features[feature];
      if (typeof v === 'boolean') return { entitled: v, plan: ent.plan || sessionJson?.plan || '—' };
    }

    return { entitled: Boolean(ent.active), plan: ent.plan || sessionJson?.plan || '—' };
  }

  /**
   * Ensures the user is allowed to access `feature`.
   * Returns: { ok: boolean, reason?: 'login'|'paywall', plan?: string }
   */
  async function requireEntitlement(feature, { returnTo } = {}) {
    const rt = returnTo || currentUrl();

    const loggedIn = await isLoggedInViaAuthCookie();
    if (!loggedIn) {
      redirectToLogin(rt);
      return { ok: false, reason: 'login' };
    }

    const me = await apiMe();

    // If API session says unauthorized, treat as logged out (cookie mismatch).
    if (me.status === 401) {
      redirectToLogin(rt);
      return { ok: false, reason: 'login' };
    }

    if (!me.ok) {
      // If your API uses 402 for payment required, this is where we route.
      if (me.status === 402 || me.status === 403) {
        redirectToPaywall({ feature, returnTo: rt });
        return { ok: false, reason: 'paywall' };
      }

      // Default: fail closed → paywall (safer than letting through)
      redirectToPaywall({ feature, returnTo: rt });
      return { ok: false, reason: 'paywall' };
    }

    const { entitled, plan } = getEntitled(me.json, feature);
    if (!entitled) {
      redirectToPaywall({ feature, returnTo: rt });
      return { ok: false, reason: 'paywall', plan };
    }

    return { ok: true, plan };
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.EntitlementGate = {
    requireEntitlement,
    _debug: { apiMe, isLoggedInViaAuthCookie, redirectToLogin, redirectToPaywall },
  };
})();