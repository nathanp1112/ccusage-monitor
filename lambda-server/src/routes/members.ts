/**
 * Members Route Handler
 * Serves member data from pre-computed S3 views
 *
 * GET /api/members - List all members with stats (from views/members.json)
 * GET /api/members/:id - Get member yearly data (from views/members/{id}/{year}.json)
 */

import { Hono, type Context } from 'hono';
import {
  getJsonFromS3,
  getMembersViewKey,
  getMembersByMonthViewKey,
  getMemberDetailViewKey,
  getMemberRegistryKey,
  getRawDataKey,
} from '../lib/s3.js';
import type {
  MembersView,
  MemberYearlyView,
  MemberRegistry,
  RawMonthlyData,
} from '../lib/types.js';

const membersRoute = new Hono();

/**
 * Emails (prefix match) to hide from the members list.
 * Members whose email starts with any of these prefixes will be excluded.
 */
const HIDDEN_EMAIL_PREFIXES = [
  'brendan.pham@',
  'brendan.nghiapham@',
];

function isHiddenEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return HIDDEN_EMAIL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID v4
 */
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Parse optional ?year=&month= query params.
 * Returns:
 *  - { ok: true, period: null }            → no period filter (use legacy current-month view)
 *  - { ok: true, period: { year, month } } → valid past/current month
 *  - { ok: false, error }                  → 400 details
 */
function parsePeriodParams(
  yearParam: string | null,
  monthParam: string | null
):
  | { ok: true; period: { year: number; month: number } | null }
  | { ok: false; error: string } {
  if (!yearParam && !monthParam) {
    return { ok: true, period: null };
  }
  if (!yearParam || !monthParam) {
    return { ok: false, error: 'year and month must be provided together' };
  }

  // Reject anything that isn't pure digits — `parseInt('2026abc')` silently
  // returns 2026 and would otherwise pass numeric range checks.
  const INT_REGEX = /^\d+$/;
  if (!INT_REGEX.test(yearParam) || !INT_REGEX.test(monthParam)) {
    return { ok: false, error: 'year and month must be integers' };
  }

  const year = parseInt(yearParam, 10);
  const month = parseInt(monthParam, 10);
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  if (year < 2024 || year > currentYear) {
    return { ok: false, error: 'Invalid year parameter' };
  }
  if (month < 1 || month > 12) {
    return { ok: false, error: 'Invalid month parameter' };
  }
  if (year === currentYear && month > currentMonth) {
    return { ok: false, error: 'Requested month is in the future' };
  }
  return { ok: true, period: { year, month } };
}

function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date();
  return year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
}

function setMonthCacheHeader(c: Context, current: boolean): void {
  // Past months are immutable views; current month is volatile (re-aggregated hourly).
  // `private` (not `public`) because the response includes member emails — we don't want
  // shared caches/CDNs storing per-user PII even though the endpoint is JWT-gated.
  c.header(
    'Cache-Control',
    current ? 'no-cache, must-revalidate' : 'private, max-age=86400'
  );
}

/**
 * GET /api/members - List all members with aggregated stats
 *
 * Default: reads pre-computed views/members.json (current calendar month).
 * With ?year=&month=: reads views/members-by-month/{year}-{month}.json.
 */
