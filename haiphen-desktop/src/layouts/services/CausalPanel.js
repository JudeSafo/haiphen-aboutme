/**
 * CausalPanel - Root cause analysis with event input and causal chain output.
 *
 * Input: dynamic list of events (type, timestamp, source, description).
 * Output: root causes, propagation chain, counterfactuals.
 */

import { useState } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";

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
import { analyzeCausal } from "../../api/services";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_EVENT = {
  type: "",
  timestamp: "",
  source: "",
  description: "",
};

function confidenceColor(conf) {
  if (conf >= 0.8) return "error";
  if (conf >= 0.5) return "warning";
  return "info";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CausalPanel() {
  const [events, setEvents] = useState([{ ...EMPTY_EVENT }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const updateEvent = (index, field, value) => {
    setEvents((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addEvent = () => {
    setEvents((prev) => [...prev, { ...EMPTY_EVENT }]);
  };

  const removeEvent = (index) => {
    setEvents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    const validEvents = events.filter((e) => e.type.trim() && e.description.trim());
    if (validEvents.length === 0) {
      setError("Add at least one event with a type and description.");
      setLoading(false);
      return;
    }

    try {
      const res = await analyzeCausal({ events: validEvents });
      if (!res.ok) throw new Error(res.error || "Analysis failed");
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
            <Icon fontSize="medium">account_tree</Icon>
          </MDBox>
          <MDBox>
            <MDTypography variant="h4" fontWeight="medium">
              Causal Chain
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Root cause analysis &amp; propagation chain
            </MDTypography>
          </MDBox>
        </MDBox>

        <Grid container spacing={3}>
          {/* ---- Event Input Form ---- */}
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
                  Events
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                {events.map((event, idx) => (
                  <MDBox
                    key={idx}
                    mb={2}
                    p={2}
                    borderRadius="lg"
                    sx={{ border: "1px solid", borderColor: "grey.300" }}
                  >
                    <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <MDTypography variant="caption" fontWeight="bold">
                        Event {idx + 1}
                      </MDTypography>
                      {events.length > 1 && (
                        <IconButton size="small" onClick={() => removeEvent(idx)}>
                          <Icon fontSize="small" color="error">
                            close
                          </Icon>
                        </IconButton>
                      )}
                    </MDBox>
                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <MDInput
                          label="Type"
                          size="small"
                          fullWidth
                          value={event.type}
                          onChange={(e) => updateEvent(idx, "type", e.target.value)}
                          placeholder="e.g. alarm, fault"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <MDInput
                          label="Source"
                          size="small"
                          fullWidth
                          value={event.source}
                          onChange={(e) => updateEvent(idx, "source", e.target.value)}
                          placeholder="e.g. PLC-01"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <MDInput
                          label="Timestamp"
                          size="small"
                          fullWidth
                          value={event.timestamp}
                          onChange={(e) => updateEvent(idx, "timestamp", e.target.value)}
                          placeholder="2026-02-07T12:00:00Z"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          label="Description"
                          size="small"
                          fullWidth
                          multiline
                          minRows={2}
                          value={event.description}
                          onChange={(e) => updateEvent(idx, "description", e.target.value)}
                          placeholder="Describe the event..."
                        />
                      </Grid>
                    </Grid>
                  </MDBox>
                ))}

                <MDBox mb={3}>
                  <MDButton
                    variant="outlined"
                    color="info"
                    size="small"
                    onClick={addEvent}
                    fullWidth
                  >
                    <Icon sx={{ mr: 0.5 }}>add</Icon>
                    Add Event
                  </MDButton>
                </MDBox>

                <MDButton
                  variant="gradient"
                  color="info"
                  fullWidth
                  onClick={handleAnalyze}
                  disabled={loading}
                >
                  {loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <>
                      <Icon sx={{ mr: 0.5 }}>play_arrow</Icon>
                      Analyze
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
                {/* Root Causes */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        Root Causes
                      </MDTypography>
                      {(results.root_causes || []).map((cause, idx) => (
                        <MDBox
                          key={idx}
                          display="flex"
                          alignItems="flex-start"
                          justifyContent="space-between"
                          p={1.5}
                          mb={1}
                          borderRadius="md"
                          sx={{ backgroundColor: "grey.100" }}
                        >
                          <MDBox display="flex" alignItems="flex-start">
                            <Icon color="error" sx={{ mr: 1, mt: 0.25 }}>
                              error_outline
                            </Icon>
                            <MDBox>
                              <MDTypography variant="button" fontWeight="bold">
                                {cause.event || cause.label || `Cause ${idx + 1}`}
                              </MDTypography>
                              {cause.description && (
                                <MDBox>
                                  <MDTypography variant="caption" color="text">
                                    {cause.description}
                                  </MDTypography>
                                </MDBox>
                              )}
                            </MDBox>
                          </MDBox>
                          {cause.confidence != null && (
                            <MDBadge
                              badgeContent={`${(cause.confidence * 100).toFixed(0)}%`}
                              color={confidenceColor(cause.confidence)}
                              variant="gradient"
                              size="xs"
                            />
                          )}
                        </MDBox>
                      ))}
                      {(!results.root_causes || results.root_causes.length === 0) && (
                        <MDTypography variant="caption" color="text">
                          No root causes identified.
                        </MDTypography>
                      )}
                    </MDBox>
                  </Card>
                </Grid>

                {/* Propagation Chain */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        Propagation Chain
                      </MDTypography>
                      {(results.propagation_chain || []).map((step, idx) => (
                        <MDBox key={idx} display="flex" alignItems="center" mb={1}>
                          <MDBox
                            display="flex"
                            justifyContent="center"
                            alignItems="center"
                            width="1.75rem"
                            height="1.75rem"
                            borderRadius="50%"
                            bgColor="info"
                            color="white"
                            mr={1.5}
                          >
                            <MDTypography variant="caption" color="white" fontWeight="bold">
                              {idx + 1}
                            </MDTypography>
                          </MDBox>
                          <MDBox flex={1}>
                            <MDTypography variant="button" fontWeight="medium">
                              {step.event || step.label}
                            </MDTypography>
                            {step.timestamp && (
                              <MDTypography variant="caption" color="text" ml={1}>
                                ({step.timestamp})
                              </MDTypography>
                            )}
                          </MDBox>
                          {idx < (results.propagation_chain || []).length - 1 && (
                            <Icon sx={{ ml: 1, color: "text.secondary" }}>arrow_downward</Icon>
                          )}
                        </MDBox>
                      ))}
                      {(!results.propagation_chain ||
                        results.propagation_chain.length === 0) && (
                        <MDTypography variant="caption" color="text">
                          No propagation chain data.
                        </MDTypography>
                      )}
                    </MDBox>
                  </Card>
                </Grid>

                {/* Counterfactuals */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        Counterfactuals
                      </MDTypography>
                      {(results.counterfactuals || []).map((cf, idx) => (
                        <MDBox
                          key={idx}
                          display="flex"
                          alignItems="flex-start"
                          mb={1.5}
                          p={1.5}
                          borderRadius="md"
                          sx={{ backgroundColor: "grey.50" }}
                        >
                          <Icon color="info" sx={{ mr: 1, mt: 0.25 }}>
                            lightbulb
                          </Icon>
                          <MDBox>
                            <MDTypography variant="button" fontWeight="medium">
                              {cf.hypothesis || cf.label}
                            </MDTypography>
                            {cf.impact && (
                              <MDBox>
                                <MDTypography variant="caption" color="text">
                                  Impact: {cf.impact}
                                </MDTypography>
                              </MDBox>
                            )}
                          </MDBox>
                        </MDBox>
                      ))}
                      {(!results.counterfactuals || results.counterfactuals.length === 0) && (
                        <MDTypography variant="caption" color="text">
                          No counterfactual scenarios generated.
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
                  <Icon sx={{ fontSize: "3rem", mb: 2, color: "text.secondary" }}>
                    account_tree
                  </Icon>
                  <MDTypography variant="h6" color="text">
                    Add events and run analysis
                  </MDTypography>
                  <MDTypography variant="body2" color="text">
                    Enter event data to identify root causes and propagation chains.
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

export default CausalPanel;
