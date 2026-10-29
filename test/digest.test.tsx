import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
};

const temporaryDirs: string[] = [];

function makeRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  temporaryDirs.push(dir);
  return dir;
}

function writeNight(runsDir: string, night: string, contents: string): void {
  writeFileSync(join(runsDir, `${night}.jsonl`), contents);
}

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('aggregates jobs, retains null owners and counts malformed lines', () => {
    const runsDir = makeRunsDir();
    writeNight(
      runsDir,
      '2026-10-28',
      [
        JSON.stringify({ at: '2026-10-28T07:00:00+01:00', job: 'zeta', status: 'retry', owner: 'sam' }),
        'not-json',
        JSON.stringify({ at: '2026-10-28T07:02:00+01:00', job: 'alpha', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-28T07:03:00+01:00', job: 'zeta', status: 'fail', owner: 'sam', error: 'timeout' }),
      ].join('\n'),
    );

    expect(readNight(runsDir, '2026-10-28')).toEqual({
      malformedLines: 1,
      rows: [
        {
          job: 'alpha',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T07:02:00+01:00',
          lastAt: '2026-10-28T07:02:00+01:00',
        },
        {
          job: 'zeta',
          owner: 'sam',
          runs: 2,
          retries: 1,
          lastStatus: 'fail',
          lastError: 'timeout',
          firstAt: '2026-10-28T07:00:00+01:00',
          lastAt: '2026-10-28T07:03:00+01:00',
        },
      ],
    });
  });

  it('returns an empty digest for an empty file and null for a missing file', () => {
    const runsDir = makeRunsDir();
    writeNight(runsDir, '2026-10-28', '');
    expect(readNight(runsDir, '2026-10-28')).toEqual({ rows: [], malformedLines: 0 });
    expect(readNight(runsDir, '2026-10-29')).toBeNull();
  });
});

describe('digest routes', () => {
  it('renders sorted rows and serves the same rows as JSON', async () => {
    const runsDir = makeRunsDir();
    writeNight(
      runsDir,
      '2026-10-28',
      [
        JSON.stringify({ at: '2026-10-28T07:00:00+01:00', job: 'zeta', status: 'retry', owner: 'sam' }),
        JSON.stringify({ at: '2026-10-28T07:01:00+01:00', job: 'alpha', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-28T07:02:00+01:00', job: 'zeta', status: 'fail', owner: 'sam', error: 'timeout' }),
      ].join('\n'),
    );

    const app = createApp({ ...config, runsDir });
    const page = await app.request('/digest/2026-10-28');
    const html = await page.text();
    const json = await app.request('/api/digest/2026-10-28');

    expect(page.status).toBe(200);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('—');
    expect(html).toContain('timeout');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual(readNight(runsDir, '2026-10-28')?.rows);
  });

  it('returns 404 for a night with no file on both routes', async () => {
    const app = createApp({ ...config, runsDir: makeRunsDir() });
    expect((await app.request('/digest/2026-10-29')).status).toBe(404);
    expect((await app.request('/api/digest/2026-10-29')).status).toBe(404);
  });

  it('renders an empty file as nothing ran and an empty JSON array', async () => {
    const runsDir = makeRunsDir();
    writeNight(runsDir, '2026-10-28', '');
    const app = createApp({ ...config, runsDir });
    const page = await app.request('/digest/2026-10-28');
    const json = await app.request('/api/digest/2026-10-28');

    expect((await page.text())).toContain('nothing ran');
    expect(await json.json()).toEqual([]);
  });

  it('counts malformed lines without preventing the page from rendering', async () => {
    const runsDir = makeRunsDir();
    writeNight(
      runsDir,
      '2026-10-28',
      `${JSON.stringify({ at: '2026-10-28T07:00:00+01:00', job: 'alpha', status: 'ok', owner: null })}\nnot-json`,
    );
    const response = await createApp({ ...config, runsDir }).request('/digest/2026-10-28');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('1 malformed line counted');
    expect(html).toContain('alpha');
  });

  it('links each night on the status board with status counts', async () => {
    const runsDir = makeRunsDir();
    writeNight(
      runsDir,
      '2026-10-28',
      [
        JSON.stringify({ at: '2026-10-28T07:00:00+01:00', job: 'alpha', status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-28T07:01:00+01:00', job: 'beta', status: 'retry', owner: 'sam' }),
        JSON.stringify({ at: '2026-10-28T07:02:00+01:00', job: 'gamma', status: 'fail', owner: 'lee' }),
      ].join('\n'),
    );

    const response = await createApp({ ...config, runsDir }).request('/');
    const html = await response.text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok 1 / retry 1 / fail 1');
  });
});
