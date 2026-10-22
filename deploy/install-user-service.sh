#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
node_bin=$(command -v node)
service_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
runtime_dir="$repo_dir/.runtime"
html_path="$runtime_dir/dashboard.html"
[[ -f "$repo_dir/dist/index.html" ]] || { echo 'Build first: bun run build:tailnet' >&2; exit 1; }
[[ -x /usr/local/sbin/cliproxy-quota ]] || { echo 'The installed quota helper is required.' >&2; exit 1; }
mkdir -p "$service_dir"
mkdir -p "$runtime_dir"
install -m 600 "$repo_dir/dist/index.html" "$html_path.new"
mv "$html_path.new" "$html_path"
python3 - "$repo_dir" "$node_bin" "$service_dir/cliproxy-dashboard.service" <<'PY'
import pathlib, sys
repo, node, output = sys.argv[1:]
text = (pathlib.Path(repo) / 'deploy/cliproxy-dashboard.service').read_text()
text = text.replace('/srv/agents/easycliproxy-quota-setup/dashboard', repo)
text = text.replace('/usr/local/bin/node', node)
pathlib.Path(output).write_text(text)
PY
# Refuse to install a unit that serves a different checkout than the bundle we
# just copied. This catches the old dashboard/ vs dashboard-preview split.
unit="$service_dir/cliproxy-dashboard.service"
grep -Fqx "WorkingDirectory=$repo_dir" "$unit" || { echo "Generated unit has the wrong working directory" >&2; exit 1; }
grep -Fqx "ExecStart=$node_bin $repo_dir/server/dashboard.mjs" "$unit" || { echo "Generated unit has the wrong dashboard server" >&2; exit 1; }
grep -Fqx "Environment=DASHBOARD_HTML=$html_path" "$unit" || { echo "Generated unit has the wrong HTML path" >&2; exit 1; }
sha256sum "$html_path" > "$runtime_dir/dashboard.html.sha256"
systemctl --user daemon-reload
systemctl --user enable cliproxy-dashboard.service
systemctl --user restart cliproxy-dashboard.service
systemctl --user is-active cliproxy-dashboard.service
health_url="http://127.0.0.1:${DASHBOARD_PORT:-8318}/api/health"
for _ in {1..20}; do
  if curl --fail --silent --show-error "$health_url" >/dev/null; then
    break
  fi
  sleep 0.25
done
curl --fail --silent --show-error "$health_url" >/dev/null
echo 'Dashboard: http://t450-server.tail8f1c78.ts.net:8318/#quota'