membersRoute.get('/', async (c) => {
  const url = new URL(c.req.url);
  const periodResult = parsePeriodParams(
    url.searchParams.get('year'),
    url.searchParams.get('month')
  );

  if (!periodResult.ok) {
    return c.json(
      { success: false, error: periodResult.error, code: 'VALIDATION_ERROR' },
      400
    );
  }

  try {
    const period = periodResult.period;

    // Per-month leaderboard path
    if (period) {
      const membersView = await getJsonFromS3<MembersView>(
        getMembersByMonthViewKey(period.year, period.month)
      );

      if (!membersView) {
        return c.json(
          {
            success: false,
            error: 'No data for the requested month',
            code: 'NOT_FOUND',
          },
          404
        );
      }

      const filteredView = {
        ...membersView,
        members: membersView.members.filter((m) => !isHiddenEmail(m.email)),
      };

      setMonthCacheHeader(c, isCurrentMonth(period.year, period.month));
      return c.json({ success: true, data: filteredView });
    }

    // Legacy current-month path (backward compatible)
    const membersView = await getJsonFromS3<MembersView>(getMembersViewKey());

    if (!membersView) {
      // No pre-computed view yet - check registry for members
      const registry = await getJsonFromS3<MemberRegistry>(getMemberRegistryKey());

      if (!registry || Object.keys(registry.members).length === 0) {
        return c.json({
          success: true,
          message: 'No members registered yet',
          data: {
            generatedAt: new Date().toISOString(),
            teamTotals: {
              costUsd: 0,
              inputTokens: 0,
              outputTokens: 0,
            },
            members: [],
          },
        });
      }

      // Return members from registry with zero stats (excluding hidden emails)
      const members = Object.values(registry.members)
        .filter((m) => !isHiddenEmail(m.email))
        .map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          isActive: m.isActive,
          lastSyncAt: m.lastSyncAt,
          currentMonth: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
          previousMonth: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
          costChangePercent: 0,
        }));

      return c.json({
        success: true,
        message: 'Aggregator has not run yet. Showing registered members without stats.',
        data: {
          generatedAt: new Date().toISOString(),
          teamTotals: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
          members,
        },
      });
    }

    // Filter out hidden members from pre-computed view
    const filteredView = {
      ...membersView,
      members: membersView.members.filter((m) => !isHiddenEmail(m.email)),
    };

    setMonthCacheHeader(c, true); // legacy view is always the current month
    return c.json({
      success: true,
      data: filteredView,
    });
  } catch (error) {
    console.error('Members list fetch error:', error);
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
 * GET /api/members/:id - Get member yearly usage data
 * Reads from pre-computed views/members/{id}/{year}.json
 * Accepts optional `year` query parameter (default: current year)
 */
membersRoute.get('/:id', async (c) => {
  const memberId = c.req.param('id');

  // Validate UUID format
  if (!isValidUUID(memberId)) {
    return c.json(
      {
        success: false,
        error: 'Invalid member ID format',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  // Parse year query parameter
  const url = new URL(c.req.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  // Validate year
  if (isNaN(year) || year < 2024 || year > new Date().getFullYear() + 1) {
    return c.json({
      success: false,
      error: 'Invalid year parameter',
      code: 'VALIDATION_ERROR',
    }, 400);
  }

  try {
    const memberYearlyView = await getJsonFromS3<MemberYearlyView>(
      getMemberDetailViewKey(memberId, year)
    );

    if (!memberYearlyView) {
      // Check if member exists in registry
      const registry = await getJsonFromS3<MemberRegistry>(getMemberRegistryKey());

      if (!registry || !registry.members[memberId]) {
        return c.json(
          {
            success: false,
            error: 'Member not found',
            code: 'NOT_FOUND',
          },
          404
        );
      }

      // Member exists but no pre-computed view yet
      const member = registry.members[memberId];
      return c.json({
        success: true,
        message: 'Aggregator has not processed this member yet.',
        data: {
          generatedAt: new Date().toISOString(),
          member: {
            id: member.id,
            name: member.name,
            email: member.email,
            role: member.role,
            isActive: member.isActive,
          },
          year: year,
          months: {},
          recentSyncs: [],
        },
      });
    }

    return c.json({
      success: true,
      data: memberYearlyView,
    });
  } catch (error) {
    console.error('Member detail fetch error:', error);
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
 * GET /api/members/:id/raw - Get raw usage records for a member
 * Reads directly from raw/{memberId}/{year}-{month}.json
 * Used for detailed record inspection
 */
membersRoute.get('/:id/raw', async (c) => {
  const memberId = c.req.param('id');

  // Validate UUID format
  if (!isValidUUID(memberId)) {
    return c.json(
      {
        success: false,
        error: 'Invalid member ID format',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  const url = new URL(c.req.url);
  const yearParam = url.searchParams.get('year');
  const monthParam = url.searchParams.get('month');

  // Default to current month
  const now = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return c.json(
      {
        success: false,
        error: 'Invalid year or month parameter',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  try {
    // Check if member exists
    const registry = await getJsonFromS3<MemberRegistry>(getMemberRegistryKey());

    if (!registry || !registry.members[memberId]) {
      return c.json(
        {
          success: false,
          error: 'Member not found',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    // Get raw monthly data
    const rawData = await getJsonFromS3<RawMonthlyData>(getRawDataKey(memberId, year, month));

    if (!rawData) {
      return c.json({
        success: true,
        data: {
          memberId,
          year,
          month,
          lastUpdated: null,
          records: {},
          totalEntries: 0,
        },
      });
    }

    // Count total entries
    let totalEntries = 0;
    for (const dailyRecord of Object.values(rawData.records)) {
      totalEntries += dailyRecord.entries.length;
    }

    return c.json({
      success: true,
      data: {
        memberId: rawData.memberId,
        year: rawData.year,
        month: rawData.month,
        lastUpdated: rawData.lastUpdated,
        records: rawData.records,
        totalEntries,
      },
    });
  } catch (error) {
    console.error('Raw data fetch error:', error);
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

export default membersRoute;
