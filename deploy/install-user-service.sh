#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
node_bin=$(command -v node)
service_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
[[ -f "$repo_dir/dist/index.html" ]] || { echo 'Build first: bun run build:tailnet' >&2; exit 1; }
[[ -x /usr/local/sbin/cliproxy-quota ]] || { echo 'The installed quota helper is required.' >&2; exit 1; }
mkdir -p "$service_dir"
python3 - "$repo_dir" "$node_bin" "$service_dir/cliproxy-dashboard.service" <<'PY'
import pathlib, sys
repo, node, output = sys.argv[1:]
text = (pathlib.Path(repo) / 'deploy/cliproxy-dashboard.service').read_text()
text = text.replace('/srv/agents/easycliproxy-quota-setup/dashboard', repo)
text = text.replace('/usr/local/bin/node', node)
pathlib.Path(output).write_text(text)
PY
systemctl --user daemon-reload
systemctl --user enable cliproxy-dashboard.service
systemctl --user restart cliproxy-dashboard.service
systemctl --user is-active cliproxy-dashboard.service
echo 'Dashboard: http://t450-server.tail8f1c78.ts.net:8318/#quota'
