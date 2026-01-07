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
    const url = new URL(`${AUTH_ORIGIN}/login`);
    url.searchParams.set('return_to', returnTo);
    window.location.assign(url.toString());
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
    const entitlements = j.entitlements || {
      active: Boolean(j.entitlements?.active ?? true), // free plan can still be "active" for docs
      plan: j.plan || j.tier || '—',
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
      // Disable rotate if we don't have a full key lifecycle implemented yet.
      rotateBtn.disabled = true;
      rotateBtn.title = 'Key rotation not available yet';
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
    if (cred) cred.hidden = true;
    KEY_CACHE.delete(root);
  }
  async function isLoggedInViaAuthCookie() {
    try {
      const r = await fetch(`${AUTH_ORIGIN}/me`, { credentials: 'include', cache: 'no-store' });
      return r.ok;
    } catch {
      return false;
    }
  }
  async function refreshCredsUI(root) {
    hideCreds(root);

    // ✅ Gate: if not logged in, don't even call api /v1/me
    const loggedIn = await isLoggedInViaAuthCookie();
    if (!loggedIn) return;

    let session;
    try {
      session = await loadSession(); // calls API /v1/me
    } catch (err) {
      console.warn('[api-access] loadSession failed', err);
      return;
    }
    if (!session?.authenticated) return;

    const plan = session?.entitlements?.plan || '—';

    // Pull key info from /v1/me only.
    const k = session.api_key || null;

    // You currently only have key_prefix (good). Do NOT pretend you have full key.
    const displayKey = k?.key_prefix || '';

    renderCreds(root, {
      user: session.user,
      plan,
      apiKey: displayKey, // masked in UI anyway
      keyMeta: { created_at: k?.created_at || null, last_used_at: k?.last_used_at || null },
    });

    // IMPORTANT: if we only have a prefix, disable Copy (you can't copy what you don't have).
    const copyBtn = qs(root, '[data-api-copy-key]');
    if (copyBtn) copyBtn.disabled = true;
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
      await startCheckout(returnTo);
      return;
    }

    // Already entitled: show docs and hydrate when mounted
    try {
      if (typeof window.showSection === 'function') window.showSection('Docs');
    } catch {}
    try {
      window.location.hash = returnHash;
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

  // Public API: can hydrate any root that contains [data-api-cred]
  async function hydrate(rootOrSelector) {
    const root =
      typeof rootOrSelector === 'string'
        ? document.querySelector(rootOrSelector)
        : rootOrSelector;

    if (!root) return;
    wireActions(root);
    await refreshCredsUI(root);
  }

  function install() {
    window.HAIPHEN = window.HAIPHEN || {};
    window.HAIPHEN.ApiAccess = {
      requestAccess: requestAccessFlow,
      refreshCredsUI: (root) => refreshCredsUI(root),
      hydrate,
      _debug: { nowIso, consumePostAuthTarget }, // optional
    };

    // Auto-hydrate on mount for docs (and later profile)
    const obs = new MutationObserver(() => {
      // Docs
      const docsRoot = document.querySelector('#api-docs');
      if (docsRoot) void hydrate(docsRoot);

      // Future: profile dropdown mount
      const profileRoot = document.querySelector('[data-profile-root]');
      if (profileRoot) void hydrate(profileRoot);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    maybeHandlePostAuthLanding();
  }
  function getSessionRoot() {
    // New canonical mount
    const slot = document.getElementById('session-slot');
    if (slot) return slot;

    // Back-compat: older header markup
    return document.querySelector('[data-profile-root]');
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