/* site-footer.js
 * Shows footer only when user reaches bottom sentinel.
 * Uses IntersectionObserver (fast) with a scroll fallback.
 */
(function () {
  'use strict';

  const FOOTER_ID = 'site-footer';
  const MOUNT_ID = 'footer-mount';
  const SENTINEL_ID = 'footer-sentinel';

  function qs(id) {
    return document.getElementById(id);
  }

  function setYear(footerEl) {
    const yearEl = footerEl.querySelector('#site-footer-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  function setVisible(footerEl, visible) {
    footerEl.classList.toggle('is-visible', Boolean(visible));
  }

  function installVisibilityController(footerEl) {
    const sentinel = qs(SENTINEL_ID);
    if (!sentinel) {
      // No sentinel: never show (safe default)
      console.warn('[footer] sentinel missing; footer will remain hidden');
      return;
    }

    // Preferred: IntersectionObserver
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          // When sentinel is visible, user is at/near bottom -> show footer
          setVisible(footerEl, entry && entry.isIntersecting);
        },
        {
          root: null,
          threshold: 0.01,
        }
      );
      io.observe(sentinel);
      return;
    }

    // Fallback: scroll check
    function onScroll() {
      const rect = sentinel.getBoundingClientRect();
      const inView = rect.top < window.innerHeight && rect.bottom >= 0;
      setVisible(footerEl, inView);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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

  async function loadFooter() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[footer] mount missing');
      return;
    }

    // Avoid double-insert
    if (qs(FOOTER_ID)) return;

    // CSS first so no flash
    await injectCssOnce('components/footers/site-footer.css');

    const html = await fetchText('components/footers/site-footer.html');

    // Wrap so we can assign a stable id
    mount.innerHTML = `<div id="${FOOTER_ID}">${html}</div>`;
    const footerEl = mount.querySelector('.site-footer');
    if (!footerEl) {
      console.warn('[footer] failed to find .site-footer in loaded HTML');
      return;
    }

    setYear(footerEl);
    installVisibilityController(footerEl);
  }

  // Expose a tiny global for index.html to call
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadFooter = loadFooter;
})();