/* docs/components/trades-overlay/trades-overlay.js
 * KPI overlay with synthetic interactive chart.
 * - Mount once (index.html adds #trades-overlay-mount)
 * - Open via window.HAIPHEN.TradesOverlay.open({ title, screenshotUrl, seed })
 */
(function () {
  'use strict';

  const LOG = '[trades-overlay]';
  const MOUNT_ID = 'trades-overlay-mount';

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

  // Small deterministic PRNG so "random" can be stable per KPI if desired
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function movingAverage(arr, win) {
    const w = Math.max(1, win | 0);
    if (w <= 1) return arr.slice();
    const out = new Array(arr.length);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= w) sum -= arr[i - w];
      const denom = Math.min(i + 1, w);
      out[i] = sum / denom;
    }
    return out;
  }

  function genSeries({ points, vol, seed }) {
    const rand = mulberry32(seed);
    const arr = [];
    let v = 50 + rand() * 50;
    for (let i = 0; i < points; i++) {
      // random walk with gentle mean reversion + shocks
      const shock = (rand() - 0.5) * 10 * vol;
      const drift = (50 - v) * 0.015; // pull toward 50
      v = v + drift + shock;
      v = clamp(v, -50, 150);
      arr.push(v);
    }
    return arr;
  }

  function formatNum(x) {
    if (!Number.isFinite(x)) return '—';
    const abs = Math.abs(x);
    if (abs >= 1000) return x.toFixed(0);
    if (abs >= 100) return x.toFixed(1);
    return x.toFixed(2);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderExtremes(extremes) {
    const el = qs('haiphen-extremes');
    if (!el) return;

    const hi = extremes?.hi || [];
    const lo = extremes?.lo || [];
    el.hidden = (hi.length + lo.length) === 0;

    const row = (r) => `
      <div class="xrow">
        <div class="cn">${escapeHtml(r.contract_name || '')}</div>
        <div class="sym">${escapeHtml(r.symbol || '')}</div>
        <div class="pnl">${Number(r.individual_pnl).toFixed(2)}</div>
      </div>
    `;

    el.innerHTML = `
      <div class="xbox">
        <div class="xtitle">Top impact (abs PnL)</div>
        ${hi.map(row).join('') || '<div class="muted">—</div>'}
      </div>
      <div class="xbox">
        <div class="xtitle">Lowest impact (abs PnL)</div>
        ${lo.map(row).join('') || '<div class="muted">—</div>'}
      </div>
    `;
  }

  function renderPortfolio(portfolioAssets) {
    const wrap = qs('haiphen-portfolio');
    const sel = qs('haiphen-portfolio-select');
    const meta = qs('haiphen-portfolio-meta');
    if (!wrap || !sel || !meta) return;

    const assets = Array.isArray(portfolioAssets) ? portfolioAssets : [];
    wrap.hidden = assets.length === 0;

    sel.innerHTML = assets.map((a, i) => {
      const label = `${a.symbol} • ${a.contract_name}`;
      return `<option value="${i}">${escapeHtml(label)}</option>`;
    }).join('');

    function show(i) {
      const a = assets[i];
      if (!a) { meta.textContent = '—'; return; }
      meta.innerHTML = `
        <div><b>${escapeHtml(a.symbol)}</b> ${escapeHtml(a.contract_name)}</div>
        <div>Strategy: ${escapeHtml(a.strategy || '—')}</div>
        <div>Last: ${escapeHtml(a.current_last_price)} • PT: ${escapeHtml(a.profit_target)} • SL: ${escapeHtml(a.stop_loss)}</div>
        <div>Strike: ${escapeHtml(a.strike_price)} • Exp: ${escapeHtml(a.expiration_date)} • Start: ${escapeHtml(a.trade_start_time)}</div>
      `;
    }

    sel.onchange = () => show(Number(sel.value));
    show(0);
  }

  function computeSeriesSourceBadge(seriesMeta) {
    // seriesMeta items look like {t,v,src} where src is 'real' or 'synthetic'
    const badge = qs('haiphen-overlay-badge');
    const meta = qs('haiphen-overlay-meta');
    if (!badge || !meta) return;

    const pts = Array.isArray(seriesMeta) ? seriesMeta : [];
    const real = pts.filter(p => p?.src === 'real').length;
    const syn = pts.filter(p => p?.src === 'synthetic').length;

    badge.classList.remove('is-real', 'is-mixed');

    if (pts.length === 0) {
      badge.textContent = 'synthetic';
      meta.textContent = 'No published series points for this KPI.';
      return;
    }

    if (syn === 0 && real > 0) {
      badge.textContent = 'real';
      badge.classList.add('is-real');
    } else if (real === 0 && syn > 0) {
      badge.textContent = 'synthetic';
    } else {
      badge.textContent = 'hybrid';
      badge.classList.add('is-mixed');
    }

    meta.textContent = `${real} real • ${syn} synthetic • ${pts.length} total`;
  }  

  function drawChart(ctx, opts) {
    const { w, h, type, series, smooth } = opts;

    // HiDPI
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    ctx.canvas.width = Math.floor(w * dpr);
    ctx.canvas.height = Math.floor(h * dpr);
    ctx.canvas.style.width = `${w}px`;
    ctx.canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    // padding
    const padL = 44, padR = 16, padT = 18, padB = 34;
    const iw = w - padL - padR;
    const ih = h - padT - padB;

    const raw = series.slice();
    const data = smooth ? movingAverage(raw, 6) : raw;

    let min = Infinity, max = -Infinity;
    for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min = 0; max = 1;
    }
    const range = (max - min) || 1;
    const yMin = min - range * 0.08;
    const yMax = max + range * 0.08;

    function xAt(i) { return padL + (i / Math.max(1, data.length - 1)) * iw; }
    function yAt(v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * ih; }

    // soft grid
    ctx.save();
    ctx.strokeStyle = 'rgba(20,32,51,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padT + (i / 5) * ih;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + iw, y);
      ctx.stroke();
    }
    ctx.restore();

    // axes labels
    ctx.save();
    ctx.fillStyle = 'rgba(20,32,51,0.55)';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 2; i++) {
      const t = i / 2;
      const v = yMax - t * (yMax - yMin);
      const y = padT + t * ih;
      ctx.fillText(formatNum(v), padL - 8, y);
    }
    ctx.restore();

    // gradient stroke
    const grad = ctx.createLinearGradient(padL, padT, padL + iw, padT + ih);
    grad.addColorStop(0, '#7c3aed');  // purple
    grad.addColorStop(0.5, '#06b6d4'); // cyan
    grad.addColorStop(1, '#22c55e');   // green

    const baseLine = yAt(0);

    if (type === 'bars') {
      ctx.save();
      const barW = iw / data.length;
      for (let i = 0; i < data.length; i++) {
        const x = padL + i * barW;
        const y = yAt(data[i]);
        const y0 = clamp(baseLine, padT, padT + ih);
        const top = Math.min(y, y0);
        const height = Math.abs(y - y0);
        ctx.fillStyle = (data[i] >= 0) ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)';
        ctx.fillRect(x + 0.15 * barW, top, Math.max(1, 0.7 * barW), height);
      }
      ctx.restore();
      return { min, max, last: data[data.length - 1] };
    }

    // area fill (optional)
    if (type === 'area') {
      ctx.save();
      const fill = ctx.createLinearGradient(padL, padT, padL, padT + ih);
      fill.addColorStop(0, 'rgba(6,182,212,0.25)');
      fill.addColorStop(1, 'rgba(124,58,237,0.06)');

      ctx.beginPath();
      ctx.moveTo(xAt(0), clamp(baseLine, padT, padT + ih));
      for (let i = 0; i < data.length; i++) ctx.lineTo(xAt(i), yAt(data[i]));
      ctx.lineTo(xAt(data.length - 1), clamp(baseLine, padT, padT + ih));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    }

    // main line
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = grad;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = xAt(i);
      const y = yAt(data[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // last point highlight
    const lx = xAt(data.length - 1);
    const ly = yAt(data[data.length - 1]);
    ctx.save();
    ctx.fillStyle = '#0ea5e9';
    ctx.shadowColor = 'rgba(14,165,233,0.35)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    return { min, max, last: data[data.length - 1] };
  }

  function hashSeedFromString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function getCurrentTradesScreenshotUrl() {
    const img = document.getElementById('trades-img');
    const src = img?.getAttribute('src') || img?.src || '';
    return src || 'assets/trades/alpaca_screenshot.png';
  }

  function installOverlayBehavior(root) {
    const overlay = root.querySelector('.haiphen-overlay');
    const bg = root.querySelector('.haiphen-overlay__bg');
    const closeBtn = root.querySelector('.haiphen-overlay__close');
    const titleEl = qs('haiphen-overlay-title');
    const subtitleEl = qs('haiphen-overlay-subtitle');

    const canvas = qs('haiphen-overlay-chart');
    const typeSel = qs('haiphen-chart-type');
    const pointsEl = qs('haiphen-points');
    const pointsLabel = qs('haiphen-points-label');
    const volEl = qs('haiphen-vol');
    const volLabel = qs('haiphen-vol-label');
    const smoothEl = qs('haiphen-smooth');
    const regenBtn = qs('haiphen-regenerate');
    const exportBtn = qs('haiphen-export');

    const statLast = qs('haiphen-stat-last');
    const statMin = qs('haiphen-stat-min');
    const statMax = qs('haiphen-stat-max');
    const statDelta = qs('haiphen-stat-delta');

    if (!overlay || !bg || !canvas) {
      console.warn(`${LOG} missing overlay nodes`);
      return null;
    }

    const ctx = canvas.getContext('2d');

    const state = {
      title: 'Metric',
      subtitle: '—',
      seed: 12345,

      // NEW: seriesMeta is authoritative if provided
      series: [],
      seriesMeta: null,     // [{t,v,src}]
      isReal: false,

      // NEW: entity drilldowns
      extremes: { hi: [], lo: [] },
      portfolioAssets: [],
    };

    function resizeCanvasAndRender() {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(420, Math.floor(rect.width));
      const h = Math.max(260, Math.floor(rect.height));
      const points = Number(pointsEl?.value || 96);
      const vol = Number(volEl?.value || 0.65);
      const type = String(typeSel?.value || 'line');
      const smooth = Boolean(smoothEl?.checked);

      // generate new if empty
      if (!state.series || state.series.length !== points) {
        state.series = genSeries({ points, vol, seed: state.seed });
      }

      const stats = drawChart(ctx, { w, h, type, series: state.series, smooth });
      const last = stats?.last ?? NaN;
      const min = stats?.min ?? NaN;
      const max = stats?.max ?? NaN;
      const delta = (Number.isFinite(last) && state.series.length > 1)
        ? (last - state.series[0])
        : NaN;

      if (statLast) statLast.textContent = formatNum(last);
      if (statMin) statMin.textContent = formatNum(min);
      if (statMax) statMax.textContent = formatNum(max);
      if (statDelta) statDelta.textContent = formatNum(delta);
    }

    function open({ title, subtitle, screenshotUrl, seed, series, extremes, portfolioAssets } = {}) {
      state.title = title || 'Metric';
      state.subtitle = subtitle || '';
      state.seed = Number.isFinite(seed) ? seed : hashSeedFromString(state.title);

      // Accept published entity series: [{t,v,src}] (already hybrid-filled in your publisher)
      state.seriesMeta = Array.isArray(series) ? series : null;
      state.isReal = Boolean(state.seriesMeta && state.seriesMeta.length);

      state.extremes = extremes || { hi: [], lo: [] };
      state.portfolioAssets = Array.isArray(portfolioAssets) ? portfolioAssets : [];

      if (titleEl) titleEl.textContent = state.title;

      // Update the “kicker”/subtitle in a truthy way
      if (subtitleEl) {
        const base = state.subtitle || (state.isReal ? 'Published series • entity drilldown' : 'Synthetic preview (no published series)');
        subtitleEl.textContent = base;
      }

      const bgUrl = screenshotUrl || getCurrentTradesScreenshotUrl();
      bg.style.backgroundImage = `url("${bgUrl}")`;

      // Show portfolio UI only for Portfolio tile
      const isPortfolio = (state.title || '').toLowerCase() === 'portfolio';
      const canvasEl = qs('haiphen-overlay-chart');
      const chartWrap = canvasEl?.closest('.haiphen-overlay__chartWrap');

      if (chartWrap) chartWrap.style.display = isPortfolio ? 'none' : '';
      renderPortfolio(isPortfolio ? state.portfolioAssets : []);
      renderExtremes(isPortfolio ? { hi: [], lo: [] } : state.extremes);

      // Sync labels
      if (pointsLabel && pointsEl) pointsLabel.textContent = String(pointsEl.value);
      if (volLabel && volEl) volLabel.textContent = String(volEl.value);

      // IMPORTANT:
      // - if real series exists, DO NOT generate with genSeries()
      // - instead, use the published seriesMeta and slice to requested points
      if (!isPortfolio) {
        const points = Number(pointsEl?.value || 96);

        if (state.isReal) {
          const meta = state.seriesMeta.slice(-points);
          state.series = meta.map(p => Number(p.v));
          computeSeriesSourceBadge(meta);
        } else {
          // fallback synthetic
          const vol = Number(volEl?.value || 0.65);
          state.series = genSeries({ points, vol, seed: state.seed });
          computeSeriesSourceBadge([]);
        }
      } else {
        computeSeriesSourceBadge([]);
      }

      // Disable “regenerate” if we have real series
      if (regenBtn) regenBtn.disabled = state.isReal;

      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('haiphen-overlay-lock');
      document.body.style.overflow = 'hidden';

      requestAnimationFrame(resizeCanvasAndRender);
    }

    function close() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('haiphen-overlay-lock');
      document.body.style.overflow = '';
    }

    // handlers
    closeBtn?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === '1') close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });

    function onControlChange() {
      if (pointsLabel && pointsEl) pointsLabel.textContent = String(pointsEl.value);
      if (volLabel && volEl) volLabel.textContent = String(volEl.value);

      const points = Number(pointsEl?.value || 96);

      if (state.isReal && state.seriesMeta && state.seriesMeta.length) {
        const meta = state.seriesMeta.slice(-points);
        state.series = meta.map(p => Number(p.v));
        computeSeriesSourceBadge(meta);
      } else {
        const vol = Number(volEl?.value || 0.65);
        state.series = genSeries({ points, vol, seed: state.seed });
        computeSeriesSourceBadge([]);
      }

      resizeCanvasAndRender();
    }

    pointsEl?.addEventListener('input', onControlChange);
    volEl?.addEventListener('input', onControlChange);
    typeSel?.addEventListener('change', resizeCanvasAndRender);
    smoothEl?.addEventListener('change', resizeCanvasAndRender);

    regenBtn?.addEventListener('click', () => {
      if (state.isReal) return; // ignore regenerate when real data provided
      state.seed = (state.seed + 1337) >>> 0;
      onControlChange();
    });

    exportBtn?.addEventListener('click', () => {
      try {
        const a = document.createElement('a');
        a.download = `${(state.title || 'metric').replaceAll(/\s+/g, '_')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      } catch (err) {
        console.warn(`${LOG} export failed`, err);
      }
    });

    // resize when window changes
    window.addEventListener('resize', () => {
      if (!overlay.classList.contains('is-open')) return;
      resizeCanvasAndRender();
    });

    return { open, close };
  }

  async function loadOverlay() {
    const mount = qs(MOUNT_ID);
    if (!mount) {
      console.warn(`${LOG} mount missing (#${MOUNT_ID})`);
      return;
    }

    // avoid double insert
    if (mount.querySelector('.haiphen-overlay')) return;

    await injectCssOnce('components/trades-overlay/trades-overlay.css');
    const html = await fetchText('components/trades-overlay/trades-overlay.html');
    mount.innerHTML = html;

    const api = installOverlayBehavior(mount);
    if (!api) return;

    window.HAIPHEN = window.HAIPHEN || {};
    window.HAIPHEN.TradesOverlay = api;
  }

  // expose loader like your other components
  window.HAIPHEN = window.HAIPHEN || {};
  window.HAIPHEN.loadTradesOverlay = loadOverlay;
})();