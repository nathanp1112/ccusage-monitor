import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { gzipSync } from 'node:zlib';
import { sign } from 'hono/jwt';

// Mock S3 operations before importing app
vi.mock('../lib/s3.js', () => ({
  getJsonFromS3: vi.fn().mockResolvedValue(null),
  getJsonFromS3WithETag: vi.fn().mockResolvedValue(null),
  putJsonToS3: vi.fn().mockResolvedValue(undefined),
  putJsonToS3WithETag: vi.fn().mockResolvedValue(undefined),
  getRawDataKey: vi.fn((id: string, y: number, m: number) => `raw/${id}/${y}-${m}.json`),
  getAggregatedDataKey: vi.fn((id: string, y: number, m: number) => `aggregated/${id}/${y}-${m}.json`),
  getMemberRegistryKey: vi.fn(() => 'members/index.json'),
  getSyncLogKey: vi.fn((id: string, y: number, m: number) => `sync-logs/${y}-${m}/${id}.json`),
  getProjectsKey: vi.fn((id: string) => `projects/${id}.json`),
  getPromptsKey: vi.fn((id: string, y: number, m: number) => `prompts/${id}/${y}-${m}.json`),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
  addCost: vi.fn((a: number, b: number) => Math.round((a + b) * 1000000) / 1000000),
}));

vi.mock('../lib/aggregation.js', () => ({
  aggregateMonthData: vi.fn().mockReturnValue({}),
}));

import { app } from '../app.js';
import { getJwtSecret } from '../lib/auth.js';

// Generate a valid test JWT using the same secret as the app
let authHeader: string;

beforeAll(async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    { email: 'test@example.com', name: 'Test', role: 'agent', type: 'access', iat: now, exp: now + 3600 },
    getJwtSecret(),
    'HS256'
  );
  authHeader = `Bearer ${token}`;
});

function makeValidPayload(overrides?: Record<string, unknown>) {
  return {
    email: 'test@example.com',
    entries: [
      {
        request_id: 'req_001',
        timestamp: '2026-02-01T10:00:00Z',
        model: 'claude-sonnet',
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.001,
      },
    ],
    ...overrides,
  };
}

describe('POST /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should accept plain JSON request', async () => {
    const payload = makeValidPayload();

    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('should accept gzip-compressed JSON request', async () => {
    const payload = makeValidPayload();
    const compressed = gzipSync(JSON.stringify(payload));

    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Authorization': authHeader,
      },
      body: compressed,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('should return 400 for invalid gzip body', async () => {
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Authorization': authHeader,
      },
      body: 'not-valid-gzip-data',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('INVALID_ENCODING');
  });

  it('should return 400 for missing required fields', async () => {
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ email: 'test@example.com', entries: [{ timestamp: '2026-01-01T00:00:00Z' }] }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('should return success with 0 inserted for empty entries', async () => {
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ email: 'test@example.com', entries: [] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.inserted).toBe(0);
  });

  it('should handle gzip with prompts payload', async () => {
    const payload = makeValidPayload({
      prompts: [
        {
          uuid: 'prompt_001',
          session_id: 'sess_001',
          timestamp: '2026-02-01T10:00:00Z',
          project_path: 'test-project',
          cwd: '/tmp/test',
          content: 'Hello Claude, help me with this code',
        },
      ],
    });
    const compressed = gzipSync(JSON.stringify(payload));

    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Authorization': authHeader,
      },
      body: compressed,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
