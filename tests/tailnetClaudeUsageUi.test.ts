import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaudeUsage } from '../src/features/tailnet/ClaudeUsage';
import type { Account } from '../src/features/tailnet/types';

const now = Date.parse('2026-10-10T16:05:00Z');
const account: Account = {
  id: 'claude-subscription',
  provider: 'claude',
  alias: 'Claude test',
  maskedIdentity: 'Synthetic account',
  plan: 'Claude',
  priority: 0,
  inRoster: true,
  blocked: false,
  windows: [],
  lastCheckedAt: null,
};

describe('Claude usage display', () => {
  test('converts extra-usage cents to dollars and names used meters separately from remaining', () => {
    const html = renderToStaticMarkup(
      createElement(ClaudeUsage, {
        now,
        account: {
          ...account,
          claudeUsage: {
            checkedAt: '2026-10-10T16:00:00Z',
            windows: [
              {
                id: 'seven_day',
                label: 'Weekly limit',
                usedPercent: 62,
                resetAt: '2026-10-14T09:00:00Z',
                periodHours: 168,
                limitDollars: null,
                usedDollars: null,
                remainingDollars: null,
              },
            ],
            extraUsage: {
              enabled: true,
              monthlyLimitCents: 5000,
              usedCreditsCents: 1250,
              usedPercent: 25,
            },
          },
        },
      })
    );
    expect(html).toContain('62% used');
    expect(html).toContain('38');
    expect(html).toContain('aria-label="Weekly limit used"');
    expect(html).toContain('$12.50');
    expect(html).toContain('$50.00');
    expect(html).not.toContain('Stale observation');
  });

  test('unavailable details and disabled extra usage never imply a free or unused balance', () => {
    const missing = renderToStaticMarkup(createElement(ClaudeUsage, { account, now }));
    expect(missing).toContain('Detailed usage is not available');
    expect(missing).not.toContain('0% used');
    const disabled = renderToStaticMarkup(
      createElement(ClaudeUsage, {
        now,
        account: {
          ...account,
          claudeUsage: {
            checkedAt: null,
            windows: [],
            extraUsage: {
              enabled: false,
              monthlyLimitCents: null,
              usedCreditsCents: null,
              usedPercent: null,
            },
          },
        },
      })
    );
    expect(disabled).toContain('Disabled');
    expect(disabled).toContain('Not reported');
    expect(disabled).not.toContain('$0.00');
  });

  test('stale readings and passed resets remain marked rather than presenting invented fresh usage', () => {
    const html = renderToStaticMarkup(
      createElement(ClaudeUsage, {
        now,
        account: {
          ...account,
          claudeUsage: {
            checkedAt: '2026-10-10T15:00:00Z',
            windows: [
              {
                id: 'five_hour',
                label: '5-hour limit',
                usedPercent: 90,
                resetAt: '2026-10-10T16:00:00Z',
                periodHours: 5,
                limitDollars: null,
                usedDollars: null,
                remainingDollars: null,
              },
            ],
            extraUsage: null,
          },
        },
      })
    );
    expect(html).toContain('Stale observation');
    expect(html).toContain('90% used');
    expect(html).toContain('Reset passed');
    expect(html).toContain('awaiting update');
  });
});
