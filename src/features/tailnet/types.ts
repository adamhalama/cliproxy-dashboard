export type QuotaWindow = {
  kind: 'five_hour' | 'weekly';
  usedPercent: number | null;
  resetAt: string | null;
  state: string;
};

export type Account = {
  id: string;
  provider: 'codex' | 'claude';
  alias: string;
  maskedIdentity: string;
  plan: string;
  priority: number;
  inRoster: boolean;
  blocked: boolean;
  windows: QuotaWindow[];
  lastCheckedAt: string | null;
};

export type DashboardStatus = {
  fetchedAt: string;
  proxy: string;
  claudeTimer: string;
  accounts: Account[];
  gatewayUrl: string;
  dashboardUrl: string;
  source: string;
  policy: {
    mode: string;
    description: string;
    resetProbing: boolean;
  };
};

export type LoginResult = {
  state: string;
  url?: string;
  code?: string;
  message: string;
};
