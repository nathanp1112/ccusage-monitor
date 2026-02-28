import { request } from 'undici';
import type { AgentConfig, AgentState } from './config.js';
import { saveState } from './config.js';

interface LoginResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: { email: string; name: string; role: string };
  error?: string;
}

interface RefreshResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  error?: string;
}

/**
 * Login to the server with email/password, returns tokens.
 */
export async function login(
  serverUrl: string,
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const { statusCode, body } = await request(`${serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = (await body.json()) as LoginResponse;

  if (statusCode !== 200 || !data.success) {
    throw new Error(data.error || `Login failed (HTTP ${statusCode})`);
  }

  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

/**
 * Refresh the access token using a refresh token.
 */
export async function refreshToken(
  serverUrl: string,
  token: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const { statusCode, body } = await request(`${serverUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  });

  const data = (await body.json()) as RefreshResponse;

  if (statusCode !== 200 || !data.success) {
    throw new Error(data.error || `Token refresh failed (HTTP ${statusCode})`);
  }

  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

/**
 * Decode JWT payload without verification (just to check expiry).
 * Returns null if the token is malformed.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired (with 60s buffer).
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp - 60; // 60s buffer
}

/**
 * Get a valid access token. Refreshes or re-logins as needed.
 * Updates state with new tokens and saves to disk.
 */
export async function getValidToken(
  config: AgentConfig,
  state: AgentState
): Promise<string> {
  // 1. Check existing access token
  if (state.access_token && !isTokenExpired(state.access_token)) {
    return state.access_token;
  }

  // 2. Try refresh
  if (state.refresh_token && !isTokenExpired(state.refresh_token)) {
    try {
      const tokens = await refreshToken(config.server_url, state.refresh_token);
      state.access_token = tokens.accessToken;
      state.refresh_token = tokens.refreshToken;
      saveState(state);
      return tokens.accessToken;
    } catch {
      // Refresh failed, fall through to login
    }
  }

  // 3. Re-login with stored credentials
  if (!config.password) {
    throw new Error(
      'No valid token and no password configured. Run "ccusage-agent setup --password <password>" to configure.'
    );
  }

  const tokens = await login(config.server_url, config.email, config.password);
  state.access_token = tokens.accessToken;
  state.refresh_token = tokens.refreshToken;
  saveState(state);
  return tokens.accessToken;
}
