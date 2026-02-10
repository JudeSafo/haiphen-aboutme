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
        problem: 'Building a trading operation means you need signals intelligence \u2014 knowing when to enter, when to exit, and how every position is performing. Most platforms expect you to bring your own data.',
        solution: 'Haiphen IS the data provider. Install the CLI and you get the full signals intelligence pipeline: trades.json hydrates daily, MV tables process trigger conditions, and webhook notifications fire when entry and exit signals activate. Entries opened, exits closed, win rate, P&L, risk scores \u2014 all computed and delivered.',
        steps: [
          { title: 'Install', desc: 'Install the CLI, authenticate, and connect your broker' },
          { title: 'Signals Flow', desc: 'trades.json hydrates daily, MV tables fire triggers, webhooks deliver signals' },
          { title: 'Trade', desc: 'Act on entry/exit signals with full pipeline metrics and risk scores' },
        ],
      },
      finance: {
        name: 'Trading Intelligence Platform',
        eyebrow: 'Full Platform',
        problem: 'Portfolio managers need to know when to enter and exit positions \u2014 but most platforms deliver raw data and expect you to build your own signal processing.',
        solution: 'Haiphen delivers trade telemetry \u2014 real-time signals intelligence that tells you when to enter and exit positions. The pipeline hydrates daily from trades.json, processes trigger conditions through MV tables, and sends webhook notifications when signals fire.',
        steps: [
          { title: 'Connect', desc: 'Link your brokerage and authenticate via the CLI or desktop app' },
          { title: 'Signals Flow', desc: 'Daily hydration, MV table triggers, and webhook-delivered entry/exit signals' },
          { title: 'Trade', desc: 'Execute on signals with pipeline metrics, P&L tracking, and risk scores' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-workflow.gif',
        scenario: 'assets/scenarios/scenario-secure.svg',
        icon: 'assets/mission/telemetry-dashboard.svg',
      },
      usecases: {
        tech: [
          { title: 'Signals Intelligence for Trading Desks', problem: 'Fund managers run separate dashboards for risk, compliance, market data, and post-trade analysis.', solution: 'One platform covers the full cycle: ingest feeds, run risk sims, check compliance, trace execution chains, and generate reports from a single CLI.' },
          { title: 'Trading Desk Infrastructure', problem: 'Multiple vendor integrations create maintenance burden and latency across the trading stack.', solution: 'Deploy all six services through one authentication layer and unified API. Local dev via CLI, production on Cloudflare Workers.' },
          { title: 'Multi-Strategy Portfolio Management', problem: 'Each strategy team builds its own tooling for data, risk, and research, leading to duplicated effort.', solution: 'Shared platform with per-team API keys, scoped access, and centralized billing. All services available to every desk.' },
        ],
        finance: [
          { title: 'Trade Telemetry for Portfolio Managers', problem: 'Family offices and fund managers subscribe to 5+ vendors for market data, compliance, risk, and research.', solution: 'Replace fragmented vendor stack with one platform. Unified billing, one login, consistent API across all analytics.' },
          { title: 'Regulatory Reporting Workflow', problem: 'Compliance teams manually pull data from multiple systems to generate regulatory filings.', solution: 'Automated compliance scanning, risk reporting, and entity research feed directly into reporting templates.' },
          { title: 'RIA Technology Stack', problem: 'Registered Investment Advisors need institutional-grade tools without institutional-grade pricing.', solution: 'Pro-tier access to all six services at a bundled cohort price. API-first architecture integrates with existing custodian platforms.' },
        ],
      },
      installation: {
        tech: {
          cloud: {
            subtitle: 'Deploy to Cloudflare Workers edge network',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
              { name: 'AWS', icon: 'assets/partners/aws.svg' },
            ],
            snippet: 'npx wrangler deploy --config wrangler.jsonc',
            features: ['Global edge network', 'Zero cold starts', 'Auto-scaling'],
          },
          local: {
            subtitle: 'Run locally via CLI or container',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'brew install haiphen/tap/haiphen && haiphen serve',
            features: ['Local development', 'Air-gapped deployments', 'Full CLI access'],
          },
        },
        finance: {
          cloud: {
            subtitle: 'Deploy to Cloudflare Workers edge network',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
              { name: 'AWS', icon: 'assets/partners/aws.svg' },
            ],
            snippet: 'npx wrangler deploy --config wrangler.jsonc',
            features: ['Global edge network', 'Zero cold starts', 'Auto-scaling'],
          },
          local: {
            subtitle: 'Run locally via CLI or container',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'brew install haiphen/tap/haiphen && haiphen serve',
            features: ['Local development', 'Air-gapped deployments', 'Full CLI access'],
          },
        },
      },
      integration: {
        tech: {
          headline: 'Connect your entire trading stack to Haiphen in minutes',
          api: 'curl -H "Authorization: Bearer $TOKEN" \\\n  https://api.haiphen.io/v1/services',
          webhookEvents: ['scan.complete', 'risk.alert', 'graph.updated', 'supply.breach'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [
            { name: 'Schwab', icon: 'assets/partners/schwab.svg' },
            { name: 'Robinhood', icon: 'assets/partners/robinhood.svg' },
            { name: 'E*Trade', icon: 'assets/partners/etrade.svg' },
            { name: 'Fidelity', icon: 'assets/partners/fidelity.svg' },
            { name: 'Merrill', icon: 'assets/partners/merrill.svg' },
            { name: 'Interactive Brokers', icon: 'assets/partners/interactive-brokers.svg' },
            { name: 'Alpaca', icon: 'assets/partners/alpaca.svg' },
            { name: 'TD Ameritrade', icon: 'assets/partners/td-ameritrade.svg' },
          ],
        },
        finance: {
          headline: 'Connect your investment office to Haiphen in minutes',
          api: 'curl -H "Authorization: Bearer $TOKEN" \\\n  https://api.haiphen.io/v1/services',
          webhookEvents: ['compliance.alert', 'risk.breach', 'graph.updated', 'supply.exposure'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [
            { name: 'Schwab', icon: 'assets/partners/schwab.svg' },
            { name: 'Interactive Brokers', icon: 'assets/partners/interactive-brokers.svg' },
            { name: 'Alpaca', icon: 'assets/partners/alpaca.svg' },
            { name: 'Fidelity', icon: 'assets/partners/fidelity.svg' },
            { name: 'Merrill', icon: 'assets/partners/merrill.svg' },
            { name: 'E*Trade', icon: 'assets/partners/etrade.svg' },
            { name: 'TD Ameritrade', icon: 'assets/partners/td-ameritrade.svg' },
          ],
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
          cloud: {
            subtitle: 'Deploy Secure service to Cloudflare Workers',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-secure/wrangler.toml',
            features: ['Automated CVE scanning', 'Edge-deployed', 'CI/CD integration'],
          },
          local: {
            subtitle: 'Scan dependencies from your local machine',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen secure scan --target ./package.json',
            features: ['Offline scanning', 'CI pipeline integration', 'JSON/PDF reports'],
          },
        },
        finance: {
          cloud: {
            subtitle: 'Deploy compliance scanner to Cloudflare Workers',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-secure/wrangler.toml',
            features: ['Continuous compliance', 'Edge-deployed', 'Multi-framework'],
          },
          local: {
            subtitle: 'Run compliance scans locally',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen secure scan --framework soc2',
            features: ['Offline compliance', 'Audit-ready reports', 'Air-gapped deployments'],
          },
        },
      },
      integration: {
        tech: {
          headline: 'Integrate security scanning into your CI/CD pipeline',
          api: 'curl -X POST https://api.haiphen.io/v1/secure/scan \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"target":"./package.json","depth":3}\'',
          webhookEvents: ['scan.complete', 'cve.critical'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
          ],
          brokers: [],
        },
        finance: {
          headline: 'Connect compliance scanning to your regulatory workflow',
          api: 'curl -X POST https://api.haiphen.io/v1/secure/scan \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"target":"trading-infra","framework":"soc2"}\'',
          webhookEvents: ['compliance.drift', 'scan.complete'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
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
          cloud: {
            subtitle: 'Deploy Network Trace to Cloudflare Workers',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-network/wrangler.toml',
            features: ['Edge protocol analysis', 'FIX/ITCH/OUCH support', 'Real-time monitoring'],
          },
          local: {
            subtitle: 'Capture and analyze feeds locally',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen network capture --interface eth0 --protocol fix',
            features: ['PCAP replay', 'Local feed analysis', 'Latency measurement'],
          },
        },
        finance: {
          cloud: {
            subtitle: 'Deploy Market Data Analyzer to edge',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-network/wrangler.toml',
            features: ['Multi-venue monitoring', 'Feed health dashboards', 'Auto-scaling'],
          },
          local: {
            subtitle: 'Analyze market data feeds locally',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen network capture --feed nyse-itch',
            features: ['Historical replay', 'Venue comparison', 'CSV/PDF export'],
          },
        },
      },
      integration: {
        tech: {
          headline: 'Pipe market data feeds through Haiphen for protocol analysis',
          api: 'curl -X POST https://api.haiphen.io/v1/network/analyze \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"protocol":"fix","session_id":"FIX.4.4:SENDER->TARGET"}\'',
          webhookEvents: ['network.latency_spike', 'network.feed_gap'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [
            { name: 'Interactive Brokers', icon: 'assets/partners/interactive-brokers.svg' },
            { name: 'Alpaca', icon: 'assets/partners/alpaca.svg' },
          ],
        },
        finance: {
          headline: 'Monitor exchange feeds and measure execution quality',
          api: 'curl -X POST https://api.haiphen.io/v1/network/analyze \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"feed":"nyse-itch","metrics":["latency","gaps","book_depth"]}\'',
          webhookEvents: ['feed.degradation', 'network.latency_spike'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [
            { name: 'Interactive Brokers', icon: 'assets/partners/interactive-brokers.svg' },
            { name: 'Alpaca', icon: 'assets/partners/alpaca.svg' },
            { name: 'Schwab', icon: 'assets/partners/schwab.svg' },
          ],
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
          cloud: {
            subtitle: 'Deploy Knowledge Graph to Cloudflare Workers',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-graph/wrangler.toml',
            features: ['Entity extraction', 'Recursive CTE queries', 'Real-time ingestion'],
          },
          local: {
            subtitle: 'Run entity analysis from your workstation',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen graph ingest --source sec-filings --ticker AAPL',
            features: ['SEC filing parsing', 'Offline graph queries', 'Custom data sources'],
          },
        },
        finance: {
          cloud: {
            subtitle: 'Deploy Entity Intelligence to edge',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-graph/wrangler.toml',
            features: ['Corporate structure mapping', 'Automated ingestion', 'API-first'],
          },
          local: {
            subtitle: 'Run due diligence analysis locally',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen graph ingest --source sec-filings --ticker AAPL',
            features: ['Offline entity research', 'Multi-hop ownership', 'PDF/JSON reports'],
          },
        },
      },
      integration: {
        tech: {
          headline: 'Query entity relationships via API for alpha signals',
          api: 'curl -X POST https://api.haiphen.io/v1/graph/query \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"entity":"Apple Inc","hops":3,"relations":["owns","board_member"]}\'',
          webhookEvents: ['graph.entity_updated', 'graph.new_relation'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
          ],
          brokers: [],
        },
        finance: {
          headline: 'Integrate entity intelligence into your research workflow',
          api: 'curl -X POST https://api.haiphen.io/v1/graph/query \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"entity":"Apple Inc","type":"ownership","depth":5}\'',
          webhookEvents: ['graph.ownership_change', 'graph.new_relation'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
          ],
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
          cloud: {
            subtitle: 'Deploy Risk Analysis to Cloudflare Workers',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-risk/wrangler.toml',
            features: ['Monte Carlo at edge', 'Millisecond VaR', 'Auto-scaling sims'],
          },
          local: {
            subtitle: 'Run portfolio risk simulations locally',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen risk simulate --scenarios crash,rate_spike --iterations 10000',
            features: ['Offline simulations', 'CSV portfolio import', 'Custom scenarios'],
          },
        },
        finance: {
          cloud: {
            subtitle: 'Deploy Portfolio Risk Engine to edge',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-risk/wrangler.toml',
            features: ['Real-time VaR', 'Multi-asset support', 'Auto-scaling'],
          },
          local: {
            subtitle: 'Run stress tests from your workstation',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen risk report --format pdf --scenarios all',
            features: ['Client-ready reports', 'Portfolio import', 'Custom scenarios'],
          },
        },
      },
      integration: {
        tech: {
          headline: 'Add pre-trade risk checks and portfolio monitoring to your stack',
          api: 'curl -X POST https://api.haiphen.io/v1/risk/simulate \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"portfolio_id":"pf_123","scenarios":["crash_2008","covid"],"iterations":10000}\'',
          webhookEvents: ['risk.var_breach', 'risk.drawdown_alert'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [
            { name: 'Interactive Brokers', icon: 'assets/partners/interactive-brokers.svg' },
            { name: 'Alpaca', icon: 'assets/partners/alpaca.svg' },
          ],
        },
        finance: {
          headline: 'Connect portfolio risk monitoring to your investment workflow',
          api: 'curl -X POST https://api.haiphen.io/v1/risk/simulate \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"portfolio_id":"pf_123","metrics":["var","cvar","sharpe"],"confidence":0.99}\'',
          webhookEvents: ['risk.limit_approach', 'risk.drawdown_alert'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [
            { name: 'Interactive Brokers', icon: 'assets/partners/interactive-brokers.svg' },
            { name: 'Schwab', icon: 'assets/partners/schwab.svg' },
          ],
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
          cloud: {
            subtitle: 'Deploy Causal Chain to Cloudflare Workers',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-causal/wrangler.toml',
            features: ['DAG construction', 'Counterfactual analysis', 'Real-time tracing'],
          },
          local: {
            subtitle: 'Trace execution chains from local logs',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen causal ingest --source execution-logs.json',
            features: ['Offline DAG analysis', 'JSON/FIX log import', 'Timeline export'],
          },
        },
        finance: {
          cloud: {
            subtitle: 'Deploy Trade Chain Analysis to edge',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-causal/wrangler.toml',
            features: ['Incident reconstruction', 'Regulatory timelines', 'Auto-scaling'],
          },
          local: {
            subtitle: 'Reconstruct trade chains locally',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen causal timeline --date 2024-03-15 --format pdf',
            features: ['Offline analysis', 'Regulatory-ready reports', 'What-if scenarios'],
          },
        },
      },
      integration: {
        tech: {
          headline: 'Trace execution chains and detect cascading failures',
          api: 'curl -X POST https://api.haiphen.io/v1/causal/trace \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"event_id":"evt_abc","depth":5,"include_counterfactual":true}\'',
          webhookEvents: ['causal.cascade_detected', 'causal.root_cause'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [],
        },
        finance: {
          headline: 'Reconstruct incident timelines for regulatory reporting',
          api: 'curl -X POST https://api.haiphen.io/v1/causal/timeline \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"date":"2024-03-15","portfolio_id":"pf_123","format":"regulatory"}\'',
          webhookEvents: ['causal.incident_report', 'causal.cascade_detected'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
          ],
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
          cloud: {
            subtitle: 'Deploy Counterparty Intel to Cloudflare Workers',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-supply/wrangler.toml',
            features: ['Weighted risk scoring', 'Real-time monitoring', 'Edge-deployed'],
          },
          local: {
            subtitle: 'Score counterparties from your workstation',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen supply score --entity all --format json',
            features: ['Offline scoring', 'Bulk import', 'JSON/PDF reports'],
          },
        },
        finance: {
          cloud: {
            subtitle: 'Deploy Counterparty Intel to edge',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'npx wrangler deploy -c haiphen-supply/wrangler.toml',
            features: ['Continuous monitoring', 'Regulatory reporting', 'Auto-scaling'],
          },
          local: {
            subtitle: 'Run counterparty analysis locally',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen supply report --portfolio all --format pdf',
            features: ['Offline analysis', 'Basel III reports', 'Bulk counterparty import'],
          },
        },
      },
      integration: {
        tech: {
          headline: 'Monitor counterparty risk and concentration exposure',
          api: 'curl -X POST https://api.haiphen.io/v1/supply/score \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"entity":"Goldman Sachs","dimensions":["credit","concentration","operational"]}\'',
          webhookEvents: ['supply.rating_change', 'supply.concentration_breach'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
          ],
          brokers: [],
        },
        finance: {
          headline: 'Integrate counterparty monitoring into your compliance workflow',
          api: 'curl -X POST https://api.haiphen.io/v1/supply/score \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"entity":"Goldman Sachs","report_type":"regulatory","framework":"basel3"}\'',
          webhookEvents: ['supply.exposure_alert', 'supply.rating_change'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
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
    {
      key: 'prospect',
      serviceId: 'haiphen_prospect',
      tech: {
        name: 'Prospect Engine',
        eyebrow: 'Vulnerability Intel',
        problem: 'Vulnerability leads are scattered across NVD, OSV, GitHub Advisories, and Shodan. Triaging them manually across six analysis dimensions is slow and inconsistent.',
        solution: 'Automated crawl-to-outreach pipeline. Discovers vulnerability leads from four sources, runs a sequential 6-service investigation (secure \u2192 network \u2192 causal \u2192 risk \u2192 graph \u2192 supply), derives requirements, auto-resolves gaps, and confirms risk reduction with before/after scoring.',
        steps: [
          { title: 'Discover', desc: 'Crawl NVD, OSV, GitHub Advisory & Shodan for leads' },
          { title: 'Investigate', desc: '6-service pipeline with upstream context forwarding' },
          { title: 'Resolve', desc: 'Auto-fix data gaps, add monitors, confirm risk reduction' },
        ],
      },
      finance: {
        name: 'Vulnerability Intelligence',
        eyebrow: 'Vuln Intel',
        problem: 'Fintech infrastructure vulnerabilities in trading systems, payment gateways, and market data feeds require rapid triage across multiple analysis dimensions.',
        solution: 'Automated vulnerability intelligence pipeline. Discovers leads from four databases, investigates across six analysis engines with fintech-specific rules, and delivers risk reduction confirmation with measurable before/after scores.',
        steps: [
          { title: 'Discover', desc: 'Surface fintech-relevant vulnerabilities from four sources' },
          { title: 'Investigate', desc: 'Full pipeline analysis with rule-based service matching' },
          { title: 'Confirm', desc: 'Measure risk reduction and generate outreach reports' },
        ],
      },
      assets: {
        demo: 'assets/demos/cli-prospect-list.gif',
        scenario: 'assets/scenarios/scenario-secure.svg',
        icon: 'assets/mission/secure.svg',
      },
      usecases: {
        tech: [
          { title: 'Automated Vulnerability Triage', problem: 'Security teams manually correlate CVE feeds with infrastructure inventories. Critical vulnerabilities slip through when volume spikes.', solution: 'Prospect Engine crawls four vulnerability databases, matches leads against your stack using configurable rules, and runs the full 6-service investigation pipeline automatically.' },
          { title: 'Closed-Loop Risk Reduction', problem: 'After remediating a vulnerability, there is no systematic way to verify the risk actually decreased across all analysis dimensions.', solution: 'Re-investigate after resolving requirements. The engine re-runs all six services and computes a before/after risk delta, providing quantified proof of improvement.' },
          { title: 'Rule-Based Service Matching', problem: 'Different vulnerability types require different analysis services. Routing decisions are ad-hoc and inconsistent.', solution: 'Configurable use-case rules map lead attributes (severity, entity type, vulnerability class) to specific service configurations and solution templates with priority ordering.' },
        ],
        finance: [
          { title: 'Fintech Vulnerability Monitoring', problem: 'Trading platforms and payment systems face unique vulnerability patterns that generic scanners miss \u2014 FIX protocol flaws, settlement system bugs, API gateway exposures.', solution: 'Fintech-specific crawl rules surface vulnerabilities relevant to trade execution, settlement, broker connectivity, and regulatory systems with industry keyword matching.' },
          { title: 'Regulatory Vulnerability Reporting', problem: 'Regulators require documented evidence of vulnerability management processes with measurable risk metrics.', solution: 'End-to-end audit trail from discovery through investigation to risk reduction confirmation. Export investigation reports with before/after risk scores.' },
          { title: 'Proactive Counterparty Risk Intelligence', problem: 'Vulnerabilities in counterparty infrastructure create exposure that is invisible until an incident occurs.', solution: 'Monitor vulnerability feeds for entities in your counterparty network. Automatic regression detection alerts when an entity shows recurring vulnerability patterns.' },
        ],
      },
      installation: {
        tech: {
          cloud: {
            subtitle: 'Prospect Engine runs on Cloudflare Workers + GCP Cloud Run',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'haiphen prospect list --severity critical',
            features: ['4-source vulnerability crawling', '6-service investigation pipeline', 'Rule-based matching'],
          },
          local: {
            subtitle: 'Access prospect workflows via CLI',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen prospect investigate --lead <id>',
            features: ['Full CLI access', 'JSON output', 'Credential vault integration'],
          },
        },
        finance: {
          cloud: {
            subtitle: 'Vulnerability Intelligence on Cloudflare Workers + GCP',
            providers: [
              { name: 'Cloudflare Workers', icon: 'assets/partners/cloudflare.svg' },
            ],
            snippet: 'haiphen prospect list --severity critical',
            features: ['Fintech-focused rules', 'Automated investigation', 'Risk scoring'],
          },
          local: {
            subtitle: 'Run vulnerability intelligence from your terminal',
            providers: [
              { name: 'Homebrew', icon: 'assets/partners/homebrew.svg' },
              { name: 'Docker', icon: 'assets/partners/docker.svg' },
            ],
            snippet: 'haiphen prospect investigate --lead <id>',
            features: ['Offline triage', 'Audit-ready reports', 'Rule customization'],
          },
        },
      },
      integration: {
        tech: {
          headline: 'Integrate vulnerability intelligence into your security workflow',
          api: 'curl -X POST https://api.haiphen.io/v1/prospect/investigate \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"lead_id":"lead_abc123"}\'',
          webhookEvents: ['prospect.lead_discovered', 'prospect.investigation_complete', 'prospect.risk_reduced'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Discord', icon: 'assets/partners/discord.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [],
        },
        finance: {
          headline: 'Connect vulnerability intelligence to your compliance workflow',
          api: 'curl -X POST https://api.haiphen.io/v1/prospect/investigate \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -d \'{"lead_id":"lead_abc123"}\'',
          webhookEvents: ['prospect.lead_discovered', 'prospect.investigation_complete', 'prospect.risk_reduced'],
          channels: [
            { name: 'Slack', icon: 'assets/partners/slack.svg' },
            { name: 'Email', icon: 'assets/partners/email-icon.svg' },
            { name: 'PagerDuty', icon: 'assets/partners/pagerduty.svg' },
          ],
          brokers: [],
        },
      },
      subscribe: {
        faq: [
          { q: 'Which vulnerability sources are crawled?', a: 'NVD (NIST), OSV (Google), GitHub Advisory Database, and Shodan. Custom source plugins available on Enterprise.' },
          { q: 'How does the investigation pipeline work?', a: 'Sequential 6-service pipeline: secure \u2192 network \u2192 causal \u2192 risk \u2192 graph \u2192 supply. Each step receives upstream context for progressive enrichment.' },
          { q: 'What is the re-investigation workflow?', a: 'After resolving requirements, re-investigate re-runs the full pipeline. It compares before/after aggregate risk scores to quantify improvement.' },
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

  function renderInstallCard(path, title) {
    if (!path) return '';

    var providersHtml = (path.providers || []).map(function (p) {
      return '<div class="ms-provider-chip">' +
        '<img class="ms-provider-chip__icon" src="' + esc(p.icon) + '" alt="" width="22" height="22" loading="lazy" />' +
        '<span class="ms-provider-chip__name">' + esc(p.name) + '</span>' +
      '</div>';
    }).join('');

    var featuresHtml = (path.features || []).map(function (f) {
      return '<li>' + esc(f) + '</li>';
    }).join('');

    return '<div class="ms-install-card">' +
      '<div class="ms-install-card__providers">' + providersHtml + '</div>' +
      '<h4 class="ms-install-card__title">' + esc(title) + '</h4>' +
      '<p class="ms-install-card__sub">' + esc(path.subtitle || '') + '</p>' +
      (featuresHtml ? '<ul class="ms-install-card__features">' + featuresHtml + '</ul>' : '') +
      '<div class="ms-code-block">' + esc(path.snippet || '') + '</div>' +
    '</div>';
  }

  function renderInstallPanel(svc, lens) {
    var data = svc.installation;
    if (!data) return '<div class="ms-tab-panel"><p>Installation guide coming soon.</p></div>';
    var inst = data[lens] || data.tech || {};
    var docsHref = svc._docsSection ? '#docs:' + svc._docsSection : '#docs';

    var diagramHtml = '<div class="ms-install-diagram">' +
      '<img src="assets/diagrams/install-paths.svg" alt="Deployment options" data-lightbox loading="lazy" decoding="async" />' +
    '</div>';

    var gridHtml = '<div class="ms-install-grid">' +
      renderInstallCard(inst.cloud, 'Cloud-Native') +
      renderInstallCard(inst.local, 'Local / Edge') +
    '</div>';

    return '<div class="ms-tab-panel">' +
      '<h3 class="ms-tab-panel__title">Installation</h3>' +
      diagramHtml +
      gridHtml +
      '<div class="ms-actions" style="margin-top:1rem">' +
        '<a class="btn btn-ghost" href="' + esc(docsHref) + '">Full Installation Guide</a>' +
      '</div>' +
    '</div>';
  }

  /* ================================================================
     TAB PANEL: INTEGRATION
     ================================================================ */

  function renderPartnerCards(items) {
    if (!items || !items.length) return '';
    return '<div class="ms-partner-grid">' +
      items.map(function (p) {
        return '<div class="ms-partner-card">' +
          '<img class="ms-partner-card__icon" src="' + esc(p.icon) + '" alt="" width="32" height="32" loading="lazy" />' +
          '<span class="ms-partner-card__name">' + esc(p.name) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderIntegrationPanel(svc, lens) {
    var data = svc.integration;
    if (!data) return '<div class="ms-tab-panel"><p>Integration guide coming soon.</p></div>';
    var integ = data[lens] || data.tech || {};
    var docsHref = svc._docsSection ? '#docs:' + svc._docsSection : '#docs';

    // Headline
    var headlineHtml = integ.headline
      ? '<p class="ms-integ-headline">' + esc(integ.headline) + '</p>'
      : '';

    // Diagram
    var diagramHtml = '<div class="ms-integ-diagram">' +
      '<img src="assets/diagrams/integration-flow.svg" alt="Integration flow" data-lightbox loading="lazy" decoding="async" />' +
    '</div>';

    // Partner grid — brokers column
    var brokersCol = '';
    if (integ.brokers && integ.brokers.length) {
      brokersCol = '<div>' +
        '<h4 class="ms-integ-grid__section-title">Broker Partners</h4>' +
        renderPartnerCards(integ.brokers) +
      '</div>';
    } else {
      brokersCol = '<div>' +
        '<h4 class="ms-integ-grid__section-title">Broker Partners</h4>' +
        '<div class="ms-integ-standalone">Standalone service \u2014 no broker connection required</div>' +
      '</div>';
    }

    // Channels column
    var channelsCol = '';
    if (integ.channels && integ.channels.length) {
      channelsCol = '<div>' +
        '<h4 class="ms-integ-grid__section-title">Notifications</h4>' +
        renderPartnerCards(integ.channels) +
      '</div>';
    }

    var gridHtml = '<div class="ms-integ-grid">' + brokersCol + channelsCol + '</div>';

    // API snippet + webhook events
    var apiHtml = '';
    if (integ.api) {
      var eventsHtml = '';
      if (integ.webhookEvents && integ.webhookEvents.length) {
        eventsHtml = '<div class="ms-event-row">' +
          integ.webhookEvents.map(function (ev) {
            return '<span class="ms-event-badge">' + esc(ev) + '</span>';
          }).join('') +
        '</div>';
      }

      apiHtml = '<div class="ms-integ-api">' +
        '<h4 class="ms-integ-api__title">API Example</h4>' +
        '<div class="ms-code-block">' + esc(integ.api) + '</div>' +
        eventsHtml +
      '</div>';
    }

    return '<div class="ms-tab-panel">' +
      '<h3 class="ms-tab-panel__title">Integration</h3>' +
      headlineHtml +
      diagramHtml +
      gridHtml +
      apiHtml +
      '<div class="ms-integ-docs-link ms-actions">' +
        '<a class="btn btn-ghost" href="' + esc(docsHref) + '">Full API Reference</a>' +
      '</div>' +
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
