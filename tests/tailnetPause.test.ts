import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import http from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Standalone server module.
import { parseStatus, accountId, parseLogin, verifySavedLogin } from '../server/status.mjs';
import { AccountIdentity, PauseAccountAction, Summary } from '../src/features/tailnet/TailnetApp';
import type { Account } from '../src/features/tailnet/types';

const codex = 'codex-1234-example@example.invalid-plus.json';
const claude = 'claude-example@example.invalid.json';
const control = {
  available: true,
  accounts: [
    { id: codex, provider: 'codex', paused: false },
    { id: claude, provider: 'claude', paused: false },
  ],
};
const fixture = `cliproxy: active
${codex}
  alias: Plus  priority: 100  reserve 5h: 15%  in roster: true
  weekly: Active, used 25%, resets 2026-11-16T12:00:00Z
claude: active, used 8.0%, resets 2026-11-16T12:00:00Z, last check 2026-11-15T12:00:00Z, last probe ignored
`;
function output(value: unknown) {
  return `${fixture}account control: ${JSON.stringify(value)}\n`;
}

describe('account pause status', () => {
  test('maps private auth filenames for both providers and preserves settings', () => {
    const parsed = parseStatus(
      output({
        ...control,
        accounts: control.accounts.map((entry) => ({ ...entry, paused: true })),
      })
    );
    expect(parsed.data.accountControlAvailable).toBe(true);
    for (const account of parsed.data.accounts) {
      expect(account.paused).toBe(true);
      expect(account.pauseAvailable).toBe(true);
      expect(parsed.pauseFiles.get(account.id)).toBe(account.provider === 'codex' ? codex : claude);
    }
    expect(parsed.data.accounts[0].priority).toBe(100);
    expect(parsed.data.accounts[0].reserveFiveHourPercent).toBe(15);
    expect(JSON.stringify(parsed.data)).not.toContain('example@example.invalid');
  });
  test('does not advertise support for old, unavailable, or malformed helper output', () => {
    for (const value of [
      null,
      { available: false, accounts: [] },
      { ...control, accounts: [{ ...control.accounts[0], paused: 'false' }] },
      { ...control, accounts: [{ ...control.accounts[0], id: '../secret.json' }] },
      { ...control, accounts: [control.accounts[0], control.accounts[0]] },
    ]) {
      const parsed = parseStatus(output(value));
      expect(parsed.data.accountControlAvailable).toBe(false);
      expect(parsed.pauseFiles.size).toBe(0);
    }
    expect(parseStatus(fixture).data.accountControlAvailable).toBe(false);
    expect(parseStatus(`${fixture}account control: invalid`).data.accountControlAvailable).toBe(
      false
    );
  });
  test('preserves paused state when writes become unavailable', () => {
    const parsed = parseStatus(
      output({
        ...control,
        available: false,
        accounts: control.accounts.map((entry) => ({ ...entry, paused: true })),
      })
    );
    expect(parsed.data.accountControlAvailable).toBe(false);
    for (const account of parsed.data.accounts) {
      expect(account.paused).toBe(true);
      expect(account.pauseAvailable).toBe(false);
    }
  });
  test('normalizes Claude sign-in verification for both controlled and legacy rows', () => {
    const login = parseLogin(`state: succeeded\nsaved credential: ${claude}`);
    expect(login.accountId).toBe(accountId(claude));
    expect(verifySavedLogin(login, parseStatus(output(control)).data.accounts).accountId).toBe(
      accountId(claude)
    );
    expect(verifySavedLogin(login, parseStatus(fixture).data.accounts).accountId).toBe(
      'claude-subscription'
    );
  });
  test('keeps a paused account visible without scheduler observations', () => {
    const parsed = parseStatus(
      `cliproxy: active\naccount control: ${JSON.stringify({ ...control, accounts: [{ ...control.accounts[0], paused: true }] })}`
    );
    expect(parsed.data.accounts[0].id).toBe(accountId(codex));
    expect(parsed.data.accounts[0].paused).toBe(true);
    expect(parsed.data.accounts[0].windows).toEqual([]);
  });
});

