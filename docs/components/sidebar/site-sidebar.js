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

    function renderLoggedIn() {
      // Reuse the API cred block so ApiAccess can hydrate it.
      const apiCred = window.HAIPHEN?.SessionProfileTemplate?.apiCredBlockHtml
        ? window.HAIPHEN.SessionProfileTemplate.apiCredBlockHtml()
        : `
          <div class="api-cred" data-api-cred hidden>
            <div class="api-cred-left">
              <div class="api-cred-title">API Credentials</div>
              <div class="api-cred-sub">
                <span data-api-user-name>—</span>
                <span class="api-dot">•</span>
                <span data-api-user-email>—</span>
                <span class="api-dot">•</span>
                <span data-api-user-plan>—</span>
              </div>
            </div>
            <div class="api-cred-right">
              <div class="api-cred-row">
                <span class="api-cred-k">API Key</span>
                <code class="api-cred-v" data-api-key>••••••••••••••••</code>
                <button class="api-copy" type="button" data-api-copy-key aria-label="Copy API key">Copy</button>
                <button class="api-btn api-btn-ghost" type="button" data-api-rotate-key>Rotate</button>
              </div>
              <div class="api-cred-meta api-muted">
                <span>Created:</span> <span data-api-key-created>—</span>
                <span class="api-dot">•</span>
                <span>Last used:</span> <span data-api-key-last-used>—</span>
              </div>
            </div>
          </div>
        `;

      slot.innerHTML = apiCred;
      slot.hidden = false;

      // Hydrate the API cred block (fills key/user/plan + hooks copy/rotate)
      requestAnimationFrame(() => {
        try {
          if (window.HAIPHEN?.ApiAccess?.hydrate) window.HAIPHEN.ApiAccess.hydrate(slot);
        } catch {}
      });
    }

    // Decide what to render based on /me (same logic as header)
    (async () => {
      const me = await authMe();
      if (!me.ok || !me.user) return renderLoggedOut();
      return renderLoggedIn();
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