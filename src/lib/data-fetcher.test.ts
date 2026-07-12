import { describe, expect, it, vi } from 'vitest';

describe('fetchRuns', () => {
  it('throws when Turso env vars are missing', async () => {
    const originalUrl = process.env.TURSO_DATABASE_URL;
    const originalSource = process.env.DASHBOARD_DATA_SOURCE;
    delete process.env.TURSO_DATABASE_URL;
    process.env.DASHBOARD_DATA_SOURCE = 'turso';

    vi.resetModules();
    const { fetchRuns } = await import('./data-fetcher');

    await expect(fetchRuns('foo', 'bar')).rejects.toThrow('Database connection not configured');

    process.env.TURSO_DATABASE_URL = originalUrl;
    process.env.DASHBOARD_DATA_SOURCE = originalSource;
  });
});

describe('fetchLatestRuns', () => {
  it('throws when Turso env vars are missing', async () => {
    const originalUrl = process.env.TURSO_DATABASE_URL;
    const originalSource = process.env.DASHBOARD_DATA_SOURCE;
    delete process.env.TURSO_DATABASE_URL;
    process.env.DASHBOARD_DATA_SOURCE = 'turso';

    vi.resetModules();
    const { fetchLatestRuns } = await import('./data-fetcher');

    await expect(fetchLatestRuns('foo', 'bar')).rejects.toThrow('Database connection not configured');

    process.env.TURSO_DATABASE_URL = originalUrl;
    process.env.DASHBOARD_DATA_SOURCE = originalSource;
  });
});
