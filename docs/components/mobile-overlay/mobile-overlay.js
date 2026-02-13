/* docs/components/mobile-overlay/mobile-overlay.js
 * Shows a dismissable overlay on mobile viewports (< 768px) encouraging
 * users to switch to desktop for the best experience.
 *
 * - First visit only (localStorage 'haiphen.mobile_overlay_seen')
 * - Viewport-width gated — never fires on desktop
 * - Dismissable via button, backdrop click, or Escape key
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'haiphen.mobile_overlay_seen';
  var BREAKPOINT  = 768; // px — matches typical tablet/mobile boundary
  var SHOW_DELAY  = 800; // ms after DOMContentLoaded

  function alreadySeen() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch (e) { /* noop */ }
  }

  function isMobileViewport() {
    return window.innerWidth < BREAKPOINT;
  }

  function injectCss() {
    if (document.querySelector('link[href*="mobile-overlay.css"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'components/mobile-overlay/mobile-overlay.css';
    document.head.appendChild(link);
  }

  function buildOverlay() {
    var backdrop = document.createElement('div');
    backdrop.className = 'hp-mobile-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Desktop viewing recommended');

    backdrop.innerHTML = [
      '<div class="hp-mobile-card">',
      '  <div class="hp-mobile-icon" aria-hidden="true">&#128421;</div>',
      '  <h2 class="hp-mobile-heading">Best on Desktop</h2>',
      '  <p class="hp-mobile-body">',
      '    For the full Haiphen experience, we recommend viewing on a desktop browser.',
      '    Apologies while we continue to build out our mobile experience.',
      '  </p>',
      '  <button class="hp-mobile-btn" type="button">Got it</button>',
      '</div>'
    ].join('\n');

    return backdrop;
  }

  function init() {
    if (!isMobileViewport() || alreadySeen()) return;

    injectCss();

    var overlay = buildOverlay();
    document.body.appendChild(overlay);

    // Reveal after a brief delay for CSS to load
    setTimeout(function () {
      overlay.classList.add('is-visible');
    }, SHOW_DELAY);

    function dismiss() {
      markSeen();
      overlay.classList.remove('is-visible');
      setTimeout(function () { overlay.remove(); }, 400);
      document.removeEventListener('keydown', onKey);
    }

    // Button click
    var btn = overlay.querySelector('.hp-mobile-btn');
    if (btn) btn.addEventListener('click', dismiss);

    // Backdrop click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) dismiss();
    });

    // Escape key
    function onKey(e) {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('keydown', onKey);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
