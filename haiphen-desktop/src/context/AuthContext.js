/**
 * Haiphen Desktop - Auth Context
 *
 * Provides authentication state and user info to the component tree.
 * Uses JWT tokens stored in localStorage (key: "haiphen_token") and
 * validates them against the API via the /v1/me endpoint.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import { fetchMe } from "../api/services";

const AuthContext = createContext(null);
AuthContext.displayName = "AuthContext";

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Attempt to load the current user profile from the API.
   * If no token is stored the check is skipped immediately.
   */
  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("haiphen_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    const res = await fetchMe();
    if (res.ok) {
      setUser(res.data.user || res.data);
      setError(null);
    } else {
      localStorage.removeItem("haiphen_token");
      setUser(null);
      setError(res.error);
    }
    setLoading(false);
  }, []);

  // Run on first mount
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  /**
   * Store a new JWT token and re-validate the user profile.
   * @param {string} token  JWT from the OAuth callback
   */
  const login = useCallback(
    (token) => {
      localStorage.setItem("haiphen_token", token);
      setLoading(true);
      setError(null);
      loadUser();
    },
    [loadUser]
  );

  /**
   * Clear the stored token and reset auth state.
   */
  const logout = useCallback(() => {
    localStorage.removeItem("haiphen_token");
    setUser(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      logout,
      isAuthenticated: !!user,
    }),
    [user, loading, error, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}

export { AuthProvider, useAuth };
