/* docs/components/sidebar/site-sidebar.js
 * Injects a professional sidebar and wires it to showSection().
 */
(function () {
  'use strict';

  const SIDEBAR_ID = 'site-sidebar';
  const MOUNT_ID = 'sidebar-mount';

  function qs(id) {
    return document.getElementById(id);
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function setActiveLink(root, activeAnchorEl) {
    root.querySelectorAll('a.site-sidebar__link').forEach((a) => {
      a.classList.toggle('is-active', a === activeAnchorEl);
    });
  }

  function wire(root) {
    root.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-section]');
      if (!a) return;

      e.preventDefault();

      const section = a.getAttribute('data-section') || '';
      const target = a.getAttribute('data-target') || '';
      const emph = a.getAttribute('data-emph') || '';

      // Pre-select mission service before navigation (so loadMission renders the right one)
      if (target && target.startsWith('#svc-') && typeof window.HAIPHEN?.selectMissionService === 'function') {
        window.HAIPHEN.selectMissionService(target.replace('#svc-', ''));
      }

      // Prefer deep-link navigation if available
      if (typeof window.HAIPHEN?.sidebarNavigate === 'function' && section) {
        window.HAIPHEN.sidebarNavigate({
          section,
          target: target || null,
          emphasize: emph || target || null,
        });
        setActiveLink(root, a);
        return;
      }

      // Fallback: old behavior
      if (section && typeof window.showSection === 'function') {
        window.showSection(section);
        setActive(root, section);
      }

      // Legacy optional behavior
      if (a.getAttribute('data-action') === 'scroll-ethos' && typeof window.scrollToEthos === 'function') {
        window.scrollToEthos();
      }
    });
  }

  function insertSidebarSessionCard(mountEl) {
    const slot = mountEl.querySelector('#sidebar-session-card');
    if (!slot) return;

    const AUTH_ORIGIN = 'https://auth.haiphen.io';
    const LOGOUT_URL = `${AUTH_ORIGIN}/logout`;

    function loginHref(provider) {
      const here = window.location.href;
      const u = new URL(`${AUTH_ORIGIN}/login`);
      u.searchParams.set('to', here);
      u.searchParams.set('provider', provider || 'github');
      return u.toString();
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

    function renderLoggedOut() {
      const siteKey = window.HAIPHEN?.TURNSTILE_SITE_KEY || '';

      slot.innerHTML = `
        <div class="sidebar-session">
          <div class="sidebar-session__title">Session</div>
          <div class="sidebar-session__sub">You're not logged in.</div>
          <div class="sidebar-login-buttons">
            <button type="button" class="sidebar-login-btn sidebar-login-btn--github" data-provider="github">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              GitHub
            </button>
            <button type="button" class="sidebar-login-btn sidebar-login-btn--google" data-provider="google">
              <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Google
            </button>
          </div>
          ${siteKey ? `<div class="sidebar-turnstile" data-turnstile-container style="margin-top:8px;"></div>` : ''}
        </div>
      `;
      slot.hidden = false;

      // Wire Turnstile-gated login
      const btns = slot.querySelectorAll('[data-provider]');
      const container = slot.querySelector('[data-turnstile-container]');

      if (siteKey && typeof turnstile !== 'undefined' && container) {
        turnstile.render(container, {
          sitekey: siteKey,
          size: 'compact',
          callback: function (token) {
            container.dataset.cfToken = token;
          },
        });

        btns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            const token = container?.dataset.cfToken;
            if (!token) {
              container.style.outline = '2px solid #EA4335';
              container.style.borderRadius = '4px';
              return;
            }
            const href = loginHref(btn.dataset.provider);
            window.location.assign(href + '&cf_token=' + encodeURIComponent(token));
          });
        });
      } else {
        // No Turnstile — plain redirect
        btns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            window.location.assign(loginHref(btn.dataset.provider));
          });
        });
      }
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

    function sidebarMenuHtml(user) {
      const name = user?.name || user?.sub || 'User';
      const email = user?.email || '—';
      const sub = user?.sub || '—';
      const avatar = user?.avatar || user?.avatar_url || '';

      return `
        <div class="sidebar-session-menu" data-sidebar-session-menu>
          <div class="sidebar-session-trigger" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">
            <div class="sidebar-session-left">
              <div class="sidebar-session-title">${escapeHtml(name)}</div>
              <div class="sidebar-session-sub">${escapeHtml(email)}</div>
            </div>
            ${avatar ? `<img class="sidebar-session-avatar" src="${escapeAttr(avatar)}" alt="" aria-hidden="true" />` : ''}
          </div>

          <div class="sidebar-session-dropdown" role="menu" aria-label="Session menu">
            <nav class="sidebar-session-links">
              <a class="sidebar-session-link" href="javascript:void(0)" role="menuitem" data-session-nav="profile">
                Profile
              </a>
              <a class="sidebar-session-link" href="javascript:void(0)" role="menuitem" data-session-nav="getting-started">
                Getting Started
              </a>
              <a class="sidebar-session-link" href="javascript:void(0)" role="menuitem" data-session-nav="settings">
                Settings
              </a>
              <a class="sidebar-session-link" href="javascript:void(0)" role="menuitem" data-session-nav="apikeys">
                API Keys
              </a>
              <a class="sidebar-session-link" href="javascript:void(0)" role="menuitem" data-session-nav="billing">
                Billing & Plan
              </a>
              <a class="sidebar-session-link" href="javascript:void(0)" role="menuitem" data-session-nav="quota">
                Rate Limits & Quota
              </a>
            </nav>

            <div class="sidebar-session-divider"></div>

            <button class="sidebar-session-btn" type="button" role="menuitem" data-session-action="logout">
              Logout
            </button>
          </div>
        </div>
      `;
    }

    function wireSidebarMenu() {
      const menu = slot.querySelector('[data-sidebar-session-menu]');
      if (!menu) return;

      const trigger = menu.querySelector('.sidebar-session-trigger');

      // Toggle aria-expanded
      if (trigger) {
        trigger.addEventListener('click', () => {
          const expanded = trigger.getAttribute('aria-expanded') === 'true';
          trigger.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        });

        trigger.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') trigger.setAttribute('aria-expanded', 'false');
        });
      }

      // Actions + nav
      menu.addEventListener('click', async (e) => {
        const nav = e.target.closest('[data-session-nav]');
        if (nav) {
          const page = nav.getAttribute('data-session-nav');
          const mapping = NAV_MAP[page];

          // Dismiss dropdown immediately (override CSS :hover/:focus-within)
          const dropdown = menu.querySelector('.sidebar-session-dropdown');
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
          window.location.assign(u.toString());
        }
      });
    }

    function renderLoggedIn(user) {
      slot.innerHTML = sidebarMenuHtml(user);
      slot.hidden = false;
      wireSidebarMenu();
    }

    // Minimal escaping
    function escapeHtml(s) {
      const str = String(s ?? '');
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function escapeAttr(s) {
      return escapeHtml(s);
    }

    let _sessionReceived = false;

    function onSessionReady(e) {
      if (_sessionReceived) return;
      _sessionReceived = true;
      const user = e?.detail?.user || null;
      if (!user) return renderLoggedOut();
      return renderLoggedIn(user);
    }

    window.addEventListener('haiphen:session:ready', onSessionReady);

    // Fallback: if header hasn't fired haiphen:session:ready within 3s, bootstrap independently
    setTimeout(async () => {
      if (_sessionReceived) return;
      const me = await authMe();
      if (_sessionReceived) return; // event fired while we were fetching
      _sessionReceived = true;
      if (!me.ok || !me.user) return renderLoggedOut();
      return renderLoggedIn(me.user);
    }, 3000);
  }

  function wireHamburger(mount) {
    function attach() {
      const btn = document.getElementById('sidebar-hamburger');
      if (!btn || btn.__sidebarWired) return;
      btn.__sidebarWired = true;

      // Create backdrop element if not present
      if (!document.querySelector('.sidebar-mobile-backdrop')) {
        const bd = document.createElement('div');
        bd.className = 'sidebar-mobile-backdrop';
        document.body.appendChild(bd);
        bd.addEventListener('click', closeMobileSidebar);
      }

      btn.addEventListener('click', () => {
        const open = document.body.classList.toggle('sidebar-mobile-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      });

      // Close sidebar when a navigation link inside it is clicked
      mount.addEventListener('click', (e) => {
        if (e.target.closest('a[data-section]') || e.target.closest('[data-session-nav]')) {
          closeMobileSidebar();
        }
      });
    }

    // Try immediately, or wait for header injection
    if (document.getElementById('sidebar-hamburger')) {
      attach();
    } else {
      window.addEventListener('haiphen:header:ready', () => attach(), { once: true });
    }
  }

  function closeMobileSidebar() {
    document.body.classList.remove('sidebar-mobile-open');
    const btn = document.getElementById('sidebar-hamburger');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }
  }

  async function loadSidebar() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[sidebar] mount missing');
      return;
    }

    if (qs(SIDEBAR_ID)) return;

    await injectCssOnce('assets/base.css'); // ensure tokens exist
    await injectCssOnce('components/sidebar/site-sidebar.css');

    const html = await fetchText('components/sidebar/site-sidebar.html');
    mount.innerHTML = `<div id="${SIDEBAR_ID}">${html}</div>`;

    wire(mount);
    wireHamburger(mount);

    insertSidebarSessionCard(mount);
  }

  function updateSidebarLabels(lens) {
    const sidebar = qs(SIDEBAR_ID);
    if (!sidebar) return;
    const links = sidebar.querySelectorAll('a[data-tech-label][data-finance-label]');
    links.forEach(function (a) {
      var label = a.querySelector('.sidebar-label');
      var icon = a.querySelector('.sidebar-icon');
      if (!label) return;
      if (lens === 'finance') {
        label.textContent = a.getAttribute('data-finance-label') || label.textContent;
        if (icon) icon.setAttribute('data-icon', a.getAttribute('data-finance-icon') || icon.getAttribute('data-icon'));
      } else {
        label.textContent = a.getAttribute('data-tech-label') || label.textContent;
        if (icon) icon.setAttribute('data-icon', a.getAttribute('data-tech-icon') || icon.getAttribute('data-icon'));
      }
    });
  }

  window.addEventListener('haiphen:lens', function (e) {
    updateSidebarLabels(e?.detail?.lens || 'tech');
  });

  // Apply on load based on current lens
  document.addEventListener('DOMContentLoaded', function () {
    var lens = document.documentElement.getAttribute('data-lens') || 'tech';
    setTimeout(function () { updateSidebarLabels(lens); }, 500);
  });

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadSidebar = loadSidebar;
})();
