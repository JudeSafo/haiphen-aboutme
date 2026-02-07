/**
 * SupplyPanel - Supply Chain Intelligence supplier risk assessment.
 *
 * Input: supplier details (name, country, tier, categories, score components).
 * Output: overall score, risk level, alerts, alternatives, recommendations.
 */

import { useState } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Chip from "@mui/material/Chip";
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
import { assessSupplyRisk } from "../../api/services";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIERS = [1, 2, 3];
const CATEGORY_OPTIONS = [
  "Raw Materials",
  "Electronics",
  "Semiconductors",
  "Logistics",
  "Software",
  "Packaging",
  "Energy",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskColor(level) {
  const map = {
    critical: "error",
    high: "warning",
    medium: "info",
    low: "success",
    minimal: "success",
  };
  return map[level?.toLowerCase()] || "dark";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SupplyPanel() {
  // Form
  const [supplierName, setSupplierName] = useState("");
  const [country, setCountry] = useState("");
  const [tier, setTier] = useState(1);
  const [categories, setCategories] = useState([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [financialScore, setFinancialScore] = useState(50);
  const [geoScore, setGeoScore] = useState(50);
  const [deliveryScore, setDeliveryScore] = useState(50);

  // Results
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const addCategory = () => {
    const val = categoryInput.trim();
    if (val && !categories.includes(val)) {
      setCategories((prev) => [...prev, val]);
    }
    setCategoryInput("");
  };

  const removeCategory = (cat) => {
    setCategories((prev) => prev.filter((c) => c !== cat));
  };

  const handleAssess = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    if (!supplierName.trim()) {
      setError("Supplier name is required.");
      setLoading(false);
      return;
    }

    try {
      const res = await assessSupplyRisk({
        suppliers: [
          {
            name: supplierName,
            country,
            tier,
            categories,
            financial_score: financialScore,
            geo_score: geoScore,
            delivery_score: deliveryScore,
          },
        ],
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
            <Icon fontSize="medium">local_shipping</Icon>
          </MDBox>
          <MDBox>
            <MDTypography variant="h4" fontWeight="medium">
              Supply Chain Intel
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Supplier risk scoring &amp; alternative sourcing
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
                  Supplier Details
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                <MDBox mb={2}>
                  <MDInput
                    label="Supplier Name"
                    fullWidth
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </MDBox>
                <Grid container spacing={2} mb={2}>
                  <Grid item xs={8}>
                    <MDInput
                      label="Country"
                      fullWidth
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g. Germany"
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="tier-label">Tier</InputLabel>
                      <Select
                        labelId="tier-label"
                        value={tier}
                        label="Tier"
                        onChange={(e) => setTier(e.target.value)}
                        sx={{ height: 44 }}
                      >
                        {TIERS.map((t) => (
                          <MenuItem key={t} value={t}>
                            Tier {t}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                {/* Categories */}
                <MDBox mb={2}>
                  <MDBox display="flex" gap={1} mb={1}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="cat-label">Category</InputLabel>
                      <Select
                        labelId="cat-label"
                        value={categoryInput}
                        label="Category"
                        onChange={(e) => setCategoryInput(e.target.value)}
                        sx={{ height: 44 }}
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <MenuItem key={c} value={c}>
                            {c}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <MDButton
                      variant="outlined"
                      color="info"
                      size="small"
                      onClick={addCategory}
                      disabled={!categoryInput}
                    >
                      <Icon>add</Icon>
                    </MDButton>
                  </MDBox>
                  <MDBox display="flex" flexWrap="wrap" gap={0.5}>
                    {categories.map((cat) => (
                      <Chip
                        key={cat}
                        label={cat}
                        size="small"
                        onDelete={() => removeCategory(cat)}
                      />
                    ))}
                  </MDBox>
                </MDBox>

                <Divider />

                {/* Score Sliders */}
                <MDBox mt={2} mb={1}>
                  <MDTypography variant="caption" fontWeight="bold">
                    Financial Score: {financialScore}
                  </MDTypography>
                  <Slider
                    value={financialScore}
                    onChange={(_, val) => setFinancialScore(val)}
                    min={0}
                    max={100}
                    size="small"
                  />
                </MDBox>
                <MDBox mb={1}>
                  <MDTypography variant="caption" fontWeight="bold">
                    Geopolitical Score: {geoScore}
                  </MDTypography>
                  <Slider
                    value={geoScore}
                    onChange={(_, val) => setGeoScore(val)}
                    min={0}
                    max={100}
                    size="small"
                  />
                </MDBox>
                <MDBox mb={3}>
                  <MDTypography variant="caption" fontWeight="bold">
                    Delivery Score: {deliveryScore}
                  </MDTypography>
                  <Slider
                    value={deliveryScore}
                    onChange={(_, val) => setDeliveryScore(val)}
                    min={0}
                    max={100}
                    size="small"
                  />
                </MDBox>

                <MDButton
                  variant="gradient"
                  color="info"
                  fullWidth
                  onClick={handleAssess}
                  disabled={!supplierName.trim() || loading}
                >
                  {loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <>
                      <Icon sx={{ mr: 0.5 }}>play_arrow</Icon>
                      Assess Risk
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
                {/* Overall Score + Risk Level */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3} display="flex" alignItems="center" justifyContent="space-between">
                      <MDBox>
                        <MDTypography variant="h6" fontWeight="medium">
                          Overall Risk Assessment
                        </MDTypography>
                        <MDTypography variant="body2" color="text">
                          {supplierName} ({country || "N/A"})
                        </MDTypography>
                      </MDBox>
                      <MDBox display="flex" alignItems="center" gap={2}>
                        <MDBox
                          display="flex"
                          justifyContent="center"
                          alignItems="center"
                          width="4rem"
                          height="4rem"
                          borderRadius="50%"
                          sx={{
                            border: "4px solid",
                            borderColor:
                              results.overall_score >= 75
                                ? "error.main"
                                : results.overall_score >= 50
                                ? "warning.main"
                                : results.overall_score >= 25
                                ? "info.main"
                                : "success.main",
                          }}
                        >
                          <MDTypography variant="h4" fontWeight="bold">
                            {results.overall_score ?? "N/A"}
                          </MDTypography>
                        </MDBox>
                        <MDBadge
                          badgeContent={results.risk_level || "Unknown"}
                          color={riskColor(results.risk_level)}
                          variant="gradient"
                          size="sm"
                        />
                      </MDBox>
                    </MDBox>
                  </Card>
                </Grid>

                {/* Alerts */}
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        Alerts
                      </MDTypography>
                      {(results.alerts || []).map((alert, idx) => (
                        <MDBox
                          key={idx}
                          display="flex"
                          alignItems="flex-start"
                          mb={1.5}
                          p={1.5}
                          borderRadius="md"
                          sx={{ backgroundColor: "warning.main", opacity: 0.1 }}
                        >
                          <Icon color="warning" sx={{ mr: 1, mt: 0.25 }}>
                            warning
                          </Icon>
                          <MDTypography variant="button" fontWeight="regular">
                            {typeof alert === "string" ? alert : alert.message || alert.text}
                          </MDTypography>
                        </MDBox>
                      ))}
                      {(!results.alerts || results.alerts.length === 0) && (
                        <MDTypography variant="caption" color="text">
                          No active alerts.
                        </MDTypography>
                      )}
                    </MDBox>
                  </Card>
                </Grid>

                {/* Alternatives */}
                <Grid item xs={12} md={6}>
                  <Card>
                    <MDBox p={3}>
                      <MDTypography variant="h6" fontWeight="medium" mb={2}>
                        Alternative Suppliers
                      </MDTypography>
                      {(results.alternatives || []).map((alt, idx) => (
                        <MDBox
                          key={idx}
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          mb={1}
                          p={1}
                          borderRadius="md"
                          sx={{ backgroundColor: "grey.100" }}
                        >
                          <MDBox>
                            <MDTypography variant="button" fontWeight="bold">
                              {alt.name}
                            </MDTypography>
                            {alt.country && (
                              <MDTypography variant="caption" color="text" ml={1}>
                                ({alt.country})
                              </MDTypography>
                            )}
                          </MDBox>
                          {alt.score != null && (
                            <MDBadge
                              badgeContent={`Score: ${alt.score}`}
                              color="success"
                              variant="contained"
                              size="xs"
                            />
                          )}
                        </MDBox>
                      ))}
                      {(!results.alternatives || results.alternatives.length === 0) && (
                        <MDTypography variant="caption" color="text">
                          No alternatives available.
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
                            {typeof rec === "string" ? rec : rec.text}
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
                  <Icon sx={{ fontSize: "3rem", mb: 2, color: "text.secondary" }}>
                    local_shipping
                  </Icon>
                  <MDTypography variant="h6" color="text">
                    Enter supplier details and run assessment
                  </MDTypography>
                  <MDTypography variant="body2" color="text">
                    Add supplier information, set risk scores, and click Assess Risk.
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

export default SupplyPanel;
