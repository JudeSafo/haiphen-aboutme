/* docs/components/mission/mission.js
 * Phase 12: Data-driven mission page with service spotlight & catalogue.
 * One shell template, all content in JS data registry, instant lens switch.
 */
(function () {
  'use strict';

  const CSS_ID = 'mission-css';
  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  let _lensListenerWired = false;
  let _servicesJson = null;
  let _activeKey = null;

  /* ================================================================
     SERVICE DATA REGISTRY
     ================================================================ */

  const SERVICES = [
    {
      key: 'platform',
      serviceId: 'haiphen_platform',
      isPlatform: true,
      tech: {
        name: 'Trading Telemetry Suite',
        eyebrow: 'Full Platform',
        problem: 'Building a trading operation means stitching together separate tools for data feeds, risk, compliance, entity research, and post-trade analysis. Each vendor is another integration, another bill, another point of failure.',
        solution: 'Haiphen is a single platform that covers the entire trading lifecycle: ingest market data, scan your infrastructure for vulnerabilities, map entity relationships for alpha signals, stress-test portfolios with Monte Carlo simulations, trace causal chains across executions, and monitor counterparty exposure. All six services share a unified API, a single CLI, and one authentication layer. Deploy locally for development or cloud-native on Cloudflare Workers for production.',
        steps: [
          { title: 'Ingest', desc: 'Connect market data feeds, import portfolios, and register your infrastructure' },
          { title: 'Analyze', desc: 'Run security scans, risk simulations, entity graphs, and causal analysis in parallel' },
          { title: 'Act', desc: 'Generate signals, set alerts, export reports, and integrate via webhooks' },
        ],
      },
      finance: {
        name: 'Trading Intelligence Platform',
        eyebrow: 'Full Platform',
        problem: 'Portfolio managers juggle separate vendors for market data, compliance, risk analytics, research, and post-trade reporting. Fragmented tooling means slower decisions and hidden blind spots.',
        solution: 'One platform for the full investment lifecycle: real-time market data analysis, regulatory compliance scanning, portfolio risk modeling, corporate entity intelligence, trade chain reconstruction, and counterparty monitoring. Unified API, single CLI, one login. Run locally or deploy cloud-native.',
        steps: [
          { title: 'Connect', desc: 'Link market feeds, import portfolios, catalog your infrastructure' },
          { title: 'Analyze', desc: 'Compliance, risk, entity research, and post-trade analysis from one dashboard' },
          { title: 'Report', desc: 'Automated alerts, scheduled reports, and API-driven integrations' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-workflow.gif',
        scenario: 'assets/scenarios/scenario-secure.svg',
        icon: 'assets/mission/telemetry-dashboard.svg',
      },
    },
    {
      key: 'secure',
      serviceId: 'haiphen_secure',
      tech: {
        name: 'Haiphen Secure',
        eyebrow: 'Infrastructure Security',
        problem: 'Unpatched CVEs in your trading stack create attack surface that auditors flag and regulators penalize.',
        solution: 'Automated CVE correlation that maps your dependencies against vulnerability databases. Calculates exploitability scores, flags compliance gaps (SOC 2, PCI DSS), and generates remediation playbooks.',
        steps: [
          { title: 'Inventory', desc: 'Register APIs, databases, brokers, and dependencies' },
          { title: 'Scan', desc: 'CVE matching with exploitability scoring' },
          { title: 'Remediate', desc: 'Prioritized findings with upgrade paths' },
        ],
      },
      finance: {
        name: 'Compliance Scanner',
        eyebrow: 'Compliance',
        problem: 'Trading systems must meet SOC 2, MiFID II, and SEC 15c3-5 but manual audits are slow and quickly outdated.',
        solution: 'Continuous compliance monitoring across regulatory frameworks. Automated drift detection, evidence collection, and audit-ready reporting.',
        steps: [
          { title: 'Register', desc: 'Catalog trading systems and components' },
          { title: 'Assess', desc: 'Automated regulatory framework mapping' },
          { title: 'Report', desc: 'Audit-ready reports with remediation priorities' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-secure.gif',
        scenario: 'assets/scenarios/scenario-secure.svg',
        icon: 'assets/mission/secure.svg',
      },
    },
    {
      key: 'network',
      serviceId: 'network_trace',
      tech: {
        name: 'Network Trace',
        eyebrow: 'Feed Analysis',
        problem: 'Market data feeds over FIX, ITCH, and proprietary protocols are opaque at the wire level. Latency spikes and dropped ticks cost real money.',
        solution: 'Packet-level protocol analyzer for financial data feeds. Decodes FIX sessions, reconstructs order books from ITCH/OUCH streams, and measures tick-to-trade latency with microsecond precision.',
        steps: [
          { title: 'Capture', desc: 'Tap live feeds or replay PCAP/FIX logs' },
          { title: 'Decode', desc: 'FIX 4.2/4.4/5.0, ITCH, OUCH, SBE parsing' },
          { title: 'Measure', desc: 'Latency histograms and feed health dashboards' },
        ],
      },
      finance: {
        name: 'Market Data Analyzer',
        eyebrow: 'Market Data',
        problem: 'Market data feeds use complex protocols (FIX, ITCH, OUCH) that are hard to debug. Latency spikes lead to missed fills and stale pricing.',
        solution: 'Protocol analyzer for financial data feeds. Decodes FIX sessions, reconstructs order books, and measures end-to-end latency with microsecond precision.',
        steps: [
          { title: 'Connect', desc: 'Tap into exchange feeds and data streams' },
          { title: 'Decode', desc: 'FIX/ITCH/OUCH session reconstruction' },
          { title: 'Monitor', desc: 'Latency measurement and anomaly alerts' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-network.gif',
        scenario: 'assets/scenarios/scenario-network.svg',
        icon: 'assets/mission/network-trace.svg',
      },
    },
    {
      key: 'graph',
      serviceId: 'knowledge_graph',
      tech: {
        name: 'Knowledge Graph',
        eyebrow: 'Entity Intelligence',
        problem: 'Alpha hides in relationships: ownership chains, board interlocks, subsidiary connections. This data is scattered across SEC filings, earnings calls, and news.',
        solution: 'Semantic graph that auto-extracts entities from SEC filings, earnings transcripts, and financial news. Maps ownership chains and corporate relationships with recursive traversal up to 5 hops deep.',
        steps: [
          { title: 'Ingest', desc: 'Feed SEC filings, earnings calls, or custom sources' },
          { title: 'Map', desc: 'Entity extraction, relationship inference, deduplication' },
          { title: 'Query', desc: 'Recursive traversal and structured query API' },
        ],
      },
      finance: {
        name: 'Entity Intelligence',
        eyebrow: 'Intelligence',
        problem: 'Ownership chains and corporate relationships are scattered across SEC filings, earnings transcripts, and news. Analysts spend hours piecing together connections.',
        solution: 'Automated entity extraction from SEC filings, earnings calls, and financial news. Maps ownership chains, board interlocks, and subsidiary relationships.',
        steps: [
          { title: 'Ingest', desc: 'Parse SEC filings, transcripts, and news' },
          { title: 'Link', desc: 'Ownership inference across corporate structures' },
          { title: 'Query', desc: 'Graph traversal for due diligence' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-graph.gif',
        scenario: 'assets/scenarios/scenario-graph.svg',
        icon: 'assets/mission/knowledge-graph.svg',
      },
    },
    {
      key: 'risk',
      serviceId: 'risk_analysis',
      tech: {
        name: 'Risk Analysis',
        eyebrow: 'Portfolio Risk',
        problem: 'Most risk tools are expensive terminals or static spreadsheets. Traders need programmable, API-driven risk metrics that execute in milliseconds.',
        solution: 'Monte Carlo simulation engine computing VaR, CVaR, Sharpe, and max drawdown. Includes parametric VaR, historical VaR, and stress scenarios for market crashes, rate spikes, and liquidity crises.',
        steps: [
          { title: 'Define', desc: 'Configure holdings, weights, and parameters' },
          { title: 'Simulate', desc: 'Monte Carlo with custom stress scenarios' },
          { title: 'Review', desc: 'VaR, CVaR, Sharpe, and tail risk output' },
        ],
      },
      finance: {
        name: 'Portfolio Risk Engine',
        eyebrow: 'Portfolio Risk',
        problem: 'Off-the-shelf risk tools are expensive, inflexible, and don\u2019t integrate with modern data pipelines.',
        solution: 'Monte Carlo simulation engine for portfolio risk. Computes VaR, CVaR, and max drawdown across multi-asset portfolios with predefined stress scenarios.',
        steps: [
          { title: 'Portfolio', desc: 'Import holdings from CSV, API, or manual entry' },
          { title: 'Stress Test', desc: 'Market crash, rate spike, and liquidity scenarios' },
          { title: 'Report', desc: 'Exportable metrics with scenario comparisons' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-risk.gif',
        scenario: 'assets/scenarios/scenario-risk.svg',
        icon: 'assets/mission/risk-analysis.svg',
      },
    },
    {
      key: 'causal',
      serviceId: 'causal_chain',
      tech: {
        name: 'Causal Chain',
        eyebrow: 'Event Analysis',
        problem: 'When trades go wrong, the causal chain spans order routing, microstructure, and cross-asset correlations. Post-trade tools show what happened but not why.',
        solution: 'Causal inference engine that builds directed acyclic graphs from execution data and market events. Traces propagation chains, identifies root causes, and generates counterfactual P&L analysis.',
        steps: [
          { title: 'Ingest', desc: 'Feed execution logs, events, and order flow' },
          { title: 'Build', desc: 'Causal DAG construction with confidence scoring' },
          { title: 'Analyze', desc: 'Root cause ID and what-if counterfactuals' },
        ],
      },
      finance: {
        name: 'Trade Chain Analysis',
        eyebrow: 'Trade Chains',
        problem: 'Market dislocations cascade across instruments in milliseconds. Post-trade tools can\u2019t reconstruct flash crash propagation paths.',
        solution: 'Causal inference engine that traces how market events propagate, reconstructs incident timelines, and enables counterfactual reasoning for post-trade analysis.',
        steps: [
          { title: 'Ingest', desc: 'Feed market events, executions, and order flow' },
          { title: 'Trace', desc: 'Propagation graph across correlated instruments' },
          { title: 'Reconstruct', desc: 'Timeline with what-if scenario analysis' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-causal.gif',
        scenario: 'assets/scenarios/scenario-causal.svg',
        icon: 'assets/mission/causal-chain.svg',
      },
    },
    {
      key: 'supply',
      serviceId: 'supply_chain',
      tech: {
        name: 'Counterparty Intel',
        eyebrow: 'Counterparty Risk',
        problem: 'Your operation depends on prime brokers, clearing houses, and custodians. Concentration risk is invisible until a counterparty fails.',
        solution: 'Multi-dimensional risk scorer analyzing credit exposure, concentration risk, and settlement reliability across your counterparty network. Identifies single-point-of-failure exposures and recommends diversification.',
        steps: [
          { title: 'Register', desc: 'Map brokers, clearing, custodians, vendors' },
          { title: 'Score', desc: 'Credit, concentration, and operational risk' },
          { title: 'Monitor', desc: 'Alerts and diversification recommendations' },
        ],
      },
      finance: {
        name: 'Counterparty Intel',
        eyebrow: 'Counterparty',
        problem: 'Counterparty risk across prime brokers, clearing houses, and custodians is invisible until a counterparty fails.',
        solution: 'Multi-dimensional risk scorer analyzing credit exposure, concentration risk, and settlement reliability. Identifies single-point-of-failure exposures.',
        steps: [
          { title: 'Register', desc: 'Map counterparty network with exposure data' },
          { title: 'Score', desc: 'Credit, concentration, and operational scoring' },
          { title: 'Monitor', desc: 'Exposure alerts and diversification recs' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-supply.gif',
        scenario: 'assets/scenarios/scenario-supply.svg',
        icon: 'assets/mission/supply-chain.svg',
      },
    },
  ];

  /* ================================================================
     HELPERS
     ================================================================ */

  function getLens() {
    return NS.lens?.get?.() ?? (document.documentElement.getAttribute('data-lens') || 'tech');
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureCss(href) {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function fetchJson(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.json();
  }

  async function fetchText(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.text();
  }

  /* ================================================================
     PRICING MERGE
     ================================================================ */

  function mergePricing(services, json) {
    if (!json?.services) return;
    const lookup = {};
    json.services.forEach(function (s) { lookup[s.id] = s; });

    services.forEach(function (svc) {
      const match = lookup[svc.serviceId];
      if (!match) return;
      svc._pricing = match.pricing || {};
      svc._features = match.features || [];
      svc._trial = match.trial || null;
      svc._docsSection = match.docs_section || null;
    });
  }

  function getLowestPrice(pricing) {
    if (!pricing) return null;
    let min = Infinity;
    Object.values(pricing).forEach(function (tier) {
      if (typeof tier.price === 'number' && tier.price < min) min = tier.price;
    });
    return min === Infinity ? null : min;
  }

  /* ================================================================
     RENDER: SPOTLIGHT
     ================================================================ */

  function renderSpotlight(svc, lens) {
    const d = svc[lens] || svc.tech;
    const a = svc.assets;
    const price = getLowestPrice(svc._pricing);
    const features = svc._features || [];
    const trial = svc._trial;
    const docsSection = svc._docsSection;

    const stepsHtml = (d.steps || []).map(function (step, i) {
      return '<div class="ms-step">' +
        '<span class="ms-step__num">' + (i + 1) + '</span>' +
        '<strong>' + esc(step.title) + '</strong>' +
        '<p>' + esc(step.desc) + '</p>' +
        '</div>';
    }).join('');

    const featuresHtml = features.length
      ? '<ul class="ms-features">' + features.map(function (f) {
        return '<li>' + esc(f) + '</li>';
      }).join('') + '</ul>'
      : '';

    const priceHtml = price !== null
      ? '<span class="ms-pricing__from">From $' + price + '/mo</span>'
      : '';

    const trialHtml = trial
      ? '<span class="ms-pricing__trial">' + esc(String(trial.limit)) + ' ' + esc(trial.unit || trial.type || 'requests') + ' free trial</span>'
      : '';

    const docsHref = docsSection ? '#docs:' + docsSection : '#docs';

    // Cohort CTA for individual services (not platform)
    var cohortHtml = '';
    if (!svc.isPlatform) {
      cohortHtml = '<div class="ms-cohort-cta">' +
        '<span class="ms-cohort-cta__badge">Limited</span>' +
        '<span class="ms-cohort-cta__text">Get all 6 services bundled in the <strong>Cohort Program</strong></span>' +
        '<a class="ms-cohort-cta__link" href="#cohort">Learn more</a>' +
      '</div>';
    }

    // Platform entry gets different action buttons
    var actionsHtml;
    if (svc.isPlatform) {
      actionsHtml = '<div class="ms-actions">' +
        '<a class="btn btn-primary" href="#cohort">Join Cohort Program</a>' +
        '<a class="btn btn-ghost" href="' + esc(docsHref) + '">Explore Docs</a>' +
      '</div>';
    } else {
      actionsHtml = '<div class="ms-actions">' +
        '<a class="btn btn-primary" href="#services" data-service-id="' + esc(svc.serviceId) + '">Start Free Trial</a>' +
        '<a class="btn btn-ghost" href="' + esc(docsHref) + '">View API Docs</a>' +
      '</div>';
    }

    return '<div class="ms-spotlight" id="svc-' + esc(svc.key) + '">' +
      '<div class="ms-demo">' +
        '<img class="ms-demo__gif" src="' + esc(a.demo) + '" alt="' + esc(d.name) + ' CLI demo" loading="lazy" decoding="async" />' +
        '<img class="ms-demo__diagram" src="' + esc(a.scenario) + '" alt="' + esc(d.name) + ' scenario" data-lightbox loading="lazy" decoding="async" />' +
      '</div>' +
      '<div class="ms-content">' +
        '<span class="mission-eyebrow">' + esc(d.eyebrow) + '</span>' +
        '<h3 class="ms-content__title">' + esc(d.name) + '</h3>' +
        '<div class="ms-content__problem">' +
          '<strong>The problem:</strong> ' + esc(d.problem) +
        '</div>' +
        '<p class="ms-content__solution">' + esc(d.solution) + '</p>' +
        '<div class="ms-steps">' + stepsHtml + '</div>' +
        featuresHtml +
        ((priceHtml || trialHtml) ? '<div class="ms-pricing">' + priceHtml + trialHtml + '</div>' : '') +
        actionsHtml +
        cohortHtml +
      '</div>' +
    '</div>';
  }

  /* ================================================================
     RENDER: CATALOGUE NAV
     ================================================================ */

  function renderCatalogue(lens) {
    var pills = SERVICES.map(function (svc) {
      var d = svc[lens] || svc.tech;
      var active = svc.key === _activeKey ? ' is-active' : '';
      return '<button class="mc-pill' + active + '" data-svc="' + esc(svc.key) + '" role="tab" aria-selected="' + (svc.key === _activeKey ? 'true' : 'false') + '">' +
        '<img class="mc-pill__icon" src="' + esc(svc.assets.icon) + '" alt="" width="20" height="20" loading="lazy" />' +
        '<span class="mc-pill__label">' + esc(d.name) + '</span>' +
      '</button>';
    }).join('');

    var search = '<div class="mc-search">' +
      '<input class="mc-search__input" type="text" placeholder="Search services\u2026" aria-label="Search services" />' +
      '</div>';

    return pills + search;
  }

  /* ================================================================
     SELECT SERVICE
     ================================================================ */

  function selectService(key, opts) {
    var svc = SERVICES.find(function (s) { return s.key === key; });
    if (!svc) return;

    _activeKey = key;
    var lens = getLens();
    var mount = document.getElementById('mission-spotlight');
    if (mount) {
      mount.innerHTML = renderSpotlight(svc, lens);
    }

    // Update catalogue pills active state
    var nav = document.querySelector('.mission-catalogue');
    if (nav) {
      nav.querySelectorAll('.mc-pill').forEach(function (pill) {
        var isActive = pill.getAttribute('data-svc') === key;
        pill.classList.toggle('is-active', isActive);
        pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }

    // Update URL hash for shareability (skip when called from router to prevent loops)
    if (!(opts && opts.fromRouter)) {
      var nextHash = '#mission:svc-' + key;
      if (window.location.hash !== nextHash) {
        history.replaceState(null, '', nextHash);
      }
    }
  }

  /* ================================================================
     INIT REVEAL (scroll animation)
     ================================================================ */

  function initReveal(root) {
    var els = root.querySelectorAll('.mission-reveal');
    if (!els.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });
    els.forEach(function (el) { obs.observe(el); });
  }

  /* ================================================================
     WIRE LIGHTBOX
     ================================================================ */

  function wireLightbox(root) {
    if (!root || root.dataset.hpMissionLightbox === '1') return;
    root.dataset.hpMissionLightbox = '1';
    root.addEventListener('click', function (e) {
      var img = e.target?.closest?.('img[data-lightbox]');
      if (!img) return;
      var src = img.getAttribute('src');
      if (src && typeof window.openLightbox === 'function') {
        window.openLightbox(src);
      }
    });
  }

  /* ================================================================
     WIRE CATALOGUE NAV
     ================================================================ */

  function wireCatalogue(root) {
    var nav = root.querySelector('.mission-catalogue');
    if (!nav) return;

    nav.addEventListener('click', function (e) {
      var pill = e.target.closest('.mc-pill');
      if (!pill) return;
      var key = pill.getAttribute('data-svc');
      if (key) selectService(key);
    });
  }

  /* ================================================================
     WIRE CATALOGUE SEARCH
     ================================================================ */

  function wireCatalogueSearch(root) {
    var input = root.querySelector('.mc-search__input');
    if (!input) return;

    input.addEventListener('input', function () {
      var query = input.value.trim().toLowerCase();
      var lens = getLens();
      var pills = root.querySelectorAll('.mc-pill');

      pills.forEach(function (pill) {
        var key = pill.getAttribute('data-svc');
        var svc = SERVICES.find(function (s) { return s.key === key; });
        if (!svc) return;

        if (!query) {
          pill.classList.remove('is-dimmed');
          return;
        }

        var techName = (svc.tech.name || '').toLowerCase();
        var techEyebrow = (svc.tech.eyebrow || '').toLowerCase();
        var finName = (svc.finance.name || '').toLowerCase();
        var finEyebrow = (svc.finance.eyebrow || '').toLowerCase();
        var svcKey = svc.key.toLowerCase();

        var match = techName.indexOf(query) !== -1 ||
          techEyebrow.indexOf(query) !== -1 ||
          finName.indexOf(query) !== -1 ||
          finEyebrow.indexOf(query) !== -1 ||
          svcKey.indexOf(query) !== -1;

        pill.classList.toggle('is-dimmed', !match);
      });
    });

    // Clicking a dimmed pill clears search and selects it
    var nav = root.querySelector('.mission-catalogue');
    if (nav) {
      nav.addEventListener('click', function (e) {
        var pill = e.target.closest('.mc-pill');
        if (pill && pill.classList.contains('is-dimmed')) {
          input.value = '';
          root.querySelectorAll('.mc-pill').forEach(function (p) {
            p.classList.remove('is-dimmed');
          });
        }
      });
    }
  }

  /* ================================================================
     HERO LENS VISIBILITY
     ================================================================ */

  function updateHeroLens(root, lens) {
    root.querySelectorAll('[data-lens-tech]').forEach(function (el) {
      el.style.display = lens === 'tech' ? '' : 'none';
    });
    root.querySelectorAll('[data-lens-finance]').forEach(function (el) {
      el.style.display = lens === 'finance' ? '' : 'none';
    });
  }

  /* ================================================================
     FULL LENS REFRESH
     ================================================================ */

  function refreshForLens(lens) {
    var mount = document.getElementById('mission-mount');
    if (!mount || !mount.innerHTML.trim()) return;

    // Update hero text visibility
    updateHeroLens(mount, lens);

    // Re-render spotlight with current service
    if (_activeKey) {
      var svc = SERVICES.find(function (s) { return s.key === _activeKey; });
      if (svc) {
        var spotMount = document.getElementById('mission-spotlight');
        if (spotMount) spotMount.innerHTML = renderSpotlight(svc, lens);
      }
    }

    // Re-render catalogue labels
    var nav = mount.querySelector('.mission-catalogue');
    if (nav) nav.innerHTML = renderCatalogue(lens);

    // Re-wire search and lightbox on new content
    wireCatalogueSearch(mount);
    delete mount.dataset.hpMissionLightbox;
    wireLightbox(mount);
  }

  /* ================================================================
     LOAD MISSION (main entry point)
     ================================================================ */

  NS.loadMission = async function loadMission() {
    var mount = document.getElementById('mission-mount');
    if (!mount) return;

    try {
      ensureCss('components/mission/mission.css');

      // Fetch shell template and services.json in parallel
      var results = await Promise.all([
        fetchText('components/mission/mission.html'),
        _servicesJson ? Promise.resolve(_servicesJson) : fetchJson('assets/services.json'),
      ]);

      var html = results[0];
      _servicesJson = results[1];

      // Merge pricing data into service registry
      mergePricing(SERVICES, _servicesJson);

      // Inject shell
      mount.innerHTML = html;

      // Determine which service to show:
      // 1. Pre-set via selectMissionService (sidebar deep-link)
      // 2. URL hash like #mission:svc-risk
      // 3. First service as default
      var lens = getLens();
      if (!_activeKey) {
        var hashMatch = (window.location.hash || '').match(/svc-(\w+)/);
        if (hashMatch) {
          var candidate = hashMatch[1];
          if (SERVICES.find(function (s) { return s.key === candidate; })) {
            _activeKey = candidate;
          }
        }
      }
      _activeKey = _activeKey || SERVICES[0].key;

      // Render spotlight
      var spotMount = document.getElementById('mission-spotlight');
      if (spotMount) {
        var svc = SERVICES.find(function (s) { return s.key === _activeKey; });
        if (svc) spotMount.innerHTML = renderSpotlight(svc, lens);
      }

      // Render catalogue
      var catNav = mount.querySelector('.mission-catalogue');
      if (catNav) catNav.innerHTML = renderCatalogue(lens);

      // Update hero text for current lens
      updateHeroLens(mount, lens);

      // Wire interactions
      wireCatalogue(mount);
      wireCatalogueSearch(mount);
      initReveal(mount);
      wireLightbox(mount);

      // Register services in site search
      if (typeof NS.SiteSearch?.register === 'function') {
        NS.SiteSearch.register(SERVICES.map(function (svc) {
          return {
            label: svc.tech.name,
            section: 'OnePager',
            elementId: 'svc-' + svc.key,
            hash: 'mission:svc-' + svc.key,
            keywords: [svc.tech.name, svc.finance.name, svc.tech.eyebrow, svc.finance.eyebrow, svc.key].map(function (s) { return s.toLowerCase(); }),
          };
        }));
      }

    } catch (err) {
      console.warn('[mission] failed to load', err);
      mount.innerHTML = '<div style="padding:1rem;border:1px solid #e6ecf3;border-radius:12px;background:#fff;">' +
        '<strong>Mission section failed to load.</strong>' +
        '<div style="margin-top:.35rem;color:#667;">Check console for details.</div>' +
        '</div>';
    }

    // Wire lens-switch listener (once)
    if (!_lensListenerWired) {
      _lensListenerWired = true;
      window.addEventListener('haiphen:lens', function (e) {
        refreshForLens(e.detail?.lens ?? 'tech');
      });
    }
  };

  /* ================================================================
     PUBLIC API for external callers (sidebar deep-link)
     ================================================================ */

  NS.selectMissionService = function (key) {
    var svc = SERVICES.find(function (s) { return s.key === key; });
    if (!svc) return;

    _activeKey = key;

    // If mission is already rendered, select immediately
    // Pass fromRouter to avoid re-writing the hash that triggered this call
    var spotMount = document.getElementById('mission-spotlight');
    if (spotMount && spotMount.innerHTML.trim()) {
      selectService(key, { fromRouter: true });
    }
    // Otherwise _activeKey is set — loadMission will use it
  };
})();
