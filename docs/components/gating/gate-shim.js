/* components/gating/gate-shim.js
 *
 * Global click interception for common CTAs across the static site.
 * Goal: do NOT rely on text matching alone; prefer data attributes when present.
 */
(function () {
  'use strict';

  const LOG = '[gate-shim]';

  /**
   * Map UI actions to feature entitlements.
   * Keep these feature keys aligned with backend entitlements (entitlements.features[feature]).
   */
  const FEATURE = {
    services: 'services',
    api: 'api',
    docs: 'docs',
    rss: 'rss',
    tradeEngine: 'trade_engine',
  };

  function gateFn() {
    const fn = window?.HAIPHEN?.EntitlementGate?.requireEntitlement;
    return typeof fn === 'function' ? fn : null;
  }

  function currentUrl() {
    return window.location.href;
  }

  function closestAttr(el, attr) {
    if (!el) return null;
    const node = el.closest(`[${attr}]`);
    if (!node) return null;
    return { node, value: node.getAttribute(attr) };
  }

  function textOf(el) {
    return String(el?.textContent || '').trim().toLowerCase();
  }

  function inferFeatureFromElement(el) {
    // 1) Explicit beats implicit
    const explicit = closestAttr(el, 'data-gate-feature');
    if (explicit?.value) return explicit.value;

    // 2) Known action attributes you already use
    const apiAction = closestAttr(el, 'data-api-action');
    if (apiAction?.value === 'request-access') return FEATURE.api;

    // 3) “Docs / Lineage” should be browsable, but interactive “Try it” is already gated elsewhere.
    // Keep this conservative: don’t block docs navigation globally.

    // 4) Last resort: text heuristics (avoid as primary signal)
    const t = textOf(el.closest('a,button') || el);
    if (!t) return null;

    if (t === 'subscribe') return FEATURE.services;
    if (t === 'request access' || t === 'request api access') return FEATURE.api;
    if (t.includes('upgrade')) return FEATURE.services;

    return null;
  }

  async function maybeGateClick(e) {
    const target = e.target;
    const clickable = target?.closest?.('a,button');
    if (!clickable) return;

    // If this is a checkout CTA, let the Terms Gate / Checkout Router handle it.
    // checkout-router.js listens for [data-checkout-price-id] and will open terms gate.
    if (clickable.closest('[data-checkout-price-id]')) return;
    
    // Respect explicit opt-out
    if (clickable.closest('[data-gate="off"]')) return;

    const feature = inferFeatureFromElement(clickable);
    if (!feature) return;

    const gate = gateFn();
    if (!gate) {
      console.warn(`${LOG} EntitlementGate missing; allowing click through`);
      return;
    }

    // Gate at moment of action
    e.preventDefault();
    e.stopPropagation();

    try {
      const res = await gate(feature, { returnTo: currentUrl() });
      if (!res?.ok) return;

      // If entitled, re-dispatch the click in a safe way:
      // - For <a href>, navigate manually (avoids infinite loop)
      // - For <button>, call click() after disabling shim temporarily
      const href = clickable.getAttribute('href');
      const isAnchor = clickable.tagName === 'A';

      if (isAnchor && href && href !== 'javascript:void(0)') {
        window.location.assign(href);
        return;
      }

      // Temporarily mark to bypass shim and re-trigger.
      clickable.setAttribute('data-gate', 'off');
      try {
        clickable.click();
      } finally {
        clickable.removeAttribute('data-gate');
      }
    } catch (err) {
      console.warn(`${LOG} gate failed`, err?.message || err);
    }
  }

  function install() {
    document.addEventListener('click', (e) => {
      // Only intercept in bubbling phase so component handlers attach normally.
      void maybeGateClick(e);
    });
  }

  install();
})();