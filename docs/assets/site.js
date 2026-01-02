/* docs/assets/site.js
 * Shared bootloader for all pages: mounts header/sidebar/footer, session pill,
 * optional trades overlay, and snap-stack highlighting.
 */
(() => {
  const AUTH_ORIGIN = 'https://auth.haiphen.io'; // change if needed

  function safeLoad(fn, name) {
    if (typeof fn !== 'function') return;
    Promise.resolve()
      .then(() => fn())
      .catch((err) => console.warn(`[${name}] load failed`, err));
  }

  async function updateSessionWidget() {
    const slot = document.getElementById('session-slot');
    if (!slot) return;

    const showLogin = () => {
      slot.innerHTML = `<a href="${AUTH_ORIGIN}/login" class="login-btn">Login</a>`;
    };

    try {
      const resp = await fetch(`${AUTH_ORIGIN}/me`, { credentials: 'include' });
      if (!resp.ok) return showLogin();

      const user = await resp.json(); // {sub, name, avatar, email, ...}
      const displayName = user.name || user.sub || 'User';
      const avatar = user.avatar || 'assets/profile.png';

      slot.innerHTML = `
        <span class="session-user">
          <img src="${avatar}" alt="">
          ${displayName}
          <a class="logout-link" href="${AUTH_ORIGIN}/logout" title="Logout">×</a>
        </span>
      `;
    } catch (err) {
      console.warn('[session] failed to fetch /me', err);
      showLogin();
    }
  }

  // Snap stacks (your “one panel visible” Services behavior)
  function initSnapStacks(rootEl = document) {
    const stacks = rootEl.querySelectorAll('[data-snap-stack]');
    stacks.forEach((stack) => {
      if (stack.__snapWired) return;
      stack.__snapWired = true;

      const panels = Array.from(stack.querySelectorAll('.snap-panel'));
      if (!panels.length) return;

      panels.forEach((p, i) => p.classList.toggle('is-active', i === 0));

      const obs = new IntersectionObserver(
        (entries) => {
          let best = null;
          for (const e of entries) {
            if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
          }
          if (!best) return;

          panels.forEach((p) => p.classList.remove('is-active'));
          best.target.classList.add('is-active');
        },
        { root: stack, threshold: [0.35, 0.5, 0.65, 0.8] }
      );

      panels.forEach((p) => obs.observe(p));
      stack.__snapObserver = obs;
    });
  }

  function setActiveNavLink() {
    const path = (location.pathname || '').toLowerCase();
    const file = path.split('/').pop() || 'index.html';

    document.querySelectorAll('.nav-links a, .sidebar a').forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const isActive =
        href === file ||
        (file === '' && href.endsWith('index.html'));

      a.classList.toggle('active', isActive);
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const H = window.HAIPHEN || {};

    safeLoad(H.loadHeader, 'header');
    safeLoad(H.loadSidebar, 'sidebar');
    safeLoad(H.loadFooter, 'footer');

    // Optional components; harmless if not present
    safeLoad(H.loadTradesOverlay, 'trades-overlay');

    initSnapStacks(document);
    updateSessionWidget();
    setActiveNavLink();

    // Refresh session pill periodically (optional)
    setInterval(updateSessionWidget, 5 * 60 * 1000);
  });

  // Expose minimal hooks if you want them elsewhere
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.initSnapStacks = initSnapStacks;
})();