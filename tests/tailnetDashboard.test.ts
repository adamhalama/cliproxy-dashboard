import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import http from 'node:http';
// @ts-expect-error Standalone server modules intentionally run directly in Node.
import { parseStatus, parseLogin } from '../server/status.mjs';
// @ts-expect-error Standalone server modules intentionally run directly in Node.
import { handler } from '../server/dashboard.mjs';

const fixture = `cliproxy: active
claude-quota-probe.timer: active

codex-0123-example@example.invalid-team.json
  alias: Team (5h, first)  priority: 100  in roster: true
  five_hour: AuthBlocked, used 0%, resets 2026-10-09T14:30:02+02:00
  weekly: AuthBlocked, used 21%, resets 2026-10-14T05:39:56+02:00
codex-4567-buffer@example.invalid-self-serve-business-prolite.json
  alias: Pro Lite (weekly-only buffer)  priority: 0  in roster: true
  weekly: WaitingReset, used 10%, resets 2026-10-14T05:34:59+02:00
claude: active, used 8.0%, resets 2026-10-10T19:19:59+00:00, last check 2026-10-10T14:33:15Z, last probe 2026-10-10T09:27:45Z HTTP 2xx
`;

describe('tailnet quota adapter', () => {
  test('preserves blocked and weekly-only accounts without inventing missing quotas', () => {
    const { data, authFiles } = parseStatus(fixture, '2026-10-10T14:40:00Z');
    expect(data.proxy).toBe('active');
    expect(data.claudeTimer).toBe('active');
    expect(data.accounts).toHaveLength(3);
    const [team, buffer, claude] = data.accounts;
    expect(team.blocked).toBe(true);
    expect(team.windows[1].usedPercent).toBe(21);
    expect(team.priority).toBe(100);
    expect(team.lastCheckedAt).toBeNull();
    expect(buffer.windows.map((window: { kind: string }) => window.kind)).toEqual(['weekly']);
    expect(buffer.priority).toBe(0);
    expect(claude.windows).toHaveLength(1);
    expect(claude.windows[0].usedPercent).toBe(8);
    expect(claude.lastCheckedAt).toBe('2026-10-10T14:33:15Z');
    expect(authFiles.get(team.id)).toBe('codex-0123-example@example.invalid-team.json');
    expect(JSON.stringify(data)).not.toContain('example@example.invalid');
    expect(JSON.stringify(data)).not.toContain('codex-0123');
  });

  test('rejects malformed output and marks invalid readings unavailable', () => {
    expect(() => parseStatus('unexpected output')).toThrow();
    const data = parseStatus(
      fixture.replace('used 21%', 'used 101%').replace('2026-10-14T05:39:56+02:00', 'not-a-date')
    ).data;
    expect(data.accounts[0].windows[1].usedPercent).toBeNull();
    expect(data.accounts[0].windows[1].resetAt).toBeNull();
  });

  test('does not lose accounts awaiting their first quota observation', () => {
    const output = fixture.replace(
      '  five_hour: AuthBlocked, used 0%, resets 2026-10-09T14:30:02+02:00\n  weekly: AuthBlocked, used 21%, resets 2026-10-14T05:39:56+02:00',
      '  wake-up: not scheduled yet (needs a Codex request and first quota refresh)'
    );
    expect(parseStatus(output).data.accounts[0].windows).toEqual([]);
  });

  test('exposes only the intentional device sign-in fields', () => {
    expect(
      parseLogin('device URL: https://auth.openai.com/codex/device\ndevice code: ABCD-EFGH')
    ).toEqual({
      state: 'waiting',
      url: 'https://auth.openai.com/codex/device',
      code: 'ABCD-EFGH',
      message: 'Complete sign-in in your browser, then check the result.',
    });
    expect(
      JSON.stringify(parseLogin('state: succeeded\nsaved credential: secret-account-name.json'))
    ).not.toContain('secret-account');
    expect(parseLogin('state: failed or cancelled (no credential was saved)').state).toBe('failed');
  });
});

describe('tailnet HTTP boundary', () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test listener');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(() => server.close());

  test('rejects an unconfigured host and accepts local health checks', async () => {
    expect(
      (await fetch(`${base}/api/health`, { headers: { Host: 'attacker.invalid' } })).status
    ).toBe(403);
    const response = await fetch(`${base}/api/health`, { headers: { Host: 'localhost:8318' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  test('blocks mutations without the session token and cross-origin writes', async () => {
    const headers = { Host: 'localhost:8318', 'Content-Type': 'application/json' };
    expect(
      (await fetch(`${base}/api/login/codex`, { method: 'POST', headers, body: '{}' })).status
    ).toBe(403);
    const session = await fetch(`${base}/api/session`, { headers }).then((response) =>
      response.json()
    );
    const response = await fetch(`${base}/api/login/codex`, {
      method: 'POST',
      headers: {
        ...headers,
        'X-Dashboard-Token': session.token,
        Origin: 'http://attacker.invalid',
      },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  test('rejects a callback aimed outside the local OAuth listener', async () => {
    const headers = { Host: 'localhost:8318', 'Content-Type': 'application/json' };
    const { token } = await fetch(`${base}/api/session`, { headers }).then((response) =>
      response.json()
    );
    const response = await fetch(`${base}/api/login/callback`, {
      method: 'POST',
      headers: { ...headers, 'X-Dashboard-Token': token },
      body: JSON.stringify({ url: 'https://attacker.invalid/?code=example' }),
    });
    expect(response.status).toBe(400);
  });

  test('blocks cross-origin token-free API calls before reaching the proxy', async () => {
    const response = await fetch(`${base}/v1/responses`, {
      method: 'POST',
      headers: {
        Host: 'localhost:8318',
        Origin: 'http://attacker.invalid',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'example', input: 'Should not run' }),
    });
    expect(response.status).toBe(403);
    const result = await response.json();
    expect(result.error).toBe('Cross-origin API requests are blocked.');
  });
});
