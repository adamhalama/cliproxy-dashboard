import { describe, expect, test } from 'bun:test';
// @ts-expect-error Standalone Node adapter.
import { accountId, parseStatus } from '../server/status.mjs';
// @ts-expect-error Standalone Node adapter.
import { parseCodexUsage } from '../server/codex-usage.mjs';

const filename = 'codex-0000-synthetic@example.invalid-team.json';
const legacy = `cliproxy: active
${filename}
  alias: Team  priority: 100  in roster: true
  five_hour: AuthBlocked, used null%, resets 2026-10-10T19:00:00Z
  weekly: Confirmed, used 0%, resets 2026-10-17T16:00:00Z
`;
const checkedAt = '2026-10-10T16:00:00Z';
const entry = {
  id: accountId(filename),
  checkedAt,
  attemptedAt: checkedAt,
  status: 'ok',
  error: null,
  windows: [{ kind: 'weekly', usedPercent: 17, resetAt: '2026-10-17T16:00:00Z' }],
};
function output(account = entry) {
  return (
    legacy +
    'codex usage collector: available\ncodex usage: ' +
    JSON.stringify({ accounts: [account] })
  );
}

describe('current Codex usage', () => {
  test('baseline never becomes usage, including zero; auth block survives missing baseline percentage', () => {
    const account = parseStatus(legacy, checkedAt).data.accounts[0];
    expect(
      account.windows.map((window: { usedPercent: number | null }) => window.usedPercent)
    ).toEqual([null, null]);
    expect(account.blocked).toBe(true);
    expect(account.quotaSource).toBe('scheduler-baseline');
    expect(account.lastCheckedAt).toBeNull();
  });
  test('provider observations replace windows and preserve routing and auth state', () => {
    const data = parseStatus(output(), '2026-10-10T16:05:00Z').data;
    expect(data.codexUsageRefreshAvailable).toBe(true);
    const account = data.accounts[0];
    expect(account.quotaSource).toBe('provider');
    expect(account.lastCheckedAt).toBe(checkedAt);
    expect(account.windows).toEqual([{ ...entry.windows[0], state: 'active' }]);
    expect(account.blocked).toBe(true);
    expect(account.priority).toBe(100);
  });
  test('failed checks keep last successful reading visibly stale', () => {
    const account = parseStatus(
      output({ ...entry, status: 'error', error: 'http-401', attemptedAt: '2026-10-10T16:05:00Z' }),
      '2026-10-10T16:05:00Z'
    ).data.accounts[0];
    expect(account.windows[0].usedPercent).toBe(17);
    expect(account.windows[0].state).toBe('stale');
    expect(account.lastCheckedAt).toBe(checkedAt);
    expect(account.codexUsage.error).toBe('http-401');
    expect(parseStatus(output(), '2026-10-10T16:11:00Z').data.accounts[0].windows[0].state).toBe(
      'stale'
    );
  });
  test('no success timestamp cannot turn a baseline into provider data', () => {
    const data = JSON.parse(JSON.stringify(entry));
    data.checkedAt = null;
    data.status = 'error';
    const account = parseStatus(output(data), checkedAt).data.accounts[0];
    expect(account.quotaSource).toBe('scheduler-baseline');
    expect(
      account.windows.every((window: { usedPercent: number | null }) => window.usedPercent === null)
    ).toBe(true);
    expect(account.codexUsage.status).toBe('error');
  });
  test('parser allowlists fields and preserves zero versus missing or invalid values', () => {
    for (const invalid of [null, undefined, '', false, [], {}, -1, 101, 'NaN']) {
      const parsed = parseCodexUsage(
        JSON.stringify({
          accounts: [
            {
              ...entry,
              windows: [{ ...entry.windows[0], usedPercent: invalid, access_token: 'secret' }],
              access_token: 'secret',
              error: 'secret',
            },
          ],
        })
      );
      expect(parsed[0].windows[0].usedPercent).toBeNull();
      expect(JSON.stringify(parsed)).not.toContain('secret');
    }
    expect(
      parseCodexUsage(
        JSON.stringify({
          accounts: [{ ...entry, windows: [{ ...entry.windows[0], usedPercent: 0 }] }],
        })
      )[0].windows[0].usedPercent
    ).toBe(0);
    expect(parseCodexUsage('broken')).toEqual([]);
    expect(parseCodexUsage(JSON.stringify({ accounts: [{ ...entry, id: filename }] }))).toEqual([]);
    expect(parseCodexUsage(JSON.stringify({ accounts: [entry, entry] }))).toHaveLength(1);
  });
  test('manual resets survive the status boundary without exporting extra fields', () => {
    const account = parseStatus(
      output({
        ...entry,
        manualResets: {
          availableCount: 3,
          applicableAvailableCount: 0,
          credits: [
            { expiresAt: '2026-11-01T12:00:00Z', secret: 'private' },
            { expiresAt: 'invalid' },
          ],
          secret: 'private',
        },
      } as typeof entry),
      checkedAt
    ).data.accounts[0];
    expect(account.codexUsage.manualResets).toEqual({
      availableCount: 3,
      applicableAvailableCount: 0,
      credits: [{ expiresAt: '2026-11-01T12:00:00Z' }],
    });
    expect(JSON.stringify(account)).not.toContain('private');
    for (const invalid of [null, '', false, [], {}, -1, 1.5, 'NaN', Number.MAX_SAFE_INTEGER + 1]) {
      const parsed = parseCodexUsage(
        JSON.stringify({ accounts: [{ ...entry, manualResets: { availableCount: invalid } }] })
      );
      expect(parsed[0].manualResets.availableCount).toBeNull();
    }
    expect(
      parseCodexUsage(
        JSON.stringify({ accounts: [{ ...entry, manualResets: { availableCount: 0 } }] })
      )[0].manualResets.availableCount
    ).toBe(0);
    expect(parseCodexUsage(JSON.stringify({ accounts: [entry] }))[0].manualResets).toBeNull();
  });
});
