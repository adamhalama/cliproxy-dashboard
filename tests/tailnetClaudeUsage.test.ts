import { describe, expect, test } from 'bun:test';
// @ts-expect-error Standalone adapter modules run directly in Node.
import { parseStatus } from '../server/status.mjs';
// @ts-expect-error Standalone adapter modules run directly in Node.
import { parseClaudeUsage } from '../server/claude-usage.mjs';

const usage = {
  checkedAt: '2026-10-10T16:00:00Z',
  windows: [
    {
      id: 'five_hour',
      label: '5-hour limit',
      usedPercent: 18,
      resetAt: '2026-10-10T19:19:59Z',
      periodHours: 5,
    },
    {
      id: 'seven_day',
      label: 'Weekly limit',
      usedPercent: 62,
      resetAt: '2026-10-14T09:00:00Z',
      periodHours: 168,
    },
    { id: 'seven_day_sonnet', label: 'Weekly Sonnet', usedPercent: 0, resetAt: null },
    { id: 'scoped_0', label: 'Weekly Fable', usedPercent: 36, resetAt: '2026-10-14T09:00:00Z' },
    {
      id: 'iguana_necktie',
      label: 'Cloud session credits',
      usedPercent: 20,
      limitDollars: 50,
      usedDollars: 10,
      remainingDollars: 40,
    },
  ],
  extraUsage: { enabled: true, monthlyLimitCents: 5000, usedCreditsCents: 1250, usedPercent: 25 },
};
const legacy =
  'cliproxy: active\nclaude-quota-probe.timer: active\nclaude: active, used 18%, resets 2026-10-10T19:19:59Z, last check 2026-10-10T16:00:00Z, last probe -\n';

describe('full Claude quota adapter', () => {
  test('exports weekly quota to the ledger and preserves all detail limits', () => {
    const [claude] = parseStatus(`${legacy}claude usage: ${JSON.stringify(usage)}\n`).data.accounts;
    expect(claude.windows).toHaveLength(2);
    expect(
      claude.windows.find((window: { kind: string }) => window.kind === 'weekly')
    ).toMatchObject({ usedPercent: 62, resetAt: '2026-10-14T09:00:00Z' });
    expect(claude.claudeUsage.windows).toHaveLength(5);
    expect(claude.claudeUsage.windows[2].usedPercent).toBe(0);
    expect(claude.claudeUsage.windows[4].remainingDollars).toBe(40);
    expect(claude.claudeUsage.extraUsage.monthlyLimitCents).toBe(5000);
  });

  test('older helpers and malformed detail lines preserve five-hour status without invented weekly readings', () => {
    for (const output of [
      legacy,
      `${legacy}claude usage: bad-json`,
      `${legacy}claude usage: null`,
    ]) {
      const [claude] = parseStatus(output).data.accounts;
      expect(claude.windows).toHaveLength(1);
      expect(claude.claudeUsage).toBeUndefined();
    }
  });

  test('missing, invalid, and zero values stay distinct; unapproved provider fields never leave the adapter', () => {
    const result = parseClaudeUsage(
      JSON.stringify({
        ...usage,
        access_token: 'secret',
        windows: [
          {
            id: 'seven_day',
            label: 'Weekly limit',
            usedPercent: null,
            resetAt: 'invalid',
            usedDollars: false,
            limitDollars: -1,
            access_token: 'secret',
          },
          { id: 'seven_day_sonnet', label: 'Weekly Sonnet', usedPercent: 0 },
          { id: 'seven_day_opus', label: 'Weekly Opus', usedPercent: 101 },
          { id: 'seven_day', label: 'Duplicate', usedPercent: 50 },
        ],
        extraUsage: {
          enabled: false,
          monthlyLimitCents: null,
          usedCreditsCents: null,
          usedPercent: null,
          access_token: 'secret',
        },
      })
    );
    expect(result.windows).toHaveLength(3);
    expect(result.windows[0]).toMatchObject({
      usedPercent: null,
      resetAt: null,
      usedDollars: null,
      limitDollars: null,
    });
    expect(result.windows[1].usedPercent).toBe(0);
    expect(result.windows[2].usedPercent).toBeNull();
    expect(result.extraUsage).toEqual({
      enabled: false,
      monthlyLimitCents: null,
      usedCreditsCents: null,
      usedPercent: null,
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  test('failed collector checks retain last known usage with the original observation timestamp', () => {
    const [claude] = parseStatus(
      `${legacy.replace('claude: active', 'claude: error')}claude usage: ${JSON.stringify(usage)}`
    ).data.accounts;
    expect(claude.blocked).toBe(true);
    expect(claude.windows[1].state).toBe('error');
    expect(claude.claudeUsage.checkedAt).toBe(usage.checkedAt);
  });
});
