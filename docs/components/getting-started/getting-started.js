/* docs/components/getting-started/getting-started.js
 * Getting Started page — lens-aware installation guides, broker connection,
 * pipeline verification, demo GIFs, service cards.
 * Entitlement-gated: free users see teaser, Pro/Enterprise see full content.
 */
(function () {
  'use strict';

  var NS = (window.HAIPHEN = window.HAIPHEN || {});
  var LOG = '[getting-started]';

  var AUTH_ORIGIN = 'https://auth.haiphen.io';
  var MOUNT_ID = 'content-widget';

  var _lensListenerWired = false;
  var _sidebarObserver = null;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qa(sel, root) {
    return [].slice.call((root || document).querySelectorAll(sel));
  }

  async function fetchText(url) {
    var r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    return await r.text();
  }

  async function injectCssOnce(href) {
    var already = document.querySelector('link[rel="stylesheet"][href="' + href + '"]');
    if (already) return;
    var link = document.createElement('link');
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
     SECTIONS — sidebar pill data
     ================================================================ */

  var SECTIONS = [
    { id: 'gs-overview', label: 'Overview' },
    { id: 'gs-install',  label: 'Install' },
    { id: 'gs-connect',  label: 'Connect' },
    { id: 'gs-verify',   label: 'Verify' },
    { id: 'gs-success',  label: 'Success' },
    { id: 'gs-services', label: 'Services' },
    { id: 'gs-prospect', label: 'Prospect' },
    { id: 'gs-apps',     label: 'Apps' },
  ];

  /* ================================================================
     CONTENT — flat map of data-gs-lens keys → { tech, finance }
     ================================================================ */

  var CONTENT = {
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
      tech: 'Connect to Your Broker',
      finance: 'Connect Your Broker',
    },
    'broker-sub': {
      tech: 'Link your brokerage account to receive trade telemetry. Haiphen provides the signals intelligence pipeline \u2014 you bring the broker connection.',
      finance: 'Link your brokerage to receive real-time trade signals. Haiphen scans the market, fires entry and exit notifications, and delivers pipeline metrics directly to you.',
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
    'prospect-title': {
      tech: 'Prospect Engine',
      finance: 'Vulnerability Intelligence',
    },
    'prospect-sub': {
      tech: 'Automated vulnerability lead discovery, 6-service investigation pipeline, and closed-loop risk reduction.',
      finance: 'Automated vulnerability intelligence with investigation workflows, rule-based matching, and risk reduction confirmation.',
    },
    'svc-prospect-list-name': {
      tech: 'Prospect List',
      finance: 'Lead Discovery',
    },
    'svc-prospect-list-desc': {
      tech: 'Browse vulnerability leads from NVD, OSV, GitHub Advisory & Shodan',
      finance: 'View discovered vulnerability leads with severity and entity details',
    },
    'svc-prospect-investigate-name': {
      tech: 'Investigate',
      finance: 'Risk Investigation',
    },
    'svc-prospect-investigate-desc': {
      tech: 'Run 6-service sequential pipeline with upstream context forwarding',
      finance: 'Run full investigation pipeline across all analysis engines',
    },
    'svc-prospect-solve-name': {
      tech: 'Auto-Resolve',
      finance: 'Requirement Resolution',
    },
    'svc-prospect-solve-desc': {
      tech: 'Automatically resolve data gaps, monitors & integration requirements',
      finance: 'Automatically address investigation requirements and data gaps',
    },
    'svc-prospect-reinvestigate-name': {
      tech: 'Re-investigate',
      finance: 'Risk Confirmation',
    },
    'svc-prospect-reinvestigate-desc': {
      tech: 'Confirm risk reduction with before/after delta scoring',
      finance: 'Confirm risk reduction and measure improvement over baseline',
    },
  };

  /* ================================================================
     RICH CONTENT — keys whose values are functions returning HTML
     ================================================================ */

  var BROKERS = [
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

  var PIPELINE_METRICS = [
    { label: 'Entries Opened', icon: 'assets/icons/kpi/enter.svg' },
    { label: 'Exits Closed', icon: 'assets/icons/kpi/exit.svg' },
    { label: 'Signals Scanned', icon: 'assets/icons/kpi/radar.svg' },
    { label: 'Daily P&L', icon: 'assets/icons/kpi/dollar.svg' },
    { label: 'Win Rate', icon: 'assets/icons/kpi/percent.svg' },
    { label: 'Risk Score', icon: 'assets/icons/kpi/chart.svg' },
  ];

  function renderMetricsGrid() {
    var cards = PIPELINE_METRICS.map(function (m) {
      return '<div class="hp-gs__metric-card">' +
        '<img class="hp-gs__metric-icon" src="' + esc(m.icon) + '" alt="" width="28" height="28" />' +
        '<span>' + m.label + '</span>' +
      '</div>';
    }).join('');
    return '<div class="hp-gs__metrics-grid">' + cards + '</div>';
  }

  var RICH_CONTENT = {
    'broker-detail': {
      tech: function () {
        var diagramHtml = '<div class="hp-gs__telemetry-diagram">' +
          '<img src="assets/diagrams/trade-telemetry-flow.svg" alt="Trade telemetry pipeline: trades.json \u2192 MV Tables \u2192 Trigger Engine \u2192 Webhooks" loading="lazy" />' +
        '</div>';
        var cards = BROKERS.map(function (b) {
          return '<a href="#" class="hp-gs__broker-card hp-gs__broker-card--link" onclick="return false"><img src="' + esc(b.icon) + '" alt="' + esc(b.name) + '" /><span>' + esc(b.name) + '</span></a>';
        }).join('');
        var brokerGrid = '<div class="hp-gs__broker-grid">' + cards + '</div>';
        var metricsHeading = '<h4 class="hp-gs__metrics-heading">Pipeline Metrics \u2014 What Haiphen Delivers</h4>';
        var metricsGrid = renderMetricsGrid();
        var modes = '<div class="hp-gs__broker-modes">' +
          '<div class="hp-gs__broker-mode hp-gs__broker-mode--live">' +
            '<strong>Live Mode</strong>' +
            '<p>Connect with real broker credentials. Trades execute against live markets. Set <code>HAIPHEN_ENV=production</code>.</p>' +
          '</div>' +
          '<div class="hp-gs__broker-mode hp-gs__broker-mode--sandbox">' +
            '<strong>Sandbox Mode</strong>' +
            '<p>Paper trading with simulated data. Perfect for testing your pipeline before going live. Set <code>HAIPHEN_ENV=sandbox</code>.</p>' +
          '</div>' +
        '</div>';
        return diagramHtml + brokerGrid + metricsHeading + metricsGrid + modes;
      },
      finance: function () {
        var diagramHtml = '<div class="hp-gs__telemetry-diagram">' +
          '<img src="assets/diagrams/trade-telemetry-flow.svg" alt="Trade telemetry pipeline: trades.json \u2192 MV Tables \u2192 Trigger Engine \u2192 Webhooks" loading="lazy" />' +
        '</div>';
        var cards = BROKERS.map(function (b) {
          return '<a href="#" class="hp-gs__broker-card hp-gs__broker-card--link" onclick="return false"><img src="' + esc(b.icon) + '" alt="' + esc(b.name) + '" /><span>' + esc(b.name) + '</span></a>';
        }).join('');
        var brokerGrid = '<div class="hp-gs__broker-grid">' + cards + '</div>';
        var metricsHeading = '<h4 class="hp-gs__metrics-heading">Trade Telemetry Pipeline \u2014 Delivered to You</h4>';
        var metricsGrid = renderMetricsGrid();
        var modes = '<div class="hp-gs__broker-modes">' +
          '<div class="hp-gs__broker-mode hp-gs__broker-mode--live">' +
            '<strong>Live Mode</strong>' +
            '<p>Connect with real broker credentials. Trades execute against live markets. Set <code>HAIPHEN_ENV=production</code>.</p>' +
          '</div>' +
          '<div class="hp-gs__broker-mode hp-gs__broker-mode--sandbox">' +
            '<strong>Sandbox Mode</strong>' +
            '<p>Paper trading with simulated data. Perfect for testing your pipeline before going live. Set <code>HAIPHEN_ENV=sandbox</code>.</p>' +
          '</div>' +
        '</div>';
        return diagramHtml + brokerGrid + metricsHeading + metricsGrid + modes;
      },
    },

    'pipeline-detail': {
      tech: function () {
        return '<div class="hp-gs__code-block"><pre><code># Health check\n' +
          'haiphen status --verbose\n\n' +
          '# Tail service logs\n' +
          'haiphen logs --follow --service secure\n\n' +
          '# Connectivity test\n' +
          'haiphen ping --all-services</code></pre></div>' +
          '<p class="hp-gs__hint">All services should return 200 OK. If a service shows degraded, check your API key scopes in Profile.</p>';
      },
      finance: function () {
        return '<div class="hp-gs__code-block"><pre><code># Start sandbox gateway\n' +
          'HAIPHEN_ENV=sandbox haiphen serve\n\n' +
          '# Execute a test trade\n' +
          'haiphen trade --symbol AAPL --qty 10 --side buy --sandbox\n\n' +
          '# Verify pipeline received the trade\n' +
          'haiphen trades --last 1 --format json</code></pre></div>' +
          '<p class="hp-gs__hint">You should see your test trade appear in the telemetry dashboard within seconds. No real capital is at risk in sandbox mode.</p>';
      },
    },

    'success-detail': {
      tech: function () {
        return '<div class="hp-gs__success-grid">' +
          '<div class="hp-gs__success-card"><strong>CLI Authenticated</strong><p><code>haiphen status</code> returns your plan tier and active services.</p></div>' +
          '<div class="hp-gs__success-card"><strong>Services Responding</strong><p>All six intelligence endpoints return 200 OK on health checks.</p></div>' +
          '<div class="hp-gs__success-card"><strong>Data Flowing</strong><p>Webhooks fire, logs stream, and metrics appear in the dashboard.</p></div>' +
          '<div class="hp-gs__success-card"><strong>Pipeline Verified</strong><p>End-to-end test passes: ingest &rarr; process &rarr; publish &rarr; alert.</p></div>' +
        '</div>';
      },
      finance: function () {
        return '<div class="hp-gs__success-grid">' +
          '<div class="hp-gs__success-card"><strong>Broker Connected</strong><p>Your brokerage account is linked and showing account status.</p></div>' +
          '<div class="hp-gs__success-card"><strong>Sandbox Trade Executed</strong><p>A test trade flows through the pipeline and appears in telemetry.</p></div>' +
          '<div class="hp-gs__success-card"><strong>KPIs Populating</strong><p>Daily metrics cards show volume, P&amp;L, stability, and risk scores.</p></div>' +
          '<div class="hp-gs__success-card"><strong>Alerts Configured</strong><p>Threshold triggers and trade notifications are active and delivering.</p></div>' +
        '</div>';
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

      if (RICH_CONTENT[key]) {
        var fn = RICH_CONTENT[key][lens] || RICH_CONTENT[key].tech;
        if (typeof fn === 'function') {
          el.innerHTML = fn();
        }
        return;
      }

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
     SIDEBAR — render, clicks, search, scroll tracking
     ================================================================ */

  function renderSidebar(root) {
    var nav = qs('.hp-gs__sidebar', root);
    if (!nav) return;

    var pills = SECTIONS.map(function (sec) {
      return '<button class="hp-gs__pill" data-section="' + esc(sec.id) + '">' +
        '<span class="hp-gs__pill-label">' + esc(sec.label) + '</span>' +
      '</button>';
    }).join('');

    var search = '<div class="hp-gs__sidebar-search">' +
      '<input class="hp-gs__sidebar-input" type="text" placeholder="Search sections\u2026" aria-label="Search sections" />' +
    '</div>';

    nav.innerHTML = pills + search;
  }

  function wireSidebarClicks(root) {
    var nav = qs('.hp-gs__sidebar', root);
    if (!nav) return;

    nav.addEventListener('click', function (e) {
      var pill = e.target.closest('.hp-gs__pill');
      if (!pill) return;

      var sectionId = pill.getAttribute('data-section');
      var target = document.getElementById(sectionId);
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Update active state immediately on click
      qa('.hp-gs__pill', nav).forEach(function (p) {
        p.classList.toggle('is-active', p === pill);
      });
    });
  }

  function wireSidebarSearch(root) {
    var input = qs('.hp-gs__sidebar-input', root);
    if (!input) return;

    input.addEventListener('input', function () {
      var query = input.value.trim().toLowerCase();
      var pills = qa('.hp-gs__pill', root);

      pills.forEach(function (pill) {
        var sectionId = pill.getAttribute('data-section');
        var sec = SECTIONS.find(function (s) { return s.id === sectionId; });
        if (!sec) return;

        if (!query) {
          pill.classList.remove('is-dimmed');
          return;
        }

        var match = sec.label.toLowerCase().indexOf(query) !== -1 ||
          sec.id.toLowerCase().indexOf(query) !== -1;

        pill.classList.toggle('is-dimmed', !match);
      });
    });

    // Clicking a dimmed pill clears search and undims all
    var nav = qs('.hp-gs__sidebar', root);
    if (nav) {
      nav.addEventListener('click', function (e) {
        var pill = e.target.closest('.hp-gs__pill');
        if (pill && pill.classList.contains('is-dimmed')) {
          input.value = '';
          qa('.hp-gs__pill', root).forEach(function (p) {
            p.classList.remove('is-dimmed');
          });
        }
      });
    }
  }

  function wireSidebarScrollTracking(root) {
    // Disconnect any previous observer
    if (_sidebarObserver) {
      _sidebarObserver.disconnect();
      _sidebarObserver = null;
    }

    var nav = qs('.hp-gs__sidebar', root);
    if (!nav) return;

    _sidebarObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        if (!id) return;

        qa('.hp-gs__pill', nav).forEach(function (pill) {
          pill.classList.toggle('is-active', pill.getAttribute('data-section') === id);
        });
      });
    }, {
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0,
    });

    SECTIONS.forEach(function (sec) {
      var el = document.getElementById(sec.id);
      if (el) _sidebarObserver.observe(el);
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

    // Render sidebar and wire interactions
    renderSidebar(root);
    wireSidebarClicks(root);
    wireSidebarSearch(root);
    wireSidebarScrollTracking(root);

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
