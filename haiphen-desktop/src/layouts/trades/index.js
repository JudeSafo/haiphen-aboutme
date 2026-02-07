/**
 * Haiphen Desktop - Portfolio & Trades View
 *
 * Paginated asset table showing portfolio positions with
 * search filtering, sorting, allocation bars, and a detail modal.
 */

import { useState, useEffect, useCallback, useMemo } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Modal from "@mui/material/Modal";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDProgress from "components/MDProgress";
import MDAlert from "components/MDAlert";
import MDPagination from "components/MDPagination";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReportsLineChart from "examples/Charts/LineCharts/ReportsLineChart";

// Auth & API
import { useAuth } from "../../context/AuthContext";
import { fetchPortfolioAssets, fetchAssetDetail } from "../../api/services";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { value: "value_desc", label: "Value (High to Low)" },
  { value: "value_asc", label: "Value (Low to High)" },
  { value: "name_asc", label: "Name (A-Z)" },
  { value: "name_desc", label: "Name (Z-A)" },
  { value: "change_desc", label: "Change % (High to Low)" },
  { value: "change_asc", label: "Change % (Low to High)" },
];

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

function sortAssets(assets, sortKey) {
  const sorted = [...assets];
  switch (sortKey) {
    case "value_desc":
      return sorted.sort((a, b) => (b.value || 0) - (a.value || 0));
    case "value_asc":
      return sorted.sort((a, b) => (a.value || 0) - (b.value || 0));
    case "name_asc":
      return sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    case "name_desc":
      return sorted.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    case "change_desc":
      return sorted.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
    case "change_asc":
      return sorted.sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0));
    default:
      return sorted;
  }
}

// ---------------------------------------------------------------------------
// Detail Modal Component
// ---------------------------------------------------------------------------

