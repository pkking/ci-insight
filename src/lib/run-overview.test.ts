// @vitest-environment node

import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { fetchRunOverview, fetchRunPage } from './data-fetcher';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  delete process.env.DASHBOARD_DATA_SOURCE;
  delete process.env.SQLITE_DATA_DIR;
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe('Run Overview read model', () => {
  it('keeps reruns separate and uses different ordering for chart and table', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'action-insight-overview-'));
    process.env.DASHBOARD_DATA_SOURCE = 'sqlite';
    process.env.SQLITE_DATA_DIR = temporaryDirectory;
    const databasePath = path.join(temporaryDirectory, 'acme-widgets.db');
    const client = createClient({ url: `file:${databasePath}` });

    await client.batch([
      'CREATE TABLE repos (id INTEGER PRIMARY KEY, owner TEXT, repo TEXT)',
      'CREATE TABLE runs (id INTEGER PRIMARY KEY, repo_id INTEGER, name TEXT, html_url TEXT, created_at TEXT, date TEXT)',
      `CREATE TABLE workflow_attempts (
        run_id INTEGER, run_attempt INTEGER, workflow_file TEXT, workflow_ref TEXT,
        status TEXT, conclusion TEXT, created_at TEXT,
        queue_duration_seconds REAL, runtime_seconds REAL, total_duration_seconds REAL,
        PRIMARY KEY (run_id, run_attempt)
      )`,
      'CREATE TABLE pr_metrics (id INTEGER PRIMARY KEY, pr_number INTEGER)',
      'CREATE TABLE pr_workflow_attempts (pr_metric_id INTEGER, run_id INTEGER, run_attempt INTEGER)',
      "INSERT INTO repos VALUES (1, 'acme', 'widgets')",
      "INSERT INTO runs VALUES (10, 1, 'CI', 'https://example.test/runs/10', '2026-07-01T01:00:00Z', '2026-07-01')",
      "INSERT INTO runs VALUES (11, 1, 'CI', 'https://example.test/runs/11', '2026-07-01T02:00:00Z', '2026-07-01')",
      "INSERT INTO workflow_attempts VALUES (10, 1, 'ci.yml', 'main', 'completed', 'success', '2026-07-01T01:00:00Z', 30, 90, 120)",
      "INSERT INTO workflow_attempts VALUES (10, 2, 'ci.yml', 'main', 'completed', 'failure', '2026-07-01T01:30:00Z', 40, 100, 140)",
      "INSERT INTO workflow_attempts VALUES (11, 1, 'ci.yml', 'main', 'completed', 'success', '2026-07-01T02:00:00Z', 20, 80, 100)",
      'INSERT INTO pr_metrics VALUES (1, 42)',
      'INSERT INTO pr_workflow_attempts VALUES (1, 10, 1)',
    ], 'write');

    const filters = { startDate: '2026-07-01', endDate: '2026-07-01' };
    const chart = await fetchRunOverview('acme', 'widgets', filters);
    const page = await fetchRunPage('acme', 'widgets', { ...filters, page: 1, pageSize: 20 });

    expect(chart.map((run) => `${run.id}:${run.runAttempt}`)).toEqual(['10:1', '10:2', '11:1']);
    expect(chart[0].prNumber).toBe(42);
    expect(chart[1].prNumber).toBeNull();
    expect(page.runs.map((run) => `${run.id}:${run.runAttempt}`)).toEqual(['11:1', '10:2', '10:1']);
    expect(page.total).toBe(3);
    expect(page.pageSize).toBe(20);
  });
});
