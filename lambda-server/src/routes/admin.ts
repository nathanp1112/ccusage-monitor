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
  deleteObjectFromS3,
  listObjects,
  getCommandQueueKey,
  getMemberRegistryKey,
  getRawDataKey,
  getAggregatedDataKey,
  getMemberDetailViewKey,
  getPromptsKey,
} from '../lib/s3.js';
import type {
  MemberRegistry,
  CommandQueue,
  AgentCommand,
  CommandType,
  PromptMonthlyData,
} from '../lib/types.js';

const adminRoute = new Hono();

// UUID v4 validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Stage derived from BUCKET_NAME (e.g. "ccusage-data-jit" → "jit").
 * Prompt-browsing endpoints are JIT-only.
 */
function getStage(): string {
  const bucket = process.env.BUCKET_NAME || '';
  if (bucket.startsWith('ccusage-data-')) return bucket.replace('ccusage-data-', '');
  return 'dev';
}

function isPromptViewerEnabled(): boolean {
  return getStage() === 'jit';
}

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

/**
 * DELETE /api/admin/month/current
 * Hard-deletes raw + aggregated S3 data for the current month for ALL members.
 * Also removes the cached view for each member so the next aggregation starts clean.
 * After deletion, use POST /api/admin/aggregate?force=true to rebuild views.
 */
adminRoute.delete('/month/current', async (c) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-indexed

  const registry = await getJsonFromS3<MemberRegistry>(getMemberRegistryKey());
  if (!registry) {
    return c.json({ success: false, error: 'No members registered' }, 404);
  }

  const memberIds = Object.keys(registry.members);
  const deleted: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    memberIds.map(async (memberId) => {
      const keys = [
        getRawDataKey(memberId, year, month),
        getAggregatedDataKey(memberId, year, month),
        getMemberDetailViewKey(memberId, year),
      ];
      for (const key of keys) {
        try {
          await deleteObjectFromS3(key);
          deleted.push(key);
        } catch (err) {
          errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })
  );

  return c.json({
    success: true,
    year,
    month,
    membersProcessed: memberIds.length,
    keysDeleted: deleted.length,
    errors: errors.length > 0 ? errors : undefined,
    note: 'Run POST /api/admin/aggregate?force=true to rebuild views.',
  });
});

// ============================================
// Prompt Browsing Endpoints (admin-only)
// ============================================

const PROMPT_KEY_REGEX = /^prompts\/[^/]+\/(\d{4})-(\d{2})\.json$/;

/**
 * GET /api/admin/members/:id/prompts/months
 * List available prompt months for a member (year/month/count), newest first.
 */
adminRoute.get('/members/:id/prompts/months', async (c) => {
  if (!isPromptViewerEnabled()) {
    return c.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, 404);
  }

  const memberId = c.req.param('id');

  if (!isValidUUID(memberId)) {
    return c.json(
      { success: false, error: 'Invalid member ID format', code: 'VALIDATION_ERROR' },
      400
    );
  }

  try {
    const keys = await listObjects(`prompts/${memberId}/`);

    const parsed = keys
      .map((key) => {
        const match = PROMPT_KEY_REGEX.exec(key);
        if (!match) return null;
        return { year: parseInt(match[1], 10), month: parseInt(match[2], 10) };
      })
      .filter((m): m is { year: number; month: number } => m !== null);

    const months = await Promise.all(
      parsed.map(async ({ year, month }) => {
        const data = await getJsonFromS3<PromptMonthlyData>(getPromptsKey(memberId, year, month));
        return {
          year,
          month,
          count: data?.prompts.length ?? 0,
          lastUpdated: data?.lastUpdated ?? null,
        };
      })
    );

    months.sort((a, b) => (b.year - a.year) || (b.month - a.month));

    return c.json({ success: true, data: { memberId, months } });
  } catch (error) {
    console.error('Prompt months fetch error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

/**
 * GET /api/admin/members/:id/prompts?year=YYYY&month=MM
 * Return one month of prompts for a member, grouped by calendar day (UTC).
 * Days are sorted newest-first; prompts within a day are sorted oldest-first.
 */
adminRoute.get('/members/:id/prompts', async (c) => {
  if (!isPromptViewerEnabled()) {
    return c.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, 404);
  }

  const memberId = c.req.param('id');

  if (!isValidUUID(memberId)) {
    return c.json(
      { success: false, error: 'Invalid member ID format', code: 'VALIDATION_ERROR' },
      400
    );
  }

  const url = new URL(c.req.url);
  const yearParam = url.searchParams.get('year');
  const monthParam = url.searchParams.get('month');
  const pageParam = url.searchParams.get('page');
  const pageSizeParam = url.searchParams.get('pageSize');

  const now = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : now.getUTCFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getUTCMonth() + 1;

  if (isNaN(year) || year < 2024 || year > now.getUTCFullYear() + 1) {
    return c.json(
      { success: false, error: 'Invalid year parameter', code: 'VALIDATION_ERROR' },
      400
    );
  }
  if (isNaN(month) || month < 1 || month > 12) {
    return c.json(
      { success: false, error: 'Invalid month parameter', code: 'VALIDATION_ERROR' },
      400
    );
  }

  // Pagination (by day). Default 5 days/page keeps response well under the 6MB Lambda limit
  // even for heavy users (~1000 prompts/day × a few KB each ≈ ~3-4MB).
  const page = Math.max(1, pageParam ? parseInt(pageParam, 10) || 1 : 1);
  const pageSize = Math.min(31, Math.max(1, pageSizeParam ? parseInt(pageSizeParam, 10) || 5 : 5));

  // Cap per-prompt content so a single runaway paste can't blow the response budget.
  const MAX_CONTENT_CHARS = 10_000;

  try {
    const data = await getJsonFromS3<PromptMonthlyData>(getPromptsKey(memberId, year, month));

    if (!data) {
      return c.json({
        success: true,
        data: {
          memberId,
          year,
          month,
          totalPrompts: 0,
          totalDays: 0,
          page,
          pageSize,
          hasMore: false,
          days: [],
        },
      });
    }

    const byDate = new Map<string, PromptMonthlyData['prompts']>();
    for (const p of data.prompts) {
      const date = p.timestamp.slice(0, 10); // YYYY-MM-DD (UTC)
      const list = byDate.get(date) ?? [];
      list.push(p);
      byDate.set(date, list);
    }

    // Sort day keys newest-first, then slice for pagination before materializing prompts.
    const allDateKeys = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
    const totalDays = allDateKeys.length;
    const start = (page - 1) * pageSize;
    const pagedKeys = allDateKeys.slice(start, start + pageSize);

    const days = pagedKeys.map((date) => {
      const prompts = byDate.get(date)!;
      return {
        date,
        count: prompts.length,
        prompts: prompts
          .slice()
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
          .map((p) => {
            const truncated = p.content.length > MAX_CONTENT_CHARS;
            return {
              uuid: p.uuid,
              timestamp: p.timestamp,
              sessionId: p.sessionId,
              projectPath: p.projectPath,
              cwd: p.cwd,
              content: truncated ? p.content.slice(0, MAX_CONTENT_CHARS) : p.content,
              truncated: truncated || undefined,
              originalLength: truncated ? p.content.length : undefined,
            };
          }),
      };
    });

    return c.json({
      success: true,
      data: {
        memberId,
        year,
        month,
        totalPrompts: data.prompts.length,
        totalDays,
        page,
        pageSize,
        hasMore: start + pagedKeys.length < totalDays,
        days,
      },
    });
  } catch (error) {
    console.error('Prompts fetch error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

export default adminRoute;