const account: Account = {
  id: 'test',
  provider: 'codex',
  alias: 'Plus',
  plan: 'Plus',
  maskedIdentity: 'Server account',
  priority: 100,
  inRoster: true,
  blocked: false,
  pauseAvailable: true,
  paused: true,
  lastCheckedAt: '2026-11-15T12:00:00Z',
  quotaSource: 'provider',
  windows: [{ kind: 'weekly', usedPercent: 25, state: 'active', resetAt: '2026-11-16T12:00:00Z' }],
};
function action(props = {}) {
  return renderToStaticMarkup(
    createElement(PauseAccountAction, { account, onPending() {}, onChanged() {}, ...props })
  );
}
describe('pause affordances', () => {
  test('has an accessible paused marker and direct resume action for either provider', () => {
    expect(renderToStaticMarkup(createElement(AccountIdentity, { account }))).toContain('Paused');
    expect(action()).toContain('Resume account');
    expect(action({ account: { ...account, provider: 'claude' } })).toContain('Resume account');
    expect(action({ account: { ...account, paused: false } })).toContain('Pause account');
  });
  test('disables unsupported and read-only actions', () => {
    expect(action({ readOnly: true })).toMatch(/<button[^>]*disabled/);
    expect(action({ account: { ...account, pauseAvailable: false } })).toContain(
      'unavailable on this server'
    );
    expect(action({ account: { ...account, pauseAvailable: false } })).toMatch(
      /<button[^>]*disabled/
    );
  });
  test('excludes paused usage and resets from available capacity', () => {
    const html = renderToStaticMarkup(
      createElement(Summary, {
        provider: 'codex',
        accounts: [
          account,
          {
            ...account,
            id: 'active',
            paused: false,
            windows: [{ ...account.windows[0], usedPercent: 60 }],
          },
        ],
        now: Date.parse('2026-11-15T12:01:00Z'),
      })
    );
    expect(html).toContain('40%');
    expect(html).toContain('of 100% observed');
    expect(html).not.toContain('115%');
  });
});

