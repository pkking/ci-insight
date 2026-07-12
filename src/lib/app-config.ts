export const APP_CONFIG = {
  githubRepository: process.env.NEXT_PUBLIC_GITHUB_REPOSITORY || 'pkking/ci-insight',
  themeStorageKey: 'ci-insight-theme',
} as const;

export function getGithubRepositoryUrl(path = ''): string {
  return `https://github.com/${APP_CONFIG.githubRepository}${path}`;
}

export function getFeedbackUrl(): string {
  return getGithubRepositoryUrl('/issues/new/choose');
}
