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

describe('manual reset expiration dates', () => {
  function dated(dates: string[]) {
    return {
      ...withResets,
      codexUsage: {
        ...withResets.codexUsage!,
        manualResets: {
          availableCount: 3,
          applicableAvailableCount: 0,
          credits: dates.map((expiresAt) => ({ expiresAt })),
        },
      },
    };
  }
  test('groups matching dates and sorts all dates below the balance', () => {
    const html = resets(
      dated(['2026-11-02T12:00:00Z', '2026-11-01T12:00:00Z', '2026-11-01T12:00:00Z'])
    );
    expect(html).toContain('2 x ');
    expect(html).toContain('1 x ');
    expect(html.indexOf('3 available')).toBeLessThan(html.indexOf('<time'));
    expect(html.indexOf('2026-11-01T12:00:00.000Z')).toBeLessThan(
      html.indexOf('2026-11-02T12:00:00.000Z')
    );
    expect(html).not.toContain('not reported');
  });
  test('uses compact local dates and 24-hour time without a timezone label', () => {
    const date = new Date(2026, 10, 1, 11, 20).toISOString();
    const html = resets(dated([date, date]));
    expect(html).toContain('2 x <time');
    expect(html).toContain('>1.11. 2026 11:20</time>');
    expect(html).not.toMatch(/GMT|CET|AM|PM/);
  });
  test('does not invent missing expiration dates', () => {
    expect(resets(withResets)).toContain('Expiration not reported');
    expect(resets(dated(['invalid']))).toContain('Expiration not reported');
    expect(resets(dated(['2026-11-01T12:00:00Z']))).toContain(
      'Other expiration dates not reported'
    );
  });
  test('expired credits make counts stale and are excluded from totals', () => {
    const expired = dated(['2026-10-09T12:00:00Z']);
    expect(resets(expired)).toContain('1 x ');
    expect(resets(expired)).toContain('(expired)');
    expect(resets(expired)).toContain('Cached; needs update');
    expect(summary([expired])).not.toContain('3 available');
  });
});
