/**
 * SecurePanel - Haiphen Secure CVE scanning form and results display.
 *
 * Input: target host, asset vendor, product name, firmware version.
 * Output: risk score, CVE findings table, IEC 62443 compliance, recommendations.
 */

import { useState } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import Divider from "@mui/material/Divider";
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
import { runSecureScan, getSecureScan } from "../../api/services";

// ---------------------------------------------------------------------------
// Severity colour helper
// ---------------------------------------------------------------------------

function severityColor(severity) {
  const map = { critical: "error", high: "warning", medium: "info", low: "success" };
  return map[severity?.toLowerCase()] || "dark";
}

function complianceColor(pass) {
  return pass ? "success" : "error";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SecurePanel() {
  // Form state
  const [hostname, setHostname] = useState("");
  const [vendor, setVendor] = useState("");
  const [product, setProduct] = useState("");
  const [firmware, setFirmware] = useState("");

  // Result state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const vendors = ["Siemens", "Schneider Electric", "Fortinet", "Palo Alto", "Other"];

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await runSecureScan({
        hostname,
        vendor,
        product,
        firmware_version: firmware,
      });
      if (!res.ok) throw new Error(res.error || "Scan failed");
      setResults(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = hostname.trim() && vendor && product.trim();

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
            <Icon fontSize="medium">shield</Icon>
          </MDBox>
          <MDBox>
            <MDTypography variant="h4" fontWeight="medium">
              Haiphen Secure
            </MDTypography>
            <MDTypography variant="body2" color="text">
              CVE scanning &amp; vulnerability assessment
            </MDTypography>
          </MDBox>
        </MDBox>

        <Grid container spacing={3}>
          {/* ---- Input Form ---- */}
          <Grid item xs={12} lg={4}>
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
                  Scan Configuration
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                <MDBox mb={2}>
                  <MDInput
                    label="Target Hostname / IP"
                    fullWidth
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                  />
                </MDBox>
                <MDBox mb={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="vendor-label">Asset Vendor</InputLabel>
                    <Select
                      labelId="vendor-label"
                      value={vendor}
                      label="Asset Vendor"
                      onChange={(e) => setVendor(e.target.value)}
                      sx={{ height: 44 }}
                    >
                      {vendors.map((v) => (
                        <MenuItem key={v} value={v}>
                          {v}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </MDBox>
                <MDBox mb={2}>
                  <MDInput
                    label="Product Name"
                    fullWidth
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                  />
                </MDBox>
                <MDBox mb={3}>
                  <MDInput
                    label="Firmware Version"
                    fullWidth
                    value={firmware}
                    onChange={(e) => setFirmware(e.target.value)}
                  />
                </MDBox>
                <MDButton
                  variant="gradient"
                  color="info"
                  fullWidth
                  onClick={handleScan}
                  disabled={!canSubmit || loading}
                >
                  {loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <>
                      <Icon sx={{ mr: 0.5 }}>search</Icon>
                      Run Scan
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
          <Grid item xs={12} lg={8}>
            {results ? (
              <Grid container spacing={3}>
                {/* Risk Score */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3} display="flex" alignItems="center" justifyContent="space-between">
                      <MDBox>
                        <MDTypography variant="h6" fontWeight="medium">
                          Overall Risk Score
                        </MDTypography>
                        <MDTypography variant="body2" color="text">
                          {results.findings?.length || 0} vulnerabilities found
                        </MDTypography>
                      </MDBox>
                      <MDBox
                        display="flex"
                        justifyContent="center"
                        alignItems="center"
                        width="4.5rem"
                        height="4.5rem"
                        borderRadius="50%"
                        sx={{
                          border: "4px solid",
                          borderColor:
                            results.risk_score >= 75
                              ? "error.main"
                              : results.risk_score >= 50
                              ? "warning.main"
                              : results.risk_score >= 25
                              ? "info.main"
                              : "success.main",
                        }}
                      >
                        <MDTypography variant="h4" fontWeight="bold">
                          {results.risk_score ?? "N/A"}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                  </Card>
                </Grid>

                {/* Findings Table */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox
                      mx={2}
                      mt={-3}
                      py={2}
                      px={2}
                      variant="gradient"
                      bgColor="error"
                      borderRadius="lg"
                      coloredShadow="error"
                    >
                      <MDTypography variant="h6" color="white">
                        Findings
                      </MDTypography>
                    </MDBox>
                    <MDBox pt={2}>
                      <TableContainer>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>CVE ID</TableCell>
                              <TableCell>CVSS</TableCell>
                              <TableCell>Severity</TableCell>
                              <TableCell>Description</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(results.findings || []).map((f, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <MDTypography variant="caption" fontWeight="bold">
                                    {f.cve_id}
                                  </MDTypography>
                                </TableCell>
                                <TableCell>
                                  <MDTypography variant="caption">{f.cvss_score}</MDTypography>
                                </TableCell>
                                <TableCell>
                                  <MDBadge
                                    badgeContent={f.severity}
                                    color={severityColor(f.severity)}
                                    variant="gradient"
                                    size="xs"
                                  />
                                </TableCell>
                                <TableCell>
                                  <MDTypography variant="caption">{f.description}</MDTypography>
                                </TableCell>
                              </TableRow>
                            ))}
                            {(!results.findings || results.findings.length === 0) && (
                              <TableRow>
                                <TableCell colSpan={4} align="center">
                                  <MDTypography variant="caption" color="text">
                                    No findings
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

                {/* Compliance */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        IEC 62443 Compliance
                      </MDTypography>
                      {(results.compliance || []).map((c, idx) => (
                        <MDBox
                          key={idx}
                          display="flex"
                          justifyContent="space-between"
                          alignItems="center"
                          mb={1}
                        >
                          <MDTypography variant="button" fontWeight="regular">
                            {c.control}
                          </MDTypography>
                          <MDBadge
                            badgeContent={c.pass ? "Pass" : "Fail"}
                            color={complianceColor(c.pass)}
                            variant="gradient"
                            size="xs"
                          />
                        </MDBox>
                      ))}
                      {(!results.compliance || results.compliance.length === 0) && (
                        <MDTypography variant="caption" color="text">
                          No compliance data available.
                        </MDTypography>
                      )}
                    </MDBox>
                  </Card>
                </Grid>

                {/* Recommendations */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        Recommendations
                      </MDTypography>
                      {(results.recommendations || []).map((rec, idx) => (
                        <MDBox key={idx} display="flex" alignItems="flex-start" mb={1.5}>
                          <Icon color="info" sx={{ mr: 1, mt: 0.25, fontSize: "1rem" }}>
                            arrow_forward
                          </Icon>
                          <MDTypography variant="button" fontWeight="regular">
                            {rec}
                          </MDTypography>
                        </MDBox>
                      ))}
                      {(!results.recommendations || results.recommendations.length === 0) && (
                        <MDTypography variant="caption" color="text">
                          No recommendations available.
                        </MDTypography>
                      )}
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
                  <Icon sx={{ fontSize: "3rem", mb: 2, color: "text.secondary" }}>shield</Icon>
                  <MDTypography variant="h6" color="text">
                    Configure and run a scan to see results
                  </MDTypography>
                  <MDTypography variant="body2" color="text">
                    Enter a target hostname, select the asset vendor, and click Run Scan.
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

export default SecurePanel;
