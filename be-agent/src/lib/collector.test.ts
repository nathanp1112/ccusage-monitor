import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractProjectFromPath,
  extractSessionFromPath,
} from './collector.js';

// JSONL test fixtures
function makeAssistantLine(requestId: string, model: string, timestamp: string, inputTokens = 100, outputTokens = 50): string {
  return JSON.stringify({
    timestamp,
    requestId,
    sessionId: 'test-session',
    type: 'assistant',
    cwd: '/tmp/test-project',
    message: {
      role: 'assistant',
      model,
      content: 'Hello',
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    costUSD: 0.001,
  });
}

function makeUserLine(uuid: string, timestamp: string, content: string): string {
  return JSON.stringify({
    timestamp,
    sessionId: 'test-session',
    type: 'user',
    uuid,
    cwd: '/tmp/test-project',
    message: {
      role: 'user',
      content,
    },
  });
}

describe('extractProjectFromPath', () => {
  it('should extract project name from standard path', () => {
    expect(extractProjectFromPath('/home/user/.claude/projects/my-project/session.jsonl'))
      .toBe('my-project');
  });

  it('should return unknown for paths without projects dir', () => {
    expect(extractProjectFromPath('/home/user/random/file.jsonl'))
      .toBe('unknown');
  });
});

describe('extractSessionFromPath', () => {
  it('should extract session ID from filename', () => {
    expect(extractSessionFromPath('/path/to/abc-123.jsonl'))
      .toBe('abc-123');
  });
});

describe('File Offset Tracking', () => {
  let tmpDir: string;
  let projectDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'collector-test-'));
    // Create projects/test-project/ structure for extractProjectFromPath
    projectDir = join(tmpDir, 'projects', 'test-project');
    mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should read all lines from offset 0', async () => {
    const { collectUsageData } = await import('./collector.js');

    const file = join(projectDir, 'session1.jsonl');
    const lines = [
      makeAssistantLine('req_001', 'claude-sonnet', '2026-02-01T10:00:00Z'),
      makeAssistantLine('req_002', 'claude-sonnet', '2026-02-01T11:00:00Z'),
      makeAssistantLine('req_003', 'claude-sonnet', '2026-02-01T12:00:00Z'),
    ];
    writeFileSync(file, lines.join('\n') + '\n');

    const result = await collectUsageData(
      { server_url: '', email: '', sync_interval_minutes: 60, max_batch_size: 1000, retry_attempts: 3, claude_paths: [join(tmpDir, 'projects')] } as any,
      { version: 2, last_sync_timestamp: null, last_sync_records: 0, total_synced_records: 0, file_offsets: {}, last_prompt_sync_timestamp: null },
    );

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].request_id).toBe('req_001');
    expect(result.updatedFileOffsets[file]).toBeDefined();
    expect(result.updatedFileOffsets[file].byteOffset).toBe(statSync(file).size);
  });

  it('should read only new bytes when offset is set', async () => {
    const { collectUsageData } = await import('./collector.js');

    const file = join(projectDir, 'session2.jsonl');

    // Write initial lines
    const initialLines = [
      makeAssistantLine('req_001', 'claude-sonnet', '2026-02-01T10:00:00Z'),
      makeAssistantLine('req_002', 'claude-sonnet', '2026-02-01T11:00:00Z'),
    ];
    writeFileSync(file, initialLines.join('\n') + '\n');
    const offsetAfterInitial = statSync(file).size;

    // Append new lines
    const newLines = [
      makeAssistantLine('req_003', 'claude-sonnet', '2026-02-01T12:00:00Z'),
      makeAssistantLine('req_004', 'claude-sonnet', '2026-02-01T13:00:00Z'),
    ];
    appendFileSync(file, newLines.join('\n') + '\n');

    const result = await collectUsageData(
      { server_url: '', email: '', sync_interval_minutes: 60, max_batch_size: 1000, retry_attempts: 3, claude_paths: [join(tmpDir, 'projects')] } as any,
      {
        version: 2,
        last_sync_timestamp: null,
        last_sync_records: 0,
        total_synced_records: 0,
        file_offsets: {
          [file]: { byteOffset: offsetAfterInitial, lastModified: new Date().toISOString() },
        },
        last_prompt_sync_timestamp: null,
      },
    );

    // Should only get the 2 new entries
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].request_id).toBe('req_003');
    expect(result.entries[1].request_id).toBe('req_004');
    expect(result.updatedFileOffsets[file].byteOffset).toBe(statSync(file).size);
  });

  it('should skip files with no new data', async () => {
    const { collectUsageData } = await import('./collector.js');

    const file = join(projectDir, 'session3.jsonl');
    const lines = [makeAssistantLine('req_001', 'claude-sonnet', '2026-02-01T10:00:00Z')];
    writeFileSync(file, lines.join('\n') + '\n');
    const fileSize = statSync(file).size;

    const result = await collectUsageData(
      { server_url: '', email: '', sync_interval_minutes: 60, max_batch_size: 1000, retry_attempts: 3, claude_paths: [join(tmpDir, 'projects')] } as any,
      {
        version: 2,
        last_sync_timestamp: null,
        last_sync_records: 0,
        total_synced_records: 0,
        file_offsets: {
          [file]: { byteOffset: fileSize, lastModified: new Date().toISOString() },
        },
        last_prompt_sync_timestamp: null,
      },
    );

    expect(result.entries).toHaveLength(0);
    expect(result.filesScanned).toBe(0); // File was skipped, not scanned
  });

  it('should re-read from start if file was truncated', async () => {
    const { collectUsageData } = await import('./collector.js');

    const file = join(projectDir, 'session4.jsonl');
    // Write a smaller file than the stored offset
    writeFileSync(file, makeAssistantLine('req_new', 'claude-sonnet', '2026-02-01T10:00:00Z') + '\n');

    const result = await collectUsageData(
      { server_url: '', email: '', sync_interval_minutes: 60, max_batch_size: 1000, retry_attempts: 3, claude_paths: [join(tmpDir, 'projects')] } as any,
      {
        version: 2,
        last_sync_timestamp: null,
        last_sync_records: 0,
        total_synced_records: 0,
        file_offsets: {
          [file]: { byteOffset: 99999, lastModified: new Date().toISOString() }, // Larger than file
        },
        last_prompt_sync_timestamp: null,
      },
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].request_id).toBe('req_new');
  });

  it('should skip prompts when skipPrompts is true', async () => {
    const { collectUsageData } = await import('./collector.js');

    const file = join(projectDir, 'session5.jsonl');
    const lines = [
      makeUserLine('uuid_001', '2026-02-01T10:00:00Z', 'Hello Claude'),
      makeAssistantLine('req_001', 'claude-sonnet', '2026-02-01T10:01:00Z'),
    ];
    writeFileSync(file, lines.join('\n') + '\n');

    // With prompts
    const withPrompts = await collectUsageData(
      { server_url: '', email: '', sync_interval_minutes: 60, max_batch_size: 1000, retry_attempts: 3, claude_paths: [join(tmpDir, 'projects')] } as any,
      { version: 2, last_sync_timestamp: null, last_sync_records: 0, total_synced_records: 0, file_offsets: {}, last_prompt_sync_timestamp: null },
      { skipPrompts: false },
    );
    expect(withPrompts.prompts).toHaveLength(1);

    // Without prompts
    const withoutPrompts = await collectUsageData(
      { server_url: '', email: '', sync_interval_minutes: 60, max_batch_size: 1000, retry_attempts: 3, claude_paths: [join(tmpDir, 'projects')] } as any,
      { version: 2, last_sync_timestamp: null, last_sync_records: 0, total_synced_records: 0, file_offsets: {}, last_prompt_sync_timestamp: null },
      { skipPrompts: true },
    );
    expect(withoutPrompts.prompts).toHaveLength(0);
    // Entries should still be collected
    expect(withoutPrompts.entries).toHaveLength(1);
  });
});
