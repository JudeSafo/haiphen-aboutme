#!/usr/bin/env bash
# Mock haiphen CLI for VHS demo recordings.
# Produces formatted, ANSI-colored output designed for 640×360 @ 20px captures.

# ── ANSI helpers ──
B='\033[1m'        # bold
D='\033[2m'        # dim
R='\033[0m'        # reset
GRN='\033[32m'     # green
RED='\033[31m'     # red
YEL='\033[33m'     # yellow
CYN='\033[36m'     # cyan
MAG='\033[35m'     # magenta
WHT='\033[37m'     # white

case "$1" in
  login)
    echo -e "${GRN}${B}✓${R} Authenticated via GitHub OAuth"
    echo -e "  Token expires ${D}2027-02-08T00:22:33Z${R}"
    ;;
  logout)
    echo -e "${GRN}${B}✓${R} Session cleared."
    ;;
  status)
    echo -e "${B}Haiphen CLI${R}  ${D}v1.4.0${R}"
    echo ""
    echo -e "  User      ${B}demo-user${R}  ${D}(demo@haiphen.io)${R}"
    echo -e "  Plan      ${GRN}${B}Pro${R}"
    echo -e "  Entitled  ${GRN}✓${R}  ${D}until 2027-02-07${R}"
    echo -e "  Gateway   ${D}http://localhost:8787${R}"
    ;;
  services)
    echo -e "${B}Service Health${R}  ${D}$(date +%H:%M:%S)${R}"
    echo -e "${D}──────────────────────────────────────${R}"
    echo -e "  api       ${GRN}● OK${R}   ${D}42ms${R}  api.haiphen.io"
    echo -e "  secure    ${GRN}● OK${R}   ${D}38ms${R}  secure.haiphen.io"
    echo -e "  network   ${GRN}● OK${R}   ${D}45ms${R}  network.haiphen.io"
    echo -e "  graph     ${GRN}● OK${R}   ${D}41ms${R}  graph.haiphen.io"
    echo -e "  risk      ${GRN}● OK${R}   ${D}39ms${R}  risk.haiphen.io"
    echo -e "  causal    ${GRN}● OK${R}   ${D}44ms${R}  causal.haiphen.io"
    echo -e "  supply    ${GRN}● OK${R}   ${D}40ms${R}  supply.haiphen.io"
    echo -e "${D}──────────────────────────────────────${R}"
    echo -e "  ${GRN}${B}7/7 operational${R}"
    ;;
  secure)
    case "$2" in
      scan)
        echo -e "${B}Scan Complete${R}  ${D}scn_7f3a2b1c${R}"
        echo ""
        echo -e "${D}Severity   Finding                    CVE${R}"
        echo -e "${D}────────── ────────────────────────── ──────────────${R}"
        echo -e "${RED}${B}● HIGH${R}     TLS 1.1 Deprecated         ${D}CVE-2024-0001${R}"
        echo -e "${YEL}${B}● MEDIUM${R}   Open SNMP Community String ${D}CVE-2024-0042${R}"
        echo -e "${CYN}● LOW${R}      NTP Sync Drift > 500ms     ${D}—${R}"
        echo ""
        echo -e "  ${B}3 findings${R}: ${RED}1 high${R}, ${YEL}1 medium${R}, ${CYN}1 low${R}"
        ;;
      *)
        echo -e "${GRN}● secure${R}  ${D}v1.4.0  operational${R}"
        ;;
    esac
    ;;
  network)
    case "$2" in
      trace)
        echo -e "${B}Trace Complete${R}  ${D}trc_a9c4e2d1${R}"
        echo ""
        echo -e "  Target    ${B}plc-gateway-01${R}"
        echo -e "  Protocol  ${CYN}Modbus TCP${R}"
        echo -e "  Packets   ${B}1,247${R}  ${D}in 5.02s${R}"
        echo ""
        echo -e "${D}Anomalies${R}"
        echo -e "${D}──────────────────────────────────────${R}"
        echo -e "${YEL}${B}⚠${R}  Unexpected function code ${B}0x2B${R}  ${D}×3${R}"
        echo -e "${YEL}${B}⚠${R}  Timing deviation ${B}142ms${R} ${D}(thresh 100ms)${R}"
        echo ""
        echo -e "  ${YEL}${B}2 anomalies${R} detected"
        ;;
      *)
        echo -e "${GRN}● network${R}  ${D}v1.4.0  operational${R}"
        ;;
    esac
    ;;
  graph)
    case "$2" in
      query)
        echo -e "${B}Graph Query${R}  ${D}3 entities, 7 edges${R}"
        echo ""
        echo -e "${D}Entity              Type       Relevance  Risk${R}"
        echo -e "${D}─────────────────── ────────── ───────── ─────${R}"
        echo -e "${B}TSMC${R}                supplier   ${GRN}${B}0.94${R}      ${GRN}0.31${R}"
        echo -e "${B}ASML${R}                supplier   ${GRN}${B}0.79${R}      ${GRN}0.18${R}"
        echo -e "${B}Samsung Foundry${R}     supplier   ${CYN}0.72${R}      ${YEL}0.44${R}"
        echo ""
        echo -e "  Depth ${B}2${R}  ${D}│${R}  Nodes ${B}3${R}  ${D}│${R}  Edges ${B}7${R}"
        ;;
      *)
        echo -e "${GRN}● graph${R}  ${D}v1.4.0  48,210 entities${R}"
        ;;
    esac
    ;;
  risk)
    case "$2" in
      assess)
        echo -e "${B}Risk Assessment${R}  ${D}rsk_b2d4f1e3${R}"
        echo ""
        echo -e "  Scenario  ${MAG}${B}Rate Hike +300bp${R}"
        echo -e "  Horizon   ${D}30 days  │  10,000 iterations${R}"
        echo ""
        echo -e "${D}Metric              Value${R}"
        echo -e "${D}─────────────────── ──────────${R}"
        echo -e "  VaR  (95%)        ${RED}${B}-4.23%${R}"
        echo -e "  CVaR (95%)        ${RED}${B}-5.91%${R}"
        echo -e "  Expected Shortfall${RED} -6.48%${R}"
        echo -e "  Confidence        ${D}95%${R}"
        ;;
      *)
        echo -e "${GRN}● risk${R}  ${D}v1.4.0  operational${R}"
        ;;
    esac
    ;;
  causal)
    case "$2" in
      analyze|trace)
        echo -e "${B}Causal Analysis${R}  ${D}csl_e5a1c3d7${R}"
        echo ""
        echo -e "  Root Cause  ${RED}${B}firmware_update_v2.3.1${R}"
        echo -e "  Confidence  ${GRN}${B}87%${R}"
        echo ""
        echo -e "${D}Chain  Event                   Time${R}"
        echo -e "${D}────── ─────────────────────── ─────────${R}"
        echo -e "  ${B}1${R}     firmware_update         ${D}14:00:00${R}"
        echo -e "  ${B}2${R}     modbus_timeout_spike    ${D}14:02:33${R}"
        echo -e "  ${B}3${R}     plc_watchdog_reset      ${D}14:03:01${R}"
        echo -e "  ${B}4${R}     ${RED}production_halt${R}         ${D}14:03:45${R}"
        ;;
      *)
        echo -e "${GRN}● causal${R}  ${D}v1.4.0  operational${R}"
        ;;
    esac
    ;;
  supply)
    case "$2" in
      assess)
        echo -e "${B}Counterparty Assessment${R}  ${D}sup_c7f2d4a1${R}"
        echo ""
        echo -e "  Entity   ${B}Acme Industrial${R}"
        echo -e "  Risk     ${YEL}${B}0.42${R}  ${D}(moderate)${R}"
        echo -e "  Action   ${CYN}${B}Monitor${R}"
        echo ""
        echo -e "${D}Dimension              Score${R}"
        echo -e "${D}────────────────────── ─────${R}"
        echo -e "  Financial stability  ${GRN}0.28${R}"
        echo -e "  Delivery reliability ${GRN}0.31${R}"
        echo -e "  Quality history      ${GRN}0.22${R}"
        echo -e "  Geopolitical risk    ${YEL}${B}0.55${R}"
        echo -e "  Concentration risk   ${RED}${B}0.74${R}"
        echo ""
        echo -e "  ${D}3 alternative suppliers available${R}"
        ;;
      *)
        echo -e "${GRN}● supply${R}  ${D}v1.4.0  142 tracked${R}"
        ;;
    esac
    ;;
  prospect)
    case "$2" in
      target)
        case "$3" in
          list)
            echo -e "${B}Prospect Targets${R}  ${D}5 results${R}"
            echo -e "${D}────────────────────────────────────────────────────────${R}"
            echo -e "${D}TARGET ID              NAME                   TICKER  SECTOR            LEADS  INVEST${R}"
            echo -e "${D}────────────────────── ────────────────────── ─────── ───────────────── ────── ──────${R}"
            echo -e "${B}t-goldman-sachs${R}        Goldman Sachs          ${D}GS${R}      Financials        ${B}12${R}     ${B}4${R}"
            echo -e "${B}t-jpmorgan-chase${R}       JPMorgan Chase         ${D}JPM${R}     Financials        ${B}9${R}      ${B}3${R}"
            echo -e "${B}t-citadel-securities${R}   Citadel Securities     ${D}—${R}       Financials        ${B}7${R}      ${B}2${R}"
            echo -e "${B}t-stripe${R}               Stripe                 ${D}—${R}       Financials        ${B}5${R}      ${B}1${R}"
            echo -e "${B}t-coinbase${R}             Coinbase               ${D}COIN${R}    Financials        ${B}8${R}      ${B}3${R}"
            echo -e "${D}────────────────────────────────────────────────────────${R}"
            echo -e "  ${B}5${R} targets"
            ;;
          get)
            echo -e "${B}Target Profile${R}  ${D}t-goldman-sachs${R}"
            echo ""
            echo -e "  Name       ${B}Goldman Sachs${R}"
            echo -e "  Ticker     ${D}GS${R}"
            echo -e "  Sector     ${D}Financials${R}"
            echo -e "  Industry   ${D}Financial Services${R}"
            echo -e "  CIK        ${D}0000886982${R}"
            echo -e "  Domains    ${CYN}goldmansachs.com${R}, ${CYN}gs.com${R}, ${CYN}marquee.gs.com${R}"
            echo ""
            echo -e "  Leads      ${B}12${R}  ${D}(4 vuln, 3 regulatory, 3 perf, 2 incident)${R}"
            echo -e "  Investigated  ${B}4${R}  ${D}(avg score: 58.3)${R}"
            ;;
          *)
            echo -e "${B}target${R} — Manage prospect targets"
            echo -e "  list    List targets"
            echo -e "  get     Get target profile"
            echo -e "  add     Add new target"
            echo -e "  remove  Archive target"
            ;;
        esac
        ;;
      report)
        echo -e "${B}Generating Report${R}  ${D}t-goldman-sachs${R}"
        echo ""
        echo -e "  ${CYN}[fetch]${R} Querying API for target data..."
        sleep 0.2
        echo -e "  ${D}├${R} 12 leads, 4 investigations"
        echo -e "  ${D}├${R} 3 threat vectors classified"
        echo -e "  ${D}└${R} 6 services scored"
        echo ""
        echo -e "  ${CYN}[render]${R} Building LaTeX document..."
        sleep 0.2
        echo -e "  ${D}├${R} Executive summary"
        echo -e "  ${D}├${R} Services: ${RED}secure${R} ${MAG}network${R} ${CYN}graph${R} ${YEL}risk${R} ${GRN}causal${R} ${WHT}supply${R}"
        echo -e "  ${D}└${R} Service index with ${CYN}haiphen.io${R} hyperlinks"
        echo ""
        echo -e "  ${GRN}${B}✓${R} Report saved: ${B}haiphen-report-goldman-sachs-$(date +%Y-%m-%d).tex${R}"
        ;;
      list)
        echo -e "${B}Prospect Leads${R}  ${D}4 results${R}"
        echo -e "${D}────────────────────────────────────────────${R}"
        echo -e "${D}ID         Entity                Severity  CVE${R}"
        echo -e "${D}────────── ───────────────────── ───────── ──────────────${R}"
        echo -e "${B}led_7f3a${R}   Meridian Trading      ${RED}${B}CRITICAL${R}  CVE-2026-2847"
        echo -e "${B}led_a1c2${R}   Apex Clearing Corp    ${RED}${B}HIGH${R}      CVE-2026-1934"
        echo -e "${B}led_d4e5${R}   Vertex Market Data    ${YEL}${B}MEDIUM${R}    CVE-2026-3102"
        echo -e "${B}led_b8f1${R}   Nova Settlement       ${YEL}${B}MEDIUM${R}    CVE-2026-2511"
        echo -e "${D}────────────────────────────────────────────${R}"
        echo -e "  ${RED}1 critical${R}, ${RED}1 high${R}, ${YEL}2 medium${R}"
        ;;
      investigate)
        echo -e "${B}Investigation Pipeline${R}  ${D}inv_3f2a1b${R}"
        echo -e "  Lead  ${B}led_7f3a${R}  Meridian Trading"
        echo ""
        echo -e "${D}Service    Score   Status${R}"
        echo -e "${D}────────── ─────── ──────────${R}"
        echo -e "  secure   ${RED}${B}72${R}      ${GRN}✓ done${R}"
        echo -e "  network  ${YEL}${B}58${R}      ${GRN}✓ done${R}"
        echo -e "  causal   ${YEL}${B}51${R}      ${GRN}✓ done${R}"
        echo -e "  risk     ${YEL}${B}64${R}      ${GRN}✓ done${R}"
        echo -e "  graph    ${GRN}${B}38${R}      ${GRN}✓ done${R}"
        echo -e "  supply   ${YEL}${B}49${R}      ${GRN}✓ done${R}"
        echo ""
        echo -e "  Aggregate  ${YEL}${B}56.8${R}  ${D}(weighted)${R}"
        echo -e "  ${D}3 requirements identified${R}"
        ;;
      investigation)
        echo -e "${B}Investigation${R}  ${D}inv_3f2a1b${R}"
        echo ""
        echo -e "  Lead       ${B}led_7f3a${R}  Meridian Trading"
        echo -e "  Score      ${YEL}${B}56.8${R}  ${D}(aggregate)${R}"
        echo -e "  Steps      ${B}6${R} complete"
        echo ""
        echo -e "${D}Requirements${R}"
        echo -e "${D}──────────────────────────────────────${R}"
        echo -e "  ${RED}●${R}  ${B}data_gap${R}       Missing auth protocol data"
        echo -e "  ${YEL}●${R}  ${B}monitor${R}        No regression watch on entity"
        echo -e "  ${YEL}●${R}  ${B}integration${R}    Shodan query not configured"
        ;;
      solve)
        echo -e "${B}Resolve Requirements${R}  ${D}inv_3f2a1b${R}"
        echo ""
        echo -e "${D}Requirement        Action               Status${R}"
        echo -e "${D}────────────────── ──────────────────── ────────${R}"
        echo -e "  data_gap         Add crawler keywords ${GRN}${B}✓ resolved${R}"
        echo -e "  monitor          Add regression watch ${GRN}${B}✓ resolved${R}"
        echo -e "  integration      Add Shodan query     ${GRN}${B}✓ resolved${R}"
        echo ""
        echo -e "  ${GRN}${B}3/3 resolved${R}  ${D}Ready for re-investigation${R}"
        ;;
      re-investigate)
        echo -e "${B}Re-Investigation${R}  ${D}inv_8c4d2e${R}"
        echo -e "  Lead  ${B}led_7f3a${R}  Meridian Trading"
        echo ""
        echo -e "${D}Service    Before  After   Δ${R}"
        echo -e "${D}────────── ─────── ─────── ─────${R}"
        echo -e "  secure   ${RED}72${R}      ${YEL}51${R}      ${GRN}${B}↓ 21${R}"
        echo -e "  network  ${YEL}58${R}      ${GRN}38${R}      ${GRN}${B}↓ 20${R}"
        echo -e "  causal   ${YEL}51${R}      ${GRN}34${R}      ${GRN}${B}↓ 17${R}"
        echo -e "  risk     ${YEL}64${R}      ${YEL}42${R}      ${GRN}${B}↓ 22${R}"
        echo -e "  graph    ${GRN}38${R}      ${GRN}24${R}      ${GRN}${B}↓ 14${R}"
        echo -e "  supply   ${YEL}49${R}      ${GRN}31${R}      ${GRN}${B}↓ 18${R}"
        echo ""
        echo -e "  Aggregate  ${YEL}56.8${R} → ${GRN}${B}37.4${R}  ${GRN}${B}↓ 19.4 (−34%)${R}"
        ;;
      rules)
        echo -e "${B}Prospect Rules${R}  ${D}5 active${R}"
        echo -e "${D}────────────────────────────────────────────${R}"
        echo -e "${D}ID   Priority  Category          Match${R}"
        echo -e "${D}──── ──────── ────────────────── ────────────${R}"
        echo -e "  1  ${RED}${B}P1${R}       Trade Execution    ${D}auth|bypass${R}"
        echo -e "  2  ${RED}${B}P1${R}       Settlement         ${D}settlement${R}"
        echo -e "  3  ${YEL}${B}P2${R}       Market Data        ${D}feed|stream${R}"
        echo -e "  4  ${YEL}${B}P2${R}       API Gateway        ${D}api|gateway${R}"
        echo -e "  5  ${CYN}P3${R}       General            ${D}.*${R}"
        ;;
      regressions)
        echo -e "${B}Regressions${R}  ${D}3 tracked${R}"
        echo -e "${D}────────────────────────────────────────────${R}"
        echo -e "${D}Dimension      Entity/Class      Count  Trend${R}"
        echo -e "${D}────────────── ───────────────── ────── ─────${R}"
        echo -e "  entity       Meridian Trading  ${RED}${B}4${R}      ${RED}↑${R}"
        echo -e "  vuln_class   auth_bypass       ${YEL}${B}3${R}      ${YEL}→${R}"
        echo -e "  vuln_class   api_exposure      ${YEL}${B}3${R}      ${GRN}↓${R}"
        ;;
      pipeline)
        echo -e "${B}Prospect Pipeline${R}  ${D}$(date +%Y-%m-%d)${R}"
        echo ""
        echo -e "  ${CYN}[crawl]${R} Scanning 6 sources..."
        sleep 0.3
        echo -e "  ${D}├${R} NVD:          847 advisories  → ${B}12${R} leads"
        echo -e "  ${D}├${R} OSV:          1,204 entries   → ${B}8${R} leads"
        echo -e "  ${D}├${R} GitHub Adv:   312 advisories  → ${B}6${R} leads"
        echo -e "  ${D}├${R} SEC EDGAR:    34 filings      → ${B}3${R} leads"
        echo -e "  ${D}├${R} Infra-scan:   8 domains       → ${B}5${R} findings"
        echo -e "  ${D}└${R} Shodan:       2,100 results   → ${B}4${R} leads"
        echo -e "  ${GRN}${B}✓${R} ${B}38${R} new leads  ${D}(18 vuln, 3 regulatory, 5 perf, 4 incident)${R}"
        echo ""
        echo -e "  ${CYN}[investigate]${R} Analyzing top 3 by score..."
        echo ""
        sleep 0.3
        echo -e "  ${RED}${B}●${R} Meridian Trading  ${D}CVE-2026-2847${R}  ${RED}CRITICAL${R}  ${D}vulnerability${R}"
        echo -e "    secure:${RED}72${R}  network:${YEL}58${R}  causal:${YEL}51${R}  risk:${YEL}64${R}  graph:${GRN}38${R}  supply:${YEL}49${R}"
        echo -e "    Aggregate: ${YEL}${B}56.8${R}  ${D}→ Outreach drafted${R}"
        echo ""
        sleep 0.3
        echo -e "  ${RED}${B}●${R} Apex Clearing     ${D}SEC-2026-8K-447${R}  ${RED}HIGH${R}  ${MAG}regulatory${R}"
        echo -e "    risk:${RED}71${R}  causal:${YEL}62${R}  supply:${YEL}55${R}  network:${YEL}44${R}  graph:${GRN}36${R}  secure:${GRN}28${R}"
        echo -e "    Aggregate: ${YEL}${B}61.2${R}  ${D}→ Outreach drafted${R}"
        echo ""
        sleep 0.3
        echo -e "  ${YEL}${B}●${R} CloudPrime CDN    ${D}INFRA-tls-1.1${R}  ${YEL}MEDIUM${R}  ${CYN}performance${R}"
        echo -e "    network:${YEL}68${R}  secure:${YEL}52${R}  risk:${YEL}41${R}  causal:${GRN}33${R}  supply:${GRN}29${R}  graph:${GRN}22${R}"
        echo -e "    Aggregate: ${GRN}${B}42.1${R}  ${D}→ Below threshold (50)${R}"
        echo ""
        echo -e "  ${CYN}[outreach]${R} ${B}2${R} drafts ready"
        echo -e "  ${D}Use 'haiphen prospect approve' to review and send.${R}"
        echo ""
        echo -e "${D}──────────────────────────────────────────────${R}"
        echo -e "  ${GRN}${B}✓${R} Pipeline complete: ${B}38${R} leads, ${B}3${R} investigated, ${B}2${R} outreach drafts"
        ;;
      targeted-pipeline)
        echo -e "${B}Targeted Pipeline${R}  ${D}Goldman Sachs (GS)${R}"
        echo ""
        echo -e "  ${CYN}[1/4]${R} Resolving target..."
        sleep 0.2
        echo -e "  Target: ${B}Goldman Sachs${R} (GS) [t-goldman-sachs]"
        echo ""
        echo -e "  ${CYN}[2/4]${R} Crawling 6 sources for Goldman Sachs..."
        sleep 0.3
        echo -e "  ${D}├${R} NVD:          3 advisories  → ${B}2${R} leads  ${D}(keyword: Goldman Sachs)${R}"
        echo -e "  ${D}├${R} SEC EDGAR:    8 filings      → ${B}3${R} leads  ${D}(CIK: 0000886982)${R}"
        echo -e "  ${D}├${R} Infra-scan:   3 domains      → ${B}2${R} findings  ${D}(gs.com, goldmansachs.com, marquee.gs.com)${R}"
        echo -e "  ${D}├${R} GitHub Adv:   12 advisories  → ${B}2${R} leads"
        echo -e "  ${D}├${R} OSV:          6 entries      → ${B}1${R} leads"
        echo -e "  ${D}└${R} Shodan:       41 results     → ${B}2${R} leads  ${D}(org:\"Goldman Sachs\")${R}"
        echo -e "  ${GRN}${B}✓${R} ${B}12${R} leads for Goldman Sachs  ${D}(4 vuln, 3 regulatory, 3 perf, 2 incident)${R}"
        echo ""
        echo -e "  ${CYN}[3/4]${R} Investigating top 5 leads..."
        echo ""
        sleep 0.3
        echo -e "  ${RED}${B}●${R} Goldman Sachs API  ${D}CVE-2026-3847${R}  ${RED}HIGH${R}  ${D}vulnerability${R}"
        echo -e "    ${RED}secure${R}:${RED}68${R}  ${MAG}network${R}:${YEL}54${R}  ${CYN}graph${R}:${GRN}42${R}  ${YEL}risk${R}:${YEL}61${R}  ${GRN}causal${R}:${YEL}48${R}  supply:${GRN}39${R}"
        echo -e "    Aggregate: ${YEL}${B}53.4${R}  ${D}→ Outreach drafted${R}"
        echo ""
        sleep 0.2
        echo -e "  ${MAG}${B}●${R} GS 8-K Filing     ${D}SEC-2026-8K-0886982-03${R}  ${YEL}MEDIUM${R}  ${MAG}regulatory${R}"
        echo -e "    ${YEL}risk${R}:${RED}71${R}  ${GRN}causal${R}:${YEL}62${R}  supply:${YEL}55${R}  ${MAG}network${R}:${YEL}44${R}  ${CYN}graph${R}:${GRN}36${R}  ${RED}secure${R}:${GRN}28${R}"
        echo -e "    Aggregate: ${YEL}${B}61.2${R}  ${D}→ Outreach drafted${R}"
        echo ""
        sleep 0.2
        echo -e "  ${CYN}${B}●${R} marquee.gs.com    ${D}INFRA-cert-expiry${R}  ${YEL}MEDIUM${R}  ${CYN}performance${R}"
        echo -e "    ${MAG}network${R}:${YEL}58${R}  ${RED}secure${R}:${YEL}46${R}  ${YEL}risk${R}:${GRN}38${R}  ${GRN}causal${R}:${GRN}31${R}  supply:${GRN}24${R}  ${CYN}graph${R}:${GRN}18${R}"
        echo -e "    Aggregate: ${GRN}${B}38.2${R}  ${D}→ Below threshold (50)${R}"
        echo ""
        echo -e "  ${CYN}[4/4]${R} ${B}2${R} outreach drafts ready"
        echo ""
        echo -e "${D}──────────────────────────────────────────────${R}"
        echo -e "  ${GRN}${B}✓${R} Targeted pipeline complete: ${B}12${R} leads, ${B}3${R} investigated, ${B}2${R} outreach"
        echo -e "  Generate report: ${CYN}haiphen prospect report \"Goldman Sachs\"${R}"
        ;;
      outreach)
        echo -e "${B}Outreach Drafts${R}  ${D}2 pending${R}"
        echo -e "${D}────────────────────────────────────────────${R}"
        echo -e "${D}ID         Entity                Type         Status${R}"
        echo -e "${D}────────── ───────────────────── ──────────── ─────────${R}"
        echo -e "${B}out_a1b2${R}   Meridian Trading      vulnerability ${YEL}pending${R}"
        echo -e "${B}out_c3d4${R}   Apex Clearing Corp    regulatory    ${YEL}pending${R}"
        echo -e "${D}────────────────────────────────────────────${R}"
        echo -e "  ${YEL}2 pending${R}  ${D}Use 'haiphen prospect approve <id>' to review${R}"
        ;;
      approve)
        echo -e "${B}Approve Outreach${R}  ${D}out_a1b2${R}"
        echo ""
        echo -e "  To:       ${B}infrastructure@meridiantrading.com${R}"
        echo -e "  Subject:  ${B}Infrastructure Advisory: Meridian Trading${R}"
        echo -e "  Signal:   ${RED}CVE-2026-2847${R}  ${D}(vulnerability)${R}"
        echo -e "  Score:    ${YEL}${B}56.8${R}"
        echo ""
        echo -e "  ${GRN}${B}✓${R} Approved and queued for delivery"
        ;;
      *)
        echo -e "${B}prospect${R} — Infrastructure intelligence pipeline"
        echo ""
        echo -e "${D}Usage:${R}  haiphen prospect [command]"
        echo ""
        echo -e "${B}Commands:${R}"
        echo -e "  pipeline        Run full crawl → investigate → outreach"
        echo -e "  list            Browse intelligence leads"
        echo -e "  investigate     Run 6-service analysis pipeline"
        echo -e "  investigation   View investigation details"
        echo -e "  solve           Auto-resolve requirements"
        echo -e "  re-investigate  Confirm risk reduction"
        echo -e "  outreach        View/manage outreach drafts"
        echo -e "  approve         Review and send outreach"
        echo -e "  rules           Manage matching rules"
        echo -e "  regressions     View regression trends"
        ;;
    esac
    ;;
  greet)
    echo ""
    echo -e "  ${B}${CYN}👋  Hey there!${R}"
    echo ""
    echo -e "  ${B}Welcome to Haiphen${R}"
    echo -e "  ${D}Trading Intelligence Platform${R}"
    echo ""
    ;;
  farewell)
    echo ""
    echo -e "  ${D}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}"
    echo ""
    echo -e "    ${B}Haiphen — API Everything${R}  ${RED}❤️${R}"
    echo ""
    echo -e "    ${D}haiphen.io${R}"
    echo ""
    echo -e "  ${D}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${R}"
    echo ""
    ;;
  brief)
    case "$2" in
      # ── Individual demo narrations ──
      prospect-list-intro)
        echo ""
        echo -e "  ${D}Crawlers pulled fresh CVE data overnight.${R}"
        echo -e "  ${YEL}${B}67% of breaches begin with a known vuln.${R}"
        echo -e "  ${CYN}${B}► Let's see what surfaced.${R}"
        echo ""
        ;;
      prospect-list-recap)
        echo ""
        echo -e "  ${B}4 leads found.${R} ${RED}${B}1 CRITICAL auth bypass.${R}"
        echo -e "  ${YEL}${B}Undetected → \$500M+ unauthorized trades.${R}"
        echo -e "  ${CYN}${B}► Next: run the investigation pipeline.${R}"
        echo ""
        ;;
      prospect-investigate-intro)
        echo ""
        echo -e "  ${D}Meridian Trading flagged${R} ${RED}${B}CRITICAL.${R}"
        echo -e "  ${D}Auth bypass in trade execution — regulatory${R}"
        echo -e "  ${YEL}${B}fines alone can exceed \$50M.${R}"
        echo -e "  ${CYN}${B}► Running 6-service analysis pipeline.${R}"
        echo ""
        ;;
      prospect-investigate-recap)
        echo ""
        echo -e "  ${YEL}${B}Aggregate score: 56.8${R} ${D}— moderate-high risk.${R}"
        echo -e "  ${D}A SOC team needs 3–6 months for this.${R}"
        echo -e "  ${B}Haiphen: 30 seconds. 3 gaps to close.${R}"
        echo ""
        ;;
      prospect-solve-intro)
        echo ""
        echo -e "  ${D}3 capability gaps stand between us and${R}"
        echo -e "  ${D}full coverage.${R} ${YEL}${B}Manual fix: 287 days avg.${R}"
        echo -e "  ${RED}${B}Mean breach cost: \$4.7M${R} ${D}(IBM 2025).${R}"
        echo -e "  ${CYN}${B}► Auto-resolving in one command.${R}"
        echo ""
        ;;
      prospect-solve-recap)
        echo ""
        echo -e "  ${GRN}${B}✓ 3/3 resolved in seconds.${R}"
        echo -e "  ${D}Crawlers expanded. Monitoring active.${R}"
        echo -e "  ${D}Shodan linked. Ready for re-assessment.${R}"
        echo ""
        ;;
      prospect-reinvestigate-intro)
        echo ""
        echo -e "  ${D}Did the fixes actually work?${R}"
        echo -e "  ${D}The board needs delta — not promises.${R}"
        echo -e "  ${CYN}${B}► Re-running full pipeline to quantify.${R}"
        echo ""
        ;;
      prospect-reinvestigate-recap)
        echo ""
        echo -e "  ${B}56.8 → 37.4${R} ${GRN}${B}— risk down 34%.${R}"
        echo -e "  ${D}Board-level incident → managed ticket.${R}"
        echo -e "  ${GRN}${B}✓ Detect → Investigate → Solve → Confirm.${R}"
        echo ""
        ;;
      prospect-pipeline-intro)
        echo ""
        echo -e "  ${B}Haiphen runs 6 crawlers every night.${R}"
        echo -e "  ${D}CVEs, SEC filings, TLS scans, outage feeds.${R}"
        echo -e "  ${YEL}${B}One command: crawl → diagnose → draft outreach.${R}"
        echo ""
        ;;
      prospect-pipeline-recap)
        echo ""
        echo -e "  ${B}38 leads. 3 investigated. 2 outreach drafts.${R}"
        echo -e "  ${D}Vulnerability + regulatory + performance signals.${R}"
        echo -e "  ${GRN}${B}✓ From raw intelligence to client advisory${R}"
        echo -e "  ${GRN}${B}  in one pipeline run. That's Haiphen.${R}"
        echo ""
        ;;
      targeted-intro)
        echo ""
        echo -e "  ${B}Targeted Intelligence: Goldman Sachs${R}"
        echo -e "  ${D}6 crawlers focused on one Fortune 500 company.${R}"
        echo -e "  ${D}CVEs in their stack. SEC filings. TLS posture.${R}"
        echo -e "  ${YEL}${B}Crawl → Investigate → Report → Outreach.${R}"
        echo ""
        ;;
      targeted-recap)
        echo ""
        echo -e "  ${B}12 leads. 4 investigated. LaTeX report generated.${R}"
        echo -e "  ${D}Each finding links to the Haiphen service that found it.${R}"
        echo -e "  ${GRN}${B}✓ Company-specific intelligence in one command.${R}"
        echo ""
        ;;
      # ── Usecase story narrations ──
      uc01-intro)
        echo ""
        echo -e "  ${B}Chapter 1: Discovery${R}"
        echo -e "  ${D}0800 UTC — A critical CVE just dropped.${R}"
        echo -e "  ${D}Your fintech stack is in the blast radius.${R}"
        echo -e "  ${YEL}${B}Every hour undetected: ~\$150K exposure.${R}"
        echo ""
        ;;
      uc01-recap)
        echo ""
        echo -e "  ${B}4 leads. Zero analyst hours.${R}"
        echo -e "  ${RED}${B}Meridian Trading: CRITICAL auth bypass.${R}"
        echo -e "  ${YEL}${B}The clock is ticking.${R}"
        echo ""
        ;;
      uc02-intro)
        echo ""
        echo -e "  ${B}Chapter 2: Investigation${R}"
        echo -e "  ${D}Auth bypass in trade execution.${R}"
        echo -e "  ${RED}${B}One exploited session → \$500M+ in trades.${R}"
        echo -e "  ${YEL}${B}Regulatory fines. Client churn. Job losses.${R}"
        echo ""
        ;;
      uc02-recap)
        echo ""
        echo -e "  ${YEL}${B}Score: 56.8 in 30 seconds.${R}"
        echo -e "  ${D}What a 10-person SOC discovers in weeks.${R}"
        echo -e "  ${B}But there are 3 gaps to close.${R}"
        echo ""
        ;;
      uc03-intro)
        echo ""
        echo -e "  ${B}Chapter 3: Requirements${R}"
        echo -e "  ${D}The investigation surfaced 3 blind spots.${R}"
        echo -e "  ${YEL}${B}67% of breaches exploit gaps you don't${R}"
        echo -e "  ${YEL}${B}know you have.${R} ${D}Dwell time: 204 days avg.${R}"
        echo ""
        ;;
      uc03-recap)
        echo ""
        echo -e "  ${RED}${B}Data gap. Missing monitors. No Shodan link.${R}"
        echo -e "  ${D}Each one: an open door for attackers.${R}"
        echo -e "  ${CYN}${B}One command away from closing them.${R}"
        echo ""
        ;;
      uc04-intro)
        echo ""
        echo -e "  ${B}Chapter 4: Resolution${R}"
        echo -e "  ${YEL}${B}Manual fix: 6–8 weeks, 3 FTEs, \$180K.${R}"
        echo -e "  ${D}SOC burnout drives 65% annual turnover.${R}"
        echo -e "  ${CYN}${B}► Or: one command.${R}"
        echo ""
        ;;
      uc04-recap)
        echo ""
        echo -e "  ${GRN}${B}✓ 3/3 closed. 4 seconds. One API call.${R}"
        echo -e "  ${D}From exposed to fully covered.${R}"
        echo -e "  ${B}Final chapter: prove it worked.${R}"
        echo ""
        ;;
      uc05-intro)
        echo ""
        echo -e "  ${B}Chapter 5: Confirmation${R}"
        echo -e "  ${D}The board asks: \"Are we safer?\"${R}"
        echo -e "  ${D}That needs a number, not a promise.${R}"
        echo -e "  ${CYN}${B}► Re-running to quantify the ROI.${R}"
        echo ""
        ;;
      uc05-recap)
        echo ""
        echo -e "  ${B}56.8 → 37.4.${R} ${GRN}${B}Risk reduced 34%.${R}"
        echo -e "  ${D}Detect → Investigate → Solve → Confirm.${R}"
        echo -e "  ${GRN}${B}✓ Minutes, not months. That's Haiphen.${R}"
        echo ""
        ;;
      *)
        echo "Error: unknown brief key \"$2\""
        exit 1
        ;;
    esac
    ;;
  serve)
    echo -e "${GRN}${B}✓${R} Gateway running on ${B}http://localhost:8787${R}"
    echo -e "  ${D}Proxying to api.haiphen.io${R}"
    ;;
  --help|-h|"")
    echo -e "${B}Haiphen${R} — Trading Intelligence CLI"
    echo ""
    echo -e "${D}Usage:${R}  haiphen [command]"
    echo ""
    echo -e "${B}Commands:${R}"
    echo -e "  login     Authenticate via browser"
    echo -e "  status    Auth + entitlement status"
    echo -e "  services  Check service health"
    echo -e "  secure    Security scanning"
    echo -e "  network   Protocol analysis"
    echo -e "  graph     Entity intelligence"
    echo -e "  risk      Portfolio risk"
    echo -e "  causal    Event chain analysis"
    echo -e "  supply    Counterparty monitoring"
    echo -e "  prospect  Vulnerability lead management"
    ;;
  *)
    echo "Error: unknown command \"$1\""
    echo "Run 'haiphen --help' for usage."
    exit 1
    ;;
esac
