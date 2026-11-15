import type { Account, ClaudeResetGrant, ClaudeUsageWindow } from './types';

const STALE_AFTER = 10 * 60 * 1000;

/**
 * Whether saved reset grant counts may be presented as current. Anything other than `fresh`
 * is a cached observation and must not advertise live availability.
 */
export type ClaudeResetFreshness = 'fresh' | 'stale' | 'failed' | 'paused' | 'unreported';

function time(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function claudeResetFreshness(account: Account, now: number): ClaudeResetFreshness {
  const usage = account.claudeUsage;
  if (!usage?.manualResets) return 'unreported';
  // A paused account is not contacted, so its grants stay as last saved.
  if (account.paused) return 'paused';
  if (account.blocked) return 'failed';
  const checked = time(usage.checkedAt);
  if (checked === null || now - checked > STALE_AFTER) return 'stale';
  return 'fresh';
}

export const claudeResetCachedNotice: Record<'stale' | 'failed' | 'paused', string> = {
  paused: 'Account paused; these are saved counts from its last check.',
  failed: 'Saved counts; the latest Claude check failed. Availability may have changed.',
  stale: 'Saved counts; the latest check is overdue. Availability may have changed.',
};

export function claudeResetExpired(grant: ClaudeResetGrant, now: number): boolean {
  const expires = time(grant.expiresAt);
  return expires !== null && expires <= now;
}

/** Resets left on grants that have not expired; includes grants that have not started yet. */
export function claudeResetsLeft(grants: readonly ClaudeResetGrant[], now: number): number {
  return grants.reduce(
    (total, grant) => total + (claudeResetExpired(grant, now) ? 0 : grant.remaining),
    0
  );
}

export type ClaudeResetGrantStatus = { text: string; tone: 'ready' | 'muted' | 'warning' };

/** One status per grant, ordered so expiry and spent counts win over availability claims. */
export function claudeResetGrantStatus(
  grant: ClaudeResetGrant,
  eligible: boolean,
  freshness: ClaudeResetFreshness,
  now: number
): ClaudeResetGrantStatus {
  const starts = time(grant.startsAt);
  if (claudeResetExpired(grant, now)) return { text: 'Expired', tone: 'muted' };
  if (grant.remaining === 0) return { text: 'Spent', tone: 'muted' };
  if (starts !== null && starts > now) return { text: 'Upcoming', tone: 'muted' };
  if (grant.paused) return { text: 'Paused by provider', tone: 'warning' };
  if (!eligible) return { text: 'Account not eligible', tone: 'warning' };
  if (freshness !== 'fresh') return { text: 'Availability needs a fresh check', tone: 'warning' };
  if (grant.usableNow) return { text: 'Usable now', tone: 'ready' };
  return {
    text: grant.useRequiresLimit
      ? 'Not usable now; only once a limit is reached'
      : 'Not usable now',
    tone: 'muted',
  };
}

const knownScopes: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
};

/**
 * A readable name for a provider usage-window key, or null when the key is unknown. Prefers the
 * label the provider gave the matching window; unknown keys are shown as returned, never guessed.
 */
export function claudeResetScope(
  key: string,
  windows: readonly ClaudeUsageWindow[]
): string | null {
  return windows.find((window) => window.id === key)?.label ?? knownScopes[key] ?? null;
}

/** A grant that does not list the general weekly key must not read as a whole-week reset. */
export function claudeResetPartial(grant: ClaudeResetGrant): boolean {
  return grant.clears.length > 0 && !grant.clears.includes('seven_day');
}
