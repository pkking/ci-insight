import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchRunOverview, fetchRunPage } = vi.hoisted(() => ({
  fetchRunOverview: vi.fn(),
  fetchRunPage: vi.fn(),
}));

vi.mock('@/lib/data-fetcher', () => ({
  fetchRunOverview,
  fetchRunPage,
  fetchRuns: vi.fn(),
  fetchLatestRuns: vi.fn(),
}));

vi.mock('@/lib/pr-data-fetcher', () => ({
  fetchPullRequestDetail: vi.fn(),
}));

vi.mock('@/lib/server-homepage-data', () => ({
  getTrackedRepoOptions: vi.fn(async () => [{ owner: 'acme', repo: 'widgets', key: 'acme/widgets' }]),
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/data', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner: 'acme', repo: 'widgets', ...body }),
  });
}

describe('/api/data Run Overview actions', () => {
  beforeEach(() => {
    fetchRunOverview.mockReset();
    fetchRunPage.mockReset();
    fetchRunOverview.mockResolvedValue([]);
    fetchRunPage.mockResolvedValue({ runs: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
  });

  it('rejects an invalid date range before querying', async () => {
    const response = await POST(request({ action: 'fetchRunOverview', startDate: '2026-07-12', endDate: '2026-07-01' }));

    expect(response.status).toBe(400);
    expect(fetchRunOverview).not.toHaveBeenCalled();
  });

  it('accepts workflow filters for the full chart query', async () => {
    const response = await POST(request({
      action: 'fetchRunOverview',
      startDate: '2026-07-01',
      endDate: '2026-07-12',
      workflowFile: 'ci.yml',
      workflowRef: 'main',
    }));

    expect(response.status).toBe(200);
    expect(fetchRunOverview).toHaveBeenCalledWith('acme', 'widgets', {
      startDate: '2026-07-01',
      endDate: '2026-07-12',
      workflowFile: 'ci.yml',
      workflowRef: 'main',
    });
  });

  it('only accepts the supported table page sizes', async () => {
    const response = await POST(request({
      action: 'fetchRunPage',
      startDate: '2026-07-01',
      endDate: '2026-07-12',
      page: 2,
      pageSize: 25,
    }));

    expect(response.status).toBe(400);
    expect(fetchRunPage).not.toHaveBeenCalled();
  });

  it('passes a supported page size and page to the paginated query', async () => {
    const response = await POST(request({
      action: 'fetchRunPage',
      startDate: '2026-07-01',
      endDate: '2026-07-12',
      page: 2,
      pageSize: 50,
    }));

    expect(response.status).toBe(200);
    expect(fetchRunPage).toHaveBeenCalledWith('acme', 'widgets', {
      startDate: '2026-07-01',
      endDate: '2026-07-12',
      page: 2,
      pageSize: 50,
    });
  });
});
