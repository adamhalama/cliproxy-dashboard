# Lenovo CLI Proxy dashboard

A quota-focused fork of [CLI Proxy API Management Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center), built for the always-on Lenovo T450 server. The original upstream frontend and MIT license are preserved; its documentation is in [README_UPSTREAM.md](README_UPSTREAM.md).

Open **http://t450-server.tail8f1c78.ts.net:8318/#quota** while connected to Tailscale as the dashboard owner. The listener binds only to the server’s Tailscale IPv4 address and loopback. Tailscale encrypts peer traffic; the dashboard checks the connecting peer’s Tailscale identity. It does not use Funnel or a public network listener.

**No dashboard password or client API token is required.** The owner’s GitHub-linked Tailscale identity authorizes access to both the dashboard and its API:

| Client | Token-free base URL |
| --- | --- |
| Codex / OpenAI-compatible | `http://t450-server.tail8f1c78.ts.net:8318/v1` |
| Claude / Anthropic-compatible | `http://t450-server.tail8f1c78.ts.net:8318` |

The `/v1/` bridge forwards streaming requests to the loopback proxy and authenticates internally using the existing agent client `token-helper`. The client sends no authorization header. Existing clients using the key-protected HTTPS 8443 endpoint keep working.

## What it does

- Dark sidebar, provider tabs, combined quota summaries, and account ledgers modeled on the supplied CPAMC screenshots.
- Shows remaining quota, reset countdowns, weekly-only seats, blocked sign-ins, and unavailable readings.
- Filters and searches accounts; displays the configured Codex routing order.
- Reads the existing scheduler and Claude timer through the installed `cliproxy-quota status` helper.
- Supports deliberate Codex device sign-in and Claude reauthentication with a callback paste step.
- Reconnect checks the selected account, refreshes scheduler status after sign-in, and keeps the result visible. Saved credentials, pending verification, authentication blocks, and quota wake-up retries have distinct feedback.
- Reviews alias/priority changes before saving. A save invokes the installed helper and briefly restarts the proxy.
- Offers a token-free tailnet API on 8318 while preserving the existing HTTPS 8443 gateway and T3 on HTTPS 443.

The dashboard’s refresh reads **saved scheduler reset-probe baselines**, not provider APIs. Codex consumption can be newer than those baselines, and Codex has no observation timestamp in the helper output. Claude is sampled by its five-minute timer. Missing Claude weekly usage and manual-reset balances stay unavailable. The configured routing order is explanatory, not evidence of which account handled the last request.

Deployment leaves the established policy intact: Plus and Team priority 100, earliest weekly reset first, Pro Lite priority 0 as weekly-only overflow, and existing window activation. The proxy’s management API remains disabled. The adapter never reads OAuth credentials, proxy config, or scheduler files directly.

## Build and deploy

Requires Node.js 24, Bun 1.3.14, systemd user services, Tailscale, and the root-owned `/usr/local/sbin/cliproxy-quota` helper with the existing narrow sudo rule. User lingering must already be enabled for boot persistence.

```sh
bun install --frozen-lockfile
bun run verify
bun run build:tailnet
bash deploy/install-user-service.sh
```

The tailnet build replaces only the HTML entry with `src/tailnet-main.tsx` and produces a single `dist/index.html`. `bun run build` still builds upstream’s v8 Management API frontend. Always run `build:tailnet` last before deploying this dashboard.

The installer atomically copies the built page into `.runtime/dashboard.html`, which the service serves through `DASHBOARD_HTML`. Later verification builds do not replace the running dashboard’s page; a new page goes live only when the installer runs.

```sh
systemctl --user status cliproxy-dashboard.service
journalctl --user -u cliproxy-dashboard.service --no-pager -n 30
curl http://127.0.0.1:8318/api/health
```

Configuration defaults in `deploy/cliproxy-dashboard.service` target this Lenovo. Adjust `DASHBOARD_TAILNET_IP`, `DASHBOARD_TAILNET_HOST`, `DASHBOARD_OWNER`, and `DASHBOARD_PORT` for another node. No access tokens or credentials go in the service or repository. The API bridge reuses `/home/agent/.config/easycli/token-helper` on the server; adapt that path for another account. The server enforces its hostname allowlist, checks peer identity, and blocks cross-origin writes. Dashboard settings actions use an automatic in-memory CSRF token; this is not a password or client API requirement. Sign-in URLs/codes are shown only after a user action; callback URLs are never logged or stored by the adapter.

## Verification and rollback

Adapter and HTTP-boundary regressions are in `tests/tailnetDashboard.test.ts`; the upstream tests remain available. Browser validation should cover quota filters, account search, read-only connection details, login dialogs, priority review/cancel, and mobile layout. Do not start OAuth flows or write priorities as a routine UI test.

```sh
python3 deploy/verify-api.py          # token-free model list and origin boundary
python3 deploy/verify-api.py --models # also tests Codex/Claude streaming and cancellation
```

To remove this dashboard without changing the proxy:

```sh
systemctl --user disable --now cliproxy-dashboard.service
rm ~/.config/systemd/user/cliproxy-dashboard.service
systemctl --user daemon-reload
```

No proxy restart, gateway change, or server reboot is needed for deployment or rollback.

Design work uses Anthropic’s [frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design), included with its license under `docs/design/`.
