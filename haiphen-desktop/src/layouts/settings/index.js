/**
 * Settings Page - Profile, API Keys, and Plan & Quota management.
 *
 * Profile: displays user info from the API (login, name, email, avatar).
 * API Keys: list, create, revoke keys with scope management.
 * Plan & Quota: current plan, quota usage bar, upgrade CTA.
 */

import { useState, useEffect, useCallback } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Avatar from "@mui/material/Avatar";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDBadge from "components/MDBadge";
import MDProgress from "components/MDProgress";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

// API
import { getProfile, listApiKeys, createApiKey, revokeApiKey, getQuota } from "../../api/settings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function planColor(plan) {
  const map = { free: "secondary", pro: "info", enterprise: "success" };
  return map[plan?.toLowerCase()] || "dark";
}

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const AVAILABLE_SCOPES = ["metrics:read", "rss:read", "webhooks:write"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function Settings() {
  // Profile
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // API Keys
  const [keys, setKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [revoking, setRevoking] = useState(null);

  // Quota
  const [quota, setQuota] = useState(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await getProfile();
      setProfile(res.ok ? res.data : null);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await listApiKeys();
      const data = res.ok ? res.data : null;
      setKeys(data?.keys || data || []);
    } catch {
      setKeys([]);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  const loadQuota = useCallback(async () => {
    setQuotaLoading(true);
    try {
      const res = await getQuota();
      setQuota(res.ok ? res.data : null);
    } catch {
      setQuota(null);
    } finally {
      setQuotaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadKeys();
    loadQuota();
  }, [loadProfile, loadKeys, loadQuota]);

  // ---------------------------------------------------------------------------
  // Key actions
  // ---------------------------------------------------------------------------

  const toggleScope = (scope) => {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createApiKey({ name: newKeyName, scopes: newKeyScopes });
      if (!res.ok) throw new Error(res.error || "Failed to create key");
      setCreateOpen(false);
      setNewKeyName("");
      setNewKeyScopes([]);
      loadKeys();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId) => {
    setRevoking(keyId);
    try {
      await revokeApiKey(keyId);
      loadKeys();
    } catch {
      // silent
    } finally {
      setRevoking(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Quota calculations
  // ---------------------------------------------------------------------------

  const quotaUsed = quota?.used ?? 0;
  const quotaLimit = quota?.limit ?? 200;
  const quotaPct = quotaLimit > 0 ? Math.min(Math.round((quotaUsed / quotaLimit) * 100), 100) : 0;
  const quotaColor = quotaPct >= 90 ? "error" : quotaPct >= 70 ? "warning" : "info";

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <MDBox mb={3}>
          <MDTypography variant="h4" fontWeight="medium">
            Settings
          </MDTypography>
        </MDBox>

        <Grid container spacing={3}>
          {/* ================================================================= */}
          {/* Profile Section                                                    */}
          {/* ================================================================= */}
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
                  Profile
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                {profileLoading ? (
                  <MDBox display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={28} />
                  </MDBox>
                ) : profile ? (
                  <MDBox>
                    <MDBox display="flex" alignItems="center" mb={3}>
                      <Avatar
                        src={profile.avatar_url || profile.avatar}
                        sx={{ width: 64, height: 64, mr: 2 }}
                      >
                        {(profile.name || profile.login || "?").charAt(0).toUpperCase()}
                      </Avatar>
                      <MDBox>
                        <MDTypography variant="h5" fontWeight="medium">
                          {profile.name || profile.login}
                        </MDTypography>
                        {profile.login && (
                          <MDTypography variant="caption" color="text">
                            @{profile.login}
                          </MDTypography>
                        )}
                      </MDBox>
                    </MDBox>
                    <Divider />
                    <MDBox mt={2}>
                      {profile.email && (
                        <MDBox display="flex" alignItems="center" mb={1}>
                          <Icon sx={{ mr: 1, color: "text.secondary" }}>email</Icon>
                          <MDTypography variant="button" fontWeight="regular">
                            {profile.email}
                          </MDTypography>
                        </MDBox>
                      )}
                      {profile.company && (
                        <MDBox display="flex" alignItems="center" mb={1}>
                          <Icon sx={{ mr: 1, color: "text.secondary" }}>business</Icon>
                          <MDTypography variant="button" fontWeight="regular">
                            {profile.company}
                          </MDTypography>
                        </MDBox>
                      )}
                      {profile.location && (
                        <MDBox display="flex" alignItems="center" mb={1}>
                          <Icon sx={{ mr: 1, color: "text.secondary" }}>location_on</Icon>
                          <MDTypography variant="button" fontWeight="regular">
                            {profile.location}
                          </MDTypography>
                        </MDBox>
                      )}
                      {profile.created_at && (
                        <MDBox display="flex" alignItems="center">
                          <Icon sx={{ mr: 1, color: "text.secondary" }}>calendar_today</Icon>
                          <MDTypography variant="button" fontWeight="regular">
                            Joined {formatDate(profile.created_at)}
                          </MDTypography>
                        </MDBox>
                      )}
                    </MDBox>
                  </MDBox>
                ) : (
                  <MDTypography variant="body2" color="text">
                    Unable to load profile. Please sign in.
                  </MDTypography>
                )}
              </MDBox>
            </Card>
          </Grid>

          {/* ================================================================= */}
          {/* Plan & Quota Section                                               */}
          {/* ================================================================= */}
          <Grid item xs={12} lg={8}>
            <Card>
              <MDBox
                mx={2}
                mt={-3}
                py={2}
                px={2}
                variant="gradient"
                bgColor="success"
                borderRadius="lg"
                coloredShadow="success"
              >
                <MDTypography variant="h6" color="white">
                  Plan &amp; Quota
                </MDTypography>
              </MDBox>
              <MDBox p={3}>
                {quotaLoading ? (
                  <MDBox display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={28} />
                  </MDBox>
                ) : (
                  <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} md={4}>
                      <MDBox textAlign="center">
                        <MDTypography variant="caption" color="text" fontWeight="bold">
                          Current Plan
                        </MDTypography>
                        <MDBox mt={1}>
                          <MDBadge
                            badgeContent={(quota?.plan || "Free").toUpperCase()}
                            color={planColor(quota?.plan)}
                            variant="gradient"
                            size="lg"
                          />
                        </MDBox>
                      </MDBox>
                    </Grid>
                    <Grid item xs={12} md={5}>
                      <MDTypography variant="caption" color="text" fontWeight="bold">
                        Daily Quota Usage
                      </MDTypography>
                      <MDBox mt={1} mb={0.5}>
                        <MDProgress value={quotaPct} color={quotaColor} variant="gradient" />
                      </MDBox>
                      <MDTypography variant="caption" color="text">
                        {quotaUsed.toLocaleString()} / {quotaLimit.toLocaleString()} requests (
                        {quotaPct}%)
                      </MDTypography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <MDBox textAlign="center">
                        <MDButton variant="gradient" color="info" size="small">
                          <Icon sx={{ mr: 0.5 }}>upgrade</Icon>
                          Upgrade Plan
                        </MDButton>
                      </MDBox>
                    </Grid>
                  </Grid>
                )}
              </MDBox>
            </Card>
          </Grid>

          {/* ================================================================= */}
          {/* API Keys Section                                                   */}
          {/* ================================================================= */}
          <Grid item xs={12}>
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
                display="flex"
                justifyContent="space-between"
                alignItems="center"
              >
                <MDTypography variant="h6" color="white">
                  API Keys
                </MDTypography>
                <MDButton
                  variant="outlined"
                  color="white"
                  size="small"
                  onClick={() => setCreateOpen(true)}
                >
                  <Icon sx={{ mr: 0.5 }}>add</Icon>
                  Create New Key
                </MDButton>
              </MDBox>
              <MDBox pt={2} pb={3}>
                {keysLoading ? (
                  <MDBox display="flex" justifyContent="center" p={3}>
                    <CircularProgress size={28} />
                  </MDBox>
                ) : (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell>Created</TableCell>
                          <TableCell>Last Used</TableCell>
                          <TableCell>Scopes</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {keys.map((key) => (
                          <TableRow key={key.id || key.name}>
                            <TableCell>
                              <MDTypography variant="button" fontWeight="bold">
                                {key.name}
                              </MDTypography>
                            </TableCell>
                            <TableCell>
                              <MDTypography variant="caption">
                                {formatDate(key.created_at)}
                              </MDTypography>
                            </TableCell>
                            <TableCell>
                              <MDTypography variant="caption">
                                {key.last_used ? formatDate(key.last_used) : "Never"}
                              </MDTypography>
                            </TableCell>
                            <TableCell>
                              <MDBox display="flex" gap={0.5} flexWrap="wrap">
                                {(key.scopes || []).map((scope) => (
                                  <MDBadge
                                    key={scope}
                                    badgeContent={scope}
                                    color="info"
                                    variant="contained"
                                    size="xs"
                                  />
                                ))}
                              </MDBox>
                            </TableCell>
                            <TableCell>
                              <MDBadge
                                badgeContent={key.revoked ? "Revoked" : "Active"}
                                color={key.revoked ? "error" : "success"}
                                variant="gradient"
                                size="xs"
                              />
                            </TableCell>
                            <TableCell align="right">
                              {!key.revoked && (
                                <MDButton
                                  variant="text"
                                  color="error"
                                  size="small"
                                  onClick={() => handleRevoke(key.id)}
                                  disabled={revoking === key.id}
                                >
                                  {revoking === key.id ? (
                                    <CircularProgress size={16} color="inherit" />
                                  ) : (
                                    "Revoke"
                                  )}
                                </MDButton>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {keys.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} align="center">
                              <MDTypography variant="caption" color="text">
                                No API keys. Create one to get started.
                              </MDTypography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      {/* ================================================================= */}
      {/* Create Key Dialog                                                  */}
      {/* ================================================================= */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New API Key</DialogTitle>
        <DialogContent>
          <MDBox mt={1} mb={2}>
            <MDInput
              label="Key Name"
              fullWidth
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. production-metrics"
            />
          </MDBox>
          <MDTypography variant="button" fontWeight="bold" mb={1}>
            Scopes
          </MDTypography>
          <FormGroup>
            {AVAILABLE_SCOPES.map((scope) => (
              <FormControlLabel
                key={scope}
                control={
                  <Checkbox
                    checked={newKeyScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    size="small"
                  />
                }
                label={
                  <MDTypography variant="button" fontWeight="regular">
                    {scope}
                  </MDTypography>
                }
              />
            ))}
          </FormGroup>
          {createError && (
            <MDBox mt={2}>
              <MDTypography variant="caption" color="error">
                {createError}
              </MDTypography>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton variant="text" color="dark" onClick={() => setCreateOpen(false)}>
            Cancel
          </MDButton>
          <MDButton
            variant="gradient"
            color="info"
            onClick={handleCreate}
            disabled={!newKeyName.trim() || newKeyScopes.length === 0 || creating}
          >
            {creating ? <CircularProgress size={20} color="inherit" /> : "Create"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default Settings;
