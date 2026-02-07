(function () {
  'use strict';

  const NS = (window.HAIPHEN = window.HAIPHEN || {});

  function injectCssOnce(href) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }

  function cleanQueryParams() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      url.searchParams.delete('checkout_id');
      window.history.replaceState({}, '', url.pathname + url.hash);
    } catch { /* noop */ }
  }

  NS.CheckoutSuccess = {
    async show(mountSelector) {
      const mount = document.querySelector(mountSelector);
      if (!mount) return;

      injectCssOnce('components/checkout-success/checkout-success.css');

      try {
        const html = await fetchText('components/checkout-success/checkout-success.html');
        mount.innerHTML = html;
      } catch (e) {
        console.warn('[checkout-success] failed to load template', e);
        return;
      }

      mount.style.display = '';

      // Show checkout ID if present
      const params = new URLSearchParams(window.location.search);
      const checkoutId = params.get('checkout_id');
      const idBlock = mount.querySelector('[data-checkout-id]');
      if (checkoutId && idBlock) {
        idBlock.hidden = false;
        const val = idBlock.querySelector('.hp-checkout-success__id-value');
        if (val) val.textContent = checkoutId;
      }

      // Countdown redirect
      let remaining = 30;
      const countdownEl = mount.querySelector('[data-countdown-value]');
      const timer = setInterval(() => {
        remaining--;
        if (countdownEl) countdownEl.textContent = String(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
          cleanQueryParams();
          mount.style.display = 'none';
          mount.innerHTML = '';
          window.location.hash = '#profile';
        }
      }, 1000);

      // Clicking any action link stops the countdown
      mount.querySelectorAll('.hp-checkout-success__btn').forEach(btn => {
        btn.addEventListener('click', () => {
          clearInterval(timer);
          cleanQueryParams();
          mount.style.display = 'none';
          mount.innerHTML = '';
        });
      });
    },

    detect() {
      const params = new URLSearchParams(window.location.search);
      return params.get('checkout') === 'success';
    }
  };
})();
