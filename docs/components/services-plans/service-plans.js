/* docs/components/services-plans/service-plans.js
 * COMPAT SHIM (legacy filename).
 *
 * Some older pages/scripts may still reference:
 *   components/services-plans/service-plans.js   (singular)
 *
 * We keep this file so old references don't break, but it must NOT contain
 * checkout logic. All real logic lives in:
 *   components/services-plans/services-plans.js
 */
(function () {
  'use strict';

  // If the real module is already loaded, we're done.
  if (window.HAIPHEN && typeof window.HAIPHEN.loadServicesPlans === 'function') return;

  // Otherwise, dynamically load the real module (best-effort).
  const s = document.createElement('script');
  s.src = 'components/services-plans/services-plans.js';
  s.defer = true;
  s.onload = () => {
    try {
      if (window.HAIPHEN && typeof window.HAIPHEN.loadServicesPlans === 'function') {
        window.HAIPHEN.loadServicesPlans();
      }
    } catch {}
  };
  document.head.appendChild(s);
})();