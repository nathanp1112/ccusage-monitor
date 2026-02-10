/**
 * Admin Route Handler
 * POST /api/admin/aggregate - Trigger aggregator Lambda
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  getJsonFromS3,
  putJsonToS3,
  getCommandQueueKey,
  getMemberRegistryKey,
} from '../lib/s3.js';
import type {
  MemberRegistry,
  CommandQueue,
  AgentCommand,
  CommandType,
} from '../lib/types.js';

const adminRoute = new Hono();

// Lambda client (lazy initialized)
let lambdaClient: LambdaClient | null = null;

function getLambdaClient(): LambdaClient {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || 'ap-southeast-1',
    });
  }
  return lambdaClient;
}

/**
 * POST /api/admin/aggregate
 * Triggers the aggregator Lambda to recompute views
 */
adminRoute.post('/aggregate', async (c) => {
  const functionName = process.env.AGGREGATOR_FUNCTION_NAME;

  if (!functionName) {
    return c.json(
      {
        success: false,
        error: 'Aggregator function not configured',
      },
      500
    );
  }

  try {
    // Extract force flag from query params
    const url = new URL(c.req.url);
    const force = url.searchParams.get('force') === 'true';

    const client = getLambdaClient();
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse', // Synchronous — wait for result
      Payload: JSON.stringify({ source: 'api-trigger', force }),
    });

    const response = await client.send(command);

    // Parse aggregator result from Lambda response payload
    let payloadStr = '';
    if (response.Payload) {
      if (typeof response.Payload === 'string') {
        payloadStr = response.Payload;
      } else {
        // Uint8Array, Uint8ArrayBlobAdapter, or Buffer
        const bytes = response.Payload instanceof Uint8Array
          ? response.Payload
          : new Uint8Array(response.Payload);
        payloadStr = new TextDecoder().decode(bytes);
      }
    }

    // Check for Lambda-level errors
    if (response.FunctionError) {
      return c.json(
        {
          success: false,
          error: `Aggregator failed: ${response.FunctionError}`,
          details: payloadStr ? JSON.parse(payloadStr) : null,
        },
        500
      );
    }

    if (!payloadStr) {
      return c.json({ success: true, message: 'Aggregator completed (no response payload)', force });
    }

    let result = JSON.parse(payloadStr);
    // Lambda may double-encode the result as a JSON string
    if (typeof result === 'string') {
      result = JSON.parse(result);
    }

    return c.json({
      success: true,
      message: `Aggregation completed${force ? ' (force rebuild)' : ''}`,
      ...result,
    });
  } catch (error) {
    console.error('Failed to trigger aggregator:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger aggregator',
      },
      500
    );
  }
});

/**
 * GET /api/admin/status
 * Returns system status
 */
adminRoute.get('/status', async (c) => {
  return c.json({
    success: true,
    data: {
      environment: process.env.NODE_ENV || 'development',
      bucket: process.env.BUCKET_NAME || 'not-configured',
      region: process.env.AWS_REGION || 'ap-southeast-1',
      aggregatorFunction: process.env.AGGREGATOR_FUNCTION_NAME || 'not-configured',
    },
  });
});

// ============================================
// Command Management Endpoints
// ============================================

function generateUUID(): string {
  return crypto.randomUUID();
}

const createCommandSchema = z.object({
  email: z.string().email(),
  type: z.enum(['revoke-token', 'force-sync', 'update-config', 'custom']),
  payload: z.record(z.unknown()).optional().default({}),
  created_by: z.string().optional().default('admin'),
});

/**
 * POST /api/admin/commands
 * Create a new command for an agent
 */
adminRoute.post(
  '/commands',
  zValidator('json', createCommandSchema, (result, c) => {
    if (!result.success) {
      return c.json({ success: false, error: 'Invalid request' }, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid('json');

    // Look up member by email
    const registry = await getJsonFromS3<MemberRegistry>(getMemberRegistryKey());
    if (!registry) {
      return c.json({ success: false, error: 'No members registered' }, 404);
    }

    const member = Object.values(registry.members).find(
      (m) => m.email.toLowerCase() === body.email.toLowerCase()
    );
    if (!member) {
      return c.json({ success: false, error: `Member not found: ${body.email}` }, 404);
    }

    // Create command
    const command: AgentCommand = {
      id: generateUUID(),
      type: body.type as CommandType,
      payload: body.payload,
      createdAt: new Date().toISOString(),
      createdBy: body.created_by,
      status: 'pending',
    };

    // Read or create queue
    const key = getCommandQueueKey(member.id);
    let queue = await getJsonFromS3<CommandQueue>(key);

    if (!queue) {
      queue = {
        memberId: member.id,
        lastUpdated: new Date().toISOString(),
        commands: [],
      };
    }

    queue.commands.push(command);
    queue.lastUpdated = new Date().toISOString();

    await putJsonToS3(key, queue);

    return c.json({
      success: true,
      commandId: command.id,
      memberId: member.id,
      memberName: member.name,
    });
  }
);

/**
 * GET /api/admin/commands/:memberId
 * View command history for a member
 */
adminRoute.get('/commands/:memberId', async (c) => {
  const memberId = c.req.param('memberId');
  const key = getCommandQueueKey(memberId);
  const queue = await getJsonFromS3<CommandQueue>(key);

  if (!queue) {
    return c.json({ success: true, commands: [] });
  }

  return c.json({
    success: true,
    memberId,
    commands: queue.commands,
  });
});

export default adminRoute;
