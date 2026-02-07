/**
 * Haiphen Desktop - Trade Detail View
 *
 * Dedicated detail page for a single asset. Shows full-width historical
 * price chart, key OHLCV metrics, and related trading signals.
 * Navigated to from the Trades list or accessed directly via route.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDProgress from "components/MDProgress";
import MDAlert from "components/MDAlert";
import MDBadge from "components/MDBadge";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReportsLineChart from "examples/Charts/LineCharts/ReportsLineChart";

// Auth & API
import { useAuth } from "../../context/AuthContext";
import { fetchAssetDetail } from "../../api/services";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value) {
  if (value === null || value === undefined) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined) return "--";
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return "--";
  return new Intl.NumberFormat("en-US").format(value);
}

// Map signal type to MDBadge color
function signalColor(type) {
  const colorMap = {
    buy: "success",
    sell: "error",
    hold: "warning",
    alert: "info",
  };
  return colorMap[(type || "").toLowerCase()] || "dark";
}

// ---------------------------------------------------------------------------
// OHLCV Metric Row
// ---------------------------------------------------------------------------

const OHLCV_FIELDS = [
  { key: "open", label: "Open", format: formatCurrency },
  { key: "high", label: "High", format: formatCurrency },
  { key: "low", label: "Low", format: formatCurrency },
  { key: "close", label: "Close", format: formatCurrency },
  { key: "volume", label: "Volume", format: formatNumber },
];

// ---------------------------------------------------------------------------
// TradeDetail Component
// ---------------------------------------------------------------------------

function TradeDetail() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadDetail = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAssetDetail(assetId);
      // Support both envelope ({ ok, data }) and direct response shapes
      setDetail(data?.data ?? data);
    } catch (err) {
      setError(err.message || "Failed to load asset detail");
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDetail();
    }
  }, [isAuthenticated, loadDetail]);

  // -----------------------------------------------------------------------
  // Chart data
  // -----------------------------------------------------------------------

  const chartData = useMemo(() => {
    if (!detail?.history) {
      return { labels: [], datasets: { label: "Price", data: [] } };
    }
    return {
      labels: detail.history.labels || [],
      datasets: detail.history.datasets || { label: "Price", data: detail.history.data || [] },
    };
  }, [detail]);

  // -----------------------------------------------------------------------
  // Metrics from the API response
  // -----------------------------------------------------------------------

  const metrics = useMemo(() => {
    if (!detail?.metrics) return null;
    return detail.metrics;
  }, [detail]);

  const signals = useMemo(() => {
    if (!detail?.signals) return [];
    return detail.signals;
  }, [detail]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        {/* Back Button + Title */}
        <MDBox display="flex" alignItems="center" mb={3}>
          <MDButton
            variant="text"
            color="dark"
            onClick={() => navigate("/trades")}
            sx={{ mr: 2 }}
          >
            <Icon sx={{ mr: 0.5 }}>arrow_back</Icon>
            Back to Trades
          </MDButton>
        </MDBox>

        {/* Loading */}
        {loading && (
          <Card sx={{ p: 4 }}>
            <MDProgress color="info" />
          </Card>
        )}

        {/* Error */}
        {error && (
          <MDBox mb={3}>
            <MDAlert color="error" dismissible>
              <Icon sx={{ mr: 1 }}>warning</Icon>
              {error}
            </MDAlert>
          </MDBox>
        )}

        {/* Not authenticated */}
        {!isAuthenticated && !loading && (
          <Card sx={{ p: 4, textAlign: "center" }}>
            <Icon sx={{ fontSize: "3rem !important", mb: 2, color: "#90a4ae" }}>lock</Icon>
            <MDTypography variant="h5" color="text">
              Authentication Required
            </MDTypography>
            <MDTypography variant="body2" color="text" mt={1}>
              Sign in to view asset details.
            </MDTypography>
          </Card>
        )}

        {/* Detail content */}
        {!loading && !error && detail && (
          <>
            {/* Asset Header */}
            <Card sx={{ mb: 3 }}>
              <MDBox p={3}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={6}>
                    <MDTypography variant="h4" fontWeight="medium">
                      {detail.name || `Asset ${assetId}`}
                    </MDTypography>
                    {detail.symbol && (
                      <MDTypography variant="button" color="text" fontWeight="regular">
                        {detail.symbol}
                      </MDTypography>
                    )}
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <MDBox display="flex" justifyContent={{ xs: "flex-start", md: "flex-end" }} gap={3}>
                      <MDBox>
                        <MDTypography variant="caption" color="text" fontWeight="bold" textTransform="uppercase">
                          Value
                        </MDTypography>
                        <MDTypography variant="h5">{formatCurrency(detail.value)}</MDTypography>
                      </MDBox>
                      <MDBox>
                        <MDTypography variant="caption" color="text" fontWeight="bold" textTransform="uppercase">
                          Change
                        </MDTypography>
                        <MDTypography
                          variant="h5"
                          color={(detail.changePercent || 0) >= 0 ? "success" : "error"}
                        >
                          {formatPercent(detail.changePercent)}
                        </MDTypography>
                      </MDBox>
                      <MDBox>
                        <MDTypography variant="caption" color="text" fontWeight="bold" textTransform="uppercase">
                          Allocation
                        </MDTypography>
                        <MDTypography variant="h5">
                          {detail.allocation != null ? `${detail.allocation}%` : "--"}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                  </Grid>
                </Grid>
              </MDBox>
            </Card>

            {/* Full-width Historical Chart */}
            {chartData.labels.length > 0 && (
              <MDBox mb={3}>
                <ReportsLineChart
                  color="dark"
                  title={`${detail.name || "Asset"} - Price History`}
                  description={
                    <>
                      Historical price data for <strong>{detail.name || assetId}</strong>
                    </>
                  }
                  date="updated just now"
                  chart={chartData}
                />
              </MDBox>
            )}

            {/* Bottom Row: OHLCV Metrics + Signals */}
            <Grid container spacing={3}>
              {/* Key Metrics (OHLCV) */}
              <Grid item xs={12} lg={6}>
                <Card sx={{ height: "100%" }}>
                  <MDBox p={3}>
                    <MDTypography variant="h6" fontWeight="medium" mb={2}>
                      Key Metrics
                    </MDTypography>
                    <Divider />
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>
                              <MDTypography variant="caption" fontWeight="bold" textTransform="uppercase">
                                Metric
                              </MDTypography>
                            </TableCell>
                            <TableCell align="right">
                              <MDTypography variant="caption" fontWeight="bold" textTransform="uppercase">
                                Value
                              </MDTypography>
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {OHLCV_FIELDS.map(({ key, label, format }) => (
                            <TableRow key={key}>
                              <TableCell>
                                <MDTypography variant="button" fontWeight="medium">
                                  {label}
                                </MDTypography>
                              </TableCell>
                              <TableCell align="right">
                                <MDTypography variant="button" color="text">
                                  {metrics ? format(metrics[key]) : "--"}
                                </MDTypography>
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Extra metrics from the API beyond OHLCV */}
                          {metrics &&
                            Object.entries(metrics)
                              .filter(([k]) => !OHLCV_FIELDS.some((f) => f.key === k))
                              .map(([key, val]) => (
                                <TableRow key={key}>
                                  <TableCell>
                                    <MDTypography variant="button" fontWeight="medium" textTransform="capitalize">
                                      {key.replace(/_/g, " ")}
                                    </MDTypography>
                                  </TableCell>
                                  <TableCell align="right">
                                    <MDTypography variant="button" color="text">
                                      {typeof val === "number" ? val.toLocaleString() : String(val)}
                                    </MDTypography>
                                  </TableCell>
                                </TableRow>
                              ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </MDBox>
                </Card>
              </Grid>

              {/* Related Signals */}
              <Grid item xs={12} lg={6}>
                <Card sx={{ height: "100%" }}>
                  <MDBox p={3}>
                    <MDTypography variant="h6" fontWeight="medium" mb={2}>
                      Related Signals
                    </MDTypography>
                    <Divider />
                    {signals.length === 0 ? (
                      <MDBox py={3} textAlign="center">
                        <Icon sx={{ fontSize: "2rem !important", mb: 1, color: "#90a4ae" }}>
                          notifications_none
                        </Icon>
                        <MDTypography variant="button" color="text">
                          No signals for this asset.
                        </MDTypography>
                      </MDBox>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>
                                <MDTypography variant="caption" fontWeight="bold" textTransform="uppercase">
                                  Signal
                                </MDTypography>
                              </TableCell>
                              <TableCell>
                                <MDTypography variant="caption" fontWeight="bold" textTransform="uppercase">
                                  Type
                                </MDTypography>
                              </TableCell>
                              <TableCell>
                                <MDTypography variant="caption" fontWeight="bold" textTransform="uppercase">
                                  Confidence
                                </MDTypography>
                              </TableCell>
                              <TableCell>
                                <MDTypography variant="caption" fontWeight="bold" textTransform="uppercase">
                                  Time
                                </MDTypography>
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {signals.map((signal, idx) => (
                              <TableRow key={signal.id || idx}>
                                <TableCell>
                                  <MDTypography variant="button" fontWeight="medium">
                                    {signal.name || signal.description || `Signal ${idx + 1}`}
                                  </MDTypography>
                                </TableCell>
                                <TableCell>
                                  <MDBadge
                                    badgeContent={signal.type || "unknown"}
                                    color={signalColor(signal.type)}
                                    variant="gradient"
                                    size="sm"
                                    container
                                  />
                                </TableCell>
                                <TableCell>
                                  <MDBox display="flex" alignItems="center">
                                    <MDBox width="60px" mr={1}>
                                      <MDProgress
                                        variant="gradient"
                                        color={signalColor(signal.type)}
                                        value={signal.confidence || 0}
                                      />
                                    </MDBox>
                                    <MDTypography variant="caption" color="text">
                                      {signal.confidence != null ? `${signal.confidence}%` : "--"}
                                    </MDTypography>
                                  </MDBox>
                                </TableCell>
                                <TableCell>
                                  <MDTypography variant="caption" color="text">
                                    {signal.time ? new Date(signal.time).toLocaleString() : "--"}
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
              </Grid>
            </Grid>
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

export default TradeDetail;
