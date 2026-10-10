export type QuotaWindow = {
  kind: 'five_hour' | 'weekly';
  usedPercent: number | null;
  resetAt: string | null;
  state: string;
};

export type ClaudeUsageWindow = {
  id: string;
  label: string;
  usedPercent: number | null;
  resetAt: string | null;
  periodHours: number | null;
  limitDollars: number | null;
  usedDollars: number | null;
  remainingDollars: number | null;
};

export type ClaudeExtraUsage = {
  enabled: boolean;
  monthlyLimitCents: number | null;
  usedCreditsCents: number | null;
  usedPercent: number | null;
};

export type ClaudeUsage = {
  checkedAt: string | null;
  windows: ClaudeUsageWindow[];
  extraUsage: ClaudeExtraUsage | null;
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
  claudeUsage?: ClaudeUsage;
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
  provider?: 'codex' | 'claude';
  accountId?: string;
  accountAlias?: string;
  verification?: 'pending' | 'auth-blocked' | 'scheduler-observed';
  url?: string;
  code?: string;
  message: string;
};
