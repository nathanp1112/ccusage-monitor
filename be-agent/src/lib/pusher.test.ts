import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';

// Mock undici — route checkip calls vs sync calls
const CHECKIP_URL = 'https://checkip.amazonaws.com';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { pushToServer } from './pusher.js';
import type { UsageEntry } from './collector.js';
import type { AgentConfig } from './config.js';

const { request: mockRequest } = await import('undici');

/** Filter mock calls to only sync API calls (exclude getPublicIp) */
function getSyncCalls() {
  return (mockRequest as any).mock.calls.filter(
    (c: any[]) => c[0] !== CHECKIP_URL
  );
}

/** Default mock: handle checkip + sync calls */
function setupDefaultMock(syncResponse = { success: true, inserted: 0, skipped: 0 }) {
  (mockRequest as any).mockImplementation((url: string) => {
    if (url === CHECKIP_URL) {
      return Promise.resolve({ body: { text: async () => '203.0.113.55' } });
    }
    return Promise.resolve({
      statusCode: 200,
      body: { json: async () => syncResponse },
    });
  });
}

function makeEntry(id: string): UsageEntry {
  return {
    request_id: id,
    timestamp: '2026-02-01T10:00:00Z',
    model: 'claude-sonnet',
    project_path: 'test-project',
    session_id: 'sess-1',
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    cost_usd: 0.001,
    version: '1.0.0',
  };
}

const config: AgentConfig = {
  server_url: 'https://test.example.com',
  email: 'test@example.com',
  sync_interval_minutes: 60,
  max_batch_size: 1000,
  retry_attempts: 3,
};

describe('gzip compression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send gzip-compressed request body with IP fields', async () => {
    setupDefaultMock({ success: true, inserted: 1, skipped: 0 });

    const entries = [makeEntry('req_001')];
    await pushToServer(entries, config);

    const syncCalls = getSyncCalls();
    expect(syncCalls).toHaveLength(1);
    const options = syncCalls[0][1];

    // Verify headers
    expect(options.headers['Content-Encoding']).toBe('gzip');
    expect(options.headers['Content-Type']).toBe('application/json');

    // Verify body is gzip-compressed and decompresses to valid JSON
    const decompressed = gunzipSync(options.body);
    const payload = JSON.parse(decompressed.toString());
    expect(payload.email).toBe('test@example.com');
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].request_id).toBe('req_001');
    expect(payload.agent_version).toBe('0.4.0');
    // Verify IP fields
    expect(payload).toHaveProperty('local_ip');
    expect(payload.public_ip).toBe('203.0.113.55');
  });
});

describe('batch splitting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMock();
  });

  it('should split entries into multiple batches', async () => {
    const smallConfig = { ...config, max_batch_size: 2 };
    const entries = [makeEntry('req_1'), makeEntry('req_2'), makeEntry('req_3'), makeEntry('req_4'), makeEntry('req_5')];

    await pushToServer(entries, smallConfig);

    const syncCalls = getSyncCalls();
    // 5 entries / 2 per batch = 3 batches
    expect(syncCalls).toHaveLength(3);

    // Verify batch sizes
    for (let i = 0; i < 3; i++) {
      const body = gunzipSync(syncCalls[i][1].body);
      const payload = JSON.parse(body.toString());
      if (i < 2) {
        expect(payload.entries).toHaveLength(2);
      } else {
        expect(payload.entries).toHaveLength(1);
      }
    }
  });

  it('should return immediately for empty payload', async () => {
    const result = await pushToServer([], config);

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.totalSynced).toBe(0);
    expect(result.totalSkipped).toBe(0);
  });
});

describe('retry logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retry on 5xx errors with backoff', async () => {
    let syncCallCount = 0;
    (mockRequest as any).mockImplementation((url: string) => {
      if (url === CHECKIP_URL) {
        return Promise.resolve({ body: { text: async () => '1.2.3.4' } });
      }
      syncCallCount++;
      if (syncCallCount <= 2) {
        return Promise.resolve({
          statusCode: 500,
          body: { json: async () => ({ success: false, error: 'Internal error' }) },
        });
      }
      return Promise.resolve({
        statusCode: 200,
        body: { json: async () => ({ success: true, inserted: 1, skipped: 0 }) },
      });
    });

    const result = await pushToServer([makeEntry('req_001')], config);

    expect(getSyncCalls()).toHaveLength(3);
    expect(result.totalSynced).toBe(1);
  }, 30000);

  it('should not retry on 4xx errors', async () => {
    (mockRequest as any).mockImplementation((url: string) => {
      if (url === CHECKIP_URL) {
        return Promise.resolve({ body: { text: async () => '1.2.3.4' } });
      }
      return Promise.resolve({
        statusCode: 400,
        body: { json: async () => ({ success: false, error: 'Validation error' }) },
      });
    });

    const result = await pushToServer([makeEntry('req_001')], config);

    expect(getSyncCalls()).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Validation error');
  });
});
