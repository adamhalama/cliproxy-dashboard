#!/usr/bin/env bash
# Install a separate tailnet preview without replacing the main dashboard.
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
preview_port=${1:-8324}
[[ $# -le 1 && $preview_port =~ ^[0-9]{4,5}$ ]] &&
  (( preview_port >= 8324 && preview_port <= 8999 )) || {
  echo 'Usage: install-preview-service.sh [port from 8324 to 8999]' >&2
  exit 1
}
[[ -f "$repo_dir/dist/index.html" ]] || { echo 'Build first: bun run build:tailnet' >&2; exit 1; }
[[ -x /usr/local/sbin/cliproxy-quota ]] || { echo 'The installed quota helper is required.' >&2; exit 1; }
node_bin=$(command -v node)
service_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
service_name="cliproxy-dashboard-preview-$preview_port.service"
mkdir -p "$service_dir" "$repo_dir/.runtime"
preview_html="$repo_dir/.runtime/dashboard-preview-$preview_port.html"
install -m 600 "$repo_dir/dist/index.html" "$preview_html.new"
mv "$preview_html.new" "$preview_html"
python3 - "$repo_dir" "$node_bin" "$preview_port" "$service_dir/$service_name" <<'PY'
import pathlib
import sys

repo, node, port, output = sys.argv[1:]
text = (pathlib.Path(repo) / 'deploy/cliproxy-dashboard.service').read_text()
text = text.replace('Description=CLI Proxy tailnet quota dashboard',
                    'Description=CLI Proxy account control preview')
text = text.replace('/srv/agents/easycliproxy-quota-setup/dashboard', repo)
text = text.replace('/usr/local/bin/node', node)
text = text.replace('DASHBOARD_PORT=8318', f'DASHBOARD_PORT={port}')
text = text.replace('/.runtime/dashboard.html', f'/.runtime/dashboard-preview-{port}.html')
pathlib.Path(output).write_text(text)
PY
systemctl --user daemon-reload
systemctl --user enable --now "$service_name"
systemctl --user restart "$service_name"
systemctl --user is-active "$service_name"
echo "Preview: http://t450-server.tail8f1c78.ts.net:$preview_port/#overview"
echo 'This preview controls the live accounts. Pause/resume briefly restarts the proxy.'
echo "Remove: systemctl --user disable --now $service_name"
