#!/usr/bin/env node

/**
 * CCUsage Quota Push Hook
 *
 * Self-contained script triggered by Claude Code Stop hook.
 * Reads the current account's 5h/7d usage quota from Anthropic's API
 * and pushes it to the CCUsage Lambda endpoint.
 *
 * Zero external dependencies — uses only Node.js builtins.
 *
 * Environment:
 *   CLAUDE_CONFIG_DIR — set by Claude Code, points to the instance config dir
 *
 * Reads:
 *   $CLAUDE_CONFIG_DIR/.claude.json  — oauthAccount.emailAddress
 *   macOS Keychain                   — OAuth access token
 *   ~/.ccusage-agent/config.json     — server_url for Lambda endpoint
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import https from 'node:https';

const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const API_TIMEOUT_MS = 10000;

// ============================================
// Main
// ============================================

async function main() {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (!configDir) return; // Not inside a Claude Code session

  // 1. Read email from instance config
  const email = readEmail(configDir);
  if (!email) return;

  // 2. Get OAuth credentials
  let creds = getCredentials(configDir);
  if (!creds || !creds.accessToken) return;

  // 3. Refresh token if expired
  if (creds.expiresAt && creds.expiresAt <= Date.now()) {
    if (!creds.refreshToken) return;
    const refreshed = await refreshAccessToken(creds.refreshToken);
    if (!refreshed) return;
    creds = { ...creds, ...refreshed };
  }

  // 4. Fetch usage from Anthropic API
  const usage = await fetchUsage(creds.accessToken);
  if (!usage) return;

  // 5. Read server URL from agent config
  const serverUrl = readServerUrl();
  if (!serverUrl) return;

  // 6. Push to Lambda
  await pushQuota(serverUrl, email, usage);
}

// ============================================
// Config Readers
// ============================================

function readEmail(configDir) {
  try {
    const claudeJson = JSON.parse(
      readFileSync(join(configDir, '.claude.json'), 'utf-8')
    );
    return claudeJson?.oauthAccount?.emailAddress || null;
  } catch {
    return null;
  }
}

function readServerUrl() {
  try {
    const configPath = join(homedir(), '.ccusage-agent', 'config.json');
    if (!existsSync(configPath)) return null;
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    // Support both v2 (targets array) and v1 (single server_url)
    const targets = config.targets || (config.server_url ? [config] : []);
    return targets[0]?.server_url || null;
  } catch {
    return null;
  }
}

// ============================================
// Credential Access
// ============================================

function getCredentials(configDir) {
  // Try macOS Keychain first
  if (platform() === 'darwin') {
    const creds = readKeychainCredentials(configDir);
    if (creds) return creds;
  }

  // Fallback to file-based credentials
  return readFileCredentials(configDir);
}

function readKeychainCredentials(configDir) {
  try {
    const suffix = createHash('sha256').update(configDir).digest('hex').slice(0, 8);
    const service = `Claude Code-credentials-${suffix}`;
    const raw = execSync(
      `/usr/bin/security find-generic-password -s "${service}" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 3000 }
    ).trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const creds = parsed.claudeAiOauth || parsed;
    return {
      accessToken: creds.accessToken || null,
      refreshToken: creds.refreshToken || null,
      expiresAt: creds.expiresAt || null,
    };
  } catch {
    return null;
  }
}

function readFileCredentials(configDir) {
  try {
    // Try instance-level credentials first, then global
    const paths = [
      join(configDir, '.credentials.json'),
      join(homedir(), '.claude', '.credentials.json'),
    ];
    for (const p of paths) {
      if (!existsSync(p)) continue;
      const parsed = JSON.parse(readFileSync(p, 'utf-8'));
      const creds = parsed.claudeAiOauth || parsed;
      if (creds.accessToken) {
        return {
          accessToken: creds.accessToken,
          refreshToken: creds.refreshToken || null,
          expiresAt: creds.expiresAt || null,
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ============================================
// Token Refresh
// ============================================

function refreshAccessToken(refreshToken) {
  return new Promise((resolve) => {
    const clientId = process.env.CLAUDE_CODE_OAUTH_CLIENT_ID || OAUTH_CLIENT_ID;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString();

    const req = https.request(
      {
        hostname: 'platform.claude.com',
        path: '/v1/oauth/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: API_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.access_token) {
                resolve({
                  accessToken: parsed.access_token,
                  refreshToken: parsed.refresh_token || refreshToken,
                  expiresAt: parsed.expires_in
                    ? Date.now() + parsed.expires_in * 1000
                    : parsed.expires_at,
                });
                return;
              }
            } catch { /* ignore */ }
          }
          resolve(null);
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(body);
  });
}

// ============================================
// Anthropic Usage API
// ============================================

function fetchUsage(accessToken) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/api/oauth/usage',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json',
        },
        timeout: API_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              const fiveHour = parsed.five_hour?.utilization;
              const sevenDay = parsed.seven_day?.utilization;
              if (fiveHour == null && sevenDay == null) {
                resolve(null);
                return;
              }
              resolve({
                five_hour_percent: clamp(fiveHour),
                seven_day_percent: clamp(sevenDay),
                five_hour_resets_at: parsed.five_hour?.resets_at || null,
                seven_day_resets_at: parsed.seven_day?.resets_at || null,
              });
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function clamp(v) {
  if (v == null || !isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

// ============================================
// Push to Lambda
// ============================================

function pushQuota(serverUrl, email, usage) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      quotas: [
        {
          email,
          five_hour_percent: usage.five_hour_percent,
          seven_day_percent: usage.seven_day_percent,
          five_hour_resets_at: usage.five_hour_resets_at,
          seven_day_resets_at: usage.seven_day_resets_at,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const url = new URL(`${serverUrl}/api/quota`);

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: API_TIMEOUT_MS,
      },
      (res) => {
        // Drain response
        res.on('data', () => {});
        res.on('end', () => resolve());
      }
    );
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.end(payload);
  });
}

// ============================================
// Run (silent failure on all errors)
// ============================================

main().catch(() => {});
