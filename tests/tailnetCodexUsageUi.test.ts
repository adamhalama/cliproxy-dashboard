import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManualResets, Summary } from '../src/features/tailnet/TailnetApp';
import type { Account } from '../src/features/tailnet/types';

const now = Date.parse('2026-10-10T16:05:00Z');
const account: Account = {
  id: 'synthetic-account',
  provider: 'codex',
  alias: 'Synthetic',
  maskedIdentity: 'Synthetic',
  plan: 'Team',
  priority: 100,
  inRoster: true,
  blocked: false,
  lastCheckedAt: null,
  windows: [{ kind: 'weekly', state: 'active', usedPercent: 0, resetAt: '2026-10-17T16:00:00Z' }],
};
function summary(accounts: Account[]) {
  return renderToStaticMarkup(createElement(Summary, { provider: 'codex', accounts, now }));
}
describe('Codex capacity summary', () => {
  test('old baseline payloads cannot create a 300% remaining claim', () => {
    const html = summary([account, { ...account, id: 'two' }, { ...account, id: 'three' }]);
    expect(html).toContain('Weekly usage unavailable');
    expect(html).not.toContain('300%');
    expect(html).toContain('3 unavailable');
  });
  test('only fresh provider readings contribute to total capacity', () => {
    const live: Account = {
      ...account,
      quotaSource: 'provider',
      windows: [{ ...account.windows[0], usedPercent: 17 }],
    };
    const stale: Account = {
      ...live,
      id: 'stale',
      windows: [{ ...live.windows[0], state: 'stale' }],
    };
    const blocked = { ...live, id: 'blocked', blocked: true };
    const html = summary([live, stale, blocked, account]);
    expect(html).toContain('83%');
    expect(html).toContain('of 100% observed');
    expect(html).toContain('1 cached / stale');
    expect(html).toContain('3 unavailable');
    expect(html).not.toContain('166%');
  });
});

const withResets: Account = {
  ...account,
  quotaSource: 'provider',
  codexUsage: {
    checkedAt: '2026-10-10T16:00:00Z',
    attemptedAt: '2026-10-10T16:00:00Z',
    status: 'ok',
    error: null,
    manualResets: { availableCount: 3, applicableAvailableCount: 0 },
  },
};
function resets(account: Account, at = now) {
  return renderToStaticMarkup(createElement(ManualResets, { account, now: at }));
}
describe('manual reset balances', () => {
  test('shows reported available and applicable counts independently of quota percentages', () => {
    const html = resets(withResets);
    expect(html).toContain('Manual resets');
    expect(html).toContain('3 available');
    expect(html).toContain('0 applicable now');
    expect(summary([withResets])).toContain('3 available');
    expect(summary([withResets])).toContain('100%');
  });
  test('distinguishes no resets from an unavailable allowance', () => {
    const empty: Account = {
      ...withResets,
      codexUsage: {
        ...withResets.codexUsage!,
        manualResets: { availableCount: 0, applicableAvailableCount: null },
      },
    };
    expect(resets(empty)).toContain('0 available');
    expect(summary([empty])).toContain('0 available');
    expect(resets(account)).toContain('Not reported');
    expect(resets(account)).not.toContain('0 available');
  });
  test('marks old, failed and blocked readings cached and omits them from totals', () => {
    const failed = {
      ...withResets,
      codexUsage: { ...withResets.codexUsage!, status: 'error' as const },
    };
    const blocked = { ...withResets, blocked: true };
    for (const cached of [failed, blocked]) {
      expect(resets(cached)).toContain('Cached; needs update');
      expect(resets(cached)).not.toContain('applicable now');
      expect(summary([cached])).not.toContain('3 available');
    }
    expect(resets(withResets, now + 10 * 60 * 1000)).toContain('Cached; needs update');
    const html = summary([withResets, failed, blocked, account]);
    expect(html).toContain('3 available');
    expect(html).not.toContain('9 available');
    expect(html).toContain('3 unavailable');
  });
});
