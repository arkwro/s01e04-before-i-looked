import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestCounts, DigestRow, NightDigest, RunStatus } from './types.js';

type RunEntry = {
  at: string;
  timestamp: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

function parseEntry(line: string): RunEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const timestamp = typeof record.at === 'string' ? Date.parse(record.at) : Number.NaN;
  if (
    typeof record.at !== 'string' ||
    !Number.isFinite(timestamp) ||
    typeof record.job !== 'string' ||
    record.job.length === 0 ||
    (record.status !== 'ok' && record.status !== 'retry' && record.status !== 'fail') ||
    (record.owner !== null && typeof record.owner !== 'string') ||
    (record.error !== undefined && typeof record.error !== 'string')
  ) {
    return null;
  }

  return {
    at: record.at,
    timestamp,
    job: record.job,
    status: record.status,
    owner: record.owner,
    error: typeof record.error === 'string' ? record.error : null,
  };
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }

  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const byJob = new Map<string, { row: DigestRow; firstTimestamp: number; lastTimestamp: number }>();
  let malformedLines = 0;

  for (const line of lines) {
    const entry = parseEntry(line);
    if (!entry) {
      malformedLines += 1;
      continue;
    }

    const current = byJob.get(entry.job);
    if (!current) {
      byJob.set(entry.job, {
        row: {
          job: entry.job,
          owner: entry.owner,
          runs: 1,
          retries: entry.status === 'retry' ? 1 : 0,
          lastStatus: entry.status,
          lastError: entry.error,
          firstAt: entry.at,
          lastAt: entry.at,
        },
        firstTimestamp: entry.timestamp,
        lastTimestamp: entry.timestamp,
      });
      continue;
    }

    current.row.runs += 1;
    if (entry.status === 'retry') current.row.retries += 1;

    if (entry.timestamp < current.firstTimestamp) {
      current.firstTimestamp = entry.timestamp;
      current.row.firstAt = entry.at;
    }

    if (entry.error !== null) current.row.lastError = entry.error;

    // For equal timestamps, the later line is the latest event in the log.
    if (entry.timestamp >= current.lastTimestamp) {
      current.lastTimestamp = entry.timestamp;
      current.row.owner = entry.owner;
      current.row.lastStatus = entry.status;
      current.row.lastAt = entry.at;
    }
  }

  const rows = [...byJob.values()].map(({ row }) => row).sort((a, b) => a.job.localeCompare(b.job));
  return { rows, malformedLines };
}

export function countStatuses(rows: DigestRow[]): DigestCounts {
  return rows.reduce<DigestCounts>(
    (counts, row) => {
      counts[row.lastStatus] += 1;
      return counts;
    },
    { ok: 0, retry: 0, fail: 0 },
  );
}
