/* components/api-docs/api-access.js
 *
 * Unifies API access + credential hydration for:
 *  - Docs page credential card
 *  - Future /profile dropdown credential card
 *
 * Security: never inject full API key into DOM. Only mask it.
 * Copy uses in-memory cache keyed by mount element.
 */
(function () {
  'use strict';

  const API_ORIGIN = 'https://api.haiphen.io';
  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  // Session storage keys for post-auth navigation
  const STORAGE = {
    postAuthHash: 'haiphen.post_auth.hash',
    postAuthSection: 'haiphen.post_auth.section',
  };

  // In-memory key cache per mounted root (WeakMap avoids leaks)
  const KEY_CACHE = new WeakMap();

  // Add near the top (after KEY_CACHE)
  const HYDRATE_STATE = new WeakMap();
  // How often we allow re-checking /me even if DOM keeps mutating
  const HYDRATE_TTL_MS = 5 * 60 * 1000 ; // 5m
  
  const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/28E28saW7f1Cead9PpaAw03';

  // Where to send users who already have entitlement.
  // You can override without redeploy by setting window.HAIPHEN.APP_ENV_URL at runtime.
  const DEFAULT_APP_ENV_URL = `${AUTH_ORIGIN}/app`;

  // For in-site routing when NOT entitled.
  const SERVICES_HASH = '#services';

  function redirectToLogin(returnTo) {
    const url = new URL(`${AUTH_ORIGIN}/login`);
    // pick ONE canonical param; "return_to" is what your later code assumes
    url.searchParams.set('return_to', returnTo || window.location.href);
    window.location.assign(url.toString());
  }

  async function fetchMe() {
    const url = `${API_ORIGIN}/v1/me`;
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    const status = resp.status;
    if (!resp.ok) {
      return { ok: false, status, data: null };
    }

    const data = await resp.json().catch(() => null);
    return { ok: true, status: 200, data };
  }

  /**
   * API entitlement check (flexible):
   * - prefers entitlements.features.api
   * - tolerates older names if you change the backend schema later
   */
  function hasApiEntitlement(entitlements) {
    if (!entitlements) return false;
    if (entitlements.active === false) return false;

    const f = entitlements.features || {};
    return Boolean(
      (entitlements.active && f.api) ||
      (entitlements.active && f.app) ||
      (entitlements.active && f.app_environment) ||
      (entitlements.active && f.api_access)
    );
  }

  function routeToServices() {
    try {
      // Keep hash shareable
      window.location.hash = SERVICES_HASH;

      // If your SPA-ish router is present, use it for the injected content
      if (typeof window.showSection === 'function') {
        window.showSection('Services');
      }
    } catch (e) {
      console.warn('[api-access] routeToServices failed', e);
      window.location.hash = SERVICES_HASH;
    }
  }

  function routeToAppEnv() {
    const url =
      window.HAIPHEN?.APP_ENV_URL ||
      DEFAULT_APP_ENV_URL;

    window.location.assign(url);
  }

  /**
   * Primary handler for "Request API access" buttons anywhere on the site.
   * Behavior:
   * - not logged in -> auth login
   * - entitled -> app env
   * - not entitled -> services section (subscribe)
   */
  async function requestApiAccess({ returnTo, source = 'request_api_access' } = {}) {
    const rt = returnTo || window.location.href;

    // Optional: let your EntitlementGate run first (if it exists)
    // but we still verify canonically via /v1/me.
    const gate = window?.HAIPHEN?.EntitlementGate?.requireEntitlement;
    if (typeof gate === 'function') {
      try {
        const gateRes = await gate('api', { returnTo: rt, source });
        if (gateRes && gateRes.ok === false) return;
      } catch (e) {
        console.warn('[api-access] EntitlementGate failed; falling back to /v1/me', e);
      }
    }

    const me = await fetchMe();

    // Not logged in: go authenticate
    if (!me.ok && (me.status === 401 || me.status === 403)) {
      redirectToLogin(rt);
      return;
    }

    // Some other failure: don't misroute; be conservative
    if (!me.ok) {
      console.warn('[api-access] /v1/me failed', me.status);
      alert('Unable to verify your access right now. Please refresh and try again.');
      return;
    }

    const ent = me.data?.entitlements ?? null;
    const entitled = hasApiEntitlement(ent);

    if (entitled) {
      routeToAppEnv();
      return;
    }

    // Not entitled: route to Services where Stripe checkout lives
    routeToServices();
  }
  function goToStripeCheckout({ returnTo, source = 'docs_request_access' } = {}) {
    try {
      sessionStorage.setItem('haiphen.checkout.return_to', returnTo || window.location.href);
      sessionStorage.setItem('haiphen.checkout.source', source);
    } catch {}
    window.location.assign(STRIPE_CHECKOUT_URL);
  }
  function getHydrateState(root) {
    let s = HYDRATE_STATE.get(root);
    if (!s) {
      s = { inFlight: null, lastOkAt: 0, lastAttemptAt: 0 };
      HYDRATE_STATE.set(root, s);
    }
    return s;
  }

  // Replace your hydrate() with this
  async function hydrate(rootOrSelector) {
    const root =
      typeof rootOrSelector === 'string'
        ? document.querySelector(rootOrSelector)
        : rootOrSelector;

    if (!root) return;

    // Wire once (your existing guard is good)
    wireActions(root);

    const s = getHydrateState(root);
    const now = Date.now();

    // If we hydrated recently, do nothing (prevents mutation storms)
    if (s.lastOkAt && now - s.lastOkAt < HYDRATE_TTL_MS) return;

    // If a hydrate is already running, don't start another
    if (s.inFlight) return;

    // Also prevent ultra-tight loops even if lastOkAt never gets set
    if (s.lastAttemptAt && now - s.lastAttemptAt < 1000) return; // 1s floor
    s.lastAttemptAt = now;

    s.inFlight = (async () => {
      await refreshCredsUI(root);
      s.lastOkAt = Date.now();
    })()
      .catch((err) => {
        // Don't spam console in a loop; keep it single line
        console.warn('[api-access] hydrate failed', err?.message || err);
      })
      .finally(() => {
        s.inFlight = null;
      });

    return s.inFlight;
  }

  function qs(root, sel) {
    return (root || document).querySelector(sel);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function maskKey(key) {
    if (!key) return '—';
    if (key.length <= 10) return '••••••••••';
    return `${key.slice(0, 4)}••••••••••${key.slice(-4)}`;
  }

  function formatDateMaybe(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return String(s);
    return d.toLocaleString();
  }

  function setToast(msg) {
    try {
      let toast = document.querySelector('[data-haiphen-toast]');
      if (!toast) {
        toast = document.createElement('div');
        toast.setAttribute('data-haiphen-toast', '1');
        toast.style.position = 'fixed';
        toast.style.right = '16px';
        toast.style.bottom = '16px';
        toast.style.zIndex = '4000';
        toast.style.background = 'rgba(15,23,42,0.92)';
        toast.style.color = '#fff';
        toast.style.padding = '10px 12px';
        toast.style.borderRadius = '12px';
        toast.style.fontWeight = '800';
        toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        toast.style.transition = 'opacity 160ms ease, transform 160ms ease';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });
      window.clearTimeout(toast.__t);
      toast.__t = window.setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
      }, 1200);
    } catch {}
  }

  async function fetchJson(path, opts = {}) {
    const url = `${API_ORIGIN}${path}`;
    const resp = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'content-type': 'application/json',
        ...(opts.headers || {}),
      },
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });

    const text = await resp.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    return {
      ok: resp.ok,
      status: resp.status,
      json,
      text,
      headers: {
        requestId: resp.headers.get('x-request-id') || resp.headers.get('X-Request-Id') || null,
      },
    };
  }

  function savePostAuthTarget({ section = 'Docs', hash = '#docs' } = {}) {
    try {
      sessionStorage.setItem(STORAGE.postAuthSection, section);
      sessionStorage.setItem(STORAGE.postAuthHash, hash);
    } catch {}
  }

  function consumePostAuthTarget() {
    try {
      const section = sessionStorage.getItem(STORAGE.postAuthSection);
      const hash = sessionStorage.getItem(STORAGE.postAuthHash);
      sessionStorage.removeItem(STORAGE.postAuthSection);
      sessionStorage.removeItem(STORAGE.postAuthHash);
      return { section, hash };
    } catch {
      return { section: null, hash: null };
    }
  }
  function redirectToLogin(returnTo) {
    const fn = window?.HAIPHEN?.AuthSession?.redirectToLogin;
    if (typeof fn === 'function') return fn(returnTo || window.location.href);

    const url = new URL(`${AUTH_ORIGIN}/login`);
    url.searchParams.set('return_to', returnTo || window.location.href);
    window.location.assign(url.toString());
  }

  async function isLoggedInViaAuthCookie() {
    const fn = window?.HAIPHEN?.AuthSession?.isLoggedInViaAuthCookie;
    if (typeof fn === 'function') return fn();
    try {
      const r = await fetch(`${AUTH_ORIGIN}/me`, { credentials: 'include', cache: 'no-store' });
      return r.ok;
    } catch {
      return false;
    }
  }
  async function startCheckout(returnTo) {
    const res = await fetchJson('/v1/billing/checkout', {
      method: 'POST',
      body: { return_to: returnTo },
    });
    if (!res.ok) {
      console.warn('[api-access] checkout failed', res);
      throw new Error(res.json?.error?.message || `Checkout failed (HTTP ${res.status})`);
    }
    const checkoutUrl = res.json?.url;
    if (!checkoutUrl) throw new Error('Checkout URL missing');
    window.location.assign(checkoutUrl);
  }

  // Expected /v1/me (your current shape):
  // {
  //   "user_login": "haiphenAI",
  //   "plan": "free",
  //   "api_key": { key_id, key_prefix, scopes, status, created_at, last_used_at }
  // }
  async function loadSession() {
    const res = await fetchJson('/v1/me');
    if (res.status === 401) {
      return { authenticated: false, user: null, entitlements: null, api_key: null };
    }
    if (!res.ok) {
      throw new Error(res.json?.error?.message || `Session check failed (HTTP ${res.status})`);
    }

    const j = res.json || {};

    // If you ever migrate to a richer contract later, keep this flexible.
    const authenticated =
      typeof j.authenticated === 'boolean'
        ? j.authenticated
        : Boolean(j.user_login || j.user?.email || j.email || j.sub);

    if (!authenticated) return { authenticated: false, user: null, entitlements: null, api_key: null };

    const user = {
      name: j.user?.name || j.name || j.user_login || j.sub || 'User',
      email: j.user?.email || j.email || '—',
    };

    // Your current /v1/me returns plan at top-level.
    const planGuess = j.plan || j.tier || '—';
    const paidGuess = planGuess === 'pro' || planGuess === 'enterprise';

    const entitlements = j.entitlements || {
      active: paidGuess,
      plan: planGuess,
      features: {
        api: paidGuess,
        rss: paidGuess,
        docs: true,
      }
    };

    return {
      authenticated: true,
      user,
      entitlements,
      api_key: j.api_key || null,
    };
  }

  async function rotateKey() {
    const res = await fetchJson('/v1/keys/rotate', { method: 'POST', body: {} });
    if (!res.ok) throw new Error(res.json?.error?.message || `Rotate failed (HTTP ${res.status})`);
    return res.json;
  }

  function renderCreds(root, { user, plan, apiKey, keyMeta }) {
    const cred = qs(root, '[data-api-cred]');
    if (!cred) return;

    const nameEl = qs(cred, '[data-api-user-name]');
    const emailEl = qs(cred, '[data-api-user-email]');
    const planEl = qs(cred, '[data-api-user-plan]');
    const keyEl = qs(cred, '[data-api-key]');
    const createdEl = qs(cred, '[data-api-key-created]');
    const lastUsedEl = qs(cred, '[data-api-key-last-used]');
    const copyBtn = qs(cred, '[data-api-copy-key]');
    const rotateBtn = qs(cred, '[data-api-rotate-key]');
    if (rotateBtn) {
      rotateBtn.disabled = false;
      rotateBtn.title = 'Rotate API key';
    }
    if (nameEl) nameEl.textContent = user?.name || '—';
    if (emailEl) emailEl.textContent = user?.email || '—';
    if (planEl) planEl.textContent = plan || '—';

    if (keyEl) keyEl.textContent = maskKey(apiKey);
    if (createdEl) createdEl.textContent = formatDateMaybe(keyMeta?.created_at);
    if (lastUsedEl) lastUsedEl.textContent = formatDateMaybe(keyMeta?.last_used_at);

    // cache real key in memory; never put it in DOM
    KEY_CACHE.set(root, apiKey || '');

    if (copyBtn) copyBtn.disabled = !(apiKey && apiKey.length > 0);

    cred.hidden = false;
  }

  function hideCreds(root) {
    const cred = qs(root, '[data-api-cred]');
    if (cred && cred.hidden !== true) cred.hidden = true;
    KEY_CACHE.delete(root);
  }

  async function refreshCredsUI(root) {
    // Default state: logged out (explicit)
    showLoggedOut(root);

    const loggedIn = await isLoggedInViaAuthCookie();
    if (!loggedIn) return;

    showLoggedIn(root);

    let session;
    try {
      session = await loadSession(); // API /v1/me
    } catch (err) {
      console.warn('[api-access] loadSession failed', err);
      showLoggedOut(root);
      return;
    }

    if (!session?.authenticated) {
      showLoggedOut(root);
      return;
    }

    const plan = session?.entitlements?.plan || '—';
    const k = session.api_key || null;

    renderCreds(root, {
      user: session.user,
      plan,
      apiKey: k?.key_prefix || '',
      keyMeta: { created_at: k?.created_at || null, last_used_at: k?.last_used_at || null },
    });

    const copyBtn = qs(root, '[data-api-copy-key]');
    if (copyBtn) copyBtn.disabled = true; // because you only have prefix
  }

  function wireActions(root) {
    if (root.__apiAccessWired) return;
    root.__apiAccessWired = true;

    root.addEventListener('click', async (e) => {
      // Copy
      const copyBtn = e.target.closest('[data-api-copy-key]');
      if (copyBtn) {
        const key = KEY_CACHE.get(root) || '';
        if (!key) return;

        try {
          await navigator.clipboard.writeText(key);
          const prev = copyBtn.textContent;
          copyBtn.textContent = 'Copied prefix';
          setTimeout(() => (copyBtn.textContent = prev), 900);
        } catch (err) {
          console.warn('[api-access] clipboard failed', err);
          setToast('Copy failed');
        }
        return;
      }

      // Rotate
      const rotBtn = e.target.closest('[data-api-rotate-key]');
      if (rotBtn) {
        rotBtn.disabled = true;
        const prev = rotBtn.textContent;
        rotBtn.textContent = 'Rotating…';
        try {
          await rotateKey();
          setToast('Key rotated');
          await refreshCredsUI(root);
        } catch (err) {
          console.warn('[api-access] rotate failed', err);
          setToast('Rotate failed');
        } finally {
          rotBtn.textContent = prev;
          rotBtn.disabled = false;
        }
      }
    });
  }

  async function rotateKeyAndRefresh(rootOrEl) {
    const root =
      typeof rootOrEl === 'string'
        ? document.querySelector(rootOrEl)
        : rootOrEl;

    // rotate server-side
    await rotateKey();

    // refresh all known mounts
    try {
      const docsRoot = document.querySelector('#api-docs');
      if (docsRoot) await refreshCredsUI(docsRoot);
    } catch {}

    try {
      const sessionSlot = document.querySelector('#session-slot');
      if (sessionSlot) await refreshCredsUI(sessionSlot);
    } catch {}

    try {
      const sidebarCard = document.querySelector('#sidebar-session-card');
      if (sidebarCard) await refreshCredsUI(sidebarCard);
    } catch {}

    // refresh the caller too
    if (root) {
      try { await refreshCredsUI(root); } catch {}
    }
  }

  async function requestAccessFlow({ returnHash = '#docs' } = {}) {
    const returnTo = `${window.location.origin}/${returnHash}`;
    savePostAuthTarget({ section: 'Docs', hash: returnHash });

    const session = await loadSession();
    if (!session?.authenticated) {
      redirectToLogin(returnTo);
      return;
    }

    const entitled = Boolean(session?.entitlements?.active);
    if (!entitled) {
      // ✅ Subscribe-like behavior: route to checkout
      goToStripeCheckout({ returnTo, source: 'api_docs_request_access' });
      return;
    }

    // Already entitled: show docs
    try { if (typeof window.showSection === 'function') window.showSection('Docs'); } catch {}
    try { window.location.hash = returnHash; } catch {}

    // ✅ Refresh sidebar creds card (canonical place)
    try {
      const sidebar = document.querySelector('#sidebar-session-card');
      if (sidebar) {
        wireActions(sidebar);
        await refreshCredsUI(sidebar);
      }
    } catch {}

    const tryAttach = async () => {
      const root = document.querySelector('#api-docs');
      if (!root) return false;
      wireActions(root);
      await refreshCredsUI(root);
      return true;
    };

    if (await tryAttach()) return;
    requestAnimationFrame(() => void tryAttach());
  }

  function maybeHandlePostAuthLanding() {
    // if we bounce back to #docs (or anything starting with #docs)
    const rawHash = String(window.location.hash || '');
    if (!rawHash || !rawHash.toLowerCase().startsWith('#docs')) return;

    try {
      if (typeof window.showSection === 'function') window.showSection('Docs');
    } catch {}

    const attempt = async () => {
      const root = document.querySelector('#api-docs');
      if (!root) return false;
      wireActions(root);
      await refreshCredsUI(root);
      return true;
    };

    void (async () => {
      if (await attempt()) return;
      requestAnimationFrame(() => void attempt());
    })();
  }

  function install() {
    window.HAIPHEN.ApiAccess = {
      // ✅ The function your Trades button expects
      requestApiAccess,

      // ✅ Keep the Docs flow too
      requestAccess: requestAccessFlow,

      refreshCredsUI: (root) => refreshCredsUI(root),
      hydrate,
      rotateKeyAndRefresh,
      _debug: { nowIso, consumePostAuthTarget },
    };

    requestAnimationFrame(() => {
      const profileRoot = document.querySelector('[data-profile-root], #session-slot');
      if (profileRoot) void hydrate(profileRoot);

      const sidebarRoot = document.querySelector('#sidebar-session-card');
      if (sidebarRoot) void hydrate(sidebarRoot);
    });

    maybeHandlePostAuthLanding();
  }

  function getSessionRoot() {
    // New canonical mount
    const slot = document.getElementById('session-slot');
    if (slot) return slot;

    // Back-compat: older header markup
    return document.querySelector('[data-profile-root]');
  }

  function showLoggedOut(root) {
    const out = qs(root, '[data-api-logged-out]');
    const cred = qs(root, '[data-api-cred]');
    if (cred) cred.hidden = true;
    if (out) out.hidden = false;
    KEY_CACHE.delete(root);
  }

  function showLoggedIn(root) {
    const out = qs(root, '[data-api-logged-out]');
    if (out) out.hidden = true;
  }

  function onHeaderReady(cb) {
    // If header already injected, run immediately
    if (document.getElementById('site-header') || document.getElementById('session-slot')) {
      cb();
      return;
    }

    // Otherwise wait for your header injector event
    window.addEventListener('haiphen:header:ready', () => cb(), { once: true });
  }
  install();
})();