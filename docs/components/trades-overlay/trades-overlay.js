  /* docs/components/trades-overlay/trades-overlay.js
   * KPI overlay with interactive chart and live data series.
   * - Mount once (index.html adds #trades-overlay-mount)
   * - Open via window.HAIPHEN.TradesOverlay.open({ title, screenshotUrl, seed, series, extremes, portfolioAssets })
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

    function genSeries({ points, vol, seed, center }) {
      const rand = mulberry32(seed);
      const arr = [];
      const c = Number.isFinite(center) ? center : (50 + rand() * 50);
      const amplitude = Math.max(Math.abs(c) * 0.15, 1);
      let v = c + (rand() - 0.5) * amplitude * 0.3;
      for (let i = 0; i < points; i++) {
        const shock = (rand() - 0.5) * 2 * vol * amplitude;
        const drift = (c - v) * 0.02;
        v = v + drift + shock;
        arr.push(v);
      }
      return arr;
    }
    function formatNum(x) {
      const n = Number(x);
      if (!Number.isFinite(n)) return '—';
      const abs = Math.abs(n);
      if (abs >= 1000) return n.toFixed(0);
      if (abs >= 100) return n.toFixed(1);
      return n.toFixed(2);
    }
    function formatNumForKpi(kpiTitle, x) {
      if (!Number.isFinite(x)) return '—';
      const k = String(kpiTitle || '').toLowerCase();

      // Greeks: keep meaningful decimals
      if (/(delta|gamma|theta|vega|rho|beta)/.test(k) && !/exposure|ratio/.test(k)) {
        return x.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
      }

      // Percent-like
      if (/percent|win rate|drawdown|volatility/.test(k)) {
        return x.toFixed(2);
      }

      // USD-ish / price
      if (/pnl|price|market/i.test(k)) {
        const abs = Math.abs(x);
        if (abs >= 1000) return x.toFixed(0);
        if (abs >= 100) return x.toFixed(1);
        return x.toFixed(2);
      }

      // Ratios and exposures
      if (/ratio|exposure|skew|decay|uncertainty|weight|volume|liquidity/i.test(k)) {
        return x.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
      }

      // Counts (signals, entries, exits, notifications, etc.)
      if (/scanned|flagged|sent|opened|closed|portfolio/i.test(k)) {
        return x.toFixed(0);
      }

      // General fallback
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

    function formatTimeLabel(ts) {
      try {
        const d = new Date(ts);
        if (!Number.isFinite(d.getTime())) return String(ts || '');

        // If it looks like a date-only series (daily MV), show "Dec 27"
        const mm = d.toLocaleString(undefined, { month: 'short' });
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm} ${dd}`;
      } catch {
        return String(ts || '');
      }
    }

    function renderExtremes(extremes, kpiTitle) {
      const el = qs('haiphen-extremes');
      if (!el) return;

      const hi = extremes?.hi || [];
      const lo = extremes?.lo || [];
      el.hidden = (hi.length + lo.length) === 0;

      const metricLabel = (() => {
        const k = String(kpiTitle || '');
        if (/pnl|price/i.test(k)) return 'Impact ($)';
        if (/percent|rate|drawdown|volatility/i.test(k)) return 'Impact (%)';
        if (/liquidity/i.test(k)) return 'Impact ($)';
        if (/unrealized/i.test(k)) return 'Impact ($)';
        return 'Impact ($)';
      })();

      const isDollar = /\(\$\)/.test(metricLabel);

      const row = (r) => {
        const raw = formatNumForKpi(kpiTitle, Number(r.metric_value));
        const display = isDollar && raw !== '—' ? '$' + raw : raw;
        return `
        <div class="xrow">
          <div class="cn">${escapeHtml(r.contract_name || '')}</div>
          <div class="sym">${escapeHtml(r.symbol || '')}</div>
          <div class="pnl">${escapeHtml(display)}</div>
        </div>
      `;
      };

      el.innerHTML = `
        <div class="xbox">
          <div class="xtitle">Top impact (${escapeHtml(metricLabel)})</div>
          ${hi.map(row).join('') || '<div class="muted">—</div>'}
        </div>
        <div class="xbox">
          <div class="xtitle">Lowest impact (${escapeHtml(metricLabel)})</div>
          ${lo.map(row).join('') || '<div class="muted">—</div>'}
        </div>
      `;
    }

    function renderPortfolio(portfolioAssets) {
      const wrap = qs('haiphen-portfolio');
      const sel = qs('haiphen-portfolio-select');
      if (!wrap || !sel) return;

      const assets = Array.isArray(portfolioAssets) ? portfolioAssets : [];
      wrap.hidden = assets.length === 0;

      sel.innerHTML = assets
        .map((a, i) => {
          const sym = String(a.symbol || '').trim();
          const cn = String(a.contract_name || '').trim();
          const label = sym && cn ? `${sym} • ${cn}` : (sym || cn || `Contract ${i + 1}`);
          return `<option value="${i}">${escapeHtml(label)}</option>`;
        })
        .join('');
    }

    function normalizeExtremesPayload(extremesPayload, kpiTitle) {
      // Supports:
      // - { hi: [...], lo: [...] }  (legacy)
      // - { items: [...] }          (newer)
      // - [...]                     (newer)
      const payload = extremesPayload ?? {};
      const items = Array.isArray(payload) ? payload
        : Array.isArray(payload.items) ? payload.items
        : (Array.isArray(payload.hi) || Array.isArray(payload.lo)) ? [
            ...(payload.hi || []).map(x => ({ ...x, side: 'hi' })),
            ...(payload.lo || []).map(x => ({ ...x, side: 'lo' })),
          ]
        : [];

      // Choose a sensible value field based on KPI name, with fallbacks
      const pickValue = (r) => {
        // Prefer metric_raw if present (it’s your “signed” impact)
        if (Number.isFinite(Number(r.metric_raw))) return Number(r.metric_raw);

        const k = String(kpiTitle || '');
        if (/pnl/i.test(k) && Number.isFinite(Number(r.individual_pnl))) return Number(r.individual_pnl);
        if (/liquidity/i.test(k) && Number.isFinite(Number(r.liquidity_drag))) return Number(r.liquidity_drag);

        // last resort: abs metric
        if (Number.isFinite(Number(r.metric_abs))) return Number(r.metric_abs);
        return NaN;
      };

      const out = { hi: [], lo: [] };
      for (const r of items) {
        const side = String(r.side || '').toLowerCase();
        const norm = {
          trade_id: r.trade_id,
          symbol: r.symbol,
          contract_name: r.contract_name,
          metric_value: pickValue(r),
          // keep originals if you want to debug in-console later
          _raw: r,
        };
        if (side === 'hi') out.hi.push(norm);
        else if (side === 'lo') out.lo.push(norm);
      }

      // Sort: hi descending, lo ascending (or by abs if you prefer)
      out.hi.sort((a, b) => (Number(b.metric_value) || -Infinity) - (Number(a.metric_value) || -Infinity));
      out.lo.sort((a, b) => (Number(a.metric_value) || Infinity) - (Number(b.metric_value) || Infinity));

      return out;
    }

    function pickExtremesForKpi(extremesPayload, kpiTitle) {
      const p = extremesPayload || {};
      const byKpi = p.byKpi && typeof p.byKpi === 'object' ? p.byKpi : null;
      if (!byKpi) return p;

      const want = String(kpiTitle || '').trim();
      if (!want) return p;

      // 1) exact key
      if (byKpi[want]) return byKpi[want];

      // 2) case-insensitive key match
      const wantLc = want.toLowerCase();
      for (const key of Object.keys(byKpi)) {
        if (String(key).toLowerCase() === wantLc) return byKpi[key];
      }

      // 3) legacyKpi fallback
      const legacy = p.legacyKpi && byKpi[p.legacyKpi] ? byKpi[p.legacyKpi] : null;
      if (legacy) return legacy;

      // 4) first KPI as last resort
      const first = Object.keys(byKpi)[0];
      return first ? byKpi[first] : p;
    }
    
    function computeSeriesSourceBadge(seriesMeta) {
      const badge = qs('haiphen-overlay-badge');
      const meta = qs('haiphen-overlay-meta');
      if (!badge || !meta) return;

      const pts = Array.isArray(seriesMeta) ? seriesMeta : [];

      badge.classList.remove('is-real', 'is-mixed');

      if (pts.length === 0) {
        badge.textContent = 'metrics';
        meta.textContent = 'No published series points for this KPI.';
        return;
      }

      badge.textContent = 'live';
      badge.classList.add('is-real');
      meta.textContent = `${pts.length} data points`;
    }

    function drawChart(ctx, opts) {
      const { w, h, type, series, smooth, xLabel, yLabel, xTicks } = opts;

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

      // axis titles
      ctx.save();
      ctx.fillStyle = 'rgba(20,32,51,0.60)';
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

      // Y label (rotated)
      if (yLabel) {
        ctx.translate(14, padT + ih / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(yLabel), 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // X label
      if (xLabel) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(xLabel), padL + iw / 2, padT + ih + 18);
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

      // x ticks (few labels)
      if (Array.isArray(xTicks) && xTicks.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(20,32,51,0.55)';
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const n = xTicks.length;
        const marks = Math.min(5, n);
        for (let i = 0; i < marks; i++) {
          const idx = Math.round((i / (marks - 1)) * (n - 1));
          const x = padL + (idx / Math.max(1, n - 1)) * iw;
          const y = padT + ih + 6;
          const lab = xTicks[idx] ?? '';
          ctx.fillText(String(lab), x, y);
        }
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

    function getAxisForKpi(kpiTitle) {
      const k = String(kpiTitle || '').trim();

      if (/pnl/i.test(k)) return { xLabel: 'Time', yLabel: 'PnL (USD)' };
      if (/percent/i.test(k)) return { xLabel: 'Time', yLabel: 'Percent change (%)' };
      if (/liquidity/i.test(k)) return { xLabel: 'Time', yLabel: 'Liquidity ratio' };
      if (/unrealized/i.test(k)) return { xLabel: 'Time', yLabel: 'Unrealized P/L (USD)' };
      if (/win rate/i.test(k)) return { xLabel: 'Time', yLabel: 'Win rate (%)' };
      if (/drawdown/i.test(k)) return { xLabel: 'Time', yLabel: 'Max drawdown (%)' };
      if (/sharpe/i.test(k)) return { xLabel: 'Time', yLabel: 'Sharpe ratio' };
      if (/volatility/i.test(k)) return { xLabel: 'Time', yLabel: 'Historical volatility' };
      if (/uncertainty/i.test(k)) return { xLabel: 'Time', yLabel: 'Uncertainty' };
      if (/fair.*price/i.test(k)) return { xLabel: 'Time', yLabel: 'Fair Market Price (USD)' };
      if (/skew/i.test(k)) return { xLabel: 'Time', yLabel: 'IV Skew' };
      if (/decay rate/i.test(k)) return { xLabel: 'Time', yLabel: 'Decay rate' };
      if (/gamma exposure/i.test(k)) return { xLabel: 'Time', yLabel: 'Gamma exposure (GEX)' };
      if (/volume/i.test(k)) return { xLabel: 'Time', yLabel: 'Volume ratio' };
      if (/oi ratio/i.test(k)) return { xLabel: 'Time', yLabel: 'Open interest ratio' };
      if (/decay weight/i.test(k)) return { xLabel: 'Time', yLabel: 'Decay weight' };
      if (/beta/i.test(k)) return { xLabel: 'Time', yLabel: 'Beta' };
      if (/delta/i.test(k)) return { xLabel: 'Time', yLabel: 'Delta' };
      if (/gamma/i.test(k)) return { xLabel: 'Time', yLabel: 'Gamma' };
      if (/theta/i.test(k)) return { xLabel: 'Time', yLabel: 'Theta' };
      if (/vega/i.test(k)) return { xLabel: 'Time', yLabel: 'Vega' };
      if (/rho/i.test(k)) return { xLabel: 'Time', yLabel: 'Rho' };
      if (/hold time/i.test(k)) return { xLabel: 'Time', yLabel: 'Hold time (s)' };
      if (/signal/i.test(k)) return { xLabel: 'Time', yLabel: 'Signals' };

      return { xLabel: 'Time', yLabel: '' };
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
      const DEFAULT_POINTS = 96;
      const MIN_POINTS = 24;
      const MAX_POINTS_SYNTH = 288; // e.g. 5-min resolution for 24h = 288

      if (pointsEl) {
        pointsEl.min = String(MIN_POINTS);

        // if HTML shipped with max=24, override it
        pointsEl.max = String(MAX_POINTS_SYNTH);

        // ensure a reasonable default
        if (!pointsEl.value || Number(pointsEl.value) < MIN_POINTS) {
          pointsEl.value = String(DEFAULT_POINTS);
        }

        if (pointsLabel) pointsLabel.textContent = String(pointsEl.value);
      }
      if (!overlay || !bg || !canvas) {
        console.warn(`${LOG} missing overlay nodes`);
        return null;
      }

      const ctx = canvas.getContext('2d');

      const state = {
        title: 'Metric',
        subtitle: '—',
        seed: 12345,

        series: [],
        seriesMeta: null,     // [{t,v}]
        isReal: false,
        kpiHintValue: NaN,    // numeric center for generated charts

        extremes: { hi: [], lo: [] },
        portfolioAssets: [],
      };

      function resizeCanvasAndRender() {
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(280, Math.floor(rect.width));
        const h = Math.max(180, Math.floor(rect.height));
        const points = Number(pointsEl?.value || 96);
        const vol = Number(volEl?.value || 0.65);
        const type = String(typeSel?.value || 'line');
        const smooth = Boolean(smoothEl?.checked);

        // Only generate fallback series when we don't have published series
        if (!state.isReal) {
          if (!state.series || state.series.length !== points) {
            state.series = genSeries({ points, vol, seed: state.seed, center: state.kpiHintValue });
          }
        } else {
          // Keep the real series aligned to the slider
          const meta = (state.seriesMeta || []).slice(-points);
          state.series = meta.map(p => Number(p.v));
        }

        // Derive x ticks from real series timestamps when available
        let xTicks = null;
        if (state.seriesMeta && state.seriesMeta.length) {
          const meta = state.seriesMeta.slice(-points);
          xTicks = meta.map(p => formatTimeLabel(p.t));
        } else {
          xTicks = Array.from({ length: state.series.length }, (_, i) => String(i + 1));
        }

        // KPI-specific axis labels (fallbacks)
        const axis = getAxisForKpi(state.title);

        const stats = drawChart(ctx, {
          w, h, type,
          series: state.series,
          smooth,
          xLabel: axis.xLabel,
          yLabel: axis.yLabel,
          xTicks
        });

        const last = stats?.last ?? NaN;
        const min = stats?.min ?? NaN;
        const max = stats?.max ?? NaN;
        const delta = (Number.isFinite(last) && state.series.length > 1)
          ? (last - state.series[0])
          : NaN;

        if (statLast) statLast.textContent = formatNumForKpi(state.title, last);
        if (statMin) statMin.textContent = formatNumForKpi(state.title, min);
        if (statMax) statMax.textContent = formatNumForKpi(state.title, max);
        if (statDelta) statDelta.textContent = formatNumForKpi(state.title, delta);
      }

      function open({ title, subtitle, screenshotUrl, seed, series, extremes, portfolioAssets, kpiHintValue } = {}) {
        state.title = title || 'Metric';
        state.subtitle = subtitle || '';
        state.seed = Number.isFinite(seed) ? seed : hashSeedFromString(state.title);
        state.kpiHintValue = Number.isFinite(kpiHintValue) ? kpiHintValue : NaN;

        // Accept published entity series: [{t,v}]
        state.seriesMeta = Array.isArray(series) ? series : null;
        state.isReal = Boolean(state.seriesMeta && state.seriesMeta.length);

        const chosenExtremes = pickExtremesForKpi(extremes, state.title);
        state.extremes = normalizeExtremesPayload(chosenExtremes, state.title);
        state.portfolioAssets = Array.isArray(portfolioAssets) ? portfolioAssets : [];

        if (titleEl) titleEl.textContent = state.title;

        // Update the “kicker”/subtitle in a truthy way
        if (subtitleEl) {
          // Only show what the caller provides; otherwise keep it neutral.
          subtitleEl.textContent = state.subtitle || 'KPI series & contract extremes';
        }

        const bgUrl = screenshotUrl || getCurrentTradesScreenshotUrl();
        bg.style.backgroundImage = `url("${bgUrl}")`;

        // Show portfolio UI only for Portfolio tile
        const isPortfolio = (state.title || '').toLowerCase() === 'portfolio';

        const canvasEl = qs('haiphen-overlay-chart');
        const chartWrap = canvasEl?.closest('.haiphen-overlay__chartWrap');
        const controls = root.querySelector('.haiphen-overlay__controls');
        const extremesEl = qs('haiphen-extremes');

        if (chartWrap) chartWrap.style.display = isPortfolio ? 'none' : '';
        if (controls) controls.style.display = isPortfolio ? 'none' : '';
        if (extremesEl) extremesEl.hidden = true; // always hidden for Portfolio

        renderPortfolio(isPortfolio ? state.portfolioAssets : []);
        if (!isPortfolio) renderExtremes(state.extremes, state.title);

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
            const vol = Number(volEl?.value || 0.65);
            state.series = genSeries({ points, vol, seed: state.seed, center: state.kpiHintValue });
            computeSeriesSourceBadge([]);
          }
        } else {
          // Portfolio is dropdown-only. No badge, no chart, no stats.
          computeSeriesSourceBadge([]);
        }
        // Clamp points slider to real series length when real series exists
        if (pointsEl) {
          if (state.seriesMeta && state.seriesMeta.length) {
            const n = state.seriesMeta.length;
            pointsEl.max = String(Math.max(MIN_POINTS, n));
            if (Number(pointsEl.value) > n) pointsEl.value = String(n);
          } else {
            pointsEl.max = String(MAX_POINTS_SYNTH);
          }
          if (pointsLabel) pointsLabel.textContent = String(pointsEl.value);
        }
        // Disable “regenerate” if we have real series
        if (regenBtn) regenBtn.disabled = state.isReal || isPortfolio;

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
          state.series = genSeries({ points, vol, seed: state.seed, center: state.kpiHintValue });
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