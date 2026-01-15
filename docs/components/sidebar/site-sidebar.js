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

  function setActive(root, sectionName) {
    root.querySelectorAll('[data-section]').forEach((a) => {
      a.classList.toggle('is-active', a.getAttribute('data-section') === sectionName);
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

      // Prefer deep-link navigation if available
      if (typeof window.HAIPHEN?.sidebarNavigate === 'function' && section) {
        window.HAIPHEN.sidebarNavigate({
          section,
          target: target || null,
          emphasize: emph || target || null,
        });
        setActive(root, section);
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
    const LOGIN_URL = `${AUTH_ORIGIN}/login`;
    const LOGOUT_URL = `${AUTH_ORIGIN}/logout`;

    function loginHref() {
      const here = window.location.href;
      const u = new URL(LOGIN_URL);
      u.searchParams.set('to', here);
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
      slot.innerHTML = `
        <div class="sidebar-session">
          <div class="sidebar-session__title">Session</div>
          <div class="sidebar-session__sub">You’re not logged in.</div>
          <a class="sidebar-session__login login-btn" href="${loginHref()}">Login</a>
        </div>
      `;
      slot.hidden = false;
    }

    function sidebarMenuHtml(user) {
      const name = user?.name || user?.sub || 'User';
      const email = user?.email || '—';
      const sub = user?.sub || '—';
      const avatar = user?.avatar || user?.avatar_url || '';

      // Keep ONE authoritative api-cred block (hydrated by ApiAccess) inside dropdown.
      const apiCred = window.HAIPHEN?.SessionProfileTemplate?.apiCredBlockHtml
        ? window.HAIPHEN.SessionProfileTemplate.apiCredBlockHtml()
        : `<div class="api-cred" data-api-cred hidden></div>`;

      return `
        <div class="sidebar-session-menu" data-sidebar-session-menu>
          <div class="sidebar-session-trigger" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">
            <div class="sidebar-session-left">
              <div class="sidebar-session-title">${escapeHtml(name)}</div>
              <div class="sidebar-session-sub">${escapeHtml(email)} • ${escapeHtml(sub)}</div>
              <div class="sidebar-session-key">
                <span>Key</span>
                <code data-sidebar-api-key-preview>••••••••••••••••</code>
              </div>
            </div>
            ${avatar ? `<img class="sidebar-session-avatar" src="${escapeAttr(avatar)}" alt="" aria-hidden="true" />` : ''}
          </div>

          <div class="sidebar-session-dropdown" role="menu" aria-label="Session menu">
            <div class="sidebar-session-links">
              <a class="sidebar-session-link" href="javascript:void(0)" role="menuitem" data-session-nav="profile">
                Profile <span style="opacity:.65;">›</span>
              </a>
              <a class="sidebar-session-link" href="javascript:void(0)" role="menuitem" data-session-nav="settings">
                Settings <span style="opacity:.65;">›</span>
              </a>
              <button class="sidebar-session-btn" type="button" role="menuitem" data-session-action="rotate-key">
                Rotate API key <span style="opacity:.65;">⟲</span>
              </button>
              <button class="sidebar-session-btn" type="button" role="menuitem" data-session-action="logout">
                Logout <span style="opacity:.65;">×</span>
              </button>
            </div>

            <div class="sidebar-session-divider"></div>

            ${apiCred}
          </div>
        </div>
      `;
    }

    function wireSidebarMenu() {
      const menu = slot.querySelector('[data-sidebar-session-menu]');
      if (!menu) return;

      const trigger = menu.querySelector('.sidebar-session-trigger');
      const preview = menu.querySelector('[data-sidebar-api-key-preview]');

      // Toggle aria-expanded for semantics (CSS does the actual open/close)
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

          // extensible hook: let your app/router own this later
          window.dispatchEvent(new CustomEvent('haiphen:session:navigate', { detail: { page } }));

          // sensible defaults today (no new pages required)
          if (page === 'profile') {
            // If you later build a Profile section: showSection('Profile')
            console.info('[sidebar-session] profile clicked (hook: haiphen:session:navigate)');
          } else if (page === 'settings') {
            console.info('[sidebar-session] settings clicked (hook: haiphen:session:navigate)');
          }
          return;
        }

        const btn = e.target.closest('[data-session-action]');
        if (!btn) return;

        const action = btn.getAttribute('data-session-action');

        if (action === 'logout') {
          btn.disabled = true;
          const prev = btn.textContent;
          btn.textContent = 'Logging out…';
          const here = window.location.href;
          const u = new URL(LOGOUT_URL);
          u.searchParams.set('to', here);
          u.searchParams.set('reauth', '1'); // force the login flow to run again
          window.location.assign(u.toString());
          return;
        }

        if (action === 'rotate-key') {
          btn.disabled = true;
          const prev = btn.textContent;
          btn.textContent = 'Rotating…';
          try {
            if (window.HAIPHEN?.ApiAccess?.rotateKeyAndRefresh) {
              await window.HAIPHEN.ApiAccess.rotateKeyAndRefresh(menu);
            } else {
              console.warn('[sidebar-session] ApiAccess.rotateKeyAndRefresh missing');
            }
          } catch (err) {
            console.warn('[sidebar-session] rotate failed', err?.message || err);
          } finally {
            btn.textContent = prev;
            btn.disabled = false;
          }
        }
      });

      // Hydrate API cred block and mirror key into the trigger preview
      requestAnimationFrame(() => {
        try {
          if (window.HAIPHEN?.ApiAccess?.hydrate) window.HAIPHEN.ApiAccess.hydrate(menu);
        } catch {}

        // Mirror hydrated key text to the trigger preview (without duplicating data-api-* selectors)
        const keyEl = menu.querySelector('[data-api-key]');
        if (keyEl && preview) {
          const sync = () => {
            const t = (keyEl.textContent || '').trim();
            if (t) preview.textContent = t;
          };
          sync();

          const obs = new MutationObserver(sync);
          obs.observe(keyEl, { childList: true, characterData: true, subtree: true });

          // Cleanup if menu is removed
          window.setTimeout(() => {
            if (!document.body.contains(menu)) obs.disconnect();
          }, 10_000);
        }
      });
    }

    function renderLoggedIn(user) {
      slot.innerHTML = sidebarMenuHtml(user);
      slot.hidden = false;
      wireSidebarMenu();
    }

    // Minimal escaping (since name/email are user-derived)
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
      // same as escapeHtml for our purposes
      return escapeHtml(s);
    }

    // Prefer the already-emitted session event (from header), but also self-bootstrap.
    function onSessionReady(e) {
      const user = e?.detail?.user || null;
      if (!user) return renderLoggedOut();
      return renderLoggedIn(user);
    }

    window.addEventListener('haiphen:session:ready', onSessionReady);

    // Bootstrap immediately (in case header isn’t loaded yet)
    (async () => {
      const me = await authMe();
      if (!me.ok || !me.user) return renderLoggedOut();
      return renderLoggedIn(me.user);
    })();
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

    // ✅ mount exists here AND sidebar HTML is now in the DOM
    insertSidebarSessionCard(mount);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadSidebar = loadSidebar;
})();