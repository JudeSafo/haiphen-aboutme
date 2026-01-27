/* docs/components/profile/profile.js
 *
 * Profile page:
 * - cookie-auth user + plan info (via API /v1/me)
 * - list API keys (via /v1/keys/list)
 * - rotate key (via /v1/keys/rotate) and show raw key ONCE
 * - revoke key (via /v1/keys/revoke)
 *
 * Integration:
 * - exposes window.HAIPHEN.showProfile()
 * - listens for sidebar event haiphen:session:navigate { page: "profile" }
 */
(function () {
  'use strict';

  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const LOG = '[profile]';

  const API_ORIGIN = 'https://api.haiphen.io';
  const AUTH_ORIGIN = 'https://auth.haiphen.io';

  const MOUNT_ID = 'content-widget'; // your dynamic content root

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function setText(el, v) {
    if (!el) return;
    el.textContent = v == null || v === '' ? '—' : String(v);
  }

  function fmtIso(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString();
    } catch {
      return String(iso);
    }
  }

  function escapeHtml(v) {
    const s = v == null ? '' : String(v);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(v) {
    // good enough for attribute contexts; keep it strict
    return escapeHtml(v).replace(/`/g, '&#96;');
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  
  function shouldAutoOpenProfile() {
    const h = String(window.location.hash || '').toLowerCase();
    return h === '#profile' || h.startsWith('#profile:');
  }

  function setProfileHash() {
    try {
      // don’t clobber other SPA state if you use more complex hashes later
      if (!window.location.hash || !String(window.location.hash).toLowerCase().startsWith('#profile')) {
        window.location.hash = '#profile';
      }
    } catch {/* noop */}
  }

  // Optional: auto-open if user visits /#profile directly
  window.addEventListener('DOMContentLoaded', () => {
    if (shouldAutoOpenProfile() && typeof NS.showProfile === 'function') {
      NS.showProfile().catch((e) => console.warn(LOG, 'auto-open profile failed', e));
    }
  });

  // Public API
  NS.showProfile = showProfile;

  // If profile is opened via sidebar, "persist" it by setting hash
  const _origShowProfile = NS.showProfile;
  NS.showProfile = async function wrappedShowProfile() {
    setProfileHash();
    return _origShowProfile();
  };

  async function getJson(url) {
    const r = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!r.ok) {
      const msg = data?.error?.message || data?.error || `HTTP ${r.status}`;
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function postJson(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!r.ok) {
      const msg = data?.error?.message || data?.error || `HTTP ${r.status}`;
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function redirectToLogin() {
    const here = window.location.href;
    const u = new URL(`${AUTH_ORIGIN}/login`);
    u.searchParams.set('to', here);
    window.location.assign(u.toString());
  }

  function showToast(msg) {
    // keep it simple for now; swap to your site-wide toast later
    try {
      window.alert(String(msg));
    } catch {
      /* noop */
    }
  }

  async function ensureMounted() {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) throw new Error(`${LOG} missing #${MOUNT_ID}`);

    await injectCssOnce('assets/base.css');
    await injectCssOnce('components/profile/profile.css');

    const html = await fetchText('components/profile/profile.html');
    mount.innerHTML = html;

    wire(mount);
    await hydrate(mount);
  }

  async function hydrate(root) {
    // Hide "reveal" region on (re)hydrate unless we just rotated.
    const reveal = qs('[data-profile-reveal]', root);
    if (reveal) reveal.hidden = true;

    // 1) cookie-auth user + plan + active key metadata
    let me;
    try {
      me = await getJson(`${API_ORIGIN}/v1/me`);
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        redirectToLogin();
        return;
      }
      console.warn(LOG, 'failed to load /v1/me', e);
      throw e;
    }

    setText(qs('[data-profile-user]', root), me?.user_login || '—');
    setText(qs('[data-profile-email]', root), me?.user?.email || me?.email || '—');

    const plan = me?.plan || me?.entitlements?.plan || 'free';
    setText(qs('[data-profile-plan]', root), plan);

    // active key summary (metadata only)
    const k = me?.api_key || null;
    setText(qs('[data-profile-active-prefix]', root), k?.key_prefix || '—');
    setText(qs('[data-profile-active-created]', root), fmtIso(k?.created_at));
    setText(qs('[data-profile-active-used]', root), k?.last_used_at ? fmtIso(k.last_used_at) : '—');
    setText(
      qs('[data-profile-active-scopes]', root),
      Array.isArray(k?.scopes) ? k.scopes.join(', ') : '—'
    );

    // 2) list keys table
    await refreshKeysTable(root);
  }

  async function refreshKeysTable(root) {
    const tbody = qs('[data-profile-keys-tbody]', root);
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="hp-muted">Loading…</td></tr>`;

    let data;
    try {
      data = await getJson(`${API_ORIGIN}/v1/keys/list`);
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        redirectToLogin();
        return;
      }
      console.warn(LOG, 'failed to load keys list', e);
      tbody.innerHTML = `<tr><td colspan="7" class="hp-muted">Unable to load keys.</td></tr>`;
      return;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="hp-muted">No keys found.</td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((k) => {
        const isActive = k.status === 'active';
        const badgeClass = isActive ? 'hp-badge hp-badge--active' : 'hp-badge hp-badge--revoked';
        const badgeText = isActive ? 'active' : 'revoked';
        const scopes = Array.isArray(k.scopes) ? k.scopes.join(', ') : '—';

        const revokeBtn = isActive
          ? `<button class="hp-profile__btn hp-profile__btn--ghost" type="button"
              data-profile-action="revoke" data-key-id="${escapeAttr(k.key_id)}">Revoke</button>`
          : `<span class="hp-muted">—</span>`;

        return `
        <tr>
          <td><span class="${badgeClass}">${badgeText}</span></td>
          <td><code class="hp-code" style="display:inline-block; padding:2px 8px;">${escapeHtml(
            k.key_prefix || '—'
          )}</code></td>
          <td>${escapeHtml(scopes)}</td>
          <td>${escapeHtml(fmtIso(k.created_at))}</td>
          <td>${escapeHtml(k.last_used_at ? fmtIso(k.last_used_at) : '—')}</td>
          <td>${escapeHtml(k.revoked_at ? fmtIso(k.revoked_at) : '—')}</td>
          <td style="text-align:right;">${revokeBtn}</td>
        </tr>
      `;
      })
      .join('');
  }

  async function rotateKey(root) {
    const btn = qs('[data-profile-action="rotate"]', root);
    if (!btn) return;

    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Rotating…';

    try {
      // Find current active key_id from /v1/keys/list (so rotate can revoke it)
      const list = await getJson(`${API_ORIGIN}/v1/keys/list`);
      const active =
        (Array.isArray(list?.items) ? list.items : []).find((k) => k.status === 'active') || null;

      const res = await postJson(`${API_ORIGIN}/v1/keys/rotate`, {
        revoke_key_id: active?.key_id || undefined,
        // scopes: undefined -> API defaults; pass explicit scopes if you want:
        // scopes: ["metrics:read","rss:read"]
      });

      const raw = res?.api_key;
      if (!raw) throw new Error('Rotate succeeded but API did not return api_key');

      // Reveal once
      const reveal = qs('[data-profile-reveal]', root);
      const keyEl = qs('[data-profile-newkey]', root);
      if (keyEl) keyEl.textContent = String(raw);
      if (reveal) reveal.hidden = false;

      // Refresh summaries/tables (active key metadata updates via /v1/me)
      await hydrate(root);
    } catch (e) {
      console.warn(LOG, 'rotate failed', e);
      showToast(`Rotate failed: ${e?.message || e}`);
    } finally {
      btn.textContent = prev;
      btn.disabled = false;
    }
  }

  async function revokeKey(root, keyId) {
    if (!keyId) return;

    const ok = window.confirm('Revoke this key? Any clients using it will immediately lose access.');
    if (!ok) return;

    try {
      await postJson(`${API_ORIGIN}/v1/keys/revoke`, { key_id: String(keyId) });
      await hydrate(root);
    } catch (e) {
      console.warn(LOG, 'revoke failed', e);
      showToast(`Revoke failed: ${e?.message || e}`);
    }
  }

  async function copyNewKey(root) {
    const keyEl = qs('[data-profile-newkey]', root);
    const raw = (keyEl?.textContent || '').trim();
    if (!raw || raw === '—') return;

    try {
      await navigator.clipboard.writeText(raw);
      showToast('Copied.');
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = raw;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Copied.');
    }
  }

  function wire(root) {
    // Prevent double-wiring if ensureMounted() is called repeatedly.
    if (root.__haiphenProfileWired) return;
    root.__haiphenProfileWired = true;

    root.addEventListener('click', async (e) => {
      const t = e.target;

      const rotate = t?.closest?.('[data-profile-action="rotate"]');
      if (rotate) {
        e.preventDefault();
        await rotateKey(root);
        return;
      }

      const copy = t?.closest?.('[data-profile-action="copy-new"]');
      if (copy) {
        e.preventDefault();
        await copyNewKey(root);
        return;
      }

      const revoke = t?.closest?.('[data-profile-action="revoke"]');
      if (revoke) {
        e.preventDefault();
        const keyId = revoke.getAttribute('data-key-id');
        await revokeKey(root, keyId);
        return;
      }

      const close = t?.closest?.('[data-profile-action="close"]');
      if (close) {
        e.preventDefault();
        // If your profile is in an overlay, hide it here.
        // If it's a page, you can route elsewhere.
        try {
          if (typeof NS.hideOverlay === 'function') NS.hideOverlay();
        } catch {
          /* noop */
        }
      }
    });
  }

  async function showProfile() {
    try {
      await ensureMounted();
    } catch (e) {
      console.warn(LOG, 'failed to mount profile', e);
      showToast(`Unable to load profile: ${e?.message || e}`);
    }
  }

  // Public API
  NS.showProfile = showProfile;

  // Sidebar navigation hook
  window.addEventListener('haiphen:session:navigate', (ev) => {
    const page = ev?.detail?.page;
    if (page === 'profile') {
      // Best-effort; do not throw in event loop
      showProfile().catch((e) => console.warn(LOG, 'showProfile failed', e));
    }
  });
})();