// Every helper call in these tests targets a disposable stub; no installed helper is invoked.
async function boundary(
  run: (
    request: (body: unknown, extra?: Record<string, string>) => Promise<Response>,
    state: string,
    calls: string,
    get: () => Promise<Response>,
    simultaneous: (bodies: unknown[]) => Promise<number[]>
  ) => Promise<void>,
  options: { fail?: boolean; noChange?: boolean; unsupported?: boolean; readOnly?: boolean } = {}
) {
  const directory = await mkdtemp(join(tmpdir(), 'dashboard-pause-'));
  const state = join(directory, 'state.json');
  const calls = join(directory, 'calls.json');
  const helper = join(directory, 'helper.mjs');
  await writeFile(
    state,
    JSON.stringify(options.unsupported ? { available: false, accounts: [] } : control)
  );
  await writeFile(calls, '[]');
  await writeFile(
    helper,
    `#!${process.execPath}\nimport fs from 'node:fs';
const state = ${JSON.stringify(state)}, calls = ${JSON.stringify(calls)};
const args = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(state));
if (args[0] === 'status') { console.log(${JSON.stringify(fixture)} + 'account control: ' + JSON.stringify(value)); }
else { const log = JSON.parse(fs.readFileSync(calls)); log.push(args); fs.writeFileSync(calls, JSON.stringify(log));
if (${!!options.fail}) process.exit(1);
if (!${!!options.noChange}) { value.accounts.find(a => a.id === args[1]).paused = args[2] === 'true'; fs.writeFileSync(state, JSON.stringify(value)); } }
`,
    { mode: 0o700 }
  );
  const previous = {
    helper: process.env.DASHBOARD_HELPER,
    readOnly: process.env.DASHBOARD_READ_ONLY,
  };
  process.env.DASHBOARD_HELPER = helper;
  process.env.DASHBOARD_READ_ONLY = options.readOnly ? '1' : '0';
  const module = await import(
    `../server/dashboard.mjs?pause-test=${encodeURIComponent(directory)}`
  );
  if (previous.helper === undefined) delete process.env.DASHBOARD_HELPER;
  else process.env.DASHBOARD_HELPER = previous.helper;
  if (previous.readOnly === undefined) delete process.env.DASHBOARD_READ_ONLY;
  else process.env.DASHBOARD_READ_ONLY = previous.readOnly;
  const server = http.createServer(module.handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No listener');
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { Host: 'localhost:8318', 'Content-Type': 'application/json' };
    const session = await fetch(`${base}/api/session`, { headers }).then((r) => r.json());
    await run(
      (body, extra = {}) =>
        fetch(`${base}/api/accounts/paused`, {
          method: 'POST',
          headers: { ...headers, 'X-Dashboard-Token': session.token, ...extra },
          body: JSON.stringify(body),
        }),
      state,
      calls,
      () => fetch(`${base}/api/status`, { headers }),
      async (bodies) => {
        let waiting = 0;
        let release = () => {};
        const barrier = new Promise<void>((resolve) => {
          release = resolve;
        });
        return Promise.all(
          bodies.map(async (value) => {
            const body = JSON.stringify(value);
            let status = 0;
            const req = {
              method: 'POST',
              url: '/api/accounts/paused',
              headers: {
                host: headers.Host,
                'content-type': headers['Content-Type'],
                'x-dashboard-token': session.token,
              },
              socket: { remoteAddress: '127.0.0.1' },
              async *[Symbol.asyncIterator]() {
                yield body.slice(0, 10);
                waiting += 1;
                if (waiting === bodies.length) release();
                await barrier;
                yield body.slice(10);
              },
            };
            await module.handler(req, {
              setHeader() {},
              writeHead(code: number) {
                status = code;
              },
              end() {},
            });
            return status;
          })
        );
      }
    );
  } finally {
    server.closeAllConnections();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

describe('protected pause endpoint', () => {
  test('serializes actions whose request bodies arrive together', async () =>
    boundary(async (_request, _state, calls, _get, simultaneous) => {
      const codes = await simultaneous([
        { id: accountId(codex), paused: true },
        { id: accountId(claude), paused: true },
      ]);
      expect(codes.sort()).toEqual([200, 429]);
      expect(JSON.parse(await readFile(calls, 'utf8'))).toHaveLength(1);
    }));
  for (const provider of ['codex', 'claude'])
    test(`confirms ${provider} pause through the helper without changing settings`, async () => {
      await boundary(async (request, _state, calls) => {
        const response = await request({
          id: accountId(provider === 'codex' ? codex : claude),
          paused: true,
        });
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.status.accounts.find((a: Account) => a.provider === provider).paused).toBe(
          true
        );
        expect(JSON.parse(await readFile(calls, 'utf8'))).toEqual([
          ['set-paused', provider === 'codex' ? codex : claude, 'true'],
        ]);
      });
    });
  test('resumes an account', async () =>
    boundary(async (request, state, calls) => {
      await writeFile(
        state,
        JSON.stringify({
          ...control,
          accounts: control.accounts.map((a) => ({ ...a, paused: true })),
        })
      );
      expect((await request({ id: accountId(codex), paused: false })).status).toBe(200);
      expect(JSON.parse(await readFile(calls, 'utf8'))[0][2]).toBe('false');
    }));
  for (const paused of ['false', 0, null])
    test(`rejects non-boolean ${JSON.stringify(paused)}`, async () =>
      boundary(async (request, _state, calls) => {
        expect((await request({ id: accountId(codex), paused })).status).toBe(400);
        expect(await readFile(calls, 'utf8')).toBe('[]');
      }));
  test('rejects stale account membership after an earlier snapshot', async () =>
    boundary(async (request, state, calls, get) => {
      expect((await get()).status).toBe(200);
      await writeFile(state, JSON.stringify({ available: true, accounts: [] }));
      expect((await request({ id: accountId(codex), paused: true })).status).toBe(409);
      expect(await readFile(calls, 'utf8')).toBe('[]');
    }));
  test('rejects a stale Claude row when its credential file was replaced', async () =>
    boundary(async (request, state, calls, get) => {
      expect((await get()).status).toBe(200);
      await writeFile(
        state,
        JSON.stringify({
          ...control,
          accounts: [
            { id: 'claude-replacement@example.invalid.json', provider: 'claude', paused: false },
          ],
        })
      );
      expect((await request({ id: accountId(claude), paused: true })).status).toBe(409);
      expect(await readFile(calls, 'utf8')).toBe('[]');
    }));
  for (const options of [{ fail: true }, { noChange: true }])
    test(`does not report success on ${JSON.stringify(options)}`, async () =>
      boundary(async (request) => {
        expect((await request({ id: accountId(codex), paused: true })).status).toBe(503);
      }, options));
  for (const options of [{ unsupported: true }, { readOnly: true }])
    test(`blocks unavailable writes ${JSON.stringify(options)}`, async () =>
      boundary(async (request, _state, calls) => {
        expect((await request({ id: accountId(codex), paused: true })).status).toBe(
          options.readOnly ? 403 : 409
        );
        expect(await readFile(calls, 'utf8')).toBe('[]');
      }, options));
  test('requires CSRF token, trusted host, and same origin before helper writes', async () =>
    boundary(async (request, _state, calls) => {
      for (const extra of [
        { 'X-Dashboard-Token': '' },
        { Host: 'attacker.invalid' },
        { Origin: 'http://attacker.invalid' },
      ])
        expect((await request({ id: accountId(codex), paused: true }, extra)).status).toBe(403);
      expect(await readFile(calls, 'utf8')).toBe('[]');
    }));
});
