/**
 * Haiphen Desktop - Trading Dashboard
 *
 * Main dashboard view showing portfolio KPIs, PnL/signal charts,
 * recent trades table, and portfolio composition doughnut chart.
 */

import { useState, useEffect, useCallback } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDProgress from "components/MDProgress";
import MDAlert from "components/MDAlert";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReportsLineChart from "examples/Charts/LineCharts/ReportsLineChart";
import ReportsBarChart from "examples/Charts/BarCharts/ReportsBarChart";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import DefaultDoughnutChart from "examples/Charts/DoughnutCharts/DefaultDoughnutChart";

// Auth & API
import { useAuth } from "../../context/AuthContext";
import { fetchKPIs, fetchSeries, fetchPortfolioAssets, fetchRecentTrades } from "../../api/services";

// ---------------------------------------------------------------------------
// Placeholder data used while the API loads or when unreachable
// ---------------------------------------------------------------------------

const EMPTY_KPI = {
  portfolioValue: "--",
  dailyPnl: "--",
  winRate: "--",
  activeSignals: "--",
  portfolioChange: { amount: "", label: "Loading..." },
  pnlChange: { amount: "", label: "Loading..." },
  winRateChange: { amount: "", label: "Loading..." },
  signalsChange: { amount: "", label: "Loading..." },
};

const EMPTY_LINE_CHART = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  datasets: { label: "PnL", data: [0, 0, 0, 0, 0, 0, 0] },
};

const EMPTY_BAR_CHART = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  datasets: { label: "Signals", data: [0, 0, 0, 0, 0, 0, 0] },
};

