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

## Full Claude usage follow-up

The dashboard now accepts the helper's optional `claude usage:` JSON line.
General weekly usage populates the existing ledger. A Claude detail section
shows reported model and scoped limits, used/remaining percentages, reset
times, dollar credit pools, and enabled/disabled extra usage with spending
and monthly limits. Missing values are not converted to zero. Detail readings
older than ten minutes and reset times that have passed are marked accordingly.

- `bun run verify`: 1,601 tests passed, zero failures; ESLint and the upstream
  TypeScript/production build passed.
- `bun run build:tailnet`: TypeScript and single-file build passed.
- Collector tests: 9 Ruby cases and 34 assertions passed. The Python contract
  check passed from a synthetic provider response through the Ruby collector,
  helper's actual jq allowlist, and Node adapter. Quota export excluded tokens
  and state-only credential fields.
- Administrator installer `--check` passed. Collector/helper syntax passed.
- T3 browser: synthetic test account displayed five-hour, weekly, Sonnet,
  Opus, OAuth apps, Cowork, Fable, cloud credits, and extra usage. Desktop and
  iPhone-size views had no horizontal overflow. Used meters had distinct
  accessible labels from the ledger's remaining-capacity meters. Additional
  scenarios verified disabled extra usage without invented $0 balances,
  stale observations, and absent detail from the previous helper.
- A temporary real-backend preview verified compatibility with the installed
  helper before UI deployment. After deploying the dashboard user service,
  the live page correctly states that collector detail is unavailable.
  The service is active; token-free model list (33 models) and cross-origin
  request rejection passed. Temporary preview listeners were stopped.

The collector/helper source upgrade is published in the quota setup repository
at commit `ddb6780`. Its root-owned files are **not yet installed**: this agent's
sudo rule allows only existing helpers, not root file installation. An
administrator must run `server/install-claude-usage.sh` as documented in that
repository and this dashboard's README. Real weekly/model/extra Claude data
cannot be verified until that step. No OAuth login, routing mutation, proxy
restart, or reboot was performed for this follow-up. The UI is already deployed
and accepts the richer status output once the root upgrade is installed.

## Codex current usage correction

The persisted scheduler `probe_windows.baseline.usage` values are activation
baselines, not its in-memory current usage. A small real streaming request to
`gpt-6.1-sol` completed HTTP 200 with 314 input and 5 output tokens (319 total),
confirming successful consumption. Its responding account and percent change
were not inferred. No large consumption test was performed.

A read-only Codex provider collector, sanitized helper export and administrator
installer are published in the setup repository at `3079e81`. Provider readings
replace baseline windows, carry success and attempt times, and remain visibly
stale after failed checks. Baselines cannot contribute to quota bars or totals;
missing, stale and auth-blocked capacity is omitted from current totals.

- Final `bun run verify`: 1,608 tests passed, zero failures; lint, TypeScript,
  and upstream production build passed.
- Final `bun run build:tailnet`: TypeScript and single-file build passed.
- Parent installer `--check`: four synthetic Python collector/contract cases
  and the Claude export contract passed. Tests cover endpoint/header contract,
  redirect rejection, weekly-only windows, zero versus missing, preserved last
  success after error, credentials remaining unchanged, lock and file mode,
  and collector -> actual helper jq allowlist -> dashboard adapter.
- T3 browser: real helper output displays unavailable Codex usage and retained
  reset schedules without 300% capacity. Synthetic provider scenarios show
  83% current capacity from one fresh account, omit stale/baseline capacity,
  retain stale meters, and show provider observation and failed-attempt times.
  One explicit refresh updated the displayed reading to 80% and surfaced a
  partial account failure. Desktop and iPhone-size views have no page overflow.
- The dashboard user service was deployed and is active. Live port 8318 was
  checked in the collaborative browser with no synthetic fixture remaining.
  Token-free model list returned 33 models; cross-origin rejection passed.
  Temporary port 8319 was stopped. The live refresh endpoint returns 409 with
  an install explanation when its collector is absent.

At this deployment the Codex root-owned collector is **not yet installed**.
The server account's sudo rule permits fixed helpers, not service installation.
An administrator must run the documented `server/install-codex-usage.sh`; then
provider quota collection and the dedicated refresh button become available.
Real Codex provider percentages have not yet been verified. The earlier Claude
upgrade has since been installed: live weekly usage was 12% used and five-hour
usage 41% used at the 18:35 Copenhagen observation. No login, routing mutation,
proxy restart, Serve change or reboot occurred in this correction.
