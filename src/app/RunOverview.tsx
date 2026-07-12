'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Moon, Sun } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { callApi } from '@/lib/api-client';
import { APP_CONFIG } from '@/lib/app-config';
import type { RepoOption } from '@/lib/server-homepage-data';
import type { RunOverviewFilters, RunOverviewPoint, RunPageResult } from '@/lib/run-overview-types';

type RunOverviewProps = {
  repoOptions: RepoOption[];
  selectedRepo: RepoOption;
  startDate: string;
  endDate: string;
  onRepoChange: (key: string) => void;
};

type WorkflowOption = {
  file: string;
  ref: string;
  label: string;
};

const PAGE_SIZES = [20, 50, 100] as const;
const QUEUE_COLOR = '#f59e0b';
const EXECUTION_COLOR = '#2563eb';

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function workflowKey(file: string, ref: string): string {
  return `${file}\u0000${ref}`;
}

function workflowLabel(point: Pick<RunOverviewPoint, 'workflowFile' | 'workflowRef'>): string {
  return point.workflowFile ? `${point.workflowFile}${point.workflowRef ? ` @ ${point.workflowRef}` : ''}` : 'Unknown workflow';
}

function statusLabel(point: RunOverviewPoint): string {
  return point.conclusion || point.status || 'unknown';
}

function updateSearchParams(
  pathname: string,
  current: URLSearchParams,
  router: ReturnType<typeof useRouter>,
  changes: Record<string, string | null>,
): void {
  const params = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
}

