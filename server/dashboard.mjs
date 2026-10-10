import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { parseStatus, parseLogin, verifyLoginStatus } from './status.mjs';
import { proxyApi } from './api-bridge.mjs';

const execute = promisify(execFile);
const port = Number(process.env.DASHBOARD_PORT || 8318);
const tailnetIp = process.env.DASHBOARD_TAILNET_IP || '100.89.229.100';
const tailnetHost = process.env.DASHBOARD_TAILNET_HOST || 't450-server.tail8f1c78.ts.net';
const ownerLogin = process.env.DASHBOARD_OWNER || 'adamhalama@github';
const token = randomBytes(32).toString('hex');
const dist =
  process.env.DASHBOARD_HTML || fileURLToPath(new URL('../dist/index.html', import.meta.url));
const allowedHosts = new Set([
  `${tailnetHost}:${port}`,
  `${tailnetIp}:${port}`,
  `127.0.0.1:${port}`,
  `localhost:${port}`,
]);
const peers = new Map();
let snapshot;
let pendingSnapshot;
let mutationActive = false;
let nextMutationAt = 0;

async function helper(...args) {
  try {
    const { stdout } = await execute(
      '/usr/bin/sudo',
      ['-n', '/usr/local/sbin/cliproxy-quota', ...args],
      {
        timeout: 65000,
        maxBuffer: 512 * 1024,
        env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
      }
    );
    return stdout;
  } catch {
    throw new Error(
      'The server quota helper could not complete this action. Check account status and try again.'
    );
  }
}

async function getStatus(force = false) {
  if (force) {
    if (pendingSnapshot) await pendingSnapshot.catch(() => {});
    snapshot = null;
  }
  if (snapshot && Date.now() - snapshot.at < 5000) return snapshot;
  if (!pendingSnapshot)
    pendingSnapshot = helper('status')
      .then((output) => {
        const parsed = parseStatus(output);
        snapshot = { ...parsed, at: Date.now() };
        return snapshot;
      })
      .finally(() => {
        pendingSnapshot = null;
      });
  return pendingSnapshot;
}

function respond(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function trustedPeer(address) {
  // Loopback supports the shared browser and local acceptance checks. Never trust forwarded headers.
  if (address === '127.0.0.1' || address === '::1') return true;
  const cached = peers.get(address);
  if (cached && cached.until > Date.now()) return cached.allowed;
  try {
    const { stdout } = await execute('/usr/bin/tailscale', ['whois', '--json', address], {
      timeout: 3000,
      maxBuffer: 128 * 1024,
    });
    const peer = JSON.parse(stdout);
    const allowed = peer.UserProfile?.LoginName === ownerLogin;
    peers.set(address, { allowed, until: Date.now() + 30000 });
    return allowed;
  } catch {
    return false;
  }
}

async function jsonBody(req) {
  if (req.headers['content-type'] !== 'application/json')
    throw new Error('Expected a JSON request.');
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 8192) throw new Error('Request is too large.');
  }
  const value = JSON.parse(data);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object.');
  return value;
}

