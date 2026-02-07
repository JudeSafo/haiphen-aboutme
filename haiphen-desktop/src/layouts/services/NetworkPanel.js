/**
 * NetworkPanel - Network Trace protocol analysis form and results display.
 *
 * Input: target address (host:port), protocol, packet data (JSON array).
 * Output: session summary, anomaly table, protocol breakdown.
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
import TextField from "@mui/material/TextField";
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
import { runNetworkTrace } from "../../api/services";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityColor(severity) {
  const map = { critical: "error", high: "warning", medium: "info", low: "success" };
  return map[severity?.toLowerCase()] || "dark";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function NetworkPanel() {
  const [target, setTarget] = useState("");
  const [protocol, setProtocol] = useState("Modbus");
  const [packetData, setPacketData] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const protocols = ["Modbus", "OPC-UA", "MQTT", "DNP3", "BACnet"];

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    let packets;
    try {
      packets = JSON.parse(packetData);
      if (!Array.isArray(packets)) throw new Error("Packet data must be a JSON array.");
    } catch (parseErr) {
      setError(`Invalid packet JSON: ${parseErr.message}`);
      setLoading(false);
      return;
    }

    try {
      const res = await runNetworkTrace({
        target,
        protocol,
        packets,
      });
      if (!res.ok) throw new Error(res.error || "Trace failed");
      setResults(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = target.trim() && packetData.trim();

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
            <Icon fontSize="medium">router</Icon>
          </MDBox>
          <MDBox>
            <MDTypography variant="h4" fontWeight="medium">
              Network Trace
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Protocol analysis &amp; anomaly detection
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
                  Trace Configuration
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                <MDBox mb={2}>
                  <MDInput
                    label="Target Address (host:port)"
                    fullWidth
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="192.168.1.10:502"
                  />
                </MDBox>
                <MDBox mb={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="protocol-label">Protocol</InputLabel>
                    <Select
                      labelId="protocol-label"
                      value={protocol}
                      label="Protocol"
                      onChange={(e) => setProtocol(e.target.value)}
                      sx={{ height: 44 }}
                    >
                      {protocols.map((p) => (
                        <MenuItem key={p} value={p}>
                          {p}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </MDBox>
                <MDBox mb={3}>
                  <TextField
                    label="Packet Data (JSON array)"
                    fullWidth
                    multiline
                    minRows={6}
                    maxRows={12}
                    value={packetData}
                    onChange={(e) => setPacketData(e.target.value)}
                    placeholder={'[\n  { "src": "10.0.0.1", "dst": "10.0.0.2", "payload": "..." }\n]'}
                  />
                </MDBox>
                <MDButton
                  variant="gradient"
                  color="info"
                  fullWidth
                  onClick={handleAnalyze}
                  disabled={!canSubmit || loading}
                >
                  {loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <>
                      <Icon sx={{ mr: 0.5 }}>analytics</Icon>
                      Analyze Trace
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
                {/* Session Summary */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        Session Summary
                      </MDTypography>
                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <MDBox textAlign="center">
                            <MDTypography variant="h4" fontWeight="bold">
                              {results.summary?.packets_analyzed ?? 0}
                            </MDTypography>
                            <MDTypography variant="caption" color="text">
                              Packets Analyzed
                            </MDTypography>
                          </MDBox>
                        </Grid>
                        <Grid item xs={4}>
                          <MDBox textAlign="center">
                            <MDTypography variant="h4" fontWeight="bold">
                              {results.summary?.duration ?? "N/A"}
                            </MDTypography>
                            <MDTypography variant="caption" color="text">
                              Duration
                            </MDTypography>
                          </MDBox>
                        </Grid>
                        <Grid item xs={4}>
                          <MDBox textAlign="center">
                            <MDTypography
                              variant="h4"
                              fontWeight="bold"
                              color={results.summary?.anomalies_found > 0 ? "error" : "success"}
                            >
                              {results.summary?.anomalies_found ?? 0}
                            </MDTypography>
                            <MDTypography variant="caption" color="text">
                              Anomalies Found
                            </MDTypography>
                          </MDBox>
                        </Grid>
                      </Grid>
                    </MDBox>
                  </Card>
                </Grid>

                {/* Anomaly Table */}
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
                        Anomalies
                      </MDTypography>
                    </MDBox>
                    <MDBox pt={2}>
                      <TableContainer>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>Type</TableCell>
                              <TableCell>Severity</TableCell>
                              <TableCell>Description</TableCell>
                              <TableCell>Packet Index</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(results.anomalies || []).map((a, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  <MDTypography variant="caption" fontWeight="bold">
                                    {a.type}
                                  </MDTypography>
                                </TableCell>
                                <TableCell>
                                  <MDBadge
                                    badgeContent={a.severity}
                                    color={severityColor(a.severity)}
                                    variant="gradient"
                                    size="xs"
                                  />
                                </TableCell>
                                <TableCell>
                                  <MDTypography variant="caption">{a.description}</MDTypography>
                                </TableCell>
                                <TableCell>
                                  <MDTypography variant="caption">{a.packet_index}</MDTypography>
                                </TableCell>
                              </TableRow>
                            ))}
                            {(!results.anomalies || results.anomalies.length === 0) && (
                              <TableRow>
                                <TableCell colSpan={4} align="center">
                                  <MDTypography variant="caption" color="text">
                                    No anomalies detected
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

                {/* Protocol Breakdown */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        Protocol Breakdown
                      </MDTypography>
                      {results.protocol_breakdown ? (
                        <>
                          <MDBox mb={1}>
                            <MDTypography variant="button" fontWeight="bold">
                              Function Codes Seen:
                            </MDTypography>
                            <MDTypography variant="button" fontWeight="regular" ml={1}>
                              {(results.protocol_breakdown.function_codes || []).join(", ") ||
                                "None"}
                            </MDTypography>
                          </MDBox>
                          <MDBox mb={1}>
                            <MDTypography variant="button" fontWeight="bold">
                              Total Payload Bytes:
                            </MDTypography>
                            <MDTypography variant="button" fontWeight="regular" ml={1}>
                              {results.protocol_breakdown.total_payload_bytes ?? "N/A"}
                            </MDTypography>
                          </MDBox>
                          <MDBox>
                            <MDTypography variant="button" fontWeight="bold">
                              Avg Payload Size:
                            </MDTypography>
                            <MDTypography variant="button" fontWeight="regular" ml={1}>
                              {results.protocol_breakdown.avg_payload_size ?? "N/A"} bytes
                            </MDTypography>
                          </MDBox>
                        </>
                      ) : (
                        <MDTypography variant="caption" color="text">
                          No protocol data available.
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
                  <Icon sx={{ fontSize: "3rem", mb: 2, color: "text.secondary" }}>router</Icon>
                  <MDTypography variant="h6" color="text">
                    Configure and run a trace to see results
                  </MDTypography>
                  <MDTypography variant="body2" color="text">
                    Enter a target address, select the protocol, provide packet data, and click
                    Analyze Trace.
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

export default NetworkPanel;
