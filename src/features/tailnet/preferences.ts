import type { Account, QuotaWindow } from './types';

export type ProviderId = Account['provider'];
export type SummaryKind = Extract<QuotaWindow['kind'], 'weekly' | 'five_hour'>;
export type SummaryKinds = Record<ProviderId, SummaryKind>;

export const defaultProviderOrder: ProviderId[] = ['codex', 'claude'];
export const defaultSummaryKinds: SummaryKinds = { codex: 'weekly', claude: 'five_hour' };

/** Keeps every known provider exactly once, in the saved order, ignoring unknown entries. */
export function normalizeProviderOrder(value: unknown): ProviderId[] {
  const saved = Array.isArray(value) ? value : [];
  const known = saved.filter(
    (item, index): item is ProviderId =>
      defaultProviderOrder.includes(item as ProviderId) && saved.indexOf(item) === index
  );
  return [...known, ...defaultProviderOrder.filter((item) => !known.includes(item))];
}

/** Moves a provider one place up (-1) or down (1) within the providers that are shown. */
export function moveProvider(
  order: ProviderId[],
  visible: readonly ProviderId[],
  provider: ProviderId,
  direction: -1 | 1
): ProviderId[] {
  const shown = order.filter((item) => visible.includes(item));
  const index = shown.indexOf(provider);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= shown.length) return order;
  const swapped = [...shown];
  [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
  let next = 0;
  return order.map((item) => (visible.includes(item) ? swapped[next++] : item));
}

export function normalizeSummaryKinds(value: unknown): SummaryKinds {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const kind = (provider: ProviderId): SummaryKind =>
    saved[provider] === 'weekly' || saved[provider] === 'five_hour'
      ? saved[provider]
      : defaultSummaryKinds[provider];
  return { codex: kind('codex'), claude: kind('claude') };
}

export function normalizeIdList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