function RunBar({
  point,
  maxSeconds,
  onHover,
}: {
  point: RunOverviewPoint;
  maxSeconds: number;
  onHover: (point: RunOverviewPoint | null) => void;
}) {
  const total = point.totalSeconds ?? 0;
  const height = maxSeconds > 0 ? Math.max(1, (total / maxSeconds) * 100) : 0;
  const queueRatio = total > 0 && point.queueSeconds != null ? Math.min(100, Math.max(0, (point.queueSeconds / total) * 100)) : 0;
  const activate = () => {
    if (point.htmlUrl) window.open(point.htmlUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      aria-label={`Run ${point.id}, ${formatDuration(point.totalSeconds)}, ${statusLabel(point)}`}
      className="group relative flex h-full min-w-0 flex-1 items-end px-px focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      onMouseEnter={() => onHover(point)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(point)}
      onBlur={() => onHover(null)}
      onClick={activate}
    >
      <span className="flex w-full items-end" style={{ height: `${height}%` }}>
        <span className="relative block w-full rounded-t-sm" style={{ height: '100%', backgroundColor: EXECUTION_COLOR }}>
          <span className="absolute inset-x-0 top-0 rounded-t-sm" style={{ height: `${queueRatio}%`, backgroundColor: QUEUE_COLOR }} />
        </span>
      </span>
    </button>
  );
}

function RunChart({ runs }: { runs: RunOverviewPoint[] }) {
  const [hovered, setHovered] = useState<RunOverviewPoint | null>(null);
  const maxSeconds = Math.max(...runs.map((run) => run.totalSeconds ?? 0), 1);

  return (
    <div className="relative">
      <div className="mb-2 flex justify-end gap-4 text-xs text-neutral-500 dark:text-neutral-400">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: QUEUE_COLOR }} />Queue</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: EXECUTION_COLOR }} />Execution</span>
      </div>
      <div className="relative h-72 border-b border-l border-neutral-200 bg-gradient-to-t from-neutral-50 to-white dark:border-neutral-700 dark:from-neutral-950 dark:to-neutral-900">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between py-2">
          {[100, 75, 50, 25, 0].map((value) => (
            <div key={value} className="border-t border-dashed border-neutral-200/80 dark:border-neutral-800/80" />
          ))}
        </div>
        <div className="absolute inset-0 flex items-end gap-px px-1">
          {runs.map((run) => (
            <RunBar key={`${run.id}:${run.runAttempt}`} point={run} maxSeconds={maxSeconds} onHover={setHovered} />
          ))}
        </div>
        {hovered ? (
          <div className="pointer-events-none absolute right-3 top-3 z-10 w-64 rounded-lg border border-neutral-200 bg-white/95 p-3 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-800/95">
            <div className="mb-2 flex items-center justify-between gap-2 font-semibold text-neutral-900 dark:text-neutral-100">
              <span>Run #{hovered.id}</span>
              <span className="font-normal text-neutral-500 dark:text-neutral-400">{statusLabel(hovered)}</span>
            </div>
            <div className="mb-2 truncate text-neutral-500 dark:text-neutral-400">{workflowLabel(hovered)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-neutral-600 dark:text-neutral-300">
              <dt>Queue</dt><dd className="text-right">{formatDuration(hovered.queueSeconds)}</dd>
              <dt>Execution</dt><dd className="text-right">{formatDuration(hovered.executionSeconds)}</dd>
              <dt>Total</dt><dd className="text-right font-semibold">{formatDuration(hovered.totalSeconds)}</dd>
              <dt>PR</dt><dd className="text-right">{hovered.prNumber == null ? '-' : `#${hovered.prNumber}`}</dd>
            </dl>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-neutral-400">
        <span>{runs[0] ? new Date(runs[0].createdAt).toLocaleDateString() : '-'}</span>
        <span>{runs.at(-1) ? new Date(runs.at(-1)!.createdAt).toLocaleDateString() : '-'}</span>
      </div>
    </div>
  );
}

export default function RunOverview({ repoOptions, selectedRepo, startDate, endDate, onRepoChange }: RunOverviewProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [overviewRuns, setOverviewRuns] = useState<RunOverviewPoint[]>([]);
  const [pageResult, setPageResult] = useState<RunPageResult | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page') || 1)));
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(() => {
    const value = Number(searchParams.get('pageSize'));
    return PAGE_SIZES.includes(value as 20 | 50 | 100) ? value as 20 | 50 | 100 : 20;
  });

  useEffect(() => {
    const stored = localStorage.getItem(APP_CONFIG.themeStorageKey);
    const theme = stored === 'light' || stored === 'dark'
      ? stored
      : typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, []);
  const selectedWorkflow = searchParams.get('workflowFile') ? workflowKey(searchParams.get('workflowFile')!, searchParams.get('workflowRef') || '') : '';

  const filters = useMemo<RunOverviewFilters>(() => ({
    startDate,
    endDate,
    ...(searchParams.get('workflowFile') ? { workflowFile: searchParams.get('workflowFile')! } : {}),
    ...(searchParams.get('workflowRef') ? { workflowRef: searchParams.get('workflowRef')! } : {}),
  }), [endDate, searchParams, startDate]);

  useEffect(() => {
    const controller = new AbortController();
    callApi<RunOverviewPoint[]>('fetchRunOverview', { owner: selectedRepo.owner, repo: selectedRepo.repo, ...filters }, controller.signal)
      .then(setOverviewRuns)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Failed to load run overview');
        setOverviewRuns([]);
      })
      .finally(() => setWorkflowLoading(false));
    return () => controller.abort();
  }, [filters, selectedRepo.owner, selectedRepo.repo]);

  useEffect(() => {
    const controller = new AbortController();
    callApi<RunPageResult>('fetchRunPage', { owner: selectedRepo.owner, repo: selectedRepo.repo, ...filters, page, pageSize }, controller.signal)
      .then(setPageResult)
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Failed to load runs');
      })
      .finally(() => setTableLoading(false));
    return () => controller.abort();
  }, [filters, page, pageSize, selectedRepo.owner, selectedRepo.repo]);

  const workflowOptions = useMemo<WorkflowOption[]>(() => {
    const options = new Map<string, WorkflowOption>();
    for (const run of overviewRuns) {
      if (!run.workflowFile) continue;
      const ref = run.workflowRef || '';
      options.set(workflowKey(run.workflowFile, ref), {
        file: run.workflowFile,
        ref,
        label: workflowLabel(run),
      });
    }
    return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [overviewRuns]);

  const updateFilters = (workflow: WorkflowOption | null) => {
    setPage(1);
    updateSearchParams(pathname, searchParams, router, {
      workflowFile: workflow?.file || null,
      workflowRef: workflow?.ref || null,
      page: '1',
    });
  };

  const changePageSize = (value: 20 | 50 | 100) => {
    setPageSize(value);
    setPage(1);
    updateSearchParams(pathname, searchParams, router, { pageSize: String(value), page: '1' });
  };

  const changePage = (nextPage: number) => {
    const next = Math.max(1, Math.min(nextPage, pageResult?.totalPages || 1));
    setPage(next);
    updateSearchParams(pathname, searchParams, router, { page: String(next) });
  };

  const toggleTheme = () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.classList.toggle('light', next === 'light');
    localStorage.setItem(APP_CONFIG.themeStorageKey, next);
  };

  const tableRuns = pageResult?.runs ?? [];

  return (
    <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Run overview</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">CI duration by workflow run</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="project-select" className="text-sm text-neutral-500 dark:text-neutral-400">Project</label>
          <select id="project-select" value={selectedRepo.key} onChange={(event) => onRepoChange(event.target.value)} className="max-w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
            {repoOptions.map((repo) => <option key={repo.key} value={repo.key}>{repo.key}</option>)}
          </select>
          <label htmlFor="workflow-select" className="ml-1 text-sm text-neutral-500 dark:text-neutral-400">Workflow</label>
          <select id="workflow-select" value={selectedWorkflow} onChange={(event) => updateFilters(workflowOptions.find((option) => workflowKey(option.file, option.ref) === event.target.value) || null)} className="max-w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
            <option value="">All workflows</option>
            {workflowOptions.map((option) => <option key={workflowKey(option.file, option.ref)} value={workflowKey(option.file, option.ref)}>{option.label}</option>)}
          </select>
          <button type="button" onClick={toggleTheme} aria-label="Toggle light and dark theme" className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}
      {workflowLoading ? <div className="h-72 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" /> : overviewRuns.length === 0 ? <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">No workflow runs match the selected filters.</div> : <RunChart runs={overviewRuns} />}

      <div className="flex flex-col justify-between gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-semibold">Runs</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{pageResult?.total ?? 0} runs, newest first</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">Rows
          <select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value) as 20 | 50 | 100)} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
            {PAGE_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-800/70 dark:text-neutral-400">
            <tr><th className="px-4 py-3">Run</th><th className="px-4 py-3">Workflow</th><th className="px-4 py-3">PR</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Queue</th><th className="px-4 py-3">Execution</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Created</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {tableLoading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-500">Loading runs...</td></tr> : tableRuns.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-500">No runs on this page.</td></tr> : tableRuns.map((run) => (
              <tr key={`${run.id}:${run.runAttempt}`} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
                <td className="whitespace-nowrap px-4 py-3 font-medium"><a href={run.htmlUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">#{run.id}<ExternalLink className="h-3 w-3" /></a></td>
                <td className="max-w-56 truncate px-4 py-3 text-neutral-600 dark:text-neutral-300" title={workflowLabel(run)}>{workflowLabel(run)}</td>
                <td className="px-4 py-3">{run.prNumber == null ? '-' : `#${run.prNumber}`}</td>
                <td className="px-4 py-3">{statusLabel(run)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-300">{formatDuration(run.queueSeconds)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-300">{formatDuration(run.executionSeconds)}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium">{formatDuration(run.totalSeconds)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-500 dark:text-neutral-400">{new Date(run.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
        <span>Page {pageResult?.page ?? page} of {pageResult?.totalPages ?? 1}</span>
        <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)} className="rounded-md border border-neutral-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700">Previous</button><button type="button" disabled={page >= (pageResult?.totalPages ?? 1)} onClick={() => changePage(page + 1)} className="rounded-md border border-neutral-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700">Next</button></div>
      </div>
    </section>
  );
}
