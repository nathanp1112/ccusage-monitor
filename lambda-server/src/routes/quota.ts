/**
 * Quota Route Handler
 * POST /api/quota - Receive usage quota data from Claude Code hook
 * GET  /api/quota - Read current quota data for dashboard
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  getJsonFromS3,
  getJsonFromS3WithETag,
  putJsonToS3WithETag,
  getMemberRegistryKey,
  getQuotaKey,
  withRetry,
} from '../lib/s3.js';
import type {
  MemberRegistry,
  QuotaEntry,
  QuotaStore,
} from '../lib/types.js';

const quotaRoute = new Hono();

// ============================================
// Request Validation Schema
// ============================================

const quotaEntrySchema = z.object({
  email: z.string().email('Invalid email format'),
  five_hour_percent: z.number().min(0).max(100),
  seven_day_percent: z.number().min(0).max(100),
  five_hour_resets_at: z.string().nullable().optional(),
  seven_day_resets_at: z.string().nullable().optional(),
  timestamp: z.string().min(1, 'timestamp is required'),
});

const quotaRequestSchema = z.object({
  quotas: z.array(quotaEntrySchema).min(1).max(50),
});

// ============================================
// POST /api/quota - Receive quota data
// ============================================

quotaRoute.post(
  '/',
  zValidator('json', quotaRequestSchema, (result, c) => {
    if (!result.success) {
      const errors = result.error.errors.map((e) => e.message).join(', ');
      return c.json(
        { success: false, error: errors, code: 'VALIDATION_ERROR' },
        400
      );
    }
  }),
  async (c) => {
    try {
      const { quotas } = c.req.valid('json');

      // Read member registry to resolve emails → memberIds
      const registry = await getJsonFromS3<MemberRegistry>(
        getMemberRegistryKey()
      );

      if (!registry) {
        return c.json(
          { success: false, error: 'Member registry not found', code: 'NO_REGISTRY' },
          404
        );
      }

      // Resolve each quota entry's email to a member
      const resolvedQuotas: Array<{
        memberId: string;
        memberName: string;
        email: string;
        entry: z.infer<typeof quotaEntrySchema>;
      }> = [];

      for (const entry of quotas) {
        const member = Object.values(registry.members).find(
          (m) => m.email.toLowerCase() === entry.email.toLowerCase()
        );
        if (member) {
          resolvedQuotas.push({
            memberId: member.id,
            memberName: member.name,
            email: member.email,
            entry,
          });
        }
      }

      if (resolvedQuotas.length === 0) {
        return c.json({
          success: true,
          updated: 0,
          skipped: quotas.length,
          message: 'No matching members found',
        });
      }

      // Upsert quota entries in S3 with ETag-based concurrency control
      await withRetry(
        async () => {
          const quotaKey = getQuotaKey();
          const existing = await getJsonFromS3WithETag<QuotaStore>(quotaKey);

          let store: QuotaStore;
          let etag: string | null;

          if (!existing) {
            store = { lastUpdated: new Date().toISOString(), entries: [] };
            etag = null;
          } else {
            store = existing.data;
            etag = existing.etag;
          }

          const now = new Date().toISOString();

          for (const { memberId, memberName, email, entry } of resolvedQuotas) {
            const existingIdx = store.entries.findIndex(
              (e) => e.memberId === memberId
            );

            const quotaEntry: QuotaEntry = {
              memberId,
              email,
              memberName,
              fiveHourPercent: entry.five_hour_percent,
              sevenDayPercent: entry.seven_day_percent,
              fiveHourResetsAt: entry.five_hour_resets_at ?? null,
              sevenDayResetsAt: entry.seven_day_resets_at ?? null,
              updatedAt: entry.timestamp || now,
            };

            if (existingIdx >= 0) {
              store.entries[existingIdx] = quotaEntry;
            } else {
              store.entries.push(quotaEntry);
            }
          }

          store.lastUpdated = now;
          await putJsonToS3WithETag(quotaKey, store, etag);
        },
        { retryConditionalFailed: true }
      );

      return c.json({
        success: true,
        updated: resolvedQuotas.length,
        skipped: quotas.length - resolvedQuotas.length,
      });
    } catch (error) {
      console.error('Quota update error:', error);
      return c.json(
        { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
        500
      );
    }
  }
);

// ============================================
// GET /api/quota - Read current quota data
// ============================================

quotaRoute.get('/', async (c) => {
  try {
    const store = await getJsonFromS3<QuotaStore>(getQuotaKey());

    if (!store) {
      return c.json({
        lastUpdated: null,
        entries: [],
      });
    }

    return c.json(store);
  } catch (error) {
    console.error('Quota read error:', error);
    return c.json(
      { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500
    );
  }
});

export default quotaRoute;
