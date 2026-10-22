#!/usr/bin/env bash
set -euo pipefail
umask 077

# Only origin/main is eligible. Builds never touch the interactive checkout or
# the running release. This process runs as the dashboard user, never root.
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/cliproxy-dashboard-deploy"
repo_url=https://github.com/adamhalama/cliproxy-dashboard.git
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
unit="$unit_dir/cliproxy-dashboard.service"
mkdir -p "$state_dir/releases" "$unit_dir"
exec 9>"$state_dir/deploy.lock"
flock -n 9 || exit 0

if [[ ! -d "$state_dir/source.git" ]]; then
  git init --bare "$state_dir/source.git"
  git --git-dir="$state_dir/source.git" remote add origin "$repo_url"
fi
git --git-dir="$state_dir/source.git" fetch --no-tags origin +refs/heads/main:refs/heads/main
revision=$(git --git-dir="$state_dir/source.git" rev-parse refs/heads/main)
if [[ -f "$state_dir/deployed-revision" ]] &&
   [[ $(cat "$state_dir/deployed-revision") == "$revision" ]]; then
  echo "Already deployed: $revision"
  exit 0
fi

release=$(mktemp -d "$state_dir/releases/$revision.XXXXXX")
git --git-dir="$state_dir/source.git" archive "$revision" | tar -x -C "$release"
cd "$release"
bun install --frozen-lockfile
bun run verify
# verify builds the upstream entry. Build the Tailnet entry LAST.
bun run build:tailnet

# Keep a concrete previous unit, which points at its untouched release and HTML.
had_unit=0
if [[ -f "$unit" ]]; then
  cp "$unit" "$state_dir/previous.service"
  had_unit=1
fi
rollback() {
  echo "Deployment failed for $revision; restoring the previous service" >&2
  if [[ "$had_unit" == 1 ]]; then
    cp "$state_dir/previous.service" "$unit"
    systemctl --user daemon-reload
    systemctl --user restart cliproxy-dashboard.service
  else
    systemctl --user stop cliproxy-dashboard.service || true
    rm -f "$unit"
    systemctl --user daemon-reload
  fi
}
trap rollback ERR
bash deploy/install-user-service.sh
healthy=0
for _ in {1..20}; do
  if curl --fail --silent --max-time 5 http://127.0.0.1:8318/api/health >/dev/null &&
     curl --fail --silent --max-time 5 http://127.0.0.1:8318/ | cmp -s - "$release/.runtime/dashboard.html"; then
    healthy=1
    break
  fi
  sleep 0.5
done
[[ "$healthy" == 1 ]]
printf '%s\n' "$revision" > "$state_dir/deployed-revision.new"
mv "$state_dir/deployed-revision.new" "$state_dir/deployed-revision"
trap - ERR
echo "Deployed and verified: $revision"
