import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
let cachedKey;
let keyUntil = 0;
let pendingKey;

async function localKey() {
  if (cachedKey && keyUntil > Date.now()) return cachedKey;
  if (!pendingKey) {
    // Reuse the existing agent client helper. OAuth and proxy config are never read.
    pendingKey = execute('/home/agent/.config/easycli/token-helper', [], {
      timeout: 3000,
      maxBuffer: 4096,
    })
      .then(({ stdout }) => {
        const key = stdout.trim();
        if (!key || /[\r\n]/.test(key)) throw new Error('Invalid local client key.');
        cachedKey = key;
        keyUntil = Date.now() + 60000;
        return key;
      })
      .finally(() => {
        pendingKey = null;
      });
  }
  return pendingKey;
}

export async function proxyApi(req, res) {
  let key;
  try {
    key = await localKey();
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { message: 'The server could not authenticate to its local proxy.' },
      })
    );
    return;
  }
  const headers = { authorization: `Bearer ${key}` };
  for (const name of [
    'content-type',
    'accept',
    'anthropic-version',
    'anthropic-beta',
    'openai-beta',
  ]) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: 8317,
      path: req.url,
      method: req.method,
      headers,
    },
    (response) => {
      const forwarded = {};
      for (const name of ['content-type', 'content-length', 'x-request-id', 'retry-after']) {
        if (response.headers[name]) forwarded[name] = response.headers[name];
      }
      res.writeHead(response.statusCode || 502, forwarded);
      response.on('error', () => res.destroy());
      response.pipe(res);
    }
  );
  upstream.on('error', () => {
    if (res.headersSent) res.destroy();
    else {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: { message: 'The local proxy is unavailable. Try again shortly.' } })
      );
    }
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });
  req.pipe(upstream);
}
