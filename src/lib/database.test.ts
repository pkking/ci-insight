// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveDashboardDataSource } from './database-config';
import { getDashboardClient, getRepoId } from './database';

describe('resolveDashboardDataSource', () => {
  it('uses sqlite for local development by default', () => {
    expect(resolveDashboardDataSource({ nodeEnv: 'development' })).toBe('sqlite');
  });

  it('uses turso for production by default', () => {
    expect(resolveDashboardDataSource({ nodeEnv: 'production' })).toBe('turso');
  });

  it('honors an explicit backend selection', () => {
    expect(resolveDashboardDataSource({ nodeEnv: 'production', configured: 'sqlite' })).toBe('sqlite');
    expect(resolveDashboardDataSource({ nodeEnv: 'development', configured: 'turso' })).toBe('turso');
  });

  it('rejects unknown backend values', () => {
    expect(() => resolveDashboardDataSource({ nodeEnv: 'development', configured: 'postgres' })).toThrow(
      'Invalid DASHBOARD_DATA_SOURCE',
    );
  });

  it('opens the selected repository SQLite file through the provider', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'action-insight-db-'));
    const previousSource = process.env.DASHBOARD_DATA_SOURCE;
    const previousDirectory = process.env.SQLITE_DATA_DIR;
    process.env.DASHBOARD_DATA_SOURCE = 'sqlite';
    process.env.SQLITE_DATA_DIR = directory;

    try {
      const seed = createClient({ url: `file:${path.join(directory, 'acme-widgets.db')}` });
      await seed.execute('CREATE TABLE repos (id INTEGER PRIMARY KEY, owner TEXT, repo TEXT)');
      await seed.execute("INSERT INTO repos (id, owner, repo) VALUES (1, 'acme', 'widgets')");

      const client = getDashboardClient('acme', 'widgets');
      expect(await getRepoId('acme', 'widgets', client)).toBe(1);
    } finally {
      if (previousSource === undefined) delete process.env.DASHBOARD_DATA_SOURCE;
      else process.env.DASHBOARD_DATA_SOURCE = previousSource;
      if (previousDirectory === undefined) delete process.env.SQLITE_DATA_DIR;
      else process.env.SQLITE_DATA_DIR = previousDirectory;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
