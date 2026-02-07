/* docs/components/services-plans/services-plans.js
 * Services catalogue: data-driven grid with checkout + waitlist.
 *
 * Loads services from assets/services.json, renders cards into category grids,
 * handles: (1) checkout buttons, (2) waitlist email submission, (3) subscribe banner.
 */
(function () {
  'use strict';

  const LOG = '[services-plans]';
  const AUTH_ORIGIN = 'https://auth.haiphen.io';
  const CHECKOUT_ORIGIN = 'https://checkout.haiphen.io';
  const TOS_VERSION = 'sla_v0.2_2026-01-22';

  const SUBSCRIBE_HASH = 'subscribe';
  let subscribeFocus = false;

  function qs(id) { return document.getElementById(id); }

  function currentHashSlug() {
    const raw = String(window.location.hash || '').replace(/^#/, '').trim();
    if (!raw) return '';
    return String(raw.split(':')[0] || '').split('?')[0].toLowerCase();
  }

  // ── Subscribe banner focus (preserved from original) ────────────────────

  function applySubscribeFocus() {
    const mount = qs('services-plans-mount');
    const banner = mount?.querySelector('#services-subscribe-banner') || null;
    const sections = mount?.querySelectorAll('.hp-catalogue__section') || [];

    if (banner) banner.hidden = !subscribeFocus;
    sections.forEach(function(s) {
      s.style.display = subscribeFocus ? 'none' : '';
    });
  }

  function setServicesSubscribeFocus(enabled) {
    subscribeFocus = Boolean(enabled);
    applySubscribeFocus();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function fetchJson(url) {
    var resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + url);
    return resp.json();
  }

  async function fetchText(url) {
    var resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + url);
    return resp.text();
  }

  function injectCssOnce(href) {
    if (document.querySelector('link[rel="stylesheet"][href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Checkout flow (preserved logic) ─────────────────────────────────────

  function buildCheckoutStartUrl(opts) {
    var origin = String(opts.checkoutOrigin || CHECKOUT_ORIGIN).trim();
    var u = new URL('/v1/checkout/start', origin);
    u.searchParams.set('price_id', String(opts.priceId || '').trim());
    if (opts.plan) u.searchParams.set('plan', String(opts.plan).trim());
    if (opts.tosVersion) u.searchParams.set('tos_version', String(opts.tosVersion).trim());
    return u.toString();
  }

  function redirectToLogin(returnToUrl) {
    var to = encodeURIComponent(String(returnToUrl || window.location.href));
    window.location.assign(AUTH_ORIGIN + '/login?to=' + to);
  }

  async function getEntitlements() {
    var resp = await fetch('https://api.haiphen.io/v1/me', {
      method: 'GET', credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return { ok: false, status: resp.status };
    var data = await resp.json().catch(function() { return null; });
    return { ok: true, status: 200, entitlements: data?.entitlements ?? null };
  }

  async function handleCheckout(opts) {
    var me = await getEntitlements();

    if (!me.ok && (me.status === 401 || me.status === 403)) {
      redirectToLogin(window.location.href);
      return;
    }
    if (!me.ok) {
      alert('Unable to verify your account. Please refresh and try again.');
      return;
    }

    // Use checkout-router if available
    if (typeof window?.HAIPHEN?.startCheckout === 'function') {
      await window.HAIPHEN.startCheckout(opts);
      return;
    }

    // Terms gate fallback
    if (window.HaiphenTermsGate?.open) {
      await window.HaiphenTermsGate.open({
        priceId: opts.priceId, plan: opts.plan,
        tosVersion: opts.tosVersion, checkoutOrigin: opts.checkoutOrigin,
        contentUrl: 'components/terms-gate/terms-content.html',
      });
      return;
    }

    // Hard navigate fallback
    window.location.assign(buildCheckoutStartUrl(opts));
  }

  // ── Card rendering ──────────────────────────────────────────────────────

  function getMainPrice(pricing) {
    if (!pricing) return null;
    // Find the first price entry that has a numeric price
    var keys = Object.keys(pricing);
    for (var i = 0; i < keys.length; i++) {
      var p = pricing[keys[i]];
      if (typeof p.price === 'number') return p;
    }
    return null;
  }

  function getMainLookupKey(pricing) {
    var p = getMainPrice(pricing);
    return p?.lookup_key || null;
  }

  function isFree(pricing) {
    if (!pricing) return false;
    var keys = Object.keys(pricing);
    return keys.length === 1 && (pricing[keys[0]].label === 'Free' || pricing[keys[0]].label === 'Bundled with Pro');
  }

  function formatPrice(pricing) {
    var p = getMainPrice(pricing);
    if (!p) {
      // Check for free or bundled
      var keys = Object.keys(pricing);
      if (keys.length > 0) return pricing[keys[0]].label || 'Free';
      return 'Free';
    }
    return '$' + p.price + '/mo';
  }

  function renderTrialBadge(trial) {
    if (!trial) return '';
    var unit = trial.unit || (trial.type === 'days' ? 'days' : 'requests');
    return '<div class="hp-card__trial">' +
      escHtml(trial.limit + ' ' + unit + ' free trial') +
    '</div>';
  }

  function renderFeatures(features) {
    if (!features || !features.length) return '';
    var items = features.map(function(f) { return '<li>' + escHtml(f) + '</li>'; }).join('');
    return '<ul class="hp-card__features">' + items + '</ul>';
  }

  function renderAvailableCard(svc) {
    var price = formatPrice(svc.pricing);
    var free = isFree(svc.pricing);
    var statusClass = free ? 'hp-card__status--free' : 'hp-card__status--available';
    var statusLabel = free ? price : 'Available';
    var lookupKey = getMainLookupKey(svc.pricing);

    var priceHtml = free ? '' :
      '<div class="hp-card__price">' +
        '<span class="hp-card__amt">' + escHtml(price.split('/')[0]) + '</span>' +
        '<span class="hp-card__per">/mo</span>' +
      '</div>';

    var actionsHtml = '';
    if (lookupKey) {
      actionsHtml = '<div class="hp-card__actions">' +
        '<button class="hp-card__cta hp-card__cta--primary" ' +
          'data-checkout-price-id="' + escHtml(lookupKey) + '" ' +
          'data-service-id="' + escHtml(svc.id) + '" ' +
          'data-plan="' + escHtml(svc.id) + '" ' +
          'data-tos-version="' + TOS_VERSION + '" ' +
          'data-checkout-origin="' + CHECKOUT_ORIGIN + '">' +
          escHtml(svc.cta?.primary || 'Get Started') +
        '</button>' +
      '</div>';
    } else if (svc.cta?.primary) {
      actionsHtml = '<div class="hp-card__actions">' +
        '<button class="hp-card__cta hp-card__cta--primary" data-action="contact">' +
          escHtml(svc.cta.primary) +
        '</button>' +
      '</div>';
    }

    return '<article class="hp-card" data-service-id="' + escHtml(svc.id) + '">' +
      '<span class="hp-card__status ' + statusClass + '">' + escHtml(statusLabel) + '</span>' +
      '<div class="hp-card__top">' +
        '<div class="hp-card__icon"><img src="assets/icons/' + escHtml(svc.icon) + '.svg" alt="" /></div>' +
        '<div class="hp-card__meta">' +
          '<div class="hp-card__name">' + escHtml(svc.name) + '</div>' +
          priceHtml +
        '</div>' +
      '</div>' +
      '<div class="hp-card__tagline">' + escHtml(svc.tagline) + '</div>' +
      '<p class="hp-card__desc">' + escHtml(svc.description) + '</p>' +
      renderFeatures(svc.features) +
      renderTrialBadge(svc.trial) +
      actionsHtml +
    '</article>';
  }

  function renderComingSoonCard(svc) {
    var price = formatPrice(svc.pricing);
    var priceHtml = '<div class="hp-card__price">' +
      '<span class="hp-card__amt">' + escHtml(price.split('/')[0]) + '</span>' +
      (price.includes('/') ? '<span class="hp-card__per">/mo</span>' : '') +
    '</div>';

    return '<article class="hp-card hp-card--coming-soon" data-service-id="' + escHtml(svc.id) + '">' +
      '<span class="hp-card__status hp-card__status--coming_soon">Coming Soon</span>' +
      '<div class="hp-card__top">' +
        '<div class="hp-card__icon"><img src="assets/icons/' + escHtml(svc.icon) + '.svg" alt="" /></div>' +
        '<div class="hp-card__meta">' +
          '<div class="hp-card__name">' + escHtml(svc.name) + '</div>' +
          priceHtml +
        '</div>' +
      '</div>' +
      '<div class="hp-card__tagline">' + escHtml(svc.tagline) + '</div>' +
      '<p class="hp-card__desc">' + escHtml(svc.description) + '</p>' +
      renderFeatures(svc.features) +
      renderTrialBadge(svc.trial) +
      '<div class="hp-card__waitlist" data-waitlist-service="' + escHtml(svc.id) + '">' +
        '<div class="hp-card__waitlist-label">Get notified when available</div>' +
        '<div class="hp-card__waitlist-row">' +
          '<input class="hp-card__waitlist-input" type="email" placeholder="you@email.com" autocomplete="email" />' +
          '<button class="hp-card__waitlist-btn" type="button">Notify Me</button>' +
        '</div>' +
        '<div class="hp-card__waitlist-msg" aria-live="polite"></div>' +
      '</div>' +
    '</article>';
  }

  function renderCard(svc) {
    if (svc.status === 'coming_soon') return renderComingSoonCard(svc);
    return renderAvailableCard(svc);
  }

  // ── Waitlist handler ────────────────────────────────────────────────────

  async function submitWaitlist(serviceId, email, msgEl, btnEl) {
    btnEl.disabled = true;
    msgEl.textContent = '';
    msgEl.className = 'hp-card__waitlist-msg';

    try {
      var resp = await fetch(CHECKOUT_ORIGIN + '/v1/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, service_id: serviceId }),
      });

      var data = await resp.json().catch(function() { return {}; });

      if (resp.ok) {
        msgEl.textContent = data.message || "You're on the list!";
        msgEl.classList.add('hp-card__waitlist-msg--ok');
      } else {
        msgEl.textContent = data.error || 'Something went wrong.';
        msgEl.classList.add('hp-card__waitlist-msg--err');
        btnEl.disabled = false;
      }
    } catch (err) {
      msgEl.textContent = 'Network error. Try again.';
      msgEl.classList.add('hp-card__waitlist-msg--err');
      btnEl.disabled = false;
    }
  }

  // ── Event delegation ────────────────────────────────────────────────────

  function wire(root) {
    root.addEventListener('click', async function(e) {
      // Checkout button (has price lookup key)
      var checkoutBtn = e.target.closest('[data-checkout-price-id]');
      if (checkoutBtn) {
        var priceId = (checkoutBtn.getAttribute('data-checkout-price-id') || '').trim();
        if (!priceId) return;
        var plan = (checkoutBtn.getAttribute('data-plan') || '').trim();
        var tosVersion = (checkoutBtn.getAttribute('data-tos-version') || TOS_VERSION).trim();
        var checkoutOrigin = (checkoutBtn.getAttribute('data-checkout-origin') || CHECKOUT_ORIGIN).trim();

        await handleCheckout({ priceId: priceId, plan: plan, tosVersion: tosVersion, checkoutOrigin: checkoutOrigin });
        return;
      }

      // Contact button
      var contactBtn = e.target.closest('[data-action="contact"]');
      if (contactBtn) {
        if (typeof window.showSection === 'function') window.showSection('Contact');
        else window.location.hash = '#contact';
        return;
      }

      // Waitlist button
      var waitlistBtn = e.target.closest('.hp-card__waitlist-btn');
      if (waitlistBtn) {
        var waitlistEl = waitlistBtn.closest('[data-waitlist-service]');
        if (!waitlistEl) return;
        var serviceId = waitlistEl.getAttribute('data-waitlist-service');
        var input = waitlistEl.querySelector('.hp-card__waitlist-input');
        var msg = waitlistEl.querySelector('.hp-card__waitlist-msg');
        var emailVal = (input?.value || '').trim();

        if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
          msg.textContent = 'Please enter a valid email.';
          msg.className = 'hp-card__waitlist-msg hp-card__waitlist-msg--err';
          return;
        }

        await submitWaitlist(serviceId, emailVal, msg, waitlistBtn);
        return;
      }
    });

    // Waitlist enter key
    root.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var input = e.target.closest('.hp-card__waitlist-input');
      if (!input) return;
      var btn = input.closest('.hp-card__waitlist-row')?.querySelector('.hp-card__waitlist-btn');
      if (btn && !btn.disabled) btn.click();
    });
  }

  // ── Main load ───────────────────────────────────────────────────────────

  async function loadServicesPlans() {
    injectCssOnce('components/services-plans/services-plans.css');

    var mount = qs('services-plans-mount');
    if (!mount) return;

    // Don't re-render if already populated
    if (mount.querySelector('.hp-catalogue')) return;

    // Load HTML shell
    var html = await fetchText('components/services-plans/services-plans.html');
    mount.innerHTML = html;

    // Load services data
    var data;
    try {
      data = await fetchJson('assets/services.json');
    } catch (err) {
      console.error(LOG, 'Failed to load services.json', err);
      return;
    }

    var services = data.services || [];

    // Render cards into category grids
    var categories = ['featured', 'fintech', 'tech'];
    categories.forEach(function(cat) {
      var grid = mount.querySelector('[data-grid="' + cat + '"]');
      if (!grid) return;
      var catServices = services.filter(function(s) { return s.category === cat; });
      grid.innerHTML = catServices.map(renderCard).join('');
    });

    wire(mount);
    applySubscribeFocus();

    if (currentHashSlug() === SUBSCRIBE_HASH) {
      setServicesSubscribeFocus(true);
    }
  }

  // ── Exports ─────────────────────────────────────────────────────────────

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadServicesPlans = loadServicesPlans;
  window.HAIPHEN.setServicesSubscribeFocus = setServicesSubscribeFocus;

  window.addEventListener('hashchange', function() {
    if (currentHashSlug() === SUBSCRIBE_HASH) setServicesSubscribeFocus(true);
  });
})();
