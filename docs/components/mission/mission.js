/* docs/components/mission/mission.js */
(function () {
  'use strict';

  const CSS_ID = 'mission-css';
  const NS = (window.HAIPHEN = window.HAIPHEN || {});

  /* ---- Template cache ---- */
  let _cachedTech = null;
  let _cachedFinance = null;
  let _lensListenerWired = false;

  function getTemplateUrl() {
    const lens = NS.lens?.get?.() ?? 'tech';
    return lens === 'finance'
      ? 'components/mission/mission-finance.html'
      : 'components/mission/mission.html';
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  function ensureCss(href) {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function renderGallery(root) {
    const gallery = root.querySelector('[data-mission-gallery]');
    if (!gallery) return;

    let images = [];
    try {
      if (typeof servicesImages !== 'undefined') images = servicesImages;
    } catch (_) {}

    if (!Array.isArray(images) || images.length === 0) {
      gallery.innerHTML = '<div class="hp-muted">No gallery figures available.</div>';
      return;
    }

    gallery.innerHTML = images
      .map(({ file, cap }) => {
        const safeCap = cap || 'Figure';
        return `
          <figure class="gallery-item">
            <img src="assets/robotics/${file}" alt="${safeCap}" onclick="openLightbox(this.src)">
            <figcaption>${safeCap}</figcaption>
          </figure>
        `;
      })
      .join('');
  }

  function initReveal(root) {
    const revealEls = [...root.querySelectorAll('.mission-reveal')];
    if (!revealEls.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 }
    );

    revealEls.forEach((el) => obs.observe(el));
  }

  function wireLightbox(root) {
    if (!root || root.dataset.hpMissionLightbox === '1') return;
    root.dataset.hpMissionLightbox = '1';

    root.addEventListener('click', (e) => {
      const img = e.target?.closest?.('img[data-lightbox]');
      if (!img) return;
      const src = img.getAttribute('src');
      if (!src) return;
      if (typeof window.openLightbox === 'function') {
        window.openLightbox(src);
      }
    });
  }

  function initMission(root) {
    if (!root) return;
    renderGallery(root);
    initReveal(root);
    wireLightbox(root);
  }

  NS.loadMission = async function loadMission() {
    const mount = document.getElementById('mission-mount');
    if (!mount) return;

    try {
      ensureCss('components/mission/mission.css');
      const url = getTemplateUrl();
      const html = await fetchText(url);

      /* Cache the fetched template */
      const lens = NS.lens?.get?.() ?? 'tech';
      if (lens === 'finance') _cachedFinance = html;
      else _cachedTech = html;

      mount.innerHTML = html;
      initMission(mount);
    } catch (err) {
      console.warn('[mission] failed to load', err);
      mount.innerHTML = `
        <div style="padding:1rem;border:1px solid #e6ecf3;border-radius:12px;background:#fff;">
          <strong>Mission section failed to load.</strong>
          <div style="margin-top:.35rem;color:#667;">Check console for details.</div>
        </div>
      `;
    }

    /* Wire lens-switch listener (once) */
    if (!_lensListenerWired) {
      _lensListenerWired = true;
      window.addEventListener('haiphen:lens', async (e) => {
        const m = document.getElementById('mission-mount');
        if (!m || !m.innerHTML.trim()) return; /* only swap if section is visible */

        const newLens = e.detail?.lens ?? 'tech';
        const cached = newLens === 'finance' ? _cachedFinance : _cachedTech;
        let html;

        if (cached) {
          html = cached;
        } else {
          const u = newLens === 'finance'
            ? 'components/mission/mission-finance.html'
            : 'components/mission/mission.html';
          html = await fetchText(u);
          if (newLens === 'finance') _cachedFinance = html;
          else _cachedTech = html;
        }

        /* Reset lightbox flag so it re-wires */
        delete m.dataset.hpMissionLightbox;

        m.innerHTML = html;
        initMission(m);
      });
    }
  };
})();
