/**
 * Agent Route Handler
 * Endpoints for agent-to-server communication (poll commands, ack)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  getJsonFromS3,
  putJsonToS3,
  getCommandQueueKey,
  getMemberRegistryKey,
  getReleasesVersionKey,
  getReleasesFileKey,
  getPresignedDownloadUrl,
} from '../lib/s3.js';
import type {
  MemberRegistry,
  CommandQueue,
} from '../lib/types.js';

const agentRoute = new Hono();

/**
 * GET /api/agent/version
 * Returns latest agent version + presigned download URL
 */
agentRoute.get('/version', async (c) => {
  const versionInfo = await getJsonFromS3<{ version: string; filename: string }>(
    getReleasesVersionKey()
  );

  if (!versionInfo) {
    return c.json({ success: false, error: 'No release published yet' }, 404);
  }

  // Generate presigned URL for the tgz (valid for 10 minutes)
  const downloadUrl = await getPresignedDownloadUrl(
    getReleasesFileKey(versionInfo.filename),
    600
  );

  return c.json({
    success: true,
    version: versionInfo.version,
    filename: versionInfo.filename,
    downloadUrl,
  });
});

/**
 * GET /api/agent/commands?email=...
 * Agent polls for pending commands
 */
agentRoute.get('/commands', async (c) => {
  const email = c.req.query('email');
  if (!email) {
    return c.json({ success: false, error: 'email query parameter is required' }, 400);
  }

  // Look up memberId by email
  const registry = await getJsonFromS3<MemberRegistry>(getMemberRegistryKey());
  if (!registry) {
    return c.json({ success: true, commands: [] });
  }

  const member = Object.values(registry.members).find(
    (m) => m.email.toLowerCase() === email.toLowerCase()
  );
  if (!member) {
    return c.json({ success: true, commands: [] });
  }

  // Read command queue
  const queue = await getJsonFromS3<CommandQueue>(getCommandQueueKey(member.id));
  const pending = (queue?.commands || []).filter((cmd) => cmd.status === 'pending');

  return c.json({ success: true, commands: pending });
});

/**
 * POST /api/agent/commands/:commandId/ack
 * Agent acknowledges a command after execution
 */
const ackSchema = z.object({
  email: z.string().email(),
  status: z.enum(['acked', 'failed']),
  result: z.string().optional(),
});

agentRoute.post(
  '/commands/:commandId/ack',
  zValidator('json', ackSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: 'Invalid request' }, 400);
    }
  }),
  async (c) => {
    const commandId = c.req.param('commandId');
    const body = c.req.valid('json');

    // Look up member
    const registry = await getJsonFromS3<MemberRegistry>(getMemberRegistryKey());
    if (!registry) {
      return c.json({ success: false, error: 'Member not found' }, 404);
    }

    const member = Object.values(registry.members).find(
      (m) => m.email.toLowerCase() === body.email.toLowerCase()
    );
    if (!member) {
      return c.json({ success: false, error: 'Member not found' }, 404);
    }

    // Read and update command queue
    const key = getCommandQueueKey(member.id);
    const queue = await getJsonFromS3<CommandQueue>(key);
    if (!queue) {
      return c.json({ success: false, error: 'Command not found' }, 404);
    }

    const command = queue.commands.find((cmd) => cmd.id === commandId);
    if (!command) {
      return c.json({ success: false, error: 'Command not found' }, 404);
    }

    // Idempotent: skip if already acked
    if (command.status !== 'pending') {
      return c.json({ success: true, message: 'Command already processed' });
    }

    command.status = body.status;
    command.ackedAt = new Date().toISOString();
    command.result = body.result;
    queue.lastUpdated = new Date().toISOString();

    await putJsonToS3(key, queue);

    return c.json({ success: true });
  }
);

export default agentRoute;
