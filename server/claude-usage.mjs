function number(value, maximum = Infinity) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim()))
    return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null;
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function label(value) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, 100)
        .trim()
    : '';
}

const RESET_GRANT_ID = /^[a-z0-9_-]{1,40}$/;
const RESET_CLEARS_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_RESET_GRANTS = 16;
const MAX_RESET_CLEARS = 16;
const MAX_RESET_COUNT = 1000;
const invalid = Symbol('invalid');

function resetCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_RESET_COUNT ? value : invalid;
}

// Missing flags take the collector's refusing defaults; any other non-boolean is malformed.
function resetFlag(value, fallback) {
  if (value == null) return fallback;
  return typeof value === 'boolean' ? value : invalid;
}

function resetTime(value) {
  if (value == null) return null;
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value))
    ? value
    : invalid;
}

function resetGrant(grant) {
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) return null;
  if (typeof grant.id !== 'string' || !RESET_GRANT_ID.test(grant.id)) return null;
  if (grant.clears != null && !Array.isArray(grant.clears)) return null;
  const parsed = {
    id: grant.id,
    label:
      typeof grant.label === 'string'
        ? grant.label
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120)
            .trim()
        : '',
    total: resetCount(grant.total),
    remaining: resetCount(grant.remaining),
    startsAt: resetTime(grant.startsAt),
    expiresAt: resetTime(grant.expiresAt),
    // Keys stay as the provider names them; unsafe keys are dropped, never guessed.
    clears: [
      ...new Set(
        (grant.clears ?? []).filter((key) => typeof key === 'string' && RESET_CLEARS_KEY.test(key))
      ),
    ].slice(0, MAX_RESET_CLEARS),
    paused: resetFlag(grant.paused, false),
    usableNow: resetFlag(grant.usableNow, false),
    useRequiresLimit: resetFlag(grant.useRequiresLimit, true),
  };
  if (Object.values(parsed).includes(invalid) || parsed.remaining > parsed.total) return null;
  return parsed;
}

/** Read-only reset grants; a missing or malformed block (or any bad grant) is null, not zero. */
function manualResets(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  if (typeof block.eligible !== 'boolean') return null;
  const grants = block.grants ?? [];
  if (!Array.isArray(grants) || grants.length > MAX_RESET_GRANTS) return null;
  const parsed = grants.map(resetGrant);
  if (parsed.includes(null)) return null;
  if (new Set(parsed.map((grant) => grant.id)).size !== parsed.length) return null;
  return { eligible: block.eligible, grants: parsed };
}

export function parseClaudeUsage(output) {
  let input;
  try {
    input = JSON.parse(output);
  } catch {
    return null;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const ids = new Set();
  const windows = [];
  for (const entry of (Array.isArray(input.windows) ? input.windows : []).slice(0, 128)) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.id !== 'string' ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(entry.id)
    )
      continue;
    if (ids.has(entry.id) || !label(entry.label)) continue;
    ids.add(entry.id);
    windows.push({
      id: entry.id,
      label: label(entry.label),
      usedPercent: number(entry.usedPercent, 100),
      resetAt: timestamp(entry.resetAt),
      periodHours: number(entry.periodHours),
      limitDollars: number(entry.limitDollars),
      usedDollars: number(entry.usedDollars),
      remainingDollars: number(entry.remainingDollars),
    });
  }
  const extra = input.extraUsage;
  return {
    checkedAt: timestamp(input.checkedAt),
    windows,
    extraUsage:
      extra && typeof extra === 'object' && typeof extra.enabled === 'boolean'
        ? {
            enabled: extra.enabled,
            monthlyLimitCents: number(extra.monthlyLimitCents),
            usedCreditsCents: number(extra.usedCreditsCents),
            usedPercent: number(extra.usedPercent, 100),
          }
        : null,
    // Helpers before reset grants omit the field entirely; keep that distinct from null.
    ...('manualResets' in input ? { manualResets: manualResets(input.manualResets) } : {}),
  };
}
