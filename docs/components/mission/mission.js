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
      key: 'secure',
      serviceId: 'haiphen_secure',
      tech: {
        name: 'Haiphen Secure',
        eyebrow: 'Security',
        headline: 'Continuous vulnerability scanning for edge infrastructure.',
        problem: 'Industrial controllers and edge devices run firmware riddled with known CVEs. Manual vulnerability audits are slow, expensive, and consistently miss critical exposures that attackers exploit.',
        solution: 'Automated CVE correlation engine that matches your asset metadata (vendor, model, firmware) against vulnerability databases. Calculates risk scores, maps IEC 62443 compliance, and generates remediation playbooks.',
        steps: [
          { title: 'Inventory', desc: 'Register assets with vendor, model, and firmware metadata' },
          { title: 'Scan', desc: 'Automated CVE matching with confidence scoring' },
          { title: 'Remediate', desc: 'Prioritized findings with actionable playbooks' },
        ],
      },
      finance: {
        name: 'Compliance Scanner',
        eyebrow: 'Compliance',
        headline: 'Automated compliance scanning for trading infrastructure.',
        problem: 'Trading systems must meet regulatory standards (SOC 2, MiFID II, SEC Rule 15c3-5) but manual compliance audits are slow, error-prone, and quickly outdated as infrastructure evolves.',
        solution: 'Continuous compliance monitoring that maps trading infrastructure components against regulatory frameworks. Automated drift detection, evidence collection, and audit-ready reporting.',
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
        eyebrow: 'Protocol Analysis',
        headline: 'Deep protocol analysis and traffic inspection at scale.',
        problem: 'Industrial protocols like Modbus and OPC-UA carry critical control data but lack visibility tools. Anomalous traffic goes undetected until equipment fails or safety is compromised.',
        solution: 'Packet-level protocol analyzer that decodes function codes, reconstructs sessions, and detects specification violations. Supports Modbus, OPC-UA, MQTT, DNP3, BACnet, and EthernetIP.',
        steps: [
          { title: 'Capture', desc: 'Ingest raw packets or PCAP files for analysis' },
          { title: 'Decode', desc: 'Protocol-aware deep packet inspection and session reconstruction' },
          { title: 'Detect', desc: 'Anomaly detection with alerting and exportable reports' },
        ],
      },
      finance: {
        name: 'Market Data Analyzer',
        eyebrow: 'Market Data',
        headline: 'Real-time exchange connectivity and protocol analysis.',
        problem: 'Market data feeds use complex protocols (FIX, ITCH, OUCH) that are difficult to debug. Latency spikes and dropped messages lead to missed fills and stale pricing.',
        solution: 'Packet-level protocol analyzer for financial data feeds. Decodes FIX sessions, reconstructs order books from ITCH streams, and measures end-to-end latency with microsecond precision.',
        steps: [
          { title: 'Connect', desc: 'Tap into exchange feeds and market data streams' },
          { title: 'Decode', desc: 'FIX/ITCH/OUCH protocol parsing with session reconstruction' },
          { title: 'Monitor', desc: 'Latency measurement and connectivity anomaly alerts' },
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
        headline: 'Entity extraction and relationship mapping from your data.',
        problem: 'Critical relationships between assets, events, and entities are buried across siloed data sources. Manual correlation is time-intensive and misses transitive dependencies.',
        solution: 'Semantic knowledge graph with automated entity extraction, relationship inference, and recursive traversal up to 5 hops deep. Bulk ingest up to 50 entities per call with cross-source deduplication.',
        steps: [
          { title: 'Ingest', desc: 'Extract entities from structured and unstructured data' },
          { title: 'Map', desc: 'Automated relationship inference and graph construction' },
          { title: 'Query', desc: 'Recursive traversal and GraphQL query interface' },
        ],
      },
      finance: {
        name: 'Entity Intelligence',
        eyebrow: 'Intelligence',
        headline: 'Entity extraction and relationship mapping from financial data.',
        problem: 'Ownership chains, beneficial interests, and corporate relationships are scattered across SEC filings, earnings transcripts, and news sources. Analysts spend hours manually piecing together connections.',
        solution: 'Automated entity extraction from SEC filings, earnings calls, and financial news. Maps ownership chains, board interlocks, and subsidiary relationships with cross-source deduplication.',
        steps: [
          { title: 'Ingest', desc: 'Parse SEC filings, earnings transcripts, and news feeds' },
          { title: 'Link', desc: 'Ownership and relationship inference across corporate structures' },
          { title: 'Query', desc: 'Graph traversal for due diligence and research' },
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
        eyebrow: 'Risk',
        headline: 'Quantitative risk modeling and scenario stress testing.',
        problem: 'Traditional risk assessment uses static models that underestimate tail risk and miss correlation between portfolio components under stress conditions.',
        solution: 'Monte Carlo simulation engine (5,000 iterations default) computing VaR, CVaR, Sharpe ratio, and max drawdown. Includes parametric VaR, historical VaR, and 4 predefined stress scenarios (market crash, rate spike, sector rotation, liquidity crisis).',
        steps: [
          { title: 'Define', desc: 'Configure portfolio holdings and risk parameters' },
          { title: 'Simulate', desc: 'Monte Carlo simulation with configurable scenarios' },
          { title: 'Review', desc: 'VaR, CVaR, Sharpe, and tail risk metrics' },
        ],
      },
      finance: {
        name: 'Portfolio Risk Engine',
        eyebrow: 'Portfolio Risk',
        headline: 'Portfolio stress testing for traders and advisers.',
        problem: 'Portfolio managers and financial advisers need robust risk metrics but off-the-shelf tools are expensive, inflexible, and don\u2019t integrate with modern data pipelines.',
        solution: 'Monte Carlo simulation engine built for portfolio risk. Computes VaR, CVaR, and max drawdown across multi-asset portfolios. Predefined stress scenarios for market crashes, rate spikes, and liquidity crises.',
        steps: [
          { title: 'Portfolio', desc: 'Import holdings from CSV, API, or manual entry' },
          { title: 'Stress Test', desc: 'Run scenarios across market crash, rate spike, and liquidity crisis' },
          { title: 'Report', desc: 'Exportable risk metrics with scenario comparisons' },
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
        eyebrow: 'Causality',
        headline: 'Root cause analysis and incident chain reconstruction.',
        problem: 'When complex systems fail, incident timelines span dozens of events across multiple sources. Root cause analysis is manual, slow, and frequently wrong about propagation chains.',
        solution: 'Causal inference engine that builds directed acyclic graphs from event sequences. Identifies root causes with confidence scores, traces propagation chains, and generates counterfactual reasoning (what would have prevented the incident).',
        steps: [
          { title: 'Ingest', desc: 'Feed event sequences from logs, alerts, and sensors' },
          { title: 'Build', desc: 'Automated causal DAG construction with confidence scoring' },
          { title: 'Analyze', desc: 'Root cause identification and counterfactual reasoning' },
        ],
      },
      finance: {
        name: 'Trade Chain Analysis',
        eyebrow: 'Trade Chains',
        headline: 'Market event propagation and flash crash reconstruction.',
        problem: 'Market dislocations cascade across instruments and venues in milliseconds. Post-trade analysis tools can\u2019t reconstruct the chain of events that led to a flash crash or liquidity vacuum.',
        solution: 'Causal inference engine that traces how market events propagate across instruments, reconstructs incident timelines, and enables counterfactual reasoning for post-trade analysis and regulatory reporting.',
        steps: [
          { title: 'Ingest', desc: 'Feed market events, execution data, and order flow' },
          { title: 'Trace', desc: 'Event propagation graph across correlated instruments' },
          { title: 'Reconstruct', desc: 'Timeline reconstruction with what-if scenario analysis' },
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
        name: 'Supply Chain Intel',
        eyebrow: 'Supply Chain',
        headline: 'Disruption intelligence and supplier risk mapping.',
        problem: 'Supply chain disruptions from geopolitical events, financial instability, or delivery failures propagate invisibly through multi-tier networks until production halts.',
        solution: 'Multi-dimensional risk scorer analyzing financial health (0\u2013100), geopolitical exposure (0\u2013100), and delivery reliability (0\u2013100) across your supplier network. Identifies single-source bottlenecks and recommends alternative suppliers.',
        steps: [
          { title: 'Register', desc: 'Map supplier network with tier and dependency data' },
          { title: 'Score', desc: 'Financial, geopolitical, and delivery risk scoring' },
          { title: 'Monitor', desc: 'Continuous alerts and alternative supplier recommendations' },
        ],
      },
      finance: {
        name: 'Counterparty Intel',
        eyebrow: 'Counterparty',
        headline: 'Counterparty exposure mapping and concentration risk scoring.',
        problem: 'Counterparty risk is distributed across prime brokers, clearing houses, and custodians. Concentration risks and credit exposures are invisible until a counterparty fails.',
        solution: 'Multi-dimensional counterparty risk scorer analyzing credit exposure, concentration risk, and settlement reliability across your counterparty network. Identifies single-point-of-failure exposures and recommends diversification.',
        steps: [
          { title: 'Register', desc: 'Map counterparty network with exposure data' },
          { title: 'Score', desc: 'Credit, concentration, and operational risk scoring' },
          { title: 'Monitor', desc: 'Continuous exposure alerts and diversification recommendations' },
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
        '<div class="ms-actions">' +
          '<a class="btn btn-primary" href="#services" data-service-id="' + esc(svc.serviceId) + '">Start Free Trial</a>' +
          '<a class="btn btn-ghost" href="' + esc(docsHref) + '">View API Docs</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ================================================================
     RENDER: CATALOGUE NAV
     ================================================================ */

  function renderCatalogue(lens) {
    return SERVICES.map(function (svc) {
      var d = svc[lens] || svc.tech;
      var active = svc.key === _activeKey ? ' is-active' : '';
      return '<button class="mc-pill' + active + '" data-svc="' + esc(svc.key) + '" role="tab" aria-selected="' + (svc.key === _activeKey ? 'true' : 'false') + '">' +
        '<img class="mc-pill__icon" src="' + esc(svc.assets.icon) + '" alt="" width="20" height="20" loading="lazy" />' +
        '<span class="mc-pill__label">' + esc(d.name) + '</span>' +
      '</button>';
    }).join('');
  }

  /* ================================================================
     SELECT SERVICE
     ================================================================ */

  function selectService(key) {
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

    // Re-wire lightbox on new content
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
      initReveal(mount);
      wireLightbox(mount);

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
    var spotMount = document.getElementById('mission-spotlight');
    if (spotMount && spotMount.innerHTML.trim()) {
      selectService(key);
    }
    // Otherwise _activeKey is set — loadMission will use it
  };
})();
