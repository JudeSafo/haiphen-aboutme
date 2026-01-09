/* site-header.js
 * Injects header HTML/CSS, expands menu on logo hover, adds "lighter grey" header hover state.
 */
(function () {
  'use strict';

  const HEADER_ID = 'site-header';
  const MOUNT_ID = 'header-mount';

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

  function wireInteractions(root) {
    const headerEl = root.querySelector('.site-header');
    const brandEl = root.querySelector('.site-header__brand');
    if (!headerEl || !brandEl) return;

    let openedByBrand = false;

    function openHeader(reason) {
      headerEl.classList.add('is-expanded');
      if (reason === 'brand') headerEl.classList.add('is-brand-hover');
    }

    function closeHeader() {
      headerEl.classList.remove('is-expanded');
      headerEl.classList.remove('is-brand-hover');
      openedByBrand = false;
      // reset aria-expanded for accessibility
      root.querySelectorAll('.site-header__link[aria-expanded="true"]').forEach((a) => {
        a.setAttribute('aria-expanded', 'false');
      });
    }

    // Expand when hovering the logo
    brandEl.addEventListener('mouseenter', () => {
      openedByBrand = true;
      openHeader('brand');
    });

    // IMPORTANT: do NOT collapse on brand mouseleave.
    // Collapse only when leaving the entire header region.
    headerEl.addEventListener('mouseleave', () => {
      if (openedByBrand) closeHeader();
    });

    // Keep expanded while interacting anywhere inside the header (menu + dropdowns)
    headerEl.addEventListener('mouseenter', () => {
      if (openedByBrand) openHeader(); // keep it open if it was opened by brand
    });

    // Update aria-expanded based on hover/focus state per item
    const items = root.querySelectorAll('.site-header__item');
    items.forEach((item) => {
      const trigger = item.querySelector('.site-header__link');
      if (!trigger) return;

      const setExpanded = (v) => trigger.setAttribute('aria-expanded', v ? 'true' : 'false');

      item.addEventListener('mouseenter', () => setExpanded(true));
      item.addEventListener('mouseleave', () => setExpanded(false));

      // Keyboard accessibility: focus within opens dropdown via CSS :focus-within
      trigger.addEventListener('focus', () => setExpanded(true));
      item.addEventListener('focusout', () => setExpanded(false));
    });

    // ESC closes any open menu state
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHeader();
    });

    // Click logo -> your existing resetLanding()
    brandEl.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.resetLanding === 'function') window.resetLanding();
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  }

  function loginHref() {
    const AUTH_ORIGIN = 'https://auth.haiphen.io';
    const here = window.location.href;
    const u = new URL(`${AUTH_ORIGIN}/login`);
    u.searchParams.set('to', here);
    return u.toString();
  }

  function wireLoginIcon() {
    const icon = document.querySelector('[data-login-icon]');
    if (!icon) return;

    icon.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.assign(loginHref());
    });
  }

  wireLoginIcon();

  async function loadHeader() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn('[header] mount missing');
      return;
    }

    // Avoid double insert
    if (qs(HEADER_ID)) return;

    await injectCssOnce('components/headers/site-header.css');

    const html = await fetchText('components/headers/site-header.html');
    mount.innerHTML = `<div id="${HEADER_ID}">${html}</div>`;

    wireInteractions(mount);
    // After header is injected + wired
    window.dispatchEvent(new CustomEvent("haiphen:header:ready", {
      detail: { headerId: HEADER_ID }
    }));    
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadHeader = loadHeader;
})();