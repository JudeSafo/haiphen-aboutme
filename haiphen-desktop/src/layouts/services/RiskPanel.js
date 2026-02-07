/**
 * RiskPanel - Monte Carlo VaR and stress testing form with results display.
 *
 * Input: dynamic portfolio assets, confidence level, simulations, horizon.
 * Output: VaR, CVaR, max drawdown, Sharpe ratio, stress tests, risk level.
 */

import { useState } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Slider from "@mui/material/Slider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDBadge from "components/MDBadge";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

// API
import { runRiskAssessment } from "../../api/services";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_ASSET = { name: "", current_value: "", expected_return: "", volatility: "" };

function riskLevelColor(level) {
  const map = {
    critical: "error",
    high: "warning",
    medium: "info",
    low: "success",
    minimal: "success",
  };
  return map[level?.toLowerCase()] || "dark";
}

function formatCurrency(val) {
  if (val == null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function formatPct(val) {
  if (val == null) return "N/A";
  return `${(val * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function RiskPanel() {
  // Portfolio assets
  const [assets, setAssets] = useState([{ ...EMPTY_ASSET }]);
  const [confidence, setConfidence] = useState(95);
  const [simulations, setSimulations] = useState(1000);
  const [horizon, setHorizon] = useState(21);

  // Result state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const updateAsset = (index, field, value) => {
    setAssets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addAsset = () => {
    setAssets((prev) => [...prev, { ...EMPTY_ASSET }]);
  };

  const removeAsset = (index) => {
    setAssets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    const parsedAssets = assets.map((a) => ({
      name: a.name,
      current_value: parseFloat(a.current_value) || 0,
      expected_return: parseFloat(a.expected_return) || 0,
      volatility: parseFloat(a.volatility) || 0,
    }));

    const hasValid = parsedAssets.some((a) => a.name && a.current_value > 0);
    if (!hasValid) {
      setError("Add at least one asset with a name and positive current value.");
      setLoading(false);
      return;
    }

    try {
      const res = await runRiskAssessment({
        assets: parsedAssets,
        confidence_level: confidence / 100,
        simulations: Math.min(Math.max(simulations, 100), 10000),
        horizon_days: horizon,
      });
      if (!res.ok) throw new Error(res.error || "Assessment failed");
      setResults(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        {/* Header */}
        <MDBox display="flex" alignItems="center" mb={3}>
          <MDBox
            display="flex"
            justifyContent="center"
            alignItems="center"
            width="3rem"
            height="3rem"
            borderRadius="lg"
            variant="gradient"
            bgColor="info"
            color="white"
            shadow="md"
            mr={2}
          >
            <Icon fontSize="medium">assessment</Icon>
          </MDBox>
          <MDBox>
            <MDTypography variant="h4" fontWeight="medium">
              Risk Analysis
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Monte Carlo VaR &amp; stress testing
            </MDTypography>
          </MDBox>
        </MDBox>

        <Grid container spacing={3}>
          {/* ---- Input Form ---- */}
          <Grid item xs={12} lg={5}>
            <Card>
              <MDBox
                mx={2}
                mt={-3}
                py={2}
                px={2}
                variant="gradient"
                bgColor="info"
                borderRadius="lg"
                coloredShadow="info"
              >
                <MDTypography variant="h6" color="white">
                  Portfolio Configuration
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                {/* Dynamic asset rows */}
                {assets.map((asset, idx) => (
                  <MDBox
                    key={idx}
                    mb={2}
                    p={2}
                    borderRadius="lg"
                    sx={{ border: "1px solid", borderColor: "grey.300" }}
                  >
                    <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <MDTypography variant="caption" fontWeight="bold">
                        Asset {idx + 1}
                      </MDTypography>
                      {assets.length > 1 && (
                        <IconButton size="small" onClick={() => removeAsset(idx)}>
                          <Icon fontSize="small" color="error">
                            close
                          </Icon>
                        </IconButton>
                      )}
                    </MDBox>
                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <MDInput
                          label="Name"
                          size="small"
                          fullWidth
                          value={asset.name}
                          onChange={(e) => updateAsset(idx, "name", e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <MDInput
                          label="Current Value ($)"
                          size="small"
                          fullWidth
                          type="number"
                          value={asset.current_value}
                          onChange={(e) => updateAsset(idx, "current_value", e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <MDInput
                          label="Expected Return"
                          size="small"
                          fullWidth
                          type="number"
                          value={asset.expected_return}
                          onChange={(e) => updateAsset(idx, "expected_return", e.target.value)}
                          placeholder="e.g. 0.08"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <MDInput
                          label="Volatility"
                          size="small"
                          fullWidth
                          type="number"
                          value={asset.volatility}
                          onChange={(e) => updateAsset(idx, "volatility", e.target.value)}
                          placeholder="e.g. 0.20"
                        />
                      </Grid>
                    </Grid>
                  </MDBox>
                ))}

                <MDButton variant="outlined" color="info" size="small" onClick={addAsset} fullWidth>
                  <Icon sx={{ mr: 0.5 }}>add</Icon>
                  Add Asset
                </MDButton>

                {/* Simulation Parameters */}
                <MDBox mt={3} mb={2}>
                  <MDTypography variant="caption" fontWeight="bold" mb={1}>
                    Confidence Level: {confidence}%
                  </MDTypography>
                  <Slider
                    value={confidence}
                    onChange={(_, val) => setConfidence(val)}
                    min={90}
                    max={99}
                    step={1}
                    marks={[
                      { value: 90, label: "90%" },
                      { value: 95, label: "95%" },
                      { value: 99, label: "99%" },
                    ]}
                    valueLabelDisplay="auto"
                    size="small"
                  />
                </MDBox>
                <Grid container spacing={2} mb={3}>
                  <Grid item xs={6}>
                    <MDInput
                      label="Simulations"
                      fullWidth
                      type="number"
                      value={simulations}
                      onChange={(e) =>
                        setSimulations(
                          Math.min(Math.max(parseInt(e.target.value, 10) || 100, 100), 10000)
                        )
                      }
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <MDInput
                      label="Horizon (days)"
                      fullWidth
                      type="number"
                      value={horizon}
                      onChange={(e) => setHorizon(parseInt(e.target.value, 10) || 1)}
                    />
                  </Grid>
                </Grid>

                <MDButton
                  variant="gradient"
                  color="info"
                  fullWidth
                  onClick={handleRun}
                  disabled={loading}
                >
                  {loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <>
                      <Icon sx={{ mr: 0.5 }}>play_arrow</Icon>
                      Run Assessment
                    </>
                  )}
                </MDButton>
                {error && (
                  <MDBox mt={2}>
                    <MDTypography variant="caption" color="error">
                      {error}
                    </MDTypography>
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </Grid>

          {/* ---- Results Display ---- */}
          <Grid item xs={12} lg={7}>
            {results ? (
              <Grid container spacing={3}>
                {/* Key Metrics + Risk Level */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3}>
                      <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <MDTypography variant="h6" fontWeight="medium">
                          Risk Metrics
                        </MDTypography>
                        <MDBadge
                          badgeContent={results.risk_level || "Unknown"}
                          color={riskLevelColor(results.risk_level)}
                          variant="gradient"
                          size="sm"
                        />
                      </MDBox>
                      <Grid container spacing={2}>
                        <Grid item xs={6} md={3}>
                          <MDBox textAlign="center" p={1}>
                            <MDTypography variant="h5" fontWeight="bold" color="error">
                              {formatCurrency(results.var_amount)}
                            </MDTypography>
                            <MDTypography variant="caption" color="text">
                              VaR ({confidence}%)
                            </MDTypography>
                            <MDBox>
                              <MDTypography variant="caption" color="text" fontWeight="regular">
                                {formatPct(results.var_percent)}
                              </MDTypography>
                            </MDBox>
                          </MDBox>
                        </Grid>
                        <Grid item xs={6} md={3}>
                          <MDBox textAlign="center" p={1}>
                            <MDTypography variant="h5" fontWeight="bold" color="error">
                              {formatCurrency(results.cvar_amount)}
                            </MDTypography>
                            <MDTypography variant="caption" color="text">
                              CVaR (ES)
                            </MDTypography>
                            <MDBox>
                              <MDTypography variant="caption" color="text" fontWeight="regular">
                                {formatPct(results.cvar_percent)}
                              </MDTypography>
                            </MDBox>
                          </MDBox>
                        </Grid>
                        <Grid item xs={6} md={3}>
                          <MDBox textAlign="center" p={1}>
                            <MDTypography variant="h5" fontWeight="bold">
                              {formatPct(results.max_drawdown)}
                            </MDTypography>
                            <MDTypography variant="caption" color="text">
                              Max Drawdown
                            </MDTypography>
                          </MDBox>
                        </Grid>
                        <Grid item xs={6} md={3}>
                          <MDBox textAlign="center" p={1}>
                            <MDTypography variant="h5" fontWeight="bold">
                              {results.sharpe_ratio != null
                                ? results.sharpe_ratio.toFixed(2)
                                : "N/A"}
                            </MDTypography>
                            <MDTypography variant="caption" color="text">
                              Sharpe Ratio
                            </MDTypography>
                          </MDBox>
                        </Grid>
                      </Grid>
                    </MDBox>
                  </Card>
                </Grid>

                {/* Stress Test Results */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox
                      mx={2}
                      mt={-3}
                      py={2}
                      px={2}
                      variant="gradient"
                      bgColor="warning"
                      borderRadius="lg"
                      coloredShadow="warning"
                    >
                      <MDTypography variant="h6" color="white">
                        Stress Test Results
                      </MDTypography>
                    </MDBox>
                    <MDBox pt={2}>
                      <TableContainer>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>Scenario</TableCell>
                              <TableCell>Probability</TableCell>
                              <TableCell>Portfolio Impact</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(results.stress_tests || []).map((st, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <MDTypography variant="caption" fontWeight="bold">
                                    {st.scenario}
                                  </MDTypography>
                                </TableCell>
                                <TableCell>
                                  <MDTypography variant="caption">
                                    {formatPct(st.probability)}
                                  </MDTypography>
                                </TableCell>
                                <TableCell>
                                  <MDTypography
                                    variant="caption"
                                    color={st.impact < 0 ? "error" : "success"}
                                    fontWeight="bold"
                                  >
                                    {formatCurrency(st.impact)}
                                  </MDTypography>
                                </TableCell>
                              </TableRow>
                            ))}
                            {(!results.stress_tests || results.stress_tests.length === 0) && (
                              <TableRow>
                                <TableCell colSpan={3} align="center">
                                  <MDTypography variant="caption" color="text">
                                    No stress test data
                                  </MDTypography>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </MDBox>
                  </Card>
                </Grid>
              </Grid>
            ) : (
              <Card>
                <MDBox
                  p={6}
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Icon sx={{ fontSize: "3rem", mb: 2, color: "text.secondary" }}>assessment</Icon>
                  <MDTypography variant="h6" color="text">
                    Configure your portfolio and run an assessment
                  </MDTypography>
                  <MDTypography variant="body2" color="text">
                    Add assets, set simulation parameters, and click Run Assessment.
                  </MDTypography>
                </MDBox>
              </Card>
            )}
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default RiskPanel;
