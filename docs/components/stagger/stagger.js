/* docs/components/stagger/stagger.js
 * First-visit staggered reveal orchestrator.
 *
 * On first visit (no localStorage 'haiphen.stagger_seen'), the inline <head>
 * script adds html.hp-stagger-active.  This file waits for DOMContentLoaded,
 * then reveals each secondary UI element on a timed schedule.
 *
 * Timing is designed so no two elements animate at the same time:
 *   Sidebar      @ 1.2s  (transition 0.5s → settled 1.7s)
 *   Nav assistant @ 3.0s  (transition 0.5s → settled 3.5s)
 *   Cookie bar   @ 12.0s (well after everything else)
 *
 * Fires haiphen:stagger:chatbot-revealed so chatbot.js can defer its
 * peek timer until the FAB is actually visible.
 *
 * Cohort banner is NOT staggered — always visible from first paint.
 * Repeat visitors: the class is never added, so this script bails immediately.
 */
(function () {
  'use strict';

  /* ---- bail if not a first-visit session ---- */
  if (!document.documentElement.classList.contains('hp-stagger-active')) return;

  var STEPS = [
    { sel: '#sidebar-mount',        at: 1200 },   // sidebar slides in
    { sel: '#chatbot-mount',        at: 3000 },   // nav assistant shortly after sidebar settles
    { sel: '#cookie-consent-mount', at: 12000 }   // cookie bar well after everything
  ];

  var POLL_INTERVAL = 50;   // ms between retries if element not yet in DOM
  var MAX_RETRIES   = 10;   // give up after 500ms of polling

  /**
   * Add .hp-stagger-revealed to an element.  If the element isn't in the DOM
   * yet, poll briefly until it appears.
   */
  function reveal(selector, cb) {
    function done(el) {
      if (el) el.classList.add('hp-stagger-revealed');
      // Let chatbot.js know the FAB is now visible so it can start its peek timer
      if (selector === '#chatbot-mount') {
        window.dispatchEvent(new CustomEvent('haiphen:stagger:chatbot-revealed'));
      }
      if (cb) cb();
    }

    var el = document.querySelector(selector);
    if (el) { done(el); return; }

    // Element not found — poll
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      el = document.querySelector(selector);
      if (el) {
        clearInterval(timer);
        done(el);
      } else if (tries >= MAX_RETRIES) {
        clearInterval(timer);
        done(null);  // proceed even if element never appeared
      }
    }, POLL_INTERVAL);
  }

  /**
   * Schedule all steps using absolute offsets from page ready.
   */
  function run() {
    STEPS.forEach(function (step, i) {
      setTimeout(function () {
        reveal(step.sel, function () {
          // After the last step, clean up
          if (i === STEPS.length - 1) {
            // Wait for CSS transition to finish before removing scaffolding
            setTimeout(finish, 550);
          }
        });
      }, step.at);
    });
  }

  function finish() {
    document.documentElement.classList.remove('hp-stagger-active');
    try {
      localStorage.setItem('haiphen.stagger_seen', String(Date.now()));
    } catch (e) { /* private browsing — no-op */ }
    window.dispatchEvent(new CustomEvent('haiphen:stagger:done'));
  }

  /* ---- kick off after DOM is ready ---- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
