export interface RunOverviewPoint {
  id: number;
  runAttempt: number;
  name: string;
  workflowFile?: string;
  workflowRef?: string;
  status: string;
  conclusion: string;
  createdAt: string;
  queueSeconds: number | null;
  executionSeconds: number | null;
  totalSeconds: number | null;
  htmlUrl: string;
  prNumber: number | null;
}

export interface RunOverviewFilters {
  startDate: string;
  endDate: string;
  workflowFile?: string;
  workflowRef?: string;
}

export interface RunPageResult {
  runs: RunOverviewPoint[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
