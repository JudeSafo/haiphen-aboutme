/* docs/components/mission/mission.js */
(function () {
  'use strict';

  const CSS_ID = 'mission-css';
  const NS = (window.HAIPHEN = window.HAIPHEN || {});

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

  function initMission(root) {
    if (!root) return;
    renderGallery(root);
    initReveal(root);
  }

  NS.loadMission = async function loadMission() {
    const mount = document.getElementById('mission-mount');
    if (!mount) return;

    try {
      ensureCss('components/mission/mission.css');
      const html = await fetchText('components/mission/mission.html');
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
  };
})();
