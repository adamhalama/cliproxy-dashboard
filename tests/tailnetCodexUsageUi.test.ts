import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Summary } from '../src/features/tailnet/TailnetApp';
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
