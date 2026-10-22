#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script_dir="$HOME/.local/libexec/cliproxy-dashboard"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
for command in bun node git curl tar flock python3; do
  command -v "$command" >/dev/null
done
mkdir -p "$script_dir" "$unit_dir"
install -m 700 "$repo_dir/deploy/auto-deploy.sh" "$script_dir/auto-deploy.sh"
cat > "$unit_dir/cliproxy-dashboard-deploy.service" <<EOF
[Unit]
Description=Verify and deploy the dashboard from origin/main
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash $script_dir/auto-deploy.sh
Environment="PATH=$(dirname "$(command -v bun)"):$(dirname "$(command -v node)"):/usr/local/bin:/usr/bin:/bin"
TimeoutStartSec=20min
UMask=0077
EOF
cat > "$unit_dir/cliproxy-dashboard-deploy.timer" <<'EOF'
[Unit]
Description=Check for merged dashboard changes every minute

[Timer]
OnBootSec=1min
OnUnitInactiveSec=1min
AccuracySec=5s
Unit=cliproxy-dashboard-deploy.service

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now cliproxy-dashboard-deploy.timer
echo 'Automatic deployment enabled. Logs: journalctl --user -u cliproxy-dashboard-deploy.service'
