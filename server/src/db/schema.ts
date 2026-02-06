import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  integer,
  decimal,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Database schema for CCUsage team monitoring
 * Based on technical design: docs/team-monitor-technical-design.md
 */

// Role enum for members
export const memberRoleEnum = pgEnum('member_role', ['admin', 'member']);

/**
 * Members table - team member accounts
 */
export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    apiKey: varchar('api_key', { length: 64 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    role: memberRoleEnum('role').default('member').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('members_email_idx').on(table.email),
    uniqueIndex('members_api_key_idx').on(table.apiKey),
  ]
);

/**
 * Usage records table - individual usage entries from agents
 */
export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    requestId: varchar('request_id', { length: 64 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    usageDate: date('usage_date').notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    projectPath: varchar('project_path', { length: 500 }),
    sessionId: varchar('session_id', { length: 64 }),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    cacheCreationTokens: integer('cache_creation_tokens').default(0).notNull(),
    cacheReadTokens: integer('cache_read_tokens').default(0).notNull(),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }).default('0').notNull(),
    claudeVersion: varchar('claude_version', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('usage_records_request_id_idx').on(table.requestId),
    index('usage_records_member_id_idx').on(table.memberId),
    index('usage_records_usage_date_idx').on(table.usageDate),
    index('usage_records_member_date_idx').on(table.memberId, table.usageDate),
  ]
);

/**
 * Daily aggregates table - pre-computed daily summaries per member
 */
export const dailyAggregates = pgTable(
  'daily_aggregates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    usageDate: date('usage_date').notNull(),
    totalInputTokens: integer('total_input_tokens').default(0).notNull(),
    totalOutputTokens: integer('total_output_tokens').default(0).notNull(),
    totalCacheCreation: integer('total_cache_creation').default(0).notNull(),
    totalCacheRead: integer('total_cache_read').default(0).notNull(),
    totalCostUsd: decimal('total_cost_usd', { precision: 10, scale: 4 }).default('0').notNull(),
    modelBreakdown: jsonb('model_breakdown').$type<Record<string, ModelStats>>(),
    recordCount: integer('record_count').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('daily_aggregates_member_date_idx').on(table.memberId, table.usageDate),
    index('daily_aggregates_usage_date_idx').on(table.usageDate),
  ]
);

/**
 * Sync logs table - audit trail for agent sync operations
 */
export const syncLogs = pgTable(
  'sync_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
    recordsReceived: integer('records_received').default(0).notNull(),
    recordsInserted: integer('records_inserted').default(0).notNull(),
    recordsSkipped: integer('records_skipped').default(0).notNull(),
    clientIp: varchar('client_ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 255 }),
    agentVersion: varchar('agent_version', { length: 20 }),
    hostname: varchar('hostname', { length: 255 }),
  },
  (table) => [
    index('sync_logs_member_id_idx').on(table.memberId),
    index('sync_logs_synced_at_idx').on(table.syncedAt),
  ]
);

/**
 * Type definitions for JSONB fields
 */
export interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  recordCount: number;
}

/**
 * Inferred types from schema
 */
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type DailyAggregate = typeof dailyAggregates.$inferSelect;
export type NewDailyAggregate = typeof dailyAggregates.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;
