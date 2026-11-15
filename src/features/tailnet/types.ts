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

/** One read-only limit reset grant as the provider reported it; nothing here redeems it. */
export type ClaudeResetGrant = {
  id: string;
  label: string;
  total: number;
  remaining: number;
  startsAt: string | null;
  expiresAt: string | null;
  /** Provider usage-window keys the grant clears; empty when not reported. */
  clears: string[];
  paused: boolean;
  usableNow: boolean;
  useRequiresLimit: boolean;
};

export type ClaudeManualResets = {
  eligible: boolean;
  atLimit: boolean;
  grants: ClaudeResetGrant[];
};

export type ClaudeUsage = {
  checkedAt: string | null;
  windows: ClaudeUsageWindow[];
  extraUsage: ClaudeExtraUsage | null;
  /** Absent from older helpers; null when the provider block was missing or malformed. */
  manualResets?: ClaudeManualResets | null;
};

export type Account = {
  id: string;
  provider: 'codex' | 'claude';
  alias: string;
  maskedIdentity: string;
  plan: string;
  priority: number;
  /** Share of the five-hour window kept unused; null when the helper does not report it. */
  reserveFiveHourPercent?: number | null;
  inRoster: boolean;
  blocked: boolean;
  paused?: boolean;
  pauseAvailable?: boolean;
  windows: QuotaWindow[];
  lastCheckedAt: string | null;
  claudeUsage?: ClaudeUsage;
  quotaSource?: 'scheduler-baseline' | 'provider';
  codexUsage?: {
    checkedAt: string | null;
    attemptedAt: string | null;
    status: 'ok' | 'error';
    error: string | null;
    manualResets?: {
      availableCount: number | null;
      applicableAvailableCount: number | null;
      credits?: { expiresAt: string }[];
    } | null;
  };
};

export type SchedulerPlugin = {
  /** Version registered since the proxy last started; null when the helper could not tell. */
  version: string | null;
  reserveEnforced: boolean;
};

export type DashboardStatus = {
  fetchedAt: string;
  proxy: string;
  claudeTimer: string;
  accounts: Account[];
  gatewayUrl: string;
  dashboardUrl: string;
  source: string;
  codexUsageRefreshAvailable?: boolean;
  claudeUsageRefreshAvailable?: boolean;
  schedulerPlugin?: SchedulerPlugin | null;
  readOnly?: boolean;
  accountControlAvailable?: boolean;
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
