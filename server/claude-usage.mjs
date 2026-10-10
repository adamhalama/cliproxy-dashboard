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
  };
}
