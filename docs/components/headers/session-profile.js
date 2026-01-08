/* docs/components/headers/session-profile.js
 * Renders #session-slot as:
 *  - Logged out: Login button
 *  - Logged in: avatar pill + dropdown w/ logout + api key actions
 */
(function () {
  'use strict';

  const AUTH_ORIGIN = 'https://auth.haiphen.io';
  const LOGIN_URL = `${AUTH_ORIGIN}/login`;
  const LOGOUT_URL = `${AUTH_ORIGIN}/logout`;

  function qs(root, sel) {
    return (root || document).querySelector(sel);
  }

  async function authMe() {
    try {
      const r = await fetch(`${AUTH_ORIGIN}/me`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok) return { ok: false, status: r.status, user: null };
      const user = await r.json().catch(() => null);
      return { ok: true, status: r.status, user };
    } catch {
      return { ok: false, status: 0, user: null };
    }
  }

  function loginHref() {
    // preserve current page as return target (works w/ your auth worker "to" param)
    const here = window.location.href;
    const u = new URL(LOGIN_URL);
    u.searchParams.set('to', here);
    return u.toString();
  }

  function renderLoggedOut(slot) {
    slot.innerHTML = `<a href="${loginHref()}" class="login-btn">Login</a>`;
  }

  function sessionDropdownHtml(user) {
    const name = user?.name || user?.sub || 'User';
    const sub = user?.sub || '—';
    const email = user?.email || '—';
    const avatar = user?.avatar || user?.avatar_url || '';

    // The api-cred block is reused (same selectors) so ApiAccess.hydrate can fill it.
    const apiCred = window.HAIPHEN?.SessionProfileTemplate?.apiCredBlockHtml
      ? window.HAIPHEN.SessionProfileTemplate.apiCredBlockHtml()
      : `<div class="api-cred" data-api-cred hidden></div>`;

    return `
      <div class="session-menu" data-session-menu>
        <button class="session-pill" type="button" aria-haspopup="true" aria-expanded="false">
          ${avatar ? `<img class="session-avatar" src="${avatar}" alt="" aria-hidden="true" />` : ''}
          <span>${name}</span>
        </button>

        <div class="session-dropdown" role="menu" aria-label="Session menu">
          <div style="padding: 8px 10px 4px 10px;">
            <div style="font-weight: 900; font-size: 13px;">${name}</div>
            <div style="opacity: .75; font-weight: 700; font-size: 12px; margin-top: 2px;">
              ${email} <span style="opacity:.55;">•</span> ${sub}
            </div>
          </div>

          <div class="session-panel">
            ${apiCred}
          </div>

          <div style="display:flex; gap:8px; padding: 10px;">
            <button class="api-btn api-btn-ghost" type="button" data-session-action="rotate-key">
              Request new API key
            </button>
            <button class="api-btn api-btn-ghost" type="button" data-session-action="logout">
              Logout
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLoggedIn(slot, user) {
    slot.innerHTML = sessionDropdownHtml(user);

    const menu = qs(slot, '[data-session-menu]');
    const pill = qs(menu, '.session-pill');
    const dropdown = qs(menu, '.session-dropdown');

    // Accessibility: toggle aria-expanded on focus/blur
    pill.addEventListener('click', () => {
      const expanded = pill.getAttribute('aria-expanded') === 'true';
      pill.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      // CSS already opens on :hover/:focus-within; aria is for semantics.
    });

    // Wire dropdown actions
    menu.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-session-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-session-action');

      if (action === 'logout') {
        btn.disabled = true;
        btn.textContent = 'Logging out…';
        try {
          await fetch(LOGOUT_URL, { method: 'GET', credentials: 'include', cache: 'no-store' });
        } catch {}
        // Always hard refresh to ensure cookie-cleared + UI resets
        window.location.reload();
        return;
      }

      if (action === 'rotate-key') {
        btn.disabled = true;
        const prev = btn.textContent;
        btn.textContent = 'Rotating…';
        try {
          // Prefer ApiAccess helper so the DOM in dropdown + sidebar updates
          if (window.HAIPHEN?.ApiAccess?.rotateKeyAndRefresh) {
            await window.HAIPHEN.ApiAccess.rotateKeyAndRefresh(menu);
          } else {
            console.warn('[session-profile] ApiAccess.rotateKeyAndRefresh missing');
          }
        } catch (err) {
          console.warn('[session-profile] rotate failed', err?.message || err);
        } finally {
          btn.textContent = prev;
          btn.disabled = false;
        }
      }
    });

    // Hydrate the api-cred block inside the dropdown
    requestAnimationFrame(() => {
      try {
        if (window.HAIPHEN?.ApiAccess?.hydrate) window.HAIPHEN.ApiAccess.hydrate(menu);
      } catch {}
      // Let other components know session is ready
      window.dispatchEvent(new CustomEvent('haiphen:session:ready', { detail: { user } }));
    });
  }

  async function render() {
    const slot = document.getElementById('session-slot');
    if (!slot) return;

    const me = await authMe();
    if (!me.ok || !me.user) {
      renderLoggedOut(slot);
      window.dispatchEvent(new CustomEvent('haiphen:session:ready', { detail: { user: null } }));
      return;
    }
    renderLoggedIn(slot, me.user);
  }

  // Wait until header injected
  function onHeaderReady(cb) {
    if (document.getElementById('site-header') || document.getElementById('session-slot')) return cb();
    window.addEventListener('haiphen:header:ready', () => cb(), { once: true });
  }

  onHeaderReady(() => void render());
})();