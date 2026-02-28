import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We test the migration logic and pruneStaleOffsets by importing from config.
// Since config.ts uses hardcoded paths (AGENT_CONFIG_DIR), we test the
// migration function logic directly and the prune function.

import type { AgentState, FileOffset } from './config.js';

describe('State Migration', () => {
  // Re-implement migrateState logic here since it's not exported.
  // This tests the same logic that loadState() uses internally.
  function migrateState(raw: Record<string, unknown>): AgentState {
    const DEFAULT: AgentState = {
      version: 2,
      last_sync_timestamp: null,
      last_sync_records: 0,
      total_synced_records: 0,
      file_offsets: {},
      last_prompt_sync_timestamp: null,
    };

    if (raw.version === 2) {
      return { ...DEFAULT, ...raw } as AgentState;
    }

    return {
      version: 2,
      last_sync_timestamp: (raw.last_sync_timestamp as string) || null,
      last_sync_records: (raw.last_sync_records as number) || 0,
      total_synced_records: (raw.total_synced_records as number) || 0,
      file_offsets: {},
      last_prompt_sync_timestamp: null,
    };
  }

  it('should migrate v1 state to v2', () => {
    const v1State = {
      last_sync_timestamp: '2026-02-10T18:00:00Z',
      last_sync_records: 3,
      total_synced_records: 31367,
      seen_request_ids: ['req_001', 'req_002', 'req_003'],
      seen_prompt_uuids: ['uuid_001', 'uuid_002'],
    };

    const result = migrateState(v1State);

    expect(result.version).toBe(2);
    expect(result.last_sync_timestamp).toBe('2026-02-10T18:00:00Z');
    expect(result.total_synced_records).toBe(31367);
    expect(result.file_offsets).toEqual({});
    expect(result.last_prompt_sync_timestamp).toBeNull();
    // Old fields should not be present
    expect((result as unknown as Record<string, unknown>).seen_request_ids).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).seen_prompt_uuids).toBeUndefined();
  });

  it('should preserve v2 state as-is', () => {
    const v2State: AgentState = {
      version: 2,
      last_sync_timestamp: '2026-02-10T18:00:00Z',
      last_sync_records: 5,
      total_synced_records: 100,
      file_offsets: {
        '/path/to/file.jsonl': { byteOffset: 12345, lastModified: '2026-02-10T18:00:00Z' },
      },
      last_prompt_sync_timestamp: '2026-02-10T12:00:00Z',
    };

    const result = migrateState(v2State as unknown as Record<string, unknown>);

    expect(result.version).toBe(2);
    expect(result.file_offsets).toEqual(v2State.file_offsets);
    expect(result.last_prompt_sync_timestamp).toBe('2026-02-10T12:00:00Z');
  });

  it('should handle empty/malformed state gracefully', () => {
    const result = migrateState({});

    expect(result.version).toBe(2);
    expect(result.last_sync_timestamp).toBeNull();
    expect(result.total_synced_records).toBe(0);
    expect(result.file_offsets).toEqual({});
  });
});

describe('pruneStaleOffsets', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should remove offsets for files that no longer exist', async () => {
    // Import the real function
    const { pruneStaleOffsets } = await import('./config.js');

    const existingFile = join(tmpDir, 'exists.jsonl');
    writeFileSync(existingFile, '{}');

    const state: AgentState = {
      version: 2,
      last_sync_timestamp: null,
      last_sync_records: 0,
      total_synced_records: 0,
      file_offsets: {
        [existingFile]: { byteOffset: 100, lastModified: '2026-01-01T00:00:00Z' },
        '/nonexistent/path.jsonl': { byteOffset: 200, lastModified: '2026-01-01T00:00:00Z' },
      },
      last_prompt_sync_timestamp: null,
    };

    pruneStaleOffsets(state);

    expect(state.file_offsets[existingFile]).toBeDefined();
    expect(state.file_offsets['/nonexistent/path.jsonl']).toBeUndefined();
    expect(Object.keys(state.file_offsets)).toHaveLength(1);
  });
});
