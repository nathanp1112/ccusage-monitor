import { z } from 'zod';

/**
 * Token usage schema for individual entries
 */
export const tokenUsageSchema = z.object({
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  cache_creation_input_tokens: z.number().int().min(0).optional().default(0),
  cache_read_input_tokens: z.number().int().min(0).optional().default(0),
});

/**
 * Single usage entry from agent
 */
export const usageEntrySchema = z.object({
  request_id: z.string().min(1),
  timestamp: z.string().datetime(),
  model: z.string().min(1),
  project_path: z.string().optional(),
  session_id: z.string().optional(),
  usage: tokenUsageSchema,
  cost_usd: z.number().min(0).optional(),
  version: z.string().optional(),
});

/**
 * Payload for POST /api/usage - data ingestion from agents
 */
export const usageIngestionPayloadSchema = z.object({
  email: z.string().email(),
  entries: z.array(usageEntrySchema).min(1).max(1000),
  agent_version: z.string().optional(),
  hostname: z.string().optional(),
});

/**
 * Response for usage ingestion
 */
export const usageIngestionResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    synced: z.number(),
    skipped: z.number(),
    sync_id: z.string(),
  }),
});

/**
 * Query params for member list
 */
export const memberListQuerySchema = z.object({
  search: z.string().optional(),
  active: z.coerce.boolean().optional(),
  sort: z.enum(['name', 'email', 'lastSyncAt', 'costUsd']).optional().default('name'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

/**
 * Query params for dashboard
 */
export const dashboardQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

/**
 * Query params for member detail
 */
export const memberDetailQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

/**
 * Create member payload
 */
export const createMemberSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  role: z.enum(['admin', 'member']).optional().default('member'),
  password: z.string().min(8).optional(),
});

/**
 * Login payload
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Type exports
 */
export type UsageEntry = z.infer<typeof usageEntrySchema>;
export type UsageIngestionPayload = z.infer<typeof usageIngestionPayloadSchema>;
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type MemberDetailQuery = z.infer<typeof memberDetailQuerySchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
