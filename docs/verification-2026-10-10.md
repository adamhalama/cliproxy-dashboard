# Lenovo deployment verification

The dashboard is deployed at `http://t450-server.tail8f1c78.ts.net:8318/#quota`.
The Codex/OpenAI base is the same origin plus `/v1`; the Claude base is the origin.
Dashboard and API need no user password or client API token. The server checks
the peer’s GitHub-linked Tailscale identity before granting access.

## Automated checks

- `bun run verify`: **1,586 tests passed**, zero failures; ESLint and the upstream
  TypeScript/production build passed.
- `bun run build:tailnet`: TypeScript and the single-file dashboard build passed.
- Node syntax, systemd unit, and installer shell validation passed.
- `python3 deploy/verify-api.py --models`: token-free model list (33 models),
  blocked cross-origin requests, completed Codex and Claude streaming replies,
  client cancellation, and a healthy bridge afterward passed.
- The original HTTPS 8443 quick acceptance checks passed after deployment:
  TLS, valid/invalid/missing keys, model list, management unavailable, and T3
  still on HTTPS 443.

## Browser checks

Used the T3 collaborative browser on the deployed tailnet URL. Checked provider
filtering, account search, priority modal review/cancel, login dialog controls
without starting a sign-in, Codex-only routing rows, token-free connection URLs,
and mobile navigation. Desktop and iPhone-size layouts had no horizontal
overflow. The account edit form leaves saving disabled until values change.
Missing and auth-blocked quota are unavailable; Codex readings are explicitly
saved baselines. No priority writes or OAuth flows were performed during checks.

## Running services

`cliproxy-dashboard.service` is active and enabled as a systemd user service,
with zero automatic restarts at deployment. Existing user lingering is enabled.
Listeners are only `100.89.229.100:8318` and `127.0.0.1:8318`. The core proxy,
Claude timer, T3 listener, existing gateway, routing priorities, and credential
isolation are preserved. No reboot was performed.

The Team subscription was AuthBlocked at the initial deployment. After the user
reauthenticated, the helper reported a saved Team credential and scheduler status
no longer reported AuthBlocked; a five-hour RetryWait is a quota activation retry.
Scheduler snapshots may lag actual consumption; no live quota claim is made.
Off-LAN access and an actual server reboot were not tested in this rollout.

## Reconnect feedback follow-up

The adapter now verifies saved login results against a fresh scheduler reading,
preserves a successful save when the status helper is temporarily unavailable,
and reports pending observation, authentication blocks, and wake-up retries
separately. Reconnect tracks the selected subscription and identifies a saved
credential for another account instead of confirming that reconnect. The result
stays visible after closing the dialog.

Deployment copies the built page atomically to `.runtime/dashboard.html` so
upstream verification builds do not change the page served by the live service.
Focused regression checks: 16 tests passed, including wrong-account reconnect,
provider mismatch, status read failure, and authentication-block versus retry
feedback. `bun run verify` passed with 1,594 tests, zero failures, ESLint, and
the upstream TypeScript/build checks. The final `bun run build:tailnet` passed.

The T3 browser verified the new bundle on a temporary tailnet listener before
deployment, then verified Team reconnect on the deployed port 8318. Checking
the existing sign-in confirmed the Team credential and reported its wake-up
retry separately from authentication. Selecting Plus identified the latest
saved Team credential as a different account. Confirmation remained visible
after closing the dialog and navigating to quota management. The quota row
showed the wake-up retry, and the desktop layout had no horizontal overflow.
No new OAuth login or priority change was started during these checks.

After deployment, the service was active. `python3 deploy/verify-api.py` passed:
33 models were available without a client token and cross-origin requests were
blocked. The temporary preview listener was stopped. Account-specific model
request verification was not performed for this follow-up.
