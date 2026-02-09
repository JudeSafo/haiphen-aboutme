/* docs/components/sidebar/sidebar-nav.js
 * Sidebar deep-link navigation:
 * - ensure section is visible (via showSection)
 * - scroll to a target element inside the section
 * - flash/outline the emphasized element (the "line" the user lands on)
 */
(function () {
  'use strict';

  const LOG_PREFIX = '[sidebar-nav]';

  function getHeaderHeightPx() {
    const header =
      document.querySelector('.site-header') ||
      document.querySelector('#site-header .site-header') ||
      document.querySelector('nav.navbar');

    const cssVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--header-h')
      .trim();

    const fallback = Number.parseInt(cssVar || '70', 10) || 70;
    const measured = header?.getBoundingClientRect().height || 0;

    return Math.max(fallback, measured || 0);
  }

  function scrollToWithHeaderOffset(targetEl, extra = 12) {
    if (!targetEl) return;

    const header =
      document.querySelector('.site-header') ||
      document.querySelector('#site-header .site-header') ||
      document.querySelector('nav.navbar');

    const headerH =
      header?.getBoundingClientRect().height ||
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h') || '70', 10) ||
      70;

    const bannerH =
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cohort-banner-offset') || '0', 10) ||
      0;

    const topChrome = headerH + bannerH;

    const y = window.scrollY + targetEl.getBoundingClientRect().top - topChrome - extra;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
  function getTopChromeHeightPx() {
    const header =
      document.querySelector('.site-header') ||
      document.querySelector('#site-header .site-header') ||
      document.querySelector('nav.navbar');

    const cssHeaderVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--header-h')
      .trim();

    const headerFallback = Number.parseInt(cssHeaderVar || '70', 10) || 70;
    const headerMeasured = header?.getBoundingClientRect().height || 0;
    const headerH = Math.max(headerFallback, headerMeasured || 0);

    const bannerVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--cohort-banner-offset')
      .trim();

    const bannerH = Number.parseInt(bannerVar || '0', 10) || 0;

    return headerH + bannerH;
  }
  function openAnyDetailsAncestors(el) {
    // If target is inside <details>, open them so the user actually sees it.
    let node = el?.parentElement;
    while (node) {
      if (node.tagName === 'DETAILS' && !node.open) node.open = true;
      node = node.parentElement;
    }
  }

  function flashEmphasis(el, ms = 1600) {
    if (!el) return;

    openAnyDetailsAncestors(el);

    // Remove then re-add so repeated clicks retrigger animation reliably
    el.classList.remove('haiphen-nav-flash');
    // force reflow
    void el.offsetWidth;
    el.classList.add('haiphen-nav-flash');

    window.setTimeout(() => {
      el.classList.remove('haiphen-nav-flash');
    }, ms);
  }

  function waitForElement(root, selector, timeoutMs = 2500) {
    return new Promise((resolve) => {
      if (!root) return resolve(null);
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      const obs = new MutationObserver(() => {
        const found = root.querySelector(selector);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });

      obs.observe(root, { childList: true, subtree: true });

      window.setTimeout(() => {
        obs.disconnect();
        resolve(root.querySelector(selector) || null);
      }, timeoutMs);
    });
  }

  async function navigate({ section, target, emphasize, extraOffset = 12 }) {
    const contentRoot = document.getElementById('content-widget');

    if (!section || typeof window.showSection !== 'function') {
      console.warn(`${LOG_PREFIX} missing section or showSection()`, { section });
      return;
    }

    // 2) Wait for target to exist (content is injected dynamically)
    // Prefer emphasize selector; fallback to target selector; fallback to contentRoot.
    const pickSelector = emphasize || target;

    // 1) Ensure the section is rendered (showSection does sync innerHTML injection)
    // Pass suppressScroll when sidebar will handle its own scroll-to-target
    window.showSection(section, pickSelector ? { suppressScroll: true } : undefined);
    let el = null;

    if (pickSelector) {
      el = await waitForElement(contentRoot, pickSelector);
    }

    const fallbackTarget = el || (target ? contentRoot?.querySelector(target) : null) || contentRoot;
    if (!fallbackTarget) return;

    // 3) Scroll to it with header offset
    // Delay one frame so layout settles after showSection's own scroll
    requestAnimationFrame(() => {
      scrollToWithHeaderOffset(fallbackTarget, extraOffset);
      // 4) Flash the emphasized "line"
      flashEmphasis(el || fallbackTarget);
    });
  }

  // Expose on your existing namespace
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.sidebarNavigate = navigate;
})();