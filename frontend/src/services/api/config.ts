import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import {
  getAuthToken as readToken,
  setAuthToken as writeToken,
  clearSession,
} from "./session";

// Base API URL - adjust based on your backend URL
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

// Socket.io base URL — the root server URL (no /api/v1 suffix)
// Priority: VITE_SOCKET_URL > VITE_API_URL > derived from VITE_API_BASE_URL
export const getSocketBaseURL = (): string => {
  // 1. Explicit socket URL (most reliable for production)
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL as string;
  }

  // 2. Legacy explicit socket URL env var
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL as string;
  }

  // 3. Derive from VITE_API_BASE_URL by stripping /api/v1 suffix
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:5000/api/v1";
  const socketUrl = apiBaseUrl.replace(/\/api\/v\d+$|\/api$/, '');
  return socketUrl || "http://localhost:5000";
};

// Timeouts by request type:
//   GET  → 15s  (read-only, should be fast; fail quickly so the UI shows a retry)
//   POST/PUT/PATCH/DELETE → 60s (uploads, checkout, etc. can legitimately take longer)
const GET_TIMEOUT = 15000;
const MUTATE_TIMEOUT = 60000;

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: MUTATE_TIMEOUT, // overridden per-request in the interceptor below
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - Add token and apply per-method timeout
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = readToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Apply tighter timeout for read-only requests unless a custom timeout was set
    if (config.method?.toLowerCase() === "get" && config.timeout === MUTATE_TIMEOUT) {
      config.timeout = GET_TIMEOUT;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: any) => {
    // Normalise connection-level failures (no HTTP response) into a clear,
    // user-friendly message so the UI shows "network error" with context
    // instead of axios's raw "Network Error" / "timeout of 60000ms exceeded".
    if (!error.response) {
      if (error.code === "ECONNABORTED") {
        error.friendlyMessage =
          "The request timed out. Please check your connection and try again.";
      } else {
        error.friendlyMessage =
          "Unable to reach the server. Please check your internet connection and try again.";
      }
    }

    // Only handle 401 (Unauthorized) for auto-logout
    // 403 (Forbidden) means user is authenticated but doesn't have permission - DO NOT LOGOUT
    if (error.response?.status === 401) {
      // Check if this is an authentication endpoint (OTP verification, etc.)
      // Don't redirect for auth endpoints - let the component handle the error
      const isAuthEndpoint = error.config?.url?.includes("/auth/");

      // Check if there was a token in the request (meaning user was logged in)
      const hadToken = error.config?.headers?.Authorization;

      // Only redirect if:
      // 1. It's not an auth endpoint
      // 2. There was a token in the request (user was logged in but token expired)
      // 3. User is not already on login/signup pages
      if (!isAuthEndpoint && hadToken) {
        const currentPath = window.location.pathname;

        // Skip redirect if already on public auth pages (login/signup)
        if (currentPath.includes("/login") || currentPath.includes("/signup")) {
          return Promise.reject(error);
        }

        // Token expired or invalid - clear token and redirect to appropriate login
        // Determine which login page based on the Current URL or API endpoint
        const apiUrl = error.config?.url || "";
        let redirectPath = "/login";

        if (currentPath.includes("/admin/") || apiUrl.includes("/admin/")) {
          redirectPath = "/admin/login";
        } else if (
          currentPath.includes("/seller/") ||
          apiUrl.includes("/seller/") ||
          apiUrl.includes("/sellers")
        ) {
          redirectPath = "/seller/login";
        } else if (
          currentPath.includes("/delivery/") ||
          apiUrl.includes("/delivery/")
        ) {
          redirectPath = "/delivery/login";
        }

        clearSession();
        window.location.href = redirectPath;
      }
      // If no token was present, user is just browsing as guest - don't redirect
      // Just reject the promise so the component can handle it gracefully
    }
    // For 403 and other errors, just reject the promise so the UI can handle it
    return Promise.reject(error);
  }
);

// Token management helpers
export const setAuthToken = (token: string) => writeToken(token);

export const getAuthToken = (): string | null => readToken();

export const removeAuthToken = () => clearSession();

export { currentPortal, getStoredUser, setStoredUser } from "./session";

export default api;
