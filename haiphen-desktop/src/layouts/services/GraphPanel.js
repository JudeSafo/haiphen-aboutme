/**
 * GraphPanel - Knowledge Graph entity management and query panel.
 *
 * Input: entity upsert form (type, label, properties JSON), query form.
 * Output: list of nodes and edges from the graph.
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
import TextField from "@mui/material/TextField";
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
import { upsertGraphEntities, queryGraph } from "../../api/services";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_TYPES = ["device", "network", "user", "location", "organization", "protocol", "other"];
const DIRECTIONS = ["outbound", "inbound", "both"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function GraphPanel() {
  // Upsert form state
  const [entityType, setEntityType] = useState("device");
  const [entityLabel, setEntityLabel] = useState("");
  const [entityProps, setEntityProps] = useState("");
  const [upsertLoading, setUpsertLoading] = useState(false);
  const [upsertMsg, setUpsertMsg] = useState(null);

  // Query form state
  const [rootId, setRootId] = useState("");
  const [depth, setDepth] = useState(2);
  const [direction, setDirection] = useState("outbound");
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState(null);
  const [queryResults, setQueryResults] = useState(null);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleUpsert = async () => {
    setUpsertLoading(true);
    setUpsertMsg(null);

    let properties = {};
    if (entityProps.trim()) {
      try {
        properties = JSON.parse(entityProps);
      } catch (err) {
        setUpsertMsg({ type: "error", text: `Invalid JSON: ${err.message}` });
        setUpsertLoading(false);
        return;
      }
    }

    try {
      const res = await upsertGraphEntities({
        entities: [
          {
            type: entityType,
            label: entityLabel,
            properties,
          },
        ],
      });
      if (!res.ok) throw new Error(res.error || "Upsert failed");
      setUpsertMsg({ type: "success", text: "Entity upserted successfully." });
      setEntityLabel("");
      setEntityProps("");
    } catch (err) {
      setUpsertMsg({ type: "error", text: err.message });
    } finally {
      setUpsertLoading(false);
    }
  };

  const handleQuery = async () => {
    setQueryLoading(true);
    setQueryError(null);
    setQueryResults(null);

    try {
      const res = await queryGraph({
        root: rootId,
        depth,
        direction,
      });
      if (!res.ok) throw new Error(res.error || "Query failed");
      setQueryResults(res.data);
    } catch (err) {
      setQueryError(err.message);
    } finally {
      setQueryLoading(false);
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
            <Icon fontSize="medium">hub</Icon>
          </MDBox>
          <MDBox>
            <MDTypography variant="h4" fontWeight="medium">
              Knowledge Graph
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Entity &amp; relationship mapping
            </MDTypography>
          </MDBox>
        </MDBox>

        <Grid container spacing={3}>
          {/* ---- Upsert Entities ---- */}
          <Grid item xs={12} md={6}>
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
                  Upsert Entity
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                <MDBox mb={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="entity-type-label">Entity Type</InputLabel>
                    <Select
                      labelId="entity-type-label"
                      value={entityType}
                      label="Entity Type"
                      onChange={(e) => setEntityType(e.target.value)}
                      sx={{ height: 44 }}
                    >
                      {ENTITY_TYPES.map((t) => (
                        <MenuItem key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </MDBox>
                <MDBox mb={2}>
                  <MDInput
                    label="Label"
                    fullWidth
                    value={entityLabel}
                    onChange={(e) => setEntityLabel(e.target.value)}
                    placeholder="e.g. PLC-Main-Floor"
                  />
                </MDBox>
                <MDBox mb={3}>
                  <TextField
                    label="Properties (JSON)"
                    fullWidth
                    multiline
                    minRows={4}
                    maxRows={8}
                    value={entityProps}
                    onChange={(e) => setEntityProps(e.target.value)}
                    placeholder={'{ "ip": "10.0.0.5", "firmware": "2.1.4" }'}
                  />
                </MDBox>
                <MDButton
                  variant="gradient"
                  color="info"
                  fullWidth
                  onClick={handleUpsert}
                  disabled={!entityLabel.trim() || upsertLoading}
                >
                  {upsertLoading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <>
                      <Icon sx={{ mr: 0.5 }}>cloud_upload</Icon>
                      Upsert Entities
                    </>
                  )}
                </MDButton>
                {upsertMsg && (
                  <MDBox mt={2}>
                    <MDTypography
                      variant="caption"
                      color={upsertMsg.type === "error" ? "error" : "success"}
                    >
                      {upsertMsg.text}
                    </MDTypography>
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </Grid>

          {/* ---- Query Graph ---- */}
          <Grid item xs={12} md={6}>
            <Card>
              <MDBox
                mx={2}
                mt={-3}
                py={2}
                px={2}
                variant="gradient"
                bgColor="dark"
                borderRadius="lg"
                coloredShadow="dark"
              >
                <MDTypography variant="h6" color="white">
                  Query Graph
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                <MDBox mb={2}>
                  <MDInput
                    label="Root Entity ID"
                    fullWidth
                    value={rootId}
                    onChange={(e) => setRootId(e.target.value)}
                    placeholder="entity-uuid-or-label"
                  />
                </MDBox>
                <Grid container spacing={2} mb={3}>
                  <Grid item xs={6}>
                    <MDInput
                      label="Depth"
                      fullWidth
                      type="number"
                      value={depth}
                      onChange={(e) => setDepth(parseInt(e.target.value, 10) || 1)}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="direction-label">Direction</InputLabel>
                      <Select
                        labelId="direction-label"
                        value={direction}
                        label="Direction"
                        onChange={(e) => setDirection(e.target.value)}
                        sx={{ height: 44 }}
                      >
                        {DIRECTIONS.map((d) => (
                          <MenuItem key={d} value={d}>
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                <MDButton
                  variant="gradient"
                  color="dark"
                  fullWidth
                  onClick={handleQuery}
                  disabled={!rootId.trim() || queryLoading}
                >
                  {queryLoading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <>
                      <Icon sx={{ mr: 0.5 }}>search</Icon>
                      Query
                    </>
                  )}
                </MDButton>
                {queryError && (
                  <MDBox mt={2}>
                    <MDTypography variant="caption" color="error">
                      {queryError}
                    </MDTypography>
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </Grid>

          {/* ---- Query Results ---- */}
          {queryResults && (
            <Grid item xs={12}>
              <Card>
                <MDBox p={3}>
                  <MDTypography variant="h6" fontWeight="medium" mb={2}>
                    Graph Results
                  </MDTypography>

                  {/* Nodes */}
                  <MDTypography variant="button" fontWeight="bold" mb={1}>
                    Nodes ({(queryResults.nodes || []).length})
                  </MDTypography>
                  <MDBox mb={2}>
                    {(queryResults.nodes || []).map((node, idx) => (
                      <MDBox
                        key={idx}
                        display="flex"
                        alignItems="center"
                        justifyContent="space-between"
                        p={1}
                        mb={0.5}
                        borderRadius="md"
                        sx={{ backgroundColor: "grey.100" }}
                      >
                        <MDBox display="flex" alignItems="center">
                          <Icon sx={{ mr: 1, color: "info.main" }}>circle</Icon>
                          <MDTypography variant="button" fontWeight="medium">
                            {node.label || node.id}
                          </MDTypography>
                        </MDBox>
                        <MDBadge
                          badgeContent={node.type || "entity"}
                          color="info"
                          variant="contained"
                          size="xs"
                        />
                      </MDBox>
                    ))}
                    {(!queryResults.nodes || queryResults.nodes.length === 0) && (
                      <MDTypography variant="caption" color="text">
                        No nodes found.
                      </MDTypography>
                    )}
                  </MDBox>

                  <Divider />

                  {/* Edges */}
                  <MDTypography variant="button" fontWeight="bold" mt={2} mb={1}>
                    Edges ({(queryResults.edges || []).length})
                  </MDTypography>
                  <MDBox>
                    {(queryResults.edges || []).map((edge, idx) => (
                      <MDBox
                        key={idx}
                        display="flex"
                        alignItems="center"
                        p={1}
                        mb={0.5}
                        borderRadius="md"
                        sx={{ backgroundColor: "grey.50" }}
                      >
                        <MDTypography variant="caption" fontWeight="medium">
                          {edge.source}
                        </MDTypography>
                        <Icon sx={{ mx: 1, fontSize: "1rem" }}>arrow_forward</Icon>
                        <MDBadge
                          badgeContent={edge.relationship || "related"}
                          color="dark"
                          variant="contained"
                          size="xs"
                        />
                        <Icon sx={{ mx: 1, fontSize: "1rem" }}>arrow_forward</Icon>
                        <MDTypography variant="caption" fontWeight="medium">
                          {edge.target}
                        </MDTypography>
                      </MDBox>
                    ))}
                    {(!queryResults.edges || queryResults.edges.length === 0) && (
                      <MDTypography variant="caption" color="text">
                        No edges found.
                      </MDTypography>
                    )}
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>
          )}
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default GraphPanel;
