/* docs/components/mission/mission.js
 * Phase 12+: Data-driven mission page with service spotlight, catalogue,
 * and 5-tab content system (Intro, Use Cases, Installation, Integration, Subscribe).
 */
(function () {
  'use strict';

  const CSS_ID = 'mission-css';
  const NS = (window.HAIPHEN = window.HAIPHEN || {});
  let _lensListenerWired = false;
  let _servicesJson = null;
  let _activeKey = null;
  let _activeTab = 'intro';

  const TAB_DEFS = [
    { id: 'intro',       label: 'Intro' },
    { id: 'usecases',    label: 'Use Cases' },
    { id: 'installation',label: 'Installation' },
    { id: 'integration', label: 'Integration' },
    { id: 'subscribe',   label: 'Subscribe' },
  ];

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
      usecases: {
        tech: [
          { title: 'Quantitative Fund Operations', problem: 'Fund managers run separate dashboards for risk, compliance, market data, and post-trade analysis.', solution: 'One platform covers the full cycle: ingest feeds, run risk sims, check compliance, trace execution chains, and generate reports from a single CLI.' },
          { title: 'Trading Desk Infrastructure', problem: 'Multiple vendor integrations create maintenance burden and latency across the trading stack.', solution: 'Deploy all six services through one authentication layer and unified API. Local dev via CLI, production on Cloudflare Workers.' },
          { title: 'Multi-Strategy Portfolio Management', problem: 'Each strategy team builds its own tooling for data, risk, and research, leading to duplicated effort.', solution: 'Shared platform with per-team API keys, scoped access, and centralized billing. All services available to every desk.' },
        ],
        finance: [
          { title: 'Investment Office Consolidation', problem: 'Family offices and fund managers subscribe to 5+ vendors for market data, compliance, risk, and research.', solution: 'Replace fragmented vendor stack with one platform. Unified billing, one login, consistent API across all analytics.' },
          { title: 'Regulatory Reporting Workflow', problem: 'Compliance teams manually pull data from multiple systems to generate regulatory filings.', solution: 'Automated compliance scanning, risk reporting, and entity research feed directly into reporting templates.' },
          { title: 'RIA Technology Stack', problem: 'Registered Investment Advisors need institutional-grade tools without institutional-grade pricing.', solution: 'Pro-tier access to all six services at a bundled cohort price. API-first architecture integrates with existing custodian platforms.' },
        ],
      },
      installation: {
        tech: {
          cloud: { config: '# wrangler.jsonc — deploy all services\nnpx wrangler deploy --config wrangler.jsonc', verify: 'curl https://api.haiphen.io/v1/health' },
          local: { install: 'brew install haiphen/tap/haiphen\n# or: curl -sSL https://get.haiphen.io | sh', config: 'haiphen login\nhaiphen status', test: 'haiphen serve\n# Platform running on http://localhost:8787' },
        },
        finance: {
          cloud: { config: '# Deploy full platform to Cloudflare Workers\nnpx wrangler deploy --config wrangler.jsonc', verify: 'curl https://api.haiphen.io/v1/health' },
          local: { install: 'brew install haiphen/tap/haiphen\n# or: curl -sSL https://get.haiphen.io | sh', config: 'haiphen login\nhaiphen status', test: 'haiphen serve\n# All services available at localhost:8787' },
        },
      },
      integration: {
        tech: {
          api: 'curl -H "Authorization: Bearer $TOKEN" \\\n  https://api.haiphen.io/v1/services',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://your-app.com/hook","events":["scan.complete","risk.alert"]}\'',
          channels: ['Slack', 'Discord', 'Email', 'PagerDuty'],
          brokers: ['Interactive Brokers', 'Alpaca', 'TD Ameritrade'],
        },
        finance: {
          api: 'curl -H "Authorization: Bearer $TOKEN" \\\n  https://api.haiphen.io/v1/services',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://your-app.com/hook","events":["compliance.alert","risk.breach"]}\'',
          channels: ['Slack', 'Discord', 'Email', 'PagerDuty'],
          brokers: ['Interactive Brokers', 'Alpaca', 'Schwab'],
        },
      },
      subscribe: {
        faq: [
          { q: 'What does the cohort bundle include?', a: 'All six services (Secure, Network, Graph, Risk, Causal, Supply) plus the CLI, desktop, and mobile apps. One subscription covers everything.' },
          { q: 'Can I start with individual services?', a: 'Yes. Each service has its own pricing tier. You can upgrade to the cohort bundle at any time and your existing usage carries over.' },
          { q: 'Is there an enterprise plan?', a: 'Yes. Enterprise includes dedicated support, custom SLAs, SSO integration, and volume pricing. Contact us for details.' },
          { q: 'How does the free trial work?', a: 'Each service includes a free tier with limited usage. No credit card required. Upgrade when you need higher limits.' },
        ],
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
      usecases: {
        tech: [
          { title: 'Pre-Deployment Security Gate', problem: 'New services ship to production without dependency audits, exposing the trading stack to known CVEs.', solution: 'Integrate Haiphen Secure into CI/CD. Every deploy triggers a CVE scan with exploitability scoring. Fail builds that introduce critical vulnerabilities.' },
          { title: 'SOC 2 Continuous Compliance', problem: 'Annual SOC 2 audits require months of evidence gathering from spreadsheets and screenshots.', solution: 'Continuous compliance monitoring generates audit-ready evidence automatically. Map controls to infrastructure state in real time.' },
          { title: 'Vendor Security Assessment', problem: 'Evaluating third-party broker and data provider security postures is manual and inconsistent.', solution: 'Automated vendor scanning against your security policy. Score and rank third-party risk with documented evidence.' },
        ],
        finance: [
          { title: 'Regulatory Audit Preparation', problem: 'SEC and FINRA examinations require detailed evidence of security controls across trading infrastructure.', solution: 'Automated evidence collection mapped to regulatory frameworks. Generate examination-ready reports with one command.' },
          { title: 'MiFID II Best Execution Compliance', problem: 'Demonstrating best execution monitoring requires continuous infrastructure validation.', solution: 'Continuous scanning of execution infrastructure with compliance drift alerts and remediation tracking.' },
          { title: 'Client Data Protection', problem: 'AML/KYC data stores require regular security validation but audits happen quarterly at best.', solution: 'Real-time monitoring of data protection controls with automated alerts when configurations drift from policy.' },
        ],
      },
      installation: {
        tech: {
          cloud: { config: '# wrangler.toml — Secure service\nnpx wrangler deploy -c haiphen-secure/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/secure/health' },
          local: { install: 'haiphen login', config: 'haiphen secure scan --target ./package.json', test: 'haiphen secure report --format json' },
        },
        finance: {
          cloud: { config: '# Deploy compliance scanner\nnpx wrangler deploy -c haiphen-secure/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/secure/health' },
          local: { install: 'haiphen login', config: 'haiphen secure scan --framework soc2', test: 'haiphen secure report --format pdf' },
        },
      },
      integration: {
        tech: {
          api: 'curl -X POST https://api.haiphen.io/v1/secure/scan \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"target":"./package.json","depth":3}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://your-ci.com/hook","events":["scan.complete","cve.critical"]}\'',
          channels: ['Slack', 'Discord', 'Email'],
          brokers: [],
        },
        finance: {
          api: 'curl -X POST https://api.haiphen.io/v1/secure/scan \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"target":"trading-infra","framework":"soc2"}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://compliance.firm.com/hook","events":["compliance.drift"]}\'',
          channels: ['Slack', 'Email', 'PagerDuty'],
          brokers: [],
        },
      },
      subscribe: {
        faq: [
          { q: 'How many assets can I scan?', a: 'Free tier includes 50 scans. Pro supports unlimited scans across your infrastructure. Enterprise adds custom policies.' },
          { q: 'Which compliance frameworks are supported?', a: 'SOC 2, PCI DSS, ISO 27001, MiFID II, and SEC 15c3-5. Custom framework templates available on Enterprise.' },
          { q: 'Can I integrate with my CI/CD pipeline?', a: 'Yes. Webhook events fire on scan completion. Use the CLI in your build scripts or call the REST API directly.' },
        ],
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
      usecases: {
        tech: [
          { title: 'FIX Session Debugging', problem: 'Rejected orders and sequence resets in FIX sessions are logged as raw byte streams. Engineers parse manually.', solution: 'Automatic FIX 4.2/4.4/5.0 decoding with session state tracking. See rejected orders with human-readable field names and sequence context.' },
          { title: 'Exchange Feed Latency Monitoring', problem: 'Tick-to-trade latency varies across exchanges but there is no unified measurement infrastructure.', solution: 'Microsecond-precision latency histograms per feed. Compare exchange-to-exchange performance and detect degradation in real time.' },
          { title: 'PCAP Replay for Backtesting', problem: 'Historical market data analysis requires replaying captures but most tools do not reconstruct order books.', solution: 'Replay PCAP files with full ITCH/OUCH order book reconstruction. Export tick-by-tick data for strategy backtesting.' },
        ],
        finance: [
          { title: 'Best Execution Analysis', problem: 'Proving best execution to regulators requires detailed latency and fill quality data across venues.', solution: 'Per-venue latency measurement with fill quality metrics. Generate best execution reports with microsecond timestamps.' },
          { title: 'Market Data Feed Validation', problem: 'Stale or dropped ticks from data vendors go undetected until pricing models produce bad signals.', solution: 'Real-time feed health monitoring with gap detection and vendor SLA tracking. Alert on quality degradation before it impacts models.' },
          { title: 'Cross-Venue Arbitrage Monitoring', problem: 'Price discrepancies across venues are fleeting. Latency in detecting them erodes arbitrage opportunities.', solution: 'Simultaneous multi-feed decoding with cross-venue price comparison and latency-adjusted spread calculation.' },
        ],
      },
      installation: {
        tech: {
          cloud: { config: '# Deploy Network Trace service\nnpx wrangler deploy -c haiphen-network/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/network/health' },
          local: { install: 'haiphen login', config: 'haiphen network capture --interface eth0 --protocol fix', test: 'haiphen network analyze --file trade-session.pcap' },
        },
        finance: {
          cloud: { config: '# Deploy Market Data Analyzer\nnpx wrangler deploy -c haiphen-network/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/network/health' },
          local: { install: 'haiphen login', config: 'haiphen network capture --feed nyse-itch', test: 'haiphen network latency --venue all --format csv' },
        },
      },
      integration: {
        tech: {
          api: 'curl -X POST https://api.haiphen.io/v1/network/analyze \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"protocol":"fix","session_id":"FIX.4.4:SENDER->TARGET"}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://ops.firm.com/hook","events":["network.latency_spike","network.feed_gap"]}\'',
          channels: ['Slack', 'Discord', 'PagerDuty'],
          brokers: ['Interactive Brokers', 'Alpaca'],
        },
        finance: {
          api: 'curl -X POST https://api.haiphen.io/v1/network/analyze \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"feed":"nyse-itch","metrics":["latency","gaps","book_depth"]}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://trading.firm.com/hook","events":["feed.degradation"]}\'',
          channels: ['Slack', 'Email', 'PagerDuty'],
          brokers: ['Interactive Brokers', 'Alpaca', 'Schwab'],
        },
      },
      subscribe: {
        faq: [
          { q: 'Which protocols are supported?', a: 'FIX 4.2/4.4/5.0, ITCH, OUCH, SBE, and custom binary protocols via plugin SDK. New protocols added quarterly.' },
          { q: 'Can I analyze historical captures?', a: 'Yes. Upload PCAP files or FIX log files for offline analysis with full order book reconstruction.' },
          { q: 'What latency precision is achievable?', a: 'Microsecond precision for local captures. Network-level timestamps depend on your NIC capabilities (hardware timestamping recommended).' },
        ],
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
      usecases: {
        tech: [
          { title: 'Ownership Chain Discovery', problem: 'A company announces an acquisition but the buyer operates through nested subsidiaries. Who actually controls the entity?', solution: 'Recursive graph traversal traces ownership from the target entity through up to 5 hops of corporate structure. Returns the ultimate beneficial owner with confidence scores.' },
          { title: 'Board Interlock Detection', problem: 'Shared board members between companies can indicate undisclosed relationships or conflicts of interest.', solution: 'Entity extraction from SEC filings and earnings calls surfaces board interlocks automatically. Alert when newly discovered connections affect portfolio holdings.' },
          { title: 'Event-Driven Signal Generation', problem: 'Corporate events (M&A, restructuring, executive changes) create trading signals but the data is unstructured.', solution: 'Real-time entity extraction from news and filings. Graph updates propagate to connected entities, generating relationship-aware signals.' },
        ],
        finance: [
          { title: 'Due Diligence Acceleration', problem: 'Investment committee due diligence requires manually mapping corporate structures across dozens of filings.', solution: 'Automated corporate structure mapping from SEC filings. Generate due diligence reports with ownership chains, related entities, and risk flags.' },
          { title: 'Activist Investor Tracking', problem: 'Tracking activist investor positions across their network of funds and subsidiaries is time-intensive.', solution: 'Graph-based monitoring of activist positions. Trace beneficial ownership across fund structures and alert on new filings.' },
          { title: 'ESG Supply Chain Mapping', problem: 'ESG compliance requires visibility into supplier relationships that extend beyond Tier 1.', solution: 'Multi-hop entity traversal maps supplier-of-supplier relationships. Score ESG risk exposure across the full supply network.' },
        ],
      },
      installation: {
        tech: {
          cloud: { config: '# Deploy Knowledge Graph service\nnpx wrangler deploy -c haiphen-graph/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/graph/health' },
          local: { install: 'haiphen login', config: 'haiphen graph ingest --source sec-filings --ticker AAPL', test: 'haiphen graph query --entity "Apple Inc" --hops 3' },
        },
        finance: {
          cloud: { config: '# Deploy Entity Intelligence service\nnpx wrangler deploy -c haiphen-graph/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/graph/health' },
          local: { install: 'haiphen login', config: 'haiphen graph ingest --source sec-filings --ticker AAPL', test: 'haiphen graph ownership --entity "Apple Inc" --depth 5' },
        },
      },
      integration: {
        tech: {
          api: 'curl -X POST https://api.haiphen.io/v1/graph/query \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"entity":"Apple Inc","hops":3,"relations":["owns","board_member"]}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://research.firm.com/hook","events":["graph.entity_updated","graph.new_relation"]}\'',
          channels: ['Slack', 'Discord', 'Email'],
          brokers: [],
        },
        finance: {
          api: 'curl -X POST https://api.haiphen.io/v1/graph/query \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"entity":"Apple Inc","type":"ownership","depth":5}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://compliance.firm.com/hook","events":["graph.ownership_change"]}\'',
          channels: ['Slack', 'Email'],
          brokers: [],
        },
      },
      subscribe: {
        faq: [
          { q: 'What data sources are included?', a: 'SEC EDGAR filings (10-K, 10-Q, 8-K, DEF 14A), earnings call transcripts, and financial news feeds. Custom source ingestion available on Pro.' },
          { q: 'How deep can traversals go?', a: 'Up to 5 hops on Standard, 10 hops on Pro. Enterprise supports unlimited depth with custom relationship types.' },
          { q: 'Is the data refreshed in real time?', a: 'SEC filings are ingested within 15 minutes of publication. News entities update in near real time. Full graph refresh runs daily.' },
        ],
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
      usecases: {
        tech: [
          { title: 'Pre-Trade Risk Check', problem: 'Traders submit orders without knowing portfolio-level risk impact. Margin calls happen after the fact.', solution: 'API-driven pre-trade risk check computes marginal VaR for proposed positions. Integrates into order management systems via webhook.' },
          { title: 'Stress Testing for Regulatory Compliance', problem: 'Regulators require documented stress test results but running scenarios across multi-asset portfolios takes hours.', solution: 'Predefined stress scenarios (2008 crash, COVID, rate shock) run in seconds via Monte Carlo. Export results in regulatory-ready format.' },
          { title: 'Automated Risk Limit Monitoring', problem: 'Risk limits are checked manually at end-of-day. Intraday breaches go undetected until settlement.', solution: 'Real-time VaR computation with configurable breach alerts. Webhook notifications trigger when portfolio risk exceeds thresholds.' },
        ],
        finance: [
          { title: 'Client Portfolio Risk Reporting', problem: 'Generating risk reports for client portfolios requires pulling data from multiple systems and running spreadsheet models.', solution: 'Automated risk reports with VaR, CVaR, and stress test results. Schedule daily or weekly delivery to client portals.' },
          { title: 'Multi-Asset Portfolio Optimization', problem: 'Portfolio managers need to evaluate risk-return tradeoffs across equities, fixed income, and alternatives simultaneously.', solution: 'Monte Carlo simulation across asset classes with correlation modeling. Optimize allocation based on risk budget constraints.' },
          { title: 'Drawdown Protection', problem: 'Maximum drawdown limits are part of the IPS but monitoring is reactive, based on end-of-day NAV.', solution: 'Intraday drawdown monitoring with configurable alert thresholds. Automatic position reduction recommendations when limits approach.' },
        ],
      },
      installation: {
        tech: {
          cloud: { config: '# Deploy Risk Analysis service\nnpx wrangler deploy -c haiphen-risk/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/risk/health' },
          local: { install: 'haiphen login', config: 'haiphen risk portfolio --import holdings.csv', test: 'haiphen risk simulate --scenarios crash,rate_spike --iterations 10000' },
        },
        finance: {
          cloud: { config: '# Deploy Portfolio Risk Engine\nnpx wrangler deploy -c haiphen-risk/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/risk/health' },
          local: { install: 'haiphen login', config: 'haiphen risk portfolio --import holdings.csv', test: 'haiphen risk report --format pdf --scenarios all' },
        },
      },
      integration: {
        tech: {
          api: 'curl -X POST https://api.haiphen.io/v1/risk/simulate \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"portfolio_id":"pf_123","scenarios":["crash_2008","covid"],"iterations":10000}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://risk.firm.com/hook","events":["risk.var_breach","risk.drawdown_alert"]}\'',
          channels: ['Slack', 'Discord', 'Email', 'PagerDuty'],
          brokers: ['Interactive Brokers', 'Alpaca'],
        },
        finance: {
          api: 'curl -X POST https://api.haiphen.io/v1/risk/simulate \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"portfolio_id":"pf_123","metrics":["var","cvar","sharpe"],"confidence":0.99}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://pm.firm.com/hook","events":["risk.limit_approach","risk.drawdown_alert"]}\'',
          channels: ['Slack', 'Email', 'PagerDuty'],
          brokers: ['Interactive Brokers', 'Schwab'],
        },
      },
      subscribe: {
        faq: [
          { q: 'How many simulations can I run?', a: 'Free tier includes 25 assessments. Pro supports up to 10,000 iterations per simulation with unlimited runs. Enterprise adds custom scenario libraries.' },
          { q: 'Which stress scenarios are included?', a: 'Predefined scenarios include 2008 Financial Crisis, COVID-19 crash, rate shock, and liquidity crisis. Pro users can create custom scenarios.' },
          { q: 'Can I connect my own portfolio data?', a: 'Yes. Import via CSV, connect through the API, or sync from supported brokers. Real-time portfolio sync available on Pro.' },
        ],
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
      usecases: {
        tech: [
          { title: 'Flash Crash Root Cause Analysis', problem: 'A portfolio drops 3% in 90 seconds. The execution log shows thousands of fills but no clear trigger.', solution: 'Causal DAG construction traces the propagation chain: which event triggered which order, across which instruments, with what timing. Confidence-scored root cause identification.' },
          { title: 'Algo Execution Post-Mortem', problem: 'An algorithmic strategy underperformed its benchmark. The logs show correct signals but suboptimal execution.', solution: 'Counterfactual P&L analysis simulates alternative execution paths. Identify where routing decisions diverged from optimal and quantify the slippage cost.' },
          { title: 'Cross-Asset Cascade Detection', problem: 'Bond market moves trigger equity corrections but the causal timing and magnitude are hard to quantify.', solution: 'Multi-instrument causal graph captures cross-asset propagation with microsecond timing. Detect leading indicators for cascade events.' },
        ],
        finance: [
          { title: 'Incident Timeline Reconstruction', problem: 'Regulators request detailed timelines of market events surrounding unusual trading activity.', solution: 'Automated timeline reconstruction from execution logs and market data. Export regulatory-ready incident reports with causal annotations.' },
          { title: 'Best Execution Counterfactual', problem: 'Clients question whether their orders received best execution. Proving it requires showing what alternatives existed.', solution: 'Counterfactual analysis simulates alternative execution venues and timing. Demonstrate best execution with quantified comparisons.' },
          { title: 'Propagation Risk Monitoring', problem: 'Portfolio exposure to cascade events is unknown until a dislocation occurs.', solution: 'Real-time causal monitoring of cross-instrument correlations. Alert when propagation patterns match historical cascade signatures.' },
        ],
      },
      installation: {
        tech: {
          cloud: { config: '# Deploy Causal Chain service\nnpx wrangler deploy -c haiphen-causal/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/causal/health' },
          local: { install: 'haiphen login', config: 'haiphen causal ingest --source execution-logs.json', test: 'haiphen causal trace --event "2024-03-15T14:30:00Z" --depth 5' },
        },
        finance: {
          cloud: { config: '# Deploy Trade Chain Analysis\nnpx wrangler deploy -c haiphen-causal/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/causal/health' },
          local: { install: 'haiphen login', config: 'haiphen causal ingest --source trade-log.csv', test: 'haiphen causal timeline --date 2024-03-15 --format pdf' },
        },
      },
      integration: {
        tech: {
          api: 'curl -X POST https://api.haiphen.io/v1/causal/trace \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"event_id":"evt_abc","depth":5,"include_counterfactual":true}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://ops.firm.com/hook","events":["causal.cascade_detected","causal.root_cause"]}\'',
          channels: ['Slack', 'Discord', 'PagerDuty'],
          brokers: [],
        },
        finance: {
          api: 'curl -X POST https://api.haiphen.io/v1/causal/timeline \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"date":"2024-03-15","portfolio_id":"pf_123","format":"regulatory"}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://compliance.firm.com/hook","events":["causal.incident_report"]}\'',
          channels: ['Slack', 'Email'],
          brokers: [],
        },
      },
      subscribe: {
        faq: [
          { q: 'How far back can I analyze?', a: 'Standard retains 30 days of event data. Pro extends to 1 year. Enterprise supports custom retention with archival storage.' },
          { q: 'What data formats are accepted?', a: 'JSON event logs, CSV trade files, FIX drop copies, and custom formats via ingestion API. Real-time streaming via WebSocket on Pro.' },
          { q: 'How accurate are the counterfactuals?', a: 'Counterfactual P&L uses historical order book data and execution venue statistics. Confidence intervals provided for each alternative path.' },
        ],
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
      usecases: {
        tech: [
          { title: 'Prime Broker Concentration Analysis', problem: 'Trading desks route most volume through one or two prime brokers. If one fails, settlement halts across the book.', solution: 'Concentration scoring across your prime broker network. Identify single-point-of-failure exposures and model the impact of counterparty default.' },
          { title: 'Custodian Risk Monitoring', problem: 'Asset custodians hold client funds but their credit risk is only reviewed quarterly.', solution: 'Continuous credit monitoring of custodians with weighted risk scores. Alert when credit ratings change or operational metrics degrade.' },
          { title: 'Vendor Dependency Mapping', problem: 'Critical infrastructure depends on third-party data vendors, cloud providers, and connectivity providers. The dependency graph is undocumented.', solution: 'Automated vendor dependency mapping with weighted risk scoring. Identify which vendor failures would cause the most operational disruption.' },
        ],
        finance: [
          { title: 'Counterparty Default Modeling', problem: 'Estimating the financial impact of a major counterparty default requires manual scenario analysis across multiple systems.', solution: 'Automated default impact modeling across your counterparty network. Simulate cascading failures and quantify net exposure after netting agreements.' },
          { title: 'Regulatory Counterparty Reporting', problem: 'Basel III and SEC regulations require regular counterparty exposure reporting with documented methodology.', solution: 'Automated counterparty exposure reports mapped to regulatory frameworks. Generate on-demand or schedule for quarterly filing.' },
          { title: 'Diversification Recommendations', problem: 'Reducing counterparty concentration requires evaluating alternatives across credit quality, operational capability, and cost.', solution: 'Multi-factor counterparty comparison with diversification recommendations. Score alternatives on credit, operational, and cost dimensions.' },
        ],
      },
      installation: {
        tech: {
          cloud: { config: '# Deploy Counterparty Intel service\nnpx wrangler deploy -c haiphen-supply/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/supply/health' },
          local: { install: 'haiphen login', config: 'haiphen supply register --counterparty "Goldman Sachs" --type prime_broker', test: 'haiphen supply score --entity all --format json' },
        },
        finance: {
          cloud: { config: '# Deploy Counterparty Intel service\nnpx wrangler deploy -c haiphen-supply/wrangler.toml', verify: 'curl https://api.haiphen.io/v1/supply/health' },
          local: { install: 'haiphen login', config: 'haiphen supply register --counterparty "Goldman Sachs" --type prime_broker', test: 'haiphen supply report --portfolio all --format pdf' },
        },
      },
      integration: {
        tech: {
          api: 'curl -X POST https://api.haiphen.io/v1/supply/score \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"entity":"Goldman Sachs","dimensions":["credit","concentration","operational"]}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://risk.firm.com/hook","events":["supply.rating_change","supply.concentration_breach"]}\'',
          channels: ['Slack', 'Discord', 'Email'],
          brokers: [],
        },
        finance: {
          api: 'curl -X POST https://api.haiphen.io/v1/supply/score \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"entity":"Goldman Sachs","report_type":"regulatory","framework":"basel3"}\'',
          webhook: 'curl -X POST https://api.haiphen.io/v1/webhooks \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"url":"https://compliance.firm.com/hook","events":["supply.exposure_alert"]}\'',
          channels: ['Slack', 'Email', 'PagerDuty'],
          brokers: [],
        },
      },
      subscribe: {
        faq: [
          { q: 'How are risk scores calculated?', a: 'Weighted multi-factor model combining credit ratings, settlement history, operational metrics, and concentration ratios. Methodology documented for auditors.' },
          { q: 'What counterparty types are supported?', a: 'Prime brokers, clearing houses, custodians, exchanges, data vendors, and cloud providers. Custom entity types on Enterprise.' },
          { q: 'Can I import existing counterparty data?', a: 'Yes. CSV import, API ingestion, or manual registration. Bulk import supports mapping existing internal IDs to Haiphen entities.' },
        ],
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
    var link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function fetchJson(url) {
    var resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + url);
    return resp.json();
  }

  async function fetchText(url) {
    var resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + url);
    return resp.text();
  }

  /* ================================================================
     PRICING MERGE
     ================================================================ */

  function mergePricing(services, json) {
    if (!json?.services) return;
    var lookup = {};
    json.services.forEach(function (s) { lookup[s.id] = s; });

    services.forEach(function (svc) {
      var match = lookup[svc.serviceId];
      if (!match) return;
      svc._pricing = match.pricing || {};
      svc._features = match.features || [];
      svc._trial = match.trial || null;
      svc._docsSection = match.docs_section || null;
    });
  }

  function getLowestPrice(pricing) {
    if (!pricing) return null;
    var min = Infinity;
    Object.values(pricing).forEach(function (tier) {
      if (typeof tier.price === 'number' && tier.price < min) min = tier.price;
    });
    return min === Infinity ? null : min;
  }

  /* ================================================================
     TAB BAR
     ================================================================ */

  function renderTabBar() {
    return '<div class="ms-tabs" role="tablist">' +
      TAB_DEFS.map(function (tab) {
        var sel = tab.id === _activeTab;
        return '<button class="ms-tab" role="tab" data-tab="' + tab.id + '" aria-selected="' + (sel ? 'true' : 'false') + '">' + esc(tab.label) + '</button>';
      }).join('') +
    '</div>';
  }

  /* ================================================================
     TAB PANEL: INTRO (extracted from old renderSpotlight)
     ================================================================ */

  function renderIntroPanel(svc, lens) {
    var d = svc[lens] || svc.tech;
    var a = svc.assets;
    var price = getLowestPrice(svc._pricing);
    var features = svc._features || [];
    var trial = svc._trial;
    var docsSection = svc._docsSection;

    var stepsHtml = (d.steps || []).map(function (step, i) {
      return '<div class="ms-step">' +
        '<span class="ms-step__num">' + (i + 1) + '</span>' +
        '<strong>' + esc(step.title) + '</strong>' +
        '<p>' + esc(step.desc) + '</p>' +
        '</div>';
    }).join('');

    var featuresHtml = features.length
      ? '<ul class="ms-features">' + features.map(function (f) {
        return '<li>' + esc(f) + '</li>';
      }).join('') + '</ul>'
      : '';

    var priceHtml = price !== null
      ? '<span class="ms-pricing__from">From $' + price + '/mo</span>'
      : '';

    var trialHtml = trial
      ? '<span class="ms-pricing__trial">' + esc(String(trial.limit)) + ' ' + esc(trial.unit || trial.type || 'requests') + ' free trial</span>'
      : '';

    var docsHref = docsSection ? '#docs:' + docsSection : '#docs';

    var cohortHtml = '';
    if (!svc.isPlatform) {
      cohortHtml = '<div class="ms-cohort-cta">' +
        '<span class="ms-cohort-cta__badge">Limited</span>' +
        '<span class="ms-cohort-cta__text">Get all 6 services bundled in the <strong>Cohort Program</strong></span>' +
        '<a class="ms-cohort-cta__link" href="#cohort">Learn more</a>' +
      '</div>';
    }

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
     TAB PANEL: USE CASES
     ================================================================ */

  function renderUseCasesPanel(svc, lens) {
    var data = svc.usecases;
    if (!data) return '<div class="ms-tab-panel"><p>Use case content coming soon.</p></div>';
    var cases = data[lens] || data.tech || [];

    var cardsHtml = cases.map(function (uc) {
      return '<div class="ms-usecase">' +
        '<h4 class="ms-usecase__title">' + esc(uc.title) + '</h4>' +
        '<span class="ms-usecase__label">Current State</span>' +
        '<p class="ms-usecase__problem">' + esc(uc.problem) + '</p>' +
        '<span class="ms-usecase__label">With Haiphen</span>' +
        '<p class="ms-usecase__solution">' + esc(uc.solution) + '</p>' +
      '</div>';
    }).join('');

    return '<div class="ms-tab-panel">' +
      '<h3 class="ms-tab-panel__title">Real-World Use Cases</h3>' +
      '<div class="ms-usecases">' + cardsHtml + '</div>' +
    '</div>';
  }

  /* ================================================================
     TAB PANEL: INSTALLATION
     ================================================================ */

  function renderInstallPanel(svc, lens) {
    var data = svc.installation;
    if (!data) return '<div class="ms-tab-panel"><p>Installation guide coming soon.</p></div>';
    var inst = data[lens] || data.tech || {};
    var docsHref = svc._docsSection ? '#docs:' + svc._docsSection : '#docs';

    var cloudHtml = '';
    if (inst.cloud) {
      cloudHtml = '<div class="ms-install-section">' +
        '<h4 class="ms-install-section__title">Cloud-Native</h4>' +
        '<div class="ms-code-block"><span class="ms-code-block__label">Deploy</span>' + esc(inst.cloud.config) + '</div>' +
        '<div class="ms-code-block"><span class="ms-code-block__label">Verify</span>' + esc(inst.cloud.verify) + '</div>' +
      '</div>';
    }

    var localHtml = '';
    if (inst.local) {
      localHtml = '<div class="ms-install-section">' +
        '<h4 class="ms-install-section__title">Local CLI</h4>' +
        '<div class="ms-code-block"><span class="ms-code-block__label">Install</span>' + esc(inst.local.install) + '</div>' +
        '<div class="ms-code-block"><span class="ms-code-block__label">Configure</span>' + esc(inst.local.config) + '</div>' +
        '<div class="ms-code-block"><span class="ms-code-block__label">Test</span>' + esc(inst.local.test) + '</div>' +
      '</div>';
    }

    return '<div class="ms-tab-panel">' +
      '<h3 class="ms-tab-panel__title">Installation</h3>' +
      cloudHtml + localHtml +
      '<div class="ms-actions" style="margin-top:1rem">' +
        '<a class="btn btn-ghost" href="' + esc(docsHref) + '">Full Documentation</a>' +
      '</div>' +
    '</div>';
  }

  /* ================================================================
     TAB PANEL: INTEGRATION
     ================================================================ */

  function renderIntegrationPanel(svc, lens) {
    var data = svc.integration;
    if (!data) return '<div class="ms-tab-panel"><p>Integration guide coming soon.</p></div>';
    var integ = data[lens] || data.tech || {};

    var apiHtml = '';
    if (integ.api) {
      apiHtml = '<div class="ms-integration-section">' +
        '<h4 class="ms-integration-section__title">REST API</h4>' +
        '<div class="ms-code-block">' + esc(integ.api) + '</div>' +
      '</div>';
    }

    var webhookHtml = '';
    if (integ.webhook) {
      webhookHtml = '<div class="ms-integration-section">' +
        '<h4 class="ms-integration-section__title">Webhooks</h4>' +
        '<div class="ms-code-block">' + esc(integ.webhook) + '</div>' +
      '</div>';
    }

    var channelsHtml = '';
    if (integ.channels && integ.channels.length) {
      channelsHtml = '<div class="ms-integration-section">' +
        '<h4 class="ms-integration-section__title">Notifications</h4>' +
        '<div class="ms-channel-row">' +
        integ.channels.map(function (ch) {
          return '<span class="ms-channel-badge">' + esc(ch) + '</span>';
        }).join('') +
        '</div></div>';
    }

    var brokersHtml = '';
    if (integ.brokers && integ.brokers.length) {
      brokersHtml = '<div class="ms-integration-section">' +
        '<h4 class="ms-integration-section__title">Broker Connections</h4>' +
        '<div class="ms-channel-row">' +
        integ.brokers.map(function (b) {
          return '<span class="ms-channel-badge">' + esc(b) + '</span>';
        }).join('') +
        '</div></div>';
    }

    return '<div class="ms-tab-panel">' +
      '<h3 class="ms-tab-panel__title">Integration</h3>' +
      apiHtml + webhookHtml + channelsHtml + brokersHtml +
    '</div>';
  }

  /* ================================================================
     TAB PANEL: SUBSCRIBE
     ================================================================ */

  function renderSubscribePanel(svc, lens) {
    var price = getLowestPrice(svc._pricing);
    var features = svc._features || [];
    var trial = svc._trial;
    var subData = svc.subscribe || {};
    var faqs = subData.faq || [];

    var priceStr = price !== null ? ('$' + price) : 'Free';
    var unitStr = price !== null ? '/mo' : '';

    var trialHtml = trial
      ? '<span class="ms-sub-trial">' + esc(String(trial.limit)) + ' ' + esc(trial.unit || trial.type || 'requests') + ' free trial</span>'
      : '';

    var featuresHtml = features.length
      ? '<ul class="ms-sub-features">' + features.map(function (f) {
        return '<li>' + esc(f) + '</li>';
      }).join('') + '</ul>'
      : '';

    var faqHtml = '';
    if (faqs.length) {
      faqHtml = '<div class="ms-faq">' +
        '<h4 class="ms-faq__title">Frequently Asked Questions</h4>' +
        faqs.map(function (item) {
          return '<details class="ms-faq-item"><summary>' + esc(item.q) + '</summary><p>' + esc(item.a) + '</p></details>';
        }).join('') +
      '</div>';
    }

    var actionsHtml;
    if (svc.isPlatform) {
      actionsHtml = '<div class="ms-actions">' +
        '<a class="btn btn-primary" href="#cohort">Join Cohort Program</a>' +
        '<a class="btn btn-ghost" href="#contact-us">Schedule Onboarding</a>' +
      '</div>';
    } else {
      actionsHtml = '<div class="ms-actions">' +
        '<a class="btn btn-primary" href="#services" data-service-id="' + esc(svc.serviceId) + '">Start Free Trial</a>' +
        '<a class="btn btn-ghost" href="#contact-us">Schedule Onboarding</a>' +
      '</div>';
    }

    return '<div class="ms-tab-panel">' +
      '<h3 class="ms-tab-panel__title">Subscribe</h3>' +
      '<div class="ms-sub-pricing">' +
        '<div class="ms-sub-price">' + esc(priceStr) + '<span class="ms-sub-price__unit">' + esc(unitStr) + '</span></div>' +
        trialHtml +
        featuresHtml +
      '</div>' +
      actionsHtml +
      faqHtml +
      '<div class="ms-sub-contact">Questions? <a href="#contact-us">Reach out to our team</a></div>' +
    '</div>';
  }

  /* ================================================================
     RENDER SPOTLIGHT WITH TABS
     ================================================================ */

  function renderActivePanel(svc, lens) {
    switch (_activeTab) {
      case 'usecases':    return renderUseCasesPanel(svc, lens);
      case 'installation':return renderInstallPanel(svc, lens);
      case 'integration': return renderIntegrationPanel(svc, lens);
      case 'subscribe':   return renderSubscribePanel(svc, lens);
      default:            return renderIntroPanel(svc, lens);
    }
  }

  function renderSpotlightWithTabs(svc, lens) {
    return renderTabBar() + '<div class="ms-tab-panel-wrap">' + renderActivePanel(svc, lens) + '</div>';
  }

  /* ================================================================
     TAB SWITCHING
     ================================================================ */

  function switchTab(tabId) {
    if (!TAB_DEFS.find(function (t) { return t.id === tabId; })) return;
    _activeTab = tabId;

    var mount = document.getElementById('mission-spotlight');
    if (!mount) return;

    // Update tab bar aria-selected
    mount.querySelectorAll('.ms-tab').forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.getAttribute('data-tab') === tabId ? 'true' : 'false');
    });

    // Re-render panel only
    var svc = SERVICES.find(function (s) { return s.key === _activeKey; });
    if (!svc) return;
    var lens = getLens();
    var panelWrap = mount.querySelector('.ms-tab-panel-wrap');
    if (panelWrap) {
      panelWrap.innerHTML = renderActivePanel(svc, lens);
    }

    // Re-wire lightbox on new content
    var root = document.getElementById('mission-mount');
    if (root) {
      delete root.dataset.hpMissionLightbox;
      wireLightbox(root);
    }

    // Update hash
    var hashTab = tabId === 'intro' ? '' : ':' + tabId;
    var nextHash = '#mission:svc-' + _activeKey + hashTab;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, '', nextHash);
    }
  }

  function wireMissionTabs(root) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('.ms-tab');
      if (!btn) return;
      var tabId = btn.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  }

  /* ================================================================
     RENDER: CATALOGUE NAV
     ================================================================ */

  function renderCatalogue(lens) {
    var pills = SERVICES.map(function (svc) {
      var d = svc[lens] || svc.tech;
      var active = svc.key === _activeKey ? ' is-active' : '';
      return '<button class="mc-pill' + active + '" data-svc="' + esc(svc.key) + '" role="tab" aria-selected="' + (svc.key === _activeKey ? 'true' : 'false') + '">' +
        '<img class="mc-pill__icon" src="' + esc(svc.assets.icon) + '" alt="" width="18" height="18" loading="lazy" />' +
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
      mount.innerHTML = renderSpotlightWithTabs(svc, lens);
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
      var hashTab = _activeTab === 'intro' ? '' : ':' + _activeTab;
      var nextHash = '#mission:svc-' + key + hashTab;
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

    // Re-render spotlight with tabs with current service
    if (_activeKey) {
      var svc = SERVICES.find(function (s) { return s.key === _activeKey; });
      if (svc) {
        var spotMount = document.getElementById('mission-spotlight');
        if (spotMount) spotMount.innerHTML = renderSpotlightWithTabs(svc, lens);
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

      // Determine which service and tab to show from hash:
      // #mission:svc-risk:installation → key=risk, tab=installation
      var lens = getLens();
      if (!_activeKey) {
        var hashStr = window.location.hash || '';
        var svcMatch = hashStr.match(/svc-(\w+)/);
        if (svcMatch) {
          var candidate = svcMatch[1];
          if (SERVICES.find(function (s) { return s.key === candidate; })) {
            _activeKey = candidate;
          }
        }
        // Parse tab from hash (3rd segment)
        var tabMatch = hashStr.match(/svc-\w+:(\w+)/);
        if (tabMatch && TAB_DEFS.find(function (t) { return t.id === tabMatch[1]; })) {
          _activeTab = tabMatch[1];
        }
      }
      _activeKey = _activeKey || SERVICES[0].key;

      // Render spotlight with tabs
      var spotMount = document.getElementById('mission-spotlight');
      if (spotMount) {
        var svc = SERVICES.find(function (s) { return s.key === _activeKey; });
        if (svc) spotMount.innerHTML = renderSpotlightWithTabs(svc, lens);
      }

      // Render catalogue
      var catNav = mount.querySelector('.mission-catalogue');
      if (catNav) catNav.innerHTML = renderCatalogue(lens);

      // Update hero text for current lens
      updateHeroLens(mount, lens);

      // Wire interactions
      wireCatalogue(mount);
      wireCatalogueSearch(mount);
      wireMissionTabs(mount);
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
