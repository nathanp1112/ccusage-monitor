/**
 * S3 Utilities for CCUsage Monitor
 * Handles read/write operations to S3 bucket
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

// S3 Client - reused across Lambda invocations
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

const BUCKET_NAME = process.env.BUCKET_NAME || 'ccusage-data-dev';

// ============================================
// Transient Error Detection
// ============================================

const TRANSIENT_ERROR_NAMES = [
  'ThrottlingException',
  'ServiceUnavailable',
  'InternalError',
  'RequestTimeout',
  'SlowDown',
  'ServiceException',
];

export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return TRANSIENT_ERROR_NAMES.includes(error.name) ||
         error.message.includes('socket hang up') ||
         error.message.includes('ECONNRESET');
}

// ============================================
// ETag Support for Conditional Writes
// ============================================

export interface S3ObjectWithETag<T> {
  data: T;
  etag: string | null;
}

/**
 * Get JSON object from S3 with ETag for conditional writes
 * Returns data and ETag for use with putJsonToS3WithETag
 */
export async function getJsonFromS3WithETag<T>(key: string): Promise<S3ObjectWithETag<T> | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const bodyString = await response.Body?.transformToString();

    if (!bodyString) {
      return null;
    }

    return {
      data: JSON.parse(bodyString) as T,
      etag: response.ETag || null,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

/**
 * Put JSON object to S3 with conditional write using ETag
 * Throws ConditionalCheckFailed if ETag doesn't match (concurrent modification)
 */
export async function putJsonToS3WithETag<T>(
  key: string,
  data: T,
  expectedETag: string | null
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
    // If we have an ETag, require it to match (update existing)
    // If no ETag, require object to not exist (create new)
    ...(expectedETag
      ? { IfMatch: expectedETag }
      : { IfNoneMatch: '*' }),
  });

  try {
    const response = await s3Client.send(command);
    return response.ETag || '';
  } catch (error: unknown) {
    if (error instanceof Error &&
        (error.name === 'PreconditionFailed' || error.name === 'ConditionalCheckFailedException')) {
      const concurrentError = new Error('Concurrent modification detected');
      concurrentError.name = 'ConditionalCheckFailed';
      throw concurrentError;
    }
    throw error;
  }
}

/**
 * Get JSON object from S3
 * Returns null if object doesn't exist
 */
export async function getJsonFromS3<T>(key: string): Promise<T | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const bodyString = await response.Body?.transformToString();

    if (!bodyString) {
      return null;
    }

    return JSON.parse(bodyString) as T;
  } catch (error: unknown) {
    // Handle "NoSuchKey" error - object doesn't exist
    if (error instanceof Error && error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

/**
 * Put JSON object to S3
 */
export async function putJsonToS3<T>(key: string, data: T): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  });

  await s3Client.send(command);
}

/**
 * Check if object exists in S3
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * List objects with a prefix
 */
export async function listObjects(prefix: string): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  return (response.Contents || []).map((obj: { Key?: string }) => obj.Key!).filter(Boolean);
}

// ============================================
// S3 Path Helpers
// ============================================

/**
 * Get S3 key for raw monthly data
 * Format: raw/{memberId}/{year}-{month}.json
 */
export function getRawDataKey(memberId: string, year: number, month: number): string {
  const monthStr = month.toString().padStart(2, '0');
  return `raw/${memberId}/${year}-${monthStr}.json`;
}

/**
 * Get S3 key for pre-aggregated monthly data
 * Format: aggregated/{memberId}/{year}-{month}.json
 */
export function getAggregatedDataKey(memberId: string, year: number, month: number): string {
  const monthStr = month.toString().padStart(2, '0');
  return `aggregated/${memberId}/${year}-${monthStr}.json`;
}

/**
 * Get S3 key for member registry
 * Format: members/index.json
 */
export function getMemberRegistryKey(): string {
  return 'members/index.json';
}

/**
 * Get S3 key for sync logs
 * Format: sync-logs/{year}-{month}/{memberId}.json
 */
export function getSyncLogKey(memberId: string, year: number, month: number): string {
  const monthStr = month.toString().padStart(2, '0');
  return `sync-logs/${year}-${monthStr}/${memberId}.json`;
}

/**
 * Get S3 key for dashboard view
 * Format: views/dashboard.json
 */
export function getDashboardViewKey(): string {
  return 'views/dashboard.json';
}

/**
 * Get S3 key for members view
 * Format: views/members.json
 */
export function getMembersViewKey(): string {
  return 'views/members.json';
}

/**
 * Get S3 key for member detail view
 * Format: views/members/{memberId}/{year}.json
 */
export function getMemberDetailViewKey(memberId: string, year: number): string {
  return `views/members/${memberId}/${year}.json`;
}

/**
 * Get S3 key for aggregator metadata
 * Format: meta/last-processed.json
 */
export function getMetaKey(): string {
  return 'meta/last-processed.json';
}

// ============================================
// Retry Logic for Concurrent Writes
// ============================================

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  retryConditionalFailed?: boolean;
}

/**
 * Execute a function with retry logic
 * Uses exponential backoff for transient errors and concurrent writes
 * Non-transient errors (validation, permission) fail immediately
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 100, retryConditionalFailed = true } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a retryable error
      const isConditionalFailed = lastError.name === 'ConditionalCheckFailed';
      const isRetryable = isTransientError(error) || (isConditionalFailed && retryConditionalFailed);

      if (!isRetryable || attempt >= maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter: 100-150ms, 200-300ms, 400-600ms
      const jitter = Math.random() * 0.5 + 1; // 1.0 to 1.5
      const delayMs = baseDelayMs * Math.pow(2, attempt) * jitter;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

// ============================================
// Decimal Precision for Costs
// ============================================

/**
 * Add two cost values with proper decimal precision
 * Avoids floating point errors like 0.1 + 0.2 = 0.30000000000000004
 */
export function addCost(a: number, b: number): number {
  // Use 6 decimal places (microdollars) to avoid precision loss
  const PRECISION = 1000000;
  return Math.round((a * PRECISION + b * PRECISION)) / PRECISION;
}

/**
 * Round a cost value to 6 decimal places
 */
export function roundCost(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

// ============================================
// Concurrency Limiter
// ============================================

/**
 * Process items with bounded concurrency
 * Prevents memory exhaustion when processing many items in parallel
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 10
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  // Create worker pool
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

export { s3Client, BUCKET_NAME };
