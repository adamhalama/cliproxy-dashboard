#!/bin/sh
# Synthetic stand-in for the quota helper, for browser checks of Claude limit resets only.
# Answers `status` with fixture data; every other action fails, so nothing is ever changed.
#
#   bun run build:tailnet
#   DASHBOARD_HELPER="$PWD/tests/fixtures/claude-reset-helper.sh" DASHBOARD_READ_ONLY=1 \
#     DASHBOARD_TAILNET_IP=127.0.0.1 DASHBOARD_PORT=8399 node server/dashboard.mjs
#   open http://127.0.0.1:8399/ and expand Claude's usage details.
#
# Switch scenarios live (the dashboard re-reads status within seconds):
#   echo stale > .runtime/claude-reset-scenario
# Scenarios: mixed (default), ineligible, zero, empty, stale, failed, paused, missing, legacy.
set -eu
[ "${1:-}" = status ] || { echo "synthetic helper: only status is supported" >&2; exit 1; }
dir=$(cd "$(dirname "$0")" && pwd)
scenario=$(cat "$dir/../../.runtime/claude-reset-scenario" 2>/dev/null || echo mixed)
# The dashboard runs helpers with PATH=/usr/bin:/bin, so look for Node explicitly.
for node in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  [ -x "$node" ] && exec "$node" "$dir/claudeResetScenarios.mjs" "$scenario"
done
echo "synthetic helper: node not found" >&2
exit 1