function AssetDetailModal({ open, onClose, assetId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !assetId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAssetDetail(assetId);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load asset detail");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, assetId]);

  const chartData = useMemo(() => {
    if (!detail?.history) {
      return {
        labels: [],
        datasets: { label: "Price", data: [] },
      };
    }
    return {
      labels: detail.history.labels || [],
      datasets: detail.history.datasets || { label: "Price", data: detail.history.data || [] },
    };
  }, [detail]);

  return (
    <Modal open={open} onClose={onClose}>
      <MDBox
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: { xs: "95%", md: "720px" },
          maxHeight: "90vh",
          overflow: "auto",
          bgcolor: "background.paper",
          borderRadius: 2,
          boxShadow: 24,
          p: 0,
        }}
      >
        {/* Modal Header */}
        <MDBox display="flex" justifyContent="space-between" alignItems="center" p={3} pb={1}>
          <MDTypography variant="h5" fontWeight="medium">
            {detail?.name || "Asset Detail"}
          </MDTypography>
          <MDButton variant="text" color="dark" iconOnly onClick={onClose}>
            <Icon>close</Icon>
          </MDButton>
        </MDBox>
        <Divider />

        <MDBox p={3}>
          {loading && (
            <MDBox py={4}>
              <MDProgress color="info" />
            </MDBox>
          )}

          {error && (
            <MDAlert color="error" dismissible>
              {error}
            </MDAlert>
          )}

          {!loading && !error && detail && (
            <>
              {/* Summary Stats */}
              <Grid container spacing={2} mb={3}>
                <Grid item xs={6} md={3}>
                  <MDTypography variant="caption" color="text" fontWeight="bold" textTransform="uppercase">
                    Current Value
                  </MDTypography>
                  <MDTypography variant="h6">{formatCurrency(detail.value)}</MDTypography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <MDTypography variant="caption" color="text" fontWeight="bold" textTransform="uppercase">
                    Change
                  </MDTypography>
                  <MDTypography
                    variant="h6"
                    color={(detail.changePercent || 0) >= 0 ? "success" : "error"}
                  >
                    {formatPercent(detail.changePercent)}
                  </MDTypography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <MDTypography variant="caption" color="text" fontWeight="bold" textTransform="uppercase">
                    Allocation
                  </MDTypography>
                  <MDTypography variant="h6">
                    {detail.allocation != null ? `${detail.allocation}%` : "--"}
                  </MDTypography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <MDTypography variant="caption" color="text" fontWeight="bold" textTransform="uppercase">
                    Quantity
                  </MDTypography>
                  <MDTypography variant="h6">{detail.quantity ?? "--"}</MDTypography>
                </Grid>
              </Grid>

              {/* Mini Chart */}
              {chartData.labels.length > 0 && (
                <MDBox mb={3}>
                  <ReportsLineChart
                    color="info"
                    title="Recent Performance"
                    description="Price history"
                    date="last 30 days"
                    chart={chartData}
                  />
                </MDBox>
              )}

              {/* Key Metrics Table */}
              {detail.metrics && (
                <>
                  <MDTypography variant="h6" mb={1}>
                    Key Metrics
                  </MDTypography>
                  <TableContainer>
                    <Table size="small">
                      <TableBody>
                        {Object.entries(detail.metrics).map(([key, val]) => (
                          <TableRow key={key}>
                            <TableCell>
                              <MDTypography variant="caption" fontWeight="bold" textTransform="uppercase">
                                {key}
                              </MDTypography>
                            </TableCell>
                            <TableCell align="right">
                              <MDTypography variant="button" color="text">
                                {typeof val === "number" ? val.toLocaleString() : val}
                              </MDTypography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </>
          )}
        </MDBox>
      </MDBox>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Trades Page Component
// ---------------------------------------------------------------------------

function Trades() {
  const { isAuthenticated } = useAuth();

  // Data state
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & sort state
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("value_desc");

  // Pagination state
  const [page, setPage] = useState(1);

  // Detail modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortfolioAssets();
      setAssets(data.assets || []);
    } catch (err) {
      setError(err.message || "Failed to load portfolio assets");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadAssets();
    }
  }, [isAuthenticated, loadAssets]);

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const filteredAssets = useMemo(() => {
    let result = assets;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((a) => (a.name || "").toLowerCase().includes(q));
    }
    return sortAssets(result, sortKey);
  }, [assets, search, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE));

  const pagedAssets = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAssets.slice(start, start + PAGE_SIZE);
  }, [filteredAssets, page]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, sortKey]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleViewDetail = (assetId) => {
    setSelectedAssetId(assetId);
    setModalOpen(true);
  };

  const handleRefresh = () => {
    loadAssets();
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        {/* Header */}
        <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <MDBox>
            <MDTypography variant="h4" fontWeight="medium">
              Portfolio &amp; Trades
            </MDTypography>
            <MDTypography variant="button" color="text" fontWeight="regular">
              {filteredAssets.length} asset{filteredAssets.length !== 1 ? "s" : ""} in portfolio
            </MDTypography>
          </MDBox>
          <MDButton variant="gradient" color="info" onClick={handleRefresh}>
            <Icon sx={{ mr: 1 }}>refresh</Icon>
            Refresh
          </MDButton>
        </MDBox>

        {/* Error banner */}
        {error && (
          <MDBox mb={3}>
            <MDAlert color="error" dismissible>
              <Icon sx={{ mr: 1 }}>warning</Icon>
              {error}
            </MDAlert>
          </MDBox>
        )}

        {/* Filter Bar */}
        <Card sx={{ mb: 3 }}>
          <MDBox p={2}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <MDInput
                  fullWidth
                  label="Search assets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: <Icon sx={{ mr: 1, color: "#90a4ae" }}>search</Icon>,
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel id="sort-label">Sort by</InputLabel>
                  <Select
                    labelId="sort-label"
                    value={sortKey}
                    label="Sort by"
                    onChange={(e) => setSortKey(e.target.value)}
                    sx={{ height: 44 }}
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </MDBox>
        </Card>

        {/* Assets Table */}
        <Card>
          {loading ? (
            <MDBox p={4}>
              <MDProgress color="info" />
            </MDBox>
          ) : pagedAssets.length === 0 ? (
            <MDBox p={4} textAlign="center">
              <Icon sx={{ fontSize: "2.5rem !important", mb: 1, color: "#90a4ae" }}>
                inventory_2
              </Icon>
              <MDTypography variant="h6" color="text">
                {search ? "No matching assets found" : "No portfolio assets"}
              </MDTypography>
              <MDTypography variant="body2" color="text">
                {search
                  ? "Try adjusting your search query."
                  : "Your portfolio is empty. Start by adding assets."}
              </MDTypography>
            </MDBox>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      {["Asset Name", "Current Value", "Change %", "Allocation %", "Action"].map(
                        (header) => (
                          <TableCell key={header}>
                            <MDTypography
                              variant="caption"
                              fontWeight="bold"
                              color="text"
                              textTransform="uppercase"
                            >
                              {header}
                            </MDTypography>
                          </TableCell>
                        )
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedAssets.map((asset) => (
                      <TableRow key={asset.id} hover>
                        {/* Asset Name */}
                        <TableCell>
                          <MDBox display="flex" alignItems="center">
                            <Icon sx={{ mr: 1, color: "#5A9BD4" }}>show_chart</Icon>
                            <MDTypography variant="button" fontWeight="medium">
                              {asset.name}
                            </MDTypography>
                          </MDBox>
                        </TableCell>

                        {/* Current Value */}
                        <TableCell>
                          <MDTypography variant="button" color="text">
                            {formatCurrency(asset.value)}
                          </MDTypography>
                        </TableCell>

                        {/* Change % */}
                        <TableCell>
                          <MDTypography
                            variant="button"
                            fontWeight="medium"
                            color={(asset.changePercent || 0) >= 0 ? "success" : "error"}
                          >
                            {formatPercent(asset.changePercent)}
                          </MDTypography>
                        </TableCell>

                        {/* Allocation % */}
                        <TableCell sx={{ minWidth: 160 }}>
                          <MDBox display="flex" alignItems="center">
                            <MDBox width="100%" mr={1}>
                              <MDProgress
                                variant="gradient"
                                color="info"
                                value={Math.min(asset.allocation || 0, 100)}
                              />
                            </MDBox>
                            <MDTypography variant="caption" color="text" fontWeight="medium">
                              {asset.allocation != null ? `${asset.allocation}%` : "--"}
                            </MDTypography>
                          </MDBox>
                        </TableCell>

                        {/* Action */}
                        <TableCell>
                          <MDButton
                            variant="text"
                            color="info"
                            size="small"
                            onClick={() => handleViewDetail(asset.id)}
                          >
                            <Icon sx={{ mr: 0.5 }}>visibility</Icon>
                            View Details
                          </MDButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              {totalPages > 1 && (
                <MDBox display="flex" justifyContent="center" p={2}>
                  <MDPagination>
                    <MDPagination item onClick={() => setPage(Math.max(1, page - 1))}>
                      <Icon>keyboard_arrow_left</Icon>
                    </MDPagination>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <MDPagination
                        key={p}
                        item
                        active={p === page}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </MDPagination>
                    ))}
                    <MDPagination item onClick={() => setPage(Math.min(totalPages, page + 1))}>
                      <Icon>keyboard_arrow_right</Icon>
                    </MDPagination>
                  </MDPagination>
                </MDBox>
              )}
            </>
          )}
        </Card>
      </MDBox>

      {/* Detail Modal */}
      <AssetDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        assetId={selectedAssetId}
      />

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

export default Trades;
