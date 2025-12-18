/* docs/components/section-menu/section-menu.js
 * Injects the middle buttons and wires them to showSection().
 */
(function () {
  'use strict';

  const MENU_ID = 'section-menu';
  const MOUNT_ID = 'section-menu-mount';

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
    root.querySelectorAll('[data-section]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-section') === sectionName);
    });
  }

  function wire(root) {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-section]');
      if (!btn) return;

      const section = btn.getAttribute('data-section');
      if (!section) return;

      if (typeof window.showSection === 'function') {
        window.showSection(section);
        setActive(root, section);
      }
    });
  }

  async function loadSectionMenu() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[section-menu] mount missing');
      return;
    }

    if (qs(MENU_ID)) return;

    await injectCssOnce('assets/base.css');
    await injectCssOnce('components/section-menu/section-menu.css');

    const html = await fetchText('components/section-menu/section-menu.html');
    mount.innerHTML = `<div id="${MENU_ID}">${html}</div>`;

    wire(mount);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadSectionMenu = loadSectionMenu;
})();