/* docs/components/getting-started/getting-started.js
 * Getting Started page — lens-aware installation guides, broker connection,
 * pipeline verification, demo GIFs, service cards.
 * Entitlement-gated: free users see teaser, Pro/Enterprise see full content.
 */
(function () {
  'use strict';

  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  const LOG = '[getting-started]';

  const AUTH_ORIGIN = 'https://auth.haiphen.io';
  const MOUNT_ID = 'content-widget';

  let _lensListenerWired = false;

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

  /* ================================================================
     LENS HELPERS
     ================================================================ */

  function getLens() {
    if (typeof NS.lens?.get === 'function') return NS.lens.get();
    return document.documentElement.getAttribute('data-lens') === 'finance' ? 'finance' : 'tech';
  }

  /* ================================================================
     CONTENT — flat map of data-gs-lens keys → { tech, finance }
     ================================================================ */

  const CONTENT = {
    'hero-eyebrow': {
      tech: 'Developer Quick Start',
      finance: 'Trader Quick Start',
    },
    'hero-title': {
      tech: 'Get Started with Haiphen',
      finance: 'Get Started with Haiphen',
    },
    'hero-sub': {
      tech: 'Install the CLI. Connect your APIs. Real-time telemetry in minutes — from vulnerability scanning to supply-chain risk, all from one command line.',
      finance: 'Connect your broker. See your trades flow. No black boxes, no mystery vendors — just transparent, inspectable trade telemetry from install to first signal.',
    },
    'install-sub': {
      tech: 'Install the Haiphen CLI on any platform, authenticate, and start your local gateway.',
      finance: 'Install the Haiphen CLI on any platform, authenticate, and connect to your brokerage in minutes.',
    },
    'broker-title': {
      tech: 'Connect Your Data Sources',
      finance: 'Connect Your Broker',
    },
    'broker-sub': {
      tech: 'Configure API keys, webhook endpoints, and environment variables to start ingesting data.',
      finance: 'Link your brokerage account to see live trade telemetry. Choose between live and sandbox modes.',
    },
    'pipeline-title': {
      tech: 'Verify Your Pipeline',
      finance: 'Watch Your First Trade Flow',
    },
    'pipeline-sub': {
      tech: 'Run health checks, tail logs, and confirm end-to-end connectivity.',
      finance: 'Execute a sandbox trade and watch it flow through the telemetry pipeline in real time.',
    },
    'success-title': {
      tech: 'What Success Looks Like',
      finance: 'What Success Looks Like',
    },
    'cohort-title': {
      tech: 'Join the Developer Cohort',
      finance: 'Join the Onboarding Cohort',
    },
    'cohort-sub': {
      tech: 'Get hands-on onboarding, priority support, and early access to new services. Cohort members ship faster and shape the platform roadmap.',
      finance: 'Get guided onboarding, dedicated support, and early access to new analytics. Cohort members see results faster and influence product direction.',
    },
    'svc-secure-name': {
      tech: 'Haiphen Secure',
      finance: 'Compliance Scanner',
    },
    'svc-secure-desc': {
      tech: 'Vulnerability & compliance scanning',
      finance: 'Regulatory compliance & audit automation',
    },
    'svc-network-name': {
      tech: 'Network Trace',
      finance: 'Market Data Trace',
    },
    'svc-network-desc': {
      tech: 'Protocol-level traffic analysis',
      finance: 'Feed latency & data quality analysis',
    },
    'svc-graph-name': {
      tech: 'Knowledge Graph',
      finance: 'Entity Intelligence',
    },
    'svc-graph-desc': {
      tech: 'Entity relationships & topology',
      finance: 'Corporate structure & relationship mapping',
    },
    'svc-risk-name': {
      tech: 'Risk Analysis',
      finance: 'Portfolio Risk Engine',
    },
    'svc-risk-desc': {
      tech: 'Scenario modeling & Monte Carlo',
      finance: 'VaR, stress testing & portfolio correlation',
    },
    'svc-causal-name': {
      tech: 'Causal Chain',
      finance: 'Trade Chain Replay',
    },
    'svc-causal-desc': {
      tech: 'Root-cause & event chain analysis',
      finance: 'Execution replay & decision attribution',
    },
    'svc-supply-name': {
      tech: 'Supply Chain Intel',
      finance: 'Counterparty Monitor',
    },
    'svc-supply-desc': {
      tech: 'Supplier risk scoring & alerts',
      finance: 'Counterparty exposure & concentration risk',
    },
  };

  /* ================================================================
     RICH CONTENT — keys whose values are functions returning HTML
     ================================================================ */

  const BROKERS = [
    { name: 'Charles Schwab', icon: 'assets/partners/schwab.svg' },
    { name: 'Interactive Brokers', icon: 'assets/partners/interactive-brokers.svg' },
    { name: 'Alpaca', icon: 'assets/partners/alpaca.svg' },
    { name: 'Fidelity', icon: 'assets/partners/fidelity.svg' },
    { name: 'Robinhood', icon: 'assets/partners/robinhood.svg' },
    { name: 'E*TRADE', icon: 'assets/partners/etrade.svg' },
    { name: 'TD Ameritrade', icon: 'assets/partners/td-ameritrade.svg' },
    { name: 'Merrill', icon: 'assets/partners/merrill.svg' },
  ];

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const RICH_CONTENT = {
    'broker-detail': {
      tech: function () {
        return `
          <div class="hp-gs__code-block"><pre><code># .env — configure your data sources
HAIPHEN_API_KEY=hpn_live_xxxxxxxxxxxxxxxx
HAIPHEN_WEBHOOK_URL=https://your-app.com/webhooks/haiphen
HAIPHEN_ENV=production
HAIPHEN_LOG_LEVEL=info</code></pre></div>
          <div class="hp-gs__broker-modes">
            <div class="hp-gs__broker-mode">
              <strong>API Key Auth</strong>
              <p>Generate a scoped API key in your <a href="#profile">Profile</a>. Supports metrics:read, rss:read, and webhooks:write scopes.</p>
            </div>
            <div class="hp-gs__broker-mode">
              <strong>Webhook Config</strong>
              <p>Register an HTTPS endpoint to receive real-time events — service alerts, pipeline completions, and threshold triggers.</p>
            </div>
            <div class="hp-gs__broker-mode">
              <strong>Environment Variables</strong>
              <p>All configuration is env-driven. Set HAIPHEN_ENV to <em>production</em> or <em>sandbox</em> to control behavior.</p>
            </div>
          </div>`;
      },
      finance: function () {
        var cards = BROKERS.map(function (b) {
          return '<div class="hp-gs__broker-card"><img src="' + esc(b.icon) + '" alt="' + esc(b.name) + '" /><span>' + esc(b.name) + '</span></div>';
        }).join('');
        return `
          <div class="hp-gs__broker-grid">${cards}</div>
          <div class="hp-gs__broker-modes">
            <div class="hp-gs__broker-mode hp-gs__broker-mode--live">
              <strong>Live Mode</strong>
              <p>Connect with real broker credentials. Trades execute against live markets. Set <code>HAIPHEN_ENV=production</code>.</p>
            </div>
            <div class="hp-gs__broker-mode hp-gs__broker-mode--sandbox">
              <strong>Sandbox Mode</strong>
              <p>Paper trading with simulated data. Perfect for testing your pipeline before going live. Set <code>HAIPHEN_ENV=sandbox</code>.</p>
            </div>
          </div>`;
      },
    },

    'pipeline-detail': {
      tech: function () {
        return `
          <div class="hp-gs__code-block"><pre><code># Health check
haiphen status --verbose

# Tail service logs
haiphen logs --follow --service secure

# Connectivity test
haiphen ping --all-services</code></pre></div>
          <p class="hp-gs__hint">All services should return 200 OK. If a service shows degraded, check your API key scopes in Profile.</p>`;
      },
      finance: function () {
        return `
          <div class="hp-gs__code-block"><pre><code># Start sandbox gateway
HAIPHEN_ENV=sandbox haiphen serve

# Execute a test trade
haiphen trade --symbol AAPL --qty 10 --side buy --sandbox

# Verify pipeline received the trade
haiphen trades --last 1 --format json</code></pre></div>
          <p class="hp-gs__hint">You should see your test trade appear in the telemetry dashboard within seconds. No real capital is at risk in sandbox mode.</p>`;
      },
    },

    'success-detail': {
      tech: function () {
        return `
          <div class="hp-gs__success-grid">
            <div class="hp-gs__success-card">
              <strong>CLI Authenticated</strong>
              <p><code>haiphen status</code> returns your plan tier and active services.</p>
            </div>
            <div class="hp-gs__success-card">
              <strong>Services Responding</strong>
              <p>All six intelligence endpoints return 200 OK on health checks.</p>
            </div>
            <div class="hp-gs__success-card">
              <strong>Data Flowing</strong>
              <p>Webhooks fire, logs stream, and metrics appear in the dashboard.</p>
            </div>
            <div class="hp-gs__success-card">
              <strong>Pipeline Verified</strong>
              <p>End-to-end test passes: ingest &rarr; process &rarr; publish &rarr; alert.</p>
            </div>
          </div>`;
      },
      finance: function () {
        return `
          <div class="hp-gs__success-grid">
            <div class="hp-gs__success-card">
              <strong>Broker Connected</strong>
              <p>Your brokerage account is linked and showing account status.</p>
            </div>
            <div class="hp-gs__success-card">
              <strong>Sandbox Trade Executed</strong>
              <p>A test trade flows through the pipeline and appears in telemetry.</p>
            </div>
            <div class="hp-gs__success-card">
              <strong>KPIs Populating</strong>
              <p>Daily metrics cards show volume, P&amp;L, stability, and risk scores.</p>
            </div>
            <div class="hp-gs__success-card">
              <strong>Alerts Configured</strong>
              <p>Threshold triggers and trade notifications are active and delivering.</p>
            </div>
          </div>`;
      },
    },
  };

  /* ================================================================
     LENS REFRESH — iterate [data-gs-lens] elements and populate
     ================================================================ */

  function refreshForLens(lens) {
    var root = qs('.hp-gs');
    if (!root) return;

    qa('[data-gs-lens]', root).forEach(function (el) {
      var key = el.getAttribute('data-gs-lens');

      // Check RICH_CONTENT first (returns HTML)
      if (RICH_CONTENT[key]) {
        var fn = RICH_CONTENT[key][lens] || RICH_CONTENT[key].tech;
        if (typeof fn === 'function') {
          el.innerHTML = fn();
        }
        return;
      }

      // Plain text content
      if (CONTENT[key]) {
        var val = CONTENT[key][lens] || CONTENT[key].tech;
        el.textContent = val;
      }
    });
  }

  /* ================================================================
     LAZY-LOAD GIFs
     ================================================================ */

  function lazyLoadGifs(root) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          var src = img.getAttribute('data-src');
          if (src && !img.src) img.src = src;
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });

    qa('.hp-gs__gif[data-src]', root).forEach(function (img) {
      var details = img.closest('details');
      if (details && !details.open) {
        details.addEventListener('toggle', function handler() {
          if (details.open) {
            var src = img.getAttribute('data-src');
            if (src && !img.src) img.src = src;
            details.removeEventListener('toggle', handler);
          }
        });
      } else {
        observer.observe(img);
      }
    });
  }

  /* ================================================================
     ENTITLEMENT CHECK
     ================================================================ */

  async function checkEntitlement() {
    try {
      var r = await fetch(AUTH_ORIGIN + '/entitlement', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok) return false;
      var data = await r.json();
      return !!data?.entitled;
    } catch (_) {
      return false;
    }
  }

  /* ================================================================
     MOUNT
     ================================================================ */

  async function ensureMounted() {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) throw new Error(LOG + ' missing #' + MOUNT_ID);

    await injectCssOnce('assets/base.css');
    await injectCssOnce('components/getting-started/getting-started.css');

    if (!mount.__haiphenGSMounted) {
      var html = await fetchText('components/getting-started/getting-started.html');
      mount.innerHTML = html;
      mount.__haiphenGSMounted = true;
    }

    var root = qs('.hp-gs', mount);
    if (!root) return;

    // Apply lens content
    refreshForLens(getLens());

    // Wire up lens change listener once
    if (!_lensListenerWired) {
      _lensListenerWired = true;
      window.addEventListener('haiphen:lens', function (e) {
        var lens = e.detail?.lens || 'tech';
        refreshForLens(lens);
      });
    }

    // Entitlement check
    var entitled = await checkEntitlement();
    var gate = qs('[data-gs-gate]', root);

    if (!entitled) {
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
      var mount = document.getElementById(MOUNT_ID);
      if (mount) mount.classList.add('active');
      await ensureMounted();
    } catch (e) {
      console.warn(LOG, 'failed to mount getting-started', e);
    }
  };
})();
