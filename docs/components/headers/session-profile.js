/* docs/components/headers/session-profile.js
 * Renders #session-slot as:
 *  - Logged out: Google login button (guarantees email capture)
 *  - Logged in: avatar pill + structured dropdown with full navigation
 */
(function () {
  'use strict';

  // Signal to site.js that a richer session component is managing #session-slot
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN._sessionManaged = true;

  const AUTH_ORIGIN = window.HAIPHEN?.AUTH_ORIGIN || 'https://auth.haiphen.io';
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

  function loginHref(provider) {
    const here = window.location.href;
    const u = new URL(`${AUTH_ORIGIN}/login`);
    u.searchParams.set('to', here);
    u.searchParams.set('provider', provider || 'github');
    return u.toString();
  }

  function renderLoggedOut(slot) {
    const siteKey = window.HAIPHEN?.TURNSTILE_SITE_KEY || '';

    slot.innerHTML = `
      <div class="session-login-buttons">
        <button type="button" class="session-login-btn session-login-btn--google" data-provider="google">
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Sign in with Google
        </button>
        ${siteKey ? `<div class="session-turnstile" data-turnstile-container></div>` : ''}
      </div>
    `;

    // Wire Turnstile-gated login
    const btn = slot.querySelector('[data-provider]');
    if (!btn) return;

    if (siteKey && typeof turnstile !== 'undefined') {
      const container = slot.querySelector('[data-turnstile-container]');
      turnstile.render(container, {
        sitekey: siteKey,
        size: 'compact',
        callback: function (token) {
          container.dataset.cfToken = token;
        },
      });

      btn.addEventListener('click', () => {
        const token = container?.dataset.cfToken;
        if (!token) {
          container.style.outline = '2px solid #EA4335';
          container.style.borderRadius = '4px';
          return;
        }
        const href = loginHref(btn.dataset.provider);
        window.location.assign(href + '&cf_token=' + encodeURIComponent(token));
      });
    } else {
      // No Turnstile — plain redirect
      btn.addEventListener('click', () => {
        window.location.assign(loginHref(btn.dataset.provider));
      });
    }
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sessionDropdownHtml(user) {
    const name = user?.name || user?.sub || 'User';
    const sub = user?.sub || '—';
    const email = user?.email || '—';
    const avatar = user?.avatar || user?.avatar_url || '';
    const provider = user?.provider || 'github';
    const plan = user?.plan || 'Free';

    return `
      <div class="session-menu" data-session-menu>
        <button class="session-pill" type="button" aria-haspopup="true" aria-expanded="false">
          ${avatar ? `<img class="session-avatar" src="${escapeHtml(avatar)}" alt="" aria-hidden="true" />` : ''}
          <span>${escapeHtml(name)}</span>
        </button>

        <div class="session-dropdown" role="menu" aria-label="Session menu">
          <div class="session-dropdown__identity">
            ${avatar ? `<img class="session-dropdown__avatar" src="${escapeHtml(avatar)}" alt="" />` : ''}
            <div class="session-dropdown__info">
              <div class="session-dropdown__name">${escapeHtml(name)}</div>
              <div class="session-dropdown__meta">
                ${escapeHtml(email)} <span style="opacity:.5;">•</span> @${escapeHtml(sub)}
              </div>
              <span class="session-dropdown__plan">${escapeHtml(plan)}</span>
            </div>
          </div>

          <div class="session-dropdown__divider"></div>

          <nav class="session-dropdown__nav">
            <a class="session-dropdown__link" href="javascript:void(0)" role="menuitem" data-session-nav="profile">
              Profile
            </a>
            <a class="session-dropdown__link" href="javascript:void(0)" role="menuitem" data-session-nav="getting-started">
              Getting Started
            </a>
            <a class="session-dropdown__link" href="javascript:void(0)" role="menuitem" data-session-nav="settings">
              Settings
            </a>
            <a class="session-dropdown__link" href="javascript:void(0)" role="menuitem" data-session-nav="apikeys">
              API Keys
            </a>
            <a class="session-dropdown__link" href="javascript:void(0)" role="menuitem" data-session-nav="billing">
              Billing & Plan
            </a>
            <a class="session-dropdown__link" href="javascript:void(0)" role="menuitem" data-session-nav="quota">
              Rate Limits & Quota
            </a>
          </nav>

          <div class="session-dropdown__divider"></div>

          <div class="session-dropdown__actions">
            <button class="session-dropdown__logout" type="button" data-session-action="logout">
              Logout
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Map nav items to profile sub-sections or SPA sections
  const NAV_MAP = {
    profile:           { section: 'Profile', tab: 'overview', hash: '#profile' },
    settings:          { section: 'Profile', tab: 'settings', hash: '#profile/settings' },
    billing:           { section: 'Profile', tab: 'billing', hash: '#profile/billing' },
    quota:             { section: 'Profile', tab: 'billing', hash: '#profile/billing' },
    apikeys:           { section: 'Profile', tab: 'apikeys', hash: '#profile/apikeys' },
    'getting-started': { section: 'GettingStarted', hash: '#getting-started' },
  };

  function renderLoggedIn(slot, user) {
    slot.innerHTML = sessionDropdownHtml(user);

    const menu = qs(slot, '[data-session-menu]');
    const pill = qs(menu, '.session-pill');

    // Toggle aria-expanded
    pill.addEventListener('click', () => {
      const expanded = pill.getAttribute('aria-expanded') === 'true';
      pill.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });

    // Wire dropdown actions
    menu.addEventListener('click', async (e) => {
      // Navigation links
      const nav = e.target.closest('[data-session-nav]');
      if (nav) {
        e.preventDefault();
        const page = nav.getAttribute('data-session-nav');
        const mapping = NAV_MAP[page];

        // Dismiss dropdown immediately (override CSS :hover/:focus-within)
        const dropdown = menu.querySelector('.session-dropdown');
        if (dropdown) {
          dropdown.style.opacity = '0';
          dropdown.style.visibility = 'hidden';
          dropdown.style.pointerEvents = 'none';
          menu.addEventListener('mouseleave', function handler() {
            dropdown.style.removeProperty('opacity');
            dropdown.style.removeProperty('visibility');
            dropdown.style.removeProperty('pointer-events');
            menu.removeEventListener('mouseleave', handler);
          }, { once: true });
        }
        pill.setAttribute('aria-expanded', 'false');

        // Update URL hash for shareability
        if (mapping?.hash) {
          window.location.hash = mapping.hash;
        }

        window.dispatchEvent(new CustomEvent('haiphen:session:navigate', {
          detail: { page, tab: mapping?.tab || null },
        }));

        if (mapping?.section === 'GettingStarted') {
          if (typeof window.showSection === 'function') window.showSection('GettingStarted');
        } else if (mapping?.section === 'Profile') {
          if (typeof window.HAIPHEN?.showProfile === 'function') {
            await window.HAIPHEN.showProfile({ tab: mapping?.tab });
          } else if (typeof window.showSection === 'function') {
            window.showSection('Profile');
          }
        }
        return;
      }

      const btn = e.target.closest('[data-session-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-session-action');

      if (action === 'logout') {
        btn.disabled = true;
        btn.textContent = 'Logging out…';
        const here = window.location.href;
        const u = new URL(LOGOUT_URL);
        u.searchParams.set('to', here);
        u.searchParams.set('reauth', '1');
        window.location.assign(u.toString());
      }
    });

    // Let other components know session is ready
    requestAnimationFrame(() => {
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
