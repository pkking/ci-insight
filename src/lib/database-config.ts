export type DashboardDataSource = 'sqlite' | 'turso';

type DataSourceOptions = {
  nodeEnv?: string;
  configured?: string;
};

export function resolveDashboardDataSource({
  nodeEnv = process.env.NODE_ENV,
  configured = process.env.DASHBOARD_DATA_SOURCE,
}: DataSourceOptions = {}): DashboardDataSource {
  if (configured !== undefined && configured !== 'sqlite' && configured !== 'turso') {
    throw new Error(`Invalid DASHBOARD_DATA_SOURCE: ${configured}. Expected sqlite or turso.`);
  }
  if (configured === 'sqlite' || configured === 'turso') return configured;
  return nodeEnv === 'production' ? 'turso' : 'sqlite';
}
