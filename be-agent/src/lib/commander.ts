/**
 * Command polling and execution for admin-issued commands
 */

import { request } from 'undici';
import { existsSync, unlinkSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentConfig } from './config.js';

interface AgentCommand {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

interface PollResponse {
  success: boolean;
  commands: AgentCommand[];
}

/**
 * Poll server for pending commands and execute them
 */
export async function pollAndExecuteCommands(config: AgentConfig, accessToken?: string | null): Promise<void> {
  // 1. Poll for pending commands
  const url = `${config.server_url}/api/agent/commands?email=${encodeURIComponent(config.email)}`;
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  const response = await request(url, { method: 'GET', headers });
  const body = (await response.body.json()) as PollResponse;

  if (!body.success || !body.commands || body.commands.length === 0) {
    return;
  }

  // 2. Execute each command
  for (const cmd of body.commands) {
    let status: 'acked' | 'failed' = 'acked';
    let result = '';

    try {
      result = executeCommand(cmd);
    } catch (err) {
      status = 'failed';
      result = (err as Error).message;
    }

    // 3. ACK the command
    try {
      await ackCommand(config, cmd.id, status, result, accessToken);
    } catch (err) {
      // Log but don't fail — command was already executed
      console.error(`Failed to ACK command ${cmd.id}:`, (err as Error).message);
    }
  }
}

/**
 * Execute a single admin command locally
 */
function executeCommand(cmd: AgentCommand): string {
  switch (cmd.type) {
    case 'revoke-token':
      return revokeClaudeToken();
    case 'force-sync':
      return 'Force sync acknowledged — will run on next cycle';
    case 'update-config':
      return updateAgentConfig(cmd.payload);
    default:
      return `Unknown command type: ${cmd.type}`;
  }
}

/**
 * Revoke Claude Code authentication tokens
 * Removes credential files so Claude Code requires re-authentication
 */
function revokeClaudeToken(): string {
  const home = homedir();
  const revoked: string[] = [];

  // Standard Claude credential locations
  const credPaths = [
    join(home, '.claude', '.credentials.json'),
    join(home, '.claude', 'credentials.json'),
    join(home, '.config', 'claude', 'credentials.json'),
    join(home, '.config', 'claude', '.credentials.json'),
  ];

  // CCS (Claude Code Spaces) instances
  const ccsDir = join(home, '.ccs', 'instances');
  if (existsSync(ccsDir)) {
    try {
      const instances = readdirSync(ccsDir, { withFileTypes: true });
      for (const instance of instances) {
        if (instance.isDirectory()) {
          credPaths.push(
            join(ccsDir, instance.name, '.credentials.json'),
            join(ccsDir, instance.name, 'credentials.json'),
          );
        }
      }
    } catch {
      // Ignore errors scanning CCS directory
    }
  }

  for (const p of credPaths) {
    if (existsSync(p)) {
      try {
        unlinkSync(p);
        revoked.push(p);
      } catch (err) {
        // Continue trying other paths
      }
    }
  }

  if (revoked.length > 0) {
    return `Token revoked: removed ${revoked.length} credential file(s)`;
  }
  return 'No credential files found to revoke';
}

/**
 * Update agent configuration from admin payload
 */
function updateAgentConfig(payload: Record<string, unknown>): string {
  const configPath = join(homedir(), '.ccusage-agent', 'config.json');

  if (!existsSync(configPath)) {
    return 'Config file not found';
  }

  try {
    const currentConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    const updatedConfig = { ...currentConfig, ...payload };
    writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    return `Config updated: ${Object.keys(payload).join(', ')}`;
  } catch (err) {
    throw new Error(`Failed to update config: ${(err as Error).message}`);
  }
}

/**
 * ACK a command back to the server
 */
async function ackCommand(
  config: AgentConfig,
  commandId: string,
  status: 'acked' | 'failed',
  result: string,
  accessToken?: string | null
): Promise<void> {
  const url = `${config.server_url}/api/agent/commands/${commandId}/ack`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  await request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: config.email,
      status,
      result,
    }),
  });
}
