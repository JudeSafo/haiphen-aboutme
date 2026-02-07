/**
 * Haiphen Desktop - Login Page
 *
 * Provides two authentication flows:
 *   1. "Login with GitHub" -- opens the Haiphen auth endpoint in the system
 *      browser. In Tauri it uses the shell plugin; in dev mode it falls back
 *      to window.open(). A deep-link callback (haiphen-desktop://callback)
 *      delivers the JWT token back to the app.
 *   2. Manual token input -- a text field for pasting a JWT directly,
 *      useful during development and testing.
 *
 * Uses the existing Material Dashboard 2 components (MDBox, MDButton,
 * MDTypography, MDInput) and the BasicLayout wrapper for consistent styling.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

// @mui material components
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";

// @mui icons
import GitHubIcon from "@mui/icons-material/GitHub";
import VpnKeyIcon from "@mui/icons-material/VpnKey";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Authentication layout components
import BasicLayout from "layouts/authentication/components/BasicLayout";

// Auth context
import { useAuth } from "../../context/AuthContext";

// Images
import bgImage from "assets/images/bg-sign-in-basic.jpeg";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_BASE = process.env.REACT_APP_AUTH_URL || "https://auth.haiphen.io";
const OAUTH_REDIRECT = "haiphen-desktop://callback";
const LOGIN_URL = `${AUTH_BASE}/login?redirect=${encodeURIComponent(OAUTH_REDIRECT)}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Open a URL in the system browser.
 * Prefers the Tauri shell plugin when available; falls back to window.open().
 */
async function openInBrowser(url) {
  try {
    // Dynamically import the Tauri shell plugin (only available inside Tauri)
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    // Not running inside Tauri -- fall back to a regular browser popup
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function LoginPage() {
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [manualToken, setManualToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // -----------------------------------------------------------------------
  // Handle deep-link callback token
  // -----------------------------------------------------------------------

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setSubmitting(true);
      login(token);
    }
  }, [searchParams, login]);

  // -----------------------------------------------------------------------
  // Redirect away once authenticated
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  const handleGitHubLogin = useCallback(() => {
    setError(null);
    openInBrowser(LOGIN_URL);
  }, []);

  const handleManualSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const trimmed = manualToken.trim();
      if (!trimmed) {
        setError("Please enter a token.");
        return;
      }
      setError(null);
      setSubmitting(true);
      login(trimmed);
    },
    [manualToken, login]
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <BasicLayout image={bgImage}>
      <Card>
        {/* Header banner */}
        <MDBox
          variant="gradient"
          bgColor="info"
          borderRadius="lg"
          coloredShadow="info"
          mx={2}
          mt={-3}
          p={2}
          mb={1}
          textAlign="center"
        >
          {/* Haiphen robot icon */}
          <MDBox
            component="img"
            src="https://haiphen.io/assets/robot_haiphen.png"
            alt="Haiphen"
            sx={{ width: 56, height: 56, mb: 1 }}
          />
          <MDTypography variant="h4" fontWeight="medium" color="white" mt={1}>
            Haiphen
          </MDTypography>
          <MDTypography variant="body2" color="white" mt={0.5} mb={1}>
            Semantic Edge Protocol Intelligence
          </MDTypography>
        </MDBox>

        <MDBox pt={4} pb={3} px={3}>
          {/* Loading spinner while checking existing session */}
          {(authLoading || submitting) && (
            <MDBox display="flex" justifyContent="center" py={4}>
              <CircularProgress color="info" />
            </MDBox>
          )}

          {!authLoading && !submitting && (
            <>
              {/* Error message */}
              {error && (
                <MDBox mb={2}>
                  <MDTypography variant="caption" color="error" fontWeight="medium">
                    {error}
                  </MDTypography>
                </MDBox>
              )}

              {/* GitHub OAuth button */}
              <MDBox mb={2}>
                <MDButton
                  variant="gradient"
                  color="dark"
                  fullWidth
                  onClick={handleGitHubLogin}
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <GitHubIcon />
                  &nbsp; Login with GitHub
                </MDButton>
              </MDBox>

              <MDBox my={3}>
                <Divider>
                  <MDTypography variant="overline" color="text">
                    or paste token
                  </MDTypography>
                </Divider>
              </MDBox>

              {/* Manual token input */}
              <MDBox component="form" role="form" onSubmit={handleManualSubmit}>
                <MDBox mb={2}>
                  <MDInput
                    type="password"
                    label="JWT Token"
                    fullWidth
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <VpnKeyIcon sx={{ mr: 1, color: "text.secondary", fontSize: 20 }} />
                      ),
                    }}
                  />
                </MDBox>
                <MDBox mt={2} mb={1}>
                  <MDButton
                    type="submit"
                    variant="gradient"
                    color="info"
                    fullWidth
                    disabled={!manualToken.trim()}
                  >
                    Authenticate
                  </MDButton>
                </MDBox>
              </MDBox>

              <MDBox mt={3} mb={1} textAlign="center">
                <MDTypography variant="button" color="text">
                  Need an account?{" "}
                  <MDTypography
                    component="a"
                    href="https://haiphen.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="button"
                    color="info"
                    fontWeight="medium"
                    textGradient
                  >
                    Sign up at haiphen.io
                  </MDTypography>
                </MDTypography>
              </MDBox>
            </>
          )}
        </MDBox>
      </Card>
    </BasicLayout>
  );
}

export default LoginPage;
