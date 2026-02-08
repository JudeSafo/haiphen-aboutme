/* docs/components/getting-started/getting-started.js
 * Getting Started page — installation guides, demo GIFs, service cards.
 * Entitlement-gated: free users see teaser, Pro/Enterprise see full content.
 */
(function () {
  'use strict';

  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const LOG = '[getting-started]';

  const AUTH_ORIGIN = 'https://auth.haiphen.io';
  const MOUNT_ID = 'content-widget';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qa(sel, root) {
    return [...(root || document).querySelectorAll(sel)];
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  // Lazy-load GIF images when they become visible or when a details element opens
  function lazyLoadGifs(root) {
    // Load GIFs that are immediately visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.getAttribute('data-src');
          if (src && !img.src) {
            img.src = src;
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });

    qa('.hp-gs__gif[data-src]', root).forEach((img) => {
      // If inside a closed <details>, defer until toggle
      const details = img.closest('details');
      if (details && !details.open) {
        details.addEventListener('toggle', function handler() {
          if (details.open) {
            const src = img.getAttribute('data-src');
            if (src && !img.src) img.src = src;
            details.removeEventListener('toggle', handler);
          }
        });
      } else {
        observer.observe(img);
      }
    });
  }

  async function checkEntitlement() {
    try {
      const r = await fetch(`${AUTH_ORIGIN}/entitlement`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok) return false;
      const data = await r.json();
      return !!data?.entitled;
    } catch {
      return false;
    }
  }

  async function ensureMounted() {
    const mount = document.getElementById(MOUNT_ID);
    if (!mount) throw new Error(`${LOG} missing #${MOUNT_ID}`);

    await injectCssOnce('assets/base.css');
    await injectCssOnce('components/getting-started/getting-started.css');

    if (!mount.__haiphenGSMounted) {
      const html = await fetchText('components/getting-started/getting-started.html');
      mount.innerHTML = html;
      mount.__haiphenGSMounted = true;
    }

    const root = qs('.hp-gs', mount);
    if (!root) return;

    // Entitlement check
    const entitled = await checkEntitlement();
    const gate = qs('[data-gs-gate]', root);

    if (!entitled) {
      // Show gate, blur gated sections
      root.classList.add('hp-gs--gated');
      if (gate) gate.hidden = false;
    } else {
      root.classList.remove('hp-gs--gated');
      if (gate) gate.hidden = true;
    }

    // Lazy-load GIFs
    lazyLoadGifs(root);
  }

  NS.loadGettingStarted = async function () {
    try {
      const mount = document.getElementById(MOUNT_ID);
      if (mount) mount.classList.add('active');
      await ensureMounted();
    } catch (e) {
      console.warn(LOG, 'failed to mount getting-started', e);
    }
  };
})();
