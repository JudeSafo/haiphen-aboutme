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
    ;;
  *)
    echo "Error: unknown command \"$1\""
    echo "Run 'haiphen --help' for usage."
    exit 1
    ;;
esac
