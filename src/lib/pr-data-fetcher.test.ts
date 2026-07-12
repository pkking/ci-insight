import { describe, expect, it, vi } from 'vitest';

describe('pr-data-fetcher', () => {
  it('throws when Turso env vars are missing', async () => {
    const originalUrl = process.env.TURSO_DATABASE_URL;
    const originalSource = process.env.DASHBOARD_DATA_SOURCE;
    delete process.env.TURSO_DATABASE_URL;
    process.env.DASHBOARD_DATA_SOURCE = 'turso';

    vi.resetModules();
    const { fetchPullRequestIndex } = await import('./pr-data-fetcher');

    await expect(fetchPullRequestIndex('foo', 'bar')).rejects.toThrow('Database connection not configured');

    process.env.TURSO_DATABASE_URL = originalUrl;
    process.env.DASHBOARD_DATA_SOURCE = originalSource;
  });

  it('throws when Turso env vars are missing for detail fetch', async () => {
    const originalUrl = process.env.TURSO_DATABASE_URL;
    const originalSource = process.env.DASHBOARD_DATA_SOURCE;
    delete process.env.TURSO_DATABASE_URL;
    process.env.DASHBOARD_DATA_SOURCE = 'turso';

    vi.resetModules();
    const { fetchPullRequestDetail } = await import('./pr-data-fetcher');

    await expect(fetchPullRequestDetail('foo', 'bar', 42)).rejects.toThrow('Database connection not configured');

    process.env.TURSO_DATABASE_URL = originalUrl;
    process.env.DASHBOARD_DATA_SOURCE = originalSource;
  });
});
