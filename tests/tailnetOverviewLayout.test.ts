import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Summary } from '../src/features/tailnet/TailnetApp';
import {
  moveProvider,
  normalizeIdList,
  normalizeProviderOrder,
  normalizeSummaryKinds,
} from '../src/features/tailnet/preferences';
import type { Account } from '../src/features/tailnet/types';

const now = Date.parse('2026-11-15T16:00:00Z');
const codex: Account = {
  id: 'plus',
  provider: 'codex',
  alias: 'Plus',
  maskedIdentity: 'a…@o…',
  plan: 'Plus',
  priority: 100,
  inRoster: true,
  blocked: false,
  quotaSource: 'provider',
  lastCheckedAt: '2026-11-15T15:55:00Z',
  windows: [
    { kind: 'weekly', state: 'active', usedPercent: 42, resetAt: '2026-11-18T07:00:00Z' },
    { kind: 'five_hour', state: 'active', usedPercent: 87, resetAt: '2026-11-15T18:22:00Z' },
  ],
};

describe('provider order preference', () => {
  test('keeps each provider once and ignores invalid saved values', () => {
    expect(normalizeProviderOrder(null)).toEqual(['codex', 'claude']);
    expect(normalizeProviderOrder(['claude'])).toEqual(['claude', 'codex']);
    expect(normalizeProviderOrder(['claude', 'x', 'claude', 'codex'])).toEqual(['claude', 'codex']);
    expect(normalizeProviderOrder('claude')).toEqual(['codex', 'claude']);
  });

  test('moves a provider within the shown providers and stops at the ends', () => {
    const both = ['codex', 'claude'] as const;
    expect(moveProvider(['codex', 'claude'], both, 'claude', -1)).toEqual(['claude', 'codex']);
    expect(moveProvider(['claude', 'codex'], both, 'claude', -1)).toEqual(['claude', 'codex']);
    expect(moveProvider(['codex', 'claude'], both, 'claude', 1)).toEqual(['codex', 'claude']);
    expect(moveProvider(['codex', 'claude'], ['codex'], 'codex', 1)).toEqual(['codex', 'claude']);
  });
});

describe('summary window preference', () => {
  test('defaults to Codex weekly and Claude 5-hour, and rejects unknown kinds', () => {
    expect(normalizeSummaryKinds(undefined)).toEqual({ codex: 'weekly', claude: 'five_hour' });
    expect(normalizeSummaryKinds({ codex: 'five_hour', claude: 'monthly' })).toEqual({
      codex: 'five_hour',
      claude: 'five_hour',
    });
    expect(normalizeIdList(['a', 3, null, 'b'])).toEqual(['a', 'b']);
  });

  test('the summary card shows the selected window and offers a switch', () => {
    const render = (kind: 'weekly' | 'five_hour') =>
      renderToStaticMarkup(
        createElement(Summary, {
          provider: 'codex',
          accounts: [codex],
          now,
          kind,
          onKindChange: () => undefined,
        })
      );
    const weekly = render('weekly');
    expect(weekly).toContain('Weekly remaining');
    expect(weekly).toContain('58%');
    expect(weekly).toMatch(/aria-pressed="true"[^>]*>Week</);
    const fiveHour = render('five_hour');
    expect(fiveHour).toContain('5-hour remaining');
    expect(fiveHour).toContain('13%');
    expect(fiveHour).toMatch(/aria-pressed="true"[^>]*>5h</);
  });

  test('without a switch handler the card keeps its previous read-only form', () => {
    const html = renderToStaticMarkup(
      createElement(Summary, { provider: 'codex', accounts: [codex], now })
    );
    expect(html).toContain('Weekly remaining');
    expect(html).toContain('1 account');
    expect(html).not.toContain('aria-pressed');
  });
});

describe('overview layout source contract', () => {
  const source = readFileSync('src/features/tailnet/TailnetApp.tsx', 'utf8');

  test('Claude usage details stay collapsed until the viewer expands them', () => {
    expect(source).toContain("'tailnet.expandedUsageDetails',\n    []");
    expect(source).toMatch(
      /expandedUsageDetails\.includes\(account\.id\) && \(\s*<div id=\{`usage-details-\$\{account\.id\}`\}>/
    );
    expect(source).toContain('aria-expanded={expandedUsageDetails.includes(account.id)}');
  });

  test('the page header drops the description and the 30-second note', () => {
    expect(source).not.toContain('Your subscriptions and proxy, in one place.');
    expect(source).not.toContain('Snapshot read every 30s');
    expect(source).not.toContain('Checks Codex and Claude provider limits');
    expect(source).not.toContain('Refresh snapshot');
    expect(source).not.toContain('Refresh usage');
  });

  test('one Refresh button checks provider usage when available, else rereads the snapshot', () => {
    expect(source).toContain(
      'onClick={() => void (usageRefreshable ? refreshUsage() : refresh())}'
    );
    expect(source).toContain('<h1 className={styles.srOnly}>{pages[page].label}</h1>');
  });

  test('success messages float as a toast that clears itself', () => {
    expect(source).toContain('className={`${styles.successNotice} ${styles.toast}`} role="status"');
    expect(source).toContain("window.setTimeout(() => setNotice(''), 5000)");
    // A repeated identical message must restart the timer.
    expect(source).toContain('}, [notice, noticeId]);');
    expect(source).not.toContain('Reported provider limits are shown below.');
  });
});
