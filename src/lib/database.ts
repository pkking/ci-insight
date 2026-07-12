import 'server-only';

import { createClient, type Client } from '@libsql/client';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveDashboardDataSource } from './database-config';
export { type DashboardDataSource, resolveDashboardDataSource } from './database-config';

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'ascii');
const clientCache = new Map<string, Client>();

function validateRepoSegment(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) || value === '.' || value === '..') {
    throw new Error(`Invalid repository ${field}`);
  }
}

function getSqlitePath(owner: string, repo: string): string {
  validateRepoSegment(owner, 'owner');
  validateRepoSegment(repo, 'repo');
  const dataDir = path.resolve(process.env.SQLITE_DATA_DIR ?? path.join(process.cwd(), 'etl', 'data'));
  return path.join(dataDir, `${owner}-${repo}.db`);
}

function validateSqliteFile(dbPath: string): void {
  if (!existsSync(dbPath)) {
    throw new Error(`Local SQLite database not found: ${dbPath}`);
  }
  const header = readFileSync(dbPath).subarray(0, SQLITE_HEADER.length);
  if (!header.equals(SQLITE_HEADER)) {
    throw new Error(`Local SQLite database is invalid or still a Git LFS pointer: ${dbPath}`);
  }
}

function getConfiguredTursoClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error(
      'Database connection not configured. Please set TURSO_DATABASE_URL ' +
      '(e.g., libsqls://... for remote Turso).',
    );
  }
  const key = `turso:${url}`;
  const cached = clientCache.get(key);
  if (cached) return cached;
  const client = createClient({ url, authToken });
  clientCache.set(key, client);
  return client;
}

export function getDashboardClient(owner: string, repo: string): Client {
  const source = resolveDashboardDataSource();
  if (source === 'turso') return getConfiguredTursoClient();

  const dbPath = getSqlitePath(owner, repo);
  validateSqliteFile(dbPath);
  const key = `sqlite:${dbPath}`;
  const cached = clientCache.get(key);
  if (cached) return cached;
  const client = createClient({ url: `file:${dbPath}` });
  clientCache.set(key, client);
  return client;
}

export function getTursoClient(): Client {
  return getConfiguredTursoClient();
}

export async function getRepoId(owner: string, repo: string, client = getDashboardClient(owner, repo)): Promise<number> {
  const { rows } = await client.execute({
    sql: 'SELECT id FROM repos WHERE owner = ? AND repo = ?',
    args: [owner, repo],
  });
  if (rows.length === 0) {
    throw new Error(`Repository ${owner}/${repo} not found in database`);
  }
  return Number(rows[0].id);
}
