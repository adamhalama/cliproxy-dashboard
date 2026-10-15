import type { DashboardStatus, LoginResult } from './types';

let sessionToken: string | null = null;

async function request<T>(path: string, body?: unknown): Promise<T> {
  if (body !== undefined && !sessionToken) {
    const session = await request<{ token: string }>('/api/session');
    sessionToken = session.token;
  }
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
            'X-Dashboard-Token': sessionToken!,
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 403) sessionToken = null;
    const error = result as { error?: string };
    throw new Error(error.error || 'The server could not complete this action.');
  }
  return result as T;
}

export const dashboardApi = {
  status: () => request<DashboardStatus>('/api/status'),
  refreshUsage: (provider: 'all' | 'codex' | 'claude') =>
    request<DashboardStatus & { refreshErrors: string[] }>('/api/quota/refresh', { provider }),
  saveAccount: (
    id: string,
    settings: { priority: number; alias: string; reserveFiveHourPercent?: number }
  ) => request<{ message: string }>('/api/accounts/priority', { id, ...settings }),
  startLogin: (provider: 'codex' | 'claude') => request<LoginResult>(`/api/login/${provider}`, {}),
  loginStatus: () => request<LoginResult>('/api/login/status'),
  claudeCallback: (url: string) => request<LoginResult>('/api/login/callback', { url }),
};
