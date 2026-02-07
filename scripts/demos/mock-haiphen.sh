#!/usr/bin/env bash
# Mock haiphen CLI for VHS demo recordings.
# Place on PATH before the real binary so VHS captures clean output.

case "$1" in
  login)
    echo "✅ Logged in. Token expires at: 2026-02-08T00:22:33Z"
    ;;
  logout)
    echo "✅ Logged out."
    ;;
  status)
    cat <<'EOF'
LoggedIn: true
User: demo-user (demo@haiphen.io)
Entitled: true
EntitledUntil: 2027-02-07T00:00:00Z
EOF
    ;;
  services)
    cat <<'EOF'
Haiphen Platform Status
--------------------------------------------------
  api         OK      42ms  https://api.haiphen.io
  secure      OK      38ms  https://secure.haiphen.io
  network     OK      45ms  https://network.haiphen.io
  graph       OK      41ms  https://graph.haiphen.io
  risk        OK      39ms  https://risk.haiphen.io
  causal      OK      44ms  https://causal.haiphen.io
  supply      OK      40ms  https://supply.haiphen.io
EOF
    ;;
  secure)
    case "$2" in
      scan)
        cat <<'EOF'
{
  "scan_id": "scn_7f3a2b1c",
  "target": "edge-gw-prod",
  "type": "vulnerability",
  "status": "completed",
  "findings": [
    {"severity": "high", "title": "TLS 1.1 Deprecated", "cve": "CVE-2024-0001"},
    {"severity": "medium", "title": "Open SNMP Community String", "cve": "CVE-2024-0042"},
    {"severity": "low", "title": "NTP Sync Drift > 500ms"}
  ],
  "summary": {"high": 1, "medium": 1, "low": 1, "total": 3}
}
EOF
        ;;
      *)
        cat <<'EOF'
{
  "service": "secure",
  "status": "operational",
  "version": "1.4.0"
}
EOF
        ;;
    esac
    ;;
  network)
    case "$2" in
      trace)
        cat <<'EOF'
{
  "trace_id": "trc_a9c4e2d1",
  "target": "plc-gateway-01",
  "protocol": "modbus",
  "packets_captured": 1247,
  "duration_ms": 5023,
  "anomalies": [
    {"type": "unexpected_function_code", "code": 43, "count": 3},
    {"type": "timing_deviation", "avg_ms": 142, "threshold_ms": 100}
  ]
}
EOF
        ;;
      *)
        cat <<'EOF'
{
  "service": "network",
  "status": "operational",
  "protocols": ["modbus", "opcua", "mqtt", "bacnet"]
}
EOF
        ;;
    esac
    ;;
  graph)
    case "$2" in
      query)
        cat <<'EOF'
{
  "query": "supplier risk for semiconductors",
  "depth": 2,
  "entities": [
    {"name": "TSMC", "type": "supplier", "relevance": 0.94, "risk_score": 0.31},
    {"name": "ASML", "type": "supplier", "relevance": 0.79, "risk_score": 0.18},
    {"name": "Samsung Foundry", "type": "supplier", "relevance": 0.72, "risk_score": 0.44}
  ],
  "edges": 7,
  "total_nodes": 3
}
EOF
        ;;
      *)
        cat <<'EOF'
{
  "service": "graph",
  "status": "operational",
  "entities_count": 48210
}
EOF
        ;;
    esac
    ;;
  risk)
    case "$2" in
      assess)
        cat <<'EOF'
{
  "assessment_id": "rsk_b2d4f1e3",
  "scenario": "rate_hike_300bp",
  "var_95": -0.0423,
  "cvar_95": -0.0591,
  "expected_shortfall": -0.0648,
  "monte_carlo_iterations": 10000,
  "confidence": 0.95,
  "horizon_days": 30
}
EOF
        ;;
      *)
        cat <<'EOF'
{
  "service": "risk",
  "status": "operational",
  "models": ["var", "cvar", "monte_carlo", "stress_test"]
}
EOF
        ;;
    esac
    ;;
  causal)
    case "$2" in
      analyze)
        cat <<'EOF'
{
  "analysis_id": "csl_e5a1c3d7",
  "root_cause": "firmware_update_v2.3.1",
  "confidence": 0.87,
  "chain": [
    {"event": "firmware_update_v2.3.1", "timestamp": "2026-02-06T14:00:00Z"},
    {"event": "modbus_timeout_spike", "timestamp": "2026-02-06T14:02:33Z"},
    {"event": "plc_watchdog_reset", "timestamp": "2026-02-06T14:03:01Z"},
    {"event": "production_halt_line_3", "timestamp": "2026-02-06T14:03:45Z"}
  ],
  "impact_score": 0.73
}
EOF
        ;;
      *)
        cat <<'EOF'
{
  "service": "causal",
  "status": "operational"
}
EOF
        ;;
    esac
    ;;
  supply)
    case "$2" in
      assess)
        cat <<'EOF'
{
  "assessment_id": "sup_c7f2d4a1",
  "supplier": "Acme Industrial",
  "overall_risk": 0.42,
  "dimensions": {
    "financial_stability": 0.28,
    "geopolitical_risk": 0.55,
    "delivery_reliability": 0.31,
    "quality_history": 0.22,
    "concentration_risk": 0.74
  },
  "recommendation": "monitor",
  "alternatives_count": 3
}
EOF
        ;;
      *)
        cat <<'EOF'
{
  "service": "supply",
  "status": "operational",
  "tracked_suppliers": 142
}
EOF
        ;;
    esac
    ;;
  --help|-h|"")
    cat <<'EOF'
Haiphen local gateway + CLI

Usage:
  haiphen [command]

Available Commands:
  serve       Run the local Haiphen gateway
  login       Login via browser and store session locally
  logout      Clear local session
  status      Show auth + entitlement status
  services    Check health of all Haiphen services
  secure      Edge security scanning commands
  network     Network trace and protocol analysis
  graph       Knowledge graph queries
  risk        Risk analysis and assessment
  causal      Causal chain analysis
  supply      Supply chain intelligence

Flags:
  --auth-origin   Auth origin (default: https://auth.haiphen.io)
  --api-origin    API origin (default: https://api.haiphen.io)
  --port          Local gateway port (default: 8787)
  --profile       Profile name (default: default)
  -h, --help      help for haiphen
EOF
    ;;
  *)
    echo "Error: unknown command \"$1\" for \"haiphen\""
    echo "Run 'haiphen --help' for usage."
    exit 1
    ;;
esac
