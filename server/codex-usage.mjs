function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function percent(value) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim()))
    return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

export function parseCodexUsage(output) {
  try {
    const input = JSON.parse(output);
    if (!input || !Array.isArray(input.accounts)) return [];
    const seen = new Set();
    return input.accounts
      .filter((entry) => {
        if (
          !entry ||
          typeof entry.id !== 'string' ||
          !/^[a-f0-9]{20}$/.test(entry.id) ||
          !['ok', 'error'].includes(entry.status) ||
          seen.has(entry.id)
        )
          return false;
        seen.add(entry.id);
        return true;
      })
      .map((entry) => ({
        id: entry.id,
        checkedAt: timestamp(entry.checkedAt),
        attemptedAt: timestamp(entry.attemptedAt),
        status: entry.status,
        error:
          typeof entry.error === 'string' &&
          /^(http-\d{3}|provider-unavailable|invalid-quota-or-credential)$/.test(entry.error)
            ? entry.error
            : null,
        windows: (Array.isArray(entry.windows) ? entry.windows : [])
          .filter(
            (window, index, windows) =>
              window &&
              ['five_hour', 'weekly'].includes(window.kind) &&
              windows.findIndex((item) => item?.kind === window.kind) === index
          )
          .map((window) => ({
            kind: window.kind,
            usedPercent: percent(window.usedPercent),
            resetAt: timestamp(window.resetAt),
          })),
      }));
  } catch {
    return [];
  }
}
