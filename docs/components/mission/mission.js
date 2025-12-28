/* docs/components/mission/mission.js
 * Mounts the Mission subsection and wires “subsection focus” (scroll-snap + observer).
 */
(function () {
  'use strict';

  const LOG = '[mission]';
  const MOUNT_ID = 'mission-mount';

  function qs(id) { return document.getElementById(id); }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.text();
  }

  async function injectCssOnce(href) {
    const already = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function initSubsectionFocus(scrollerEl) {
    if (!scrollerEl) return;

    const subs = Array.from(scrollerEl.querySelectorAll('.hp-subsection'));
    if (subs.length < 2) return;

    // initial state: first active
    subs.forEach((s, i) => s.classList.toggle('is-dimmed', i !== 0));

    const io = new IntersectionObserver((entries) => {
      // choose the subsection with highest intersection ratio
      let best = null;
      for (const e of entries) {
        if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
      }
      if (!best) return;

      const active = best.target;
      subs.forEach((s) => s.classList.toggle('is-dimmed', s !== active));
    }, {
      root: scrollerEl,
      threshold: [0.35, 0.55, 0.75],
    });

    subs.forEach((s) => io.observe(s));

    // expose disposer if you ever need it later
    scrollerEl._hpSubsectionObserver = io;
  }

  async function loadMission() {
    const mount = qs(MOUNT_ID);
    if (!mount) return;

    // prevent double insert
    if (mount.querySelector('.mission')) return;

    await injectCssOnce('components/mission/mission.css');
    const html = await fetchText('components/mission/mission.html');
    mount.innerHTML = html;

    // “focus” is controlled at the Fin/Tech scroller level
    const scroller = mount.closest('.hp-subsections');
    initSubsectionFocus(scroller);
  }

  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadMission = loadMission;
})();