const EMPTY_DOUGHNUT = {
  labels: ["No Data"],
  datasets: { label: "Allocation", data: [1], backgroundColors: ["dark"] },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value) {
  if (value === "--" || value === null || value === undefined) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPnl(value) {
  if (value === "--" || value === null || value === undefined) return "--";
  const prefix = value >= 0 ? "+$" : "-$";
  return `${prefix}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function pnlColor(value) {
  if (value === "--" || value === null || value === undefined) return "text";
  return value >= 0 ? "success" : "error";
}

// ---------------------------------------------------------------------------
// Dashboard Component
// ---------------------------------------------------------------------------

function Dashboard() {
  const { isAuthenticated } = useAuth();

  // KPI state
  const [kpis, setKpis] = useState(EMPTY_KPI);
  const [kpiLoading, setKpiLoading] = useState(true);

  // Chart state
  const [pnlChart, setPnlChart] = useState(EMPTY_LINE_CHART);
  const [signalChart, setSignalChart] = useState(EMPTY_BAR_CHART);
  const [chartsLoading, setChartsLoading] = useState(true);

  // Recent trades state
  const [trades, setTrades] = useState([]);
  const [tradesLoading, setTradesLoading] = useState(true);

  // Portfolio composition state
  const [composition, setComposition] = useState(EMPTY_DOUGHNUT);

  // Error state
  const [error, setError] = useState(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const loadKPIs = useCallback(async () => {
    setKpiLoading(true);
    try {
      const data = await fetchKPIs();
      setKpis({
        portfolioValue: data.portfolioValue ?? "--",
        dailyPnl: data.dailyPnl ?? "--",
        winRate: data.winRate != null ? `${data.winRate}%` : "--",
        activeSignals: data.activeSignals ?? "--",
        portfolioChange: {
          color: (data.portfolioChangePct ?? 0) >= 0 ? "success" : "error",
          amount: data.portfolioChangePct != null ? `${data.portfolioChangePct >= 0 ? "+" : ""}${data.portfolioChangePct}%` : "",
          label: "vs previous period",
        },
        pnlChange: {
          color: (data.dailyPnl ?? 0) >= 0 ? "success" : "error",
          amount: data.pnlChangePct != null ? `${data.pnlChangePct >= 0 ? "+" : ""}${data.pnlChangePct}%` : "",
          label: "vs yesterday",
        },
        winRateChange: {
          color: (data.winRateChange ?? 0) >= 0 ? "success" : "error",
          amount: data.winRateChange != null ? `${data.winRateChange >= 0 ? "+" : ""}${data.winRateChange}%` : "",
          label: "vs last week",
        },
        signalsChange: {
          color: "info",
          amount: "",
          label: "active now",
        },
      });
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load KPIs");
      setKpis(EMPTY_KPI);
    } finally {
      setKpiLoading(false);
    }
  }, []);

  const loadCharts = useCallback(async () => {
    setChartsLoading(true);
    try {
      const [pnlData, signalData] = await Promise.all([
        fetchSeries("pnl", "7d"),
        fetchSeries("signals", "7d"),
      ]);

      setPnlChart({
        labels: pnlData.labels || EMPTY_LINE_CHART.labels,
        datasets: pnlData.datasets || EMPTY_LINE_CHART.datasets,
      });

      setSignalChart({
        labels: signalData.labels || EMPTY_BAR_CHART.labels,
        datasets: signalData.datasets || EMPTY_BAR_CHART.datasets,
      });
    } catch {
      setPnlChart(EMPTY_LINE_CHART);
      setSignalChart(EMPTY_BAR_CHART);
    } finally {
      setChartsLoading(false);
    }
  }, []);

  const loadTrades = useCallback(async () => {
    setTradesLoading(true);
    try {
      const data = await fetchRecentTrades(10);
      setTrades(data.trades || []);
    } catch {
      setTrades([]);
    } finally {
      setTradesLoading(false);
    }
  }, []);

  const loadComposition = useCallback(async () => {
    try {
      const data = await fetchPortfolioAssets();
      const assets = data.assets || [];
      if (assets.length > 0) {
        const colorPalette = ["info", "success", "warning", "error", "primary", "secondary", "dark"];
        setComposition({
          labels: assets.map((a) => a.name),
          datasets: {
            label: "Allocation",
            data: assets.map((a) => a.allocation || 0),
            backgroundColors: assets.map((_, i) => colorPalette[i % colorPalette.length]),
          },
          cutout: 60,
        });
      }
    } catch {
      setComposition(EMPTY_DOUGHNUT);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadKPIs();
      loadCharts();
      loadTrades();
      loadComposition();
    }
  }, [isAuthenticated, loadKPIs, loadCharts, loadTrades, loadComposition]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderNotConnected = () => (
    <MDBox py={6} textAlign="center">
      <Icon sx={{ fontSize: "3rem !important", mb: 2, color: "#90a4ae" }}>cloud_off</Icon>
      <MDTypography variant="h5" color="text" fontWeight="medium">
        Connect to API
      </MDTypography>
      <MDTypography variant="body2" color="text" mt={1}>
        Sign in to load your trading dashboard data.
      </MDTypography>
    </MDBox>
  );

  const renderTradesTable = () => (
    <Card>
      <MDBox display="flex" justifyContent="space-between" alignItems="center" p={3}>
        <MDBox>
          <MDTypography variant="h6" gutterBottom>
            Recent Trades
          </MDTypography>
          <MDTypography variant="button" color="text" fontWeight="regular">
            Last 10 executed trades
          </MDTypography>
        </MDBox>
        <Icon sx={{ color: "#90a4ae" }}>receipt_long</Icon>
      </MDBox>
      <MDBox>
        {tradesLoading ? (
          <MDBox px={3} pb={3}>
            <MDProgress color="info" />
          </MDBox>
        ) : trades.length === 0 ? (
          <MDBox px={3} pb={3}>
            <MDTypography variant="button" color="text" fontWeight="regular">
              No recent trades found.
            </MDTypography>
          </MDBox>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {["Asset", "Side", "Price", "Qty", "PnL", "Time"].map((header) => (
                    <TableCell key={header}>
                      <MDTypography variant="caption" fontWeight="bold" color="text" textTransform="uppercase">
                        {header}
                      </MDTypography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {trades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell>
                      <MDTypography variant="button" fontWeight="medium">
                        {trade.asset}
                      </MDTypography>
                    </TableCell>
                    <TableCell>
                      <MDTypography
                        variant="caption"
                        fontWeight="bold"
                        color={trade.side === "BUY" ? "success" : "error"}
                      >
                        {trade.side}
                      </MDTypography>
                    </TableCell>
                    <TableCell>
                      <MDTypography variant="button" color="text">
                        {formatCurrency(trade.price)}
                      </MDTypography>
                    </TableCell>
                    <TableCell>
                      <MDTypography variant="button" color="text">
                        {trade.quantity}
                      </MDTypography>
                    </TableCell>
                    <TableCell>
                      <MDTypography variant="button" color={pnlColor(trade.pnl)} fontWeight="medium">
                        {formatPnl(trade.pnl)}
                      </MDTypography>
                    </TableCell>
                    <TableCell>
                      <MDTypography variant="caption" color="text">
                        {trade.time ? new Date(trade.time).toLocaleString() : "--"}
                      </MDTypography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </MDBox>
    </Card>
  );

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        {/* Error banner */}
        {error && (
          <MDBox mb={3}>
            <MDAlert color="error" dismissible>
              <Icon sx={{ mr: 1 }}>warning</Icon>
              {error}
            </MDAlert>
          </MDBox>
        )}

        {/* Unauthenticated fallback */}
        {!isAuthenticated && renderNotConnected()}

        {/* Authenticated dashboard content */}
        {isAuthenticated && (
          <>
            {/* ---- Top Row: KPI Cards ---- */}
            <Grid container spacing={3}>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  {kpiLoading ? (
                    <Card sx={{ p: 2 }}>
                      <MDProgress color="info" />
                    </Card>
                  ) : (
                    <ComplexStatisticsCard
                      color="dark"
                      icon="account_balance_wallet"
                      title="Portfolio Value"
                      count={formatCurrency(kpis.portfolioValue)}
                      percentage={kpis.portfolioChange}
                    />
                  )}
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  {kpiLoading ? (
                    <Card sx={{ p: 2 }}>
                      <MDProgress color="info" />
                    </Card>
                  ) : (
                    <ComplexStatisticsCard
                      color={kpis.dailyPnl !== "--" && kpis.dailyPnl >= 0 ? "success" : "error"}
                      icon="trending_up"
                      title="Daily PnL"
                      count={formatPnl(kpis.dailyPnl)}
                      percentage={kpis.pnlChange}
                    />
                  )}
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  {kpiLoading ? (
                    <Card sx={{ p: 2 }}>
                      <MDProgress color="info" />
                    </Card>
                  ) : (
                    <ComplexStatisticsCard
                      color="info"
                      icon="percent"
                      title="Win Rate"
                      count={kpis.winRate}
                      percentage={kpis.winRateChange}
                    />
                  )}
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  {kpiLoading ? (
                    <Card sx={{ p: 2 }}>
                      <MDProgress color="info" />
                    </Card>
                  ) : (
                    <ComplexStatisticsCard
                      color="primary"
                      icon="notifications_active"
                      title="Active Signals"
                      count={kpis.activeSignals}
                      percentage={kpis.signalsChange}
                    />
                  )}
                </MDBox>
              </Grid>
            </Grid>

            {/* ---- Charts Row ---- */}
            <MDBox mt={4.5}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <MDBox mb={3}>
                    {chartsLoading ? (
                      <Card sx={{ p: 4, height: "22rem" }}>
                        <MDTypography variant="h6" color="text" mb={2}>
                          Daily PnL
                        </MDTypography>
                        <MDProgress color="info" />
                      </Card>
                    ) : (
                      <ReportsLineChart
                        color="success"
                        title="Daily PnL"
                        description={
                          <>
                            Profit &amp; loss over the last <strong>7 days</strong>
                          </>
                        }
                        date="updated just now"
                        chart={pnlChart}
                      />
                    )}
                  </MDBox>
                </Grid>
                <Grid item xs={12} md={6}>
                  <MDBox mb={3}>
                    {chartsLoading ? (
                      <Card sx={{ p: 4, height: "22rem" }}>
                        <MDTypography variant="h6" color="text" mb={2}>
                          Signal Activity
                        </MDTypography>
                        <MDProgress color="info" />
                      </Card>
                    ) : (
                      <ReportsBarChart
                        color="info"
                        title="Signal Activity"
                        description="Signals generated per day"
                        date="last 7 days"
                        chart={signalChart}
                      />
                    )}
                  </MDBox>
                </Grid>
              </Grid>
            </MDBox>

            {/* ---- Bottom Row: Trades + Composition ---- */}
            <MDBox mt={2}>
              <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                  {renderTradesTable()}
                </Grid>
                <Grid item xs={12} lg={4}>
                  <Card sx={{ height: "100%" }}>
                    <MDBox pt={3} px={3}>
                      <MDTypography variant="h6" gutterBottom>
                        Portfolio Composition
                      </MDTypography>
                      <MDTypography variant="button" color="text" fontWeight="regular">
                        Allocation by asset
                      </MDTypography>
                    </MDBox>
                    <MDBox p={2}>
                      <DefaultDoughnutChart
                        chart={composition}
                        height="16rem"
                      />
                    </MDBox>
                  </Card>
                </Grid>
              </Grid>
            </MDBox>
          </>
        )}
      </MDBox>
      <Footer
        company={{ href: "https://haiphen.io", name: "Haiphen" }}
        links={[
          { href: "https://haiphen.io", name: "Home" },
          { href: "https://haiphen.io/about.html", name: "About" },
          { href: "https://haiphen.io/docs.html", name: "Docs" },
        ]}
      />
    </DashboardLayout>
  );
}

export default Dashboard;