function validToken(value) {
  if (typeof value !== 'string') return false;
  const given = Buffer.from(value);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );
  if (!allowedHosts.has(req.headers.host))
    return respond(res, 403, {
      error: 'This dashboard is available only at its configured tailnet address.',
    });
  if (!(await trustedPeer(req.socket.remoteAddress)))
    return respond(res, 403, { error: 'Connect using the dashboard owner’s Tailscale account.' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/v1/')) {
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      return respond(res, 403, { error: 'Cross-origin API requests are blocked.' });
    }
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      return respond(res, 405, { error: 'Method not allowed.' });
    }
    return proxyApi(req, res);
  }
  if (req.method === 'GET') {
    try {
      if (url.pathname === '/api/session') return respond(res, 200, { token });
      if (url.pathname === '/api/health') return respond(res, 200, { status: 'ok' });
      if (url.pathname === '/api/status') {
        const { data } = await getStatus();
        return respond(res, 200, {
          ...data,
          gatewayUrl: `http://${tailnetHost}:${port}`,
          dashboardUrl: `http://${tailnetHost}:${port}`,
          source:
            'Saved scheduler reset-probe baselines; Codex usage may lag actual consumption. Claude usage is checked every five minutes, including reported weekly and model limits. Refresh reads saved state, not provider APIs.',
          policy: {
            mode: 'Fill first',
            description:
              'Codex prefers higher-priority accounts, ordered within the same priority by earliest weekly reset. The saved policy uses Plus and Team at priority 100, with the weekly-only Pro Lite seat at priority 0 as overflow. See account rows for current priorities. Auth-blocked accounts are unavailable.',
            resetProbing: true,
          },
        });
      }
      if (url.pathname === '/api/login/status') {
        const login = parseLogin(await helper('login-status'));
        const result = await verifyLoginStatus(
          login,
          async () => (await getStatus(true)).data.accounts
        );
        return respond(res, 200, result);
      }
      if (url.pathname.startsWith('/api/'))
        return respond(res, 404, { error: 'Unknown dashboard endpoint.' });
      if (!['/', '/management.html', '/index.html'].includes(url.pathname))
        return respond(res, 404, { error: 'Page not found.' });
      const page = await readFile(dist);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page);
    } catch (error) {
      return respond(res, 503, { error: error.message });
    }
  }
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed.' });
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
    return respond(res, 403, { error: 'Cross-origin actions are blocked.' });
  if (!validToken(req.headers['x-dashboard-token']))
    return respond(res, 403, { error: 'Reload the dashboard before saving changes.' });
  if (mutationActive || Date.now() < nextMutationAt)
    return respond(res, 429, {
      error: 'Another action is in progress. Wait a few seconds and try again.',
    });
  let body;
  try {
    body = await jsonBody(req);
  } catch {
    return respond(res, 400, { error: 'Invalid or oversized JSON request.' });
  }
  mutationActive = true;
  nextMutationAt = Date.now() + 3000;
  try {
    if (url.pathname === '/api/accounts/priority') {
      const status = await getStatus();
      const filename = status.authFiles.get(body.id);
      if (
        !filename ||
        !Number.isInteger(body.priority) ||
        Math.abs(body.priority) > 999999 ||
        typeof body.alias !== 'string' ||
        !/^[A-Za-z0-9 ._()+,/-]{1,64}$/.test(body.alias)
      ) {
        return respond(res, 400, {
          error:
            'Choose a valid Codex account, integer priority, and alias (1–64 simple characters).',
        });
      }
      await helper('set-priority', filename, String(body.priority), body.alias);
      snapshot = null;
      return respond(res, 200, { message: 'Account settings saved. The proxy has restarted.' });
    }
    if (url.pathname === '/api/login/codex' || url.pathname === '/api/login/claude') {
      const output = await helper(url.pathname.endsWith('codex') ? 'codex-login' : 'claude-login');
      return respond(res, 200, parseLogin(output));
    }
    if (url.pathname === '/api/login/callback') {
      if (
        typeof body.url !== 'string' ||
        !/^http:\/\/(localhost|127\.0\.0\.1):54545\/callback\?[A-Za-z0-9._~%&=+-]{1,4096}$/.test(
          body.url
        )
      ) {
        return respond(res, 400, {
          error:
            'Paste the full localhost:54545/callback URL from your browser after approving Claude sign-in.',
        });
      }
      const login = parseLogin(await helper('claude-login-callback', body.url));
      const result = await verifyLoginStatus(
        login,
        async () => (await getStatus(true)).data.accounts
      );
      return respond(res, 200, result);
    }
    return respond(res, 404, { error: 'Unknown dashboard action.' });
  } catch (error) {
    return respond(res, 503, { error: error.message });
  } finally {
    mutationActive = false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const host of [tailnetIp, '127.0.0.1']) {
    const server = http.createServer((req, res) => {
      handler(req, res).catch(() => respond(res, 500, { error: 'Dashboard request failed.' }));
    });
    server.requestTimeout = 75000;
    server.headersTimeout = 10000;
    server.maxConnections = 64;
    server.on('error', (error) => {
      console.error(`Dashboard listener failed: ${error.code}`);
      process.exit(1);
    });
    server.listen(port, host, () => console.log(`Dashboard listening on ${host}:${port}`));
  }
}
