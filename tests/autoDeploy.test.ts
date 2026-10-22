import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dashboard-deploy-test-'));
  temporary.push(root);
  const bin = join(root, 'bin');
  const state = join(root, 'state/cliproxy-dashboard-deploy');
  const config = join(root, 'config');
  const source = join(root, 'source');
  const unit = join(config, 'systemd/user/cliproxy-dashboard.service');
  for (const path of [
    bin,
    join(state, 'source.git'),
    join(source, 'deploy'),
    join(source, '.runtime'),
    join(config, 'systemd/user'),
  ]) {
    mkdirSync(path, { recursive: true });
  }
  writeFileSync(unit, 'previous service\n');
  writeFileSync(join(source, '.runtime/dashboard.html'), '<html>new release</html>');
  writeFileSync(
    join(source, 'deploy/install-user-service.sh'),
    `#!/bin/bash
echo 'replacement service' > "$XDG_CONFIG_HOME/systemd/user/cliproxy-dashboard.service"
systemctl --user restart cliproxy-dashboard.service
`
  );
  execFileSync('tar', ['-cf', join(root, 'source.tar'), '-C', source, '.']);
  const executable = (name: string, script: string) =>
    writeFileSync(join(bin, name), `#!/bin/bash\nset -eu\n${script}\n`, { mode: 0o700 });
  executable(
    'git',
    `case "$2" in
fetch) exit 0 ;;
rev-parse) echo abc123 ;;
archive) cat "$FIXTURE/source.tar" ;;
*) exit 2 ;;
esac`
  );
  executable(
    'bun',
    `echo "$*" >> "$FIXTURE/build.log"
if [[ "$*" == 'run verify' && "$FAIL_VERIFY" == 1 ]]; then exit 1; fi`
  );
  executable('systemctl', 'echo "$*" >> "$FIXTURE/systemctl.log"');
  executable('sleep', 'exit 0');
  executable(
    'curl',
    `[[ "$FAIL_HEALTH" == 0 ]] || exit 22
for url; do :; done
case "$url" in
*/api/health) echo '{"status":"ok"}' ;;
*) cat "$FIXTURE/source/.runtime/dashboard.html" ;;
esac`
  );
  const run = (extra: Record<string, string> = {}) =>
    spawnSync('/bin/bash', [resolve('deploy/auto-deploy.sh')], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        XDG_STATE_HOME: join(root, 'state'),
        XDG_CONFIG_HOME: config,
        FIXTURE: root,
        FAIL_VERIFY: '0',
        FAIL_HEALTH: '0',
        ...extra,
      },
      encoding: 'utf8',
    });
  return { root, state, unit, run };
}

test('automatic deployment verifies before switching and skips the deployed revision', () => {
  const f = fixture();
  expect(f.run().status).toBe(0);
  expect(readFileSync(join(f.root, 'build.log'), 'utf8')).toBe(
    'install --frozen-lockfile\nrun verify\nrun build:tailnet\n'
  );
  expect(readFileSync(join(f.state, 'deployed-revision'), 'utf8')).toBe('abc123\n');
  expect(readFileSync(f.unit, 'utf8')).toBe('replacement service\n');
  expect(f.run().status).toBe(0);
  expect(readFileSync(join(f.root, 'build.log'), 'utf8').split('\n')).toHaveLength(4);
});

test('a verification failure leaves the running service and revision unchanged', () => {
  const f = fixture();
  expect(f.run({ FAIL_VERIFY: '1' }).status).not.toBe(0);
  expect(readFileSync(f.unit, 'utf8')).toBe('previous service\n');
  expect(() => readFileSync(join(f.state, 'deployed-revision'))).toThrow();
  expect(() => readFileSync(join(f.root, 'systemctl.log'))).toThrow();
});

test('a failed health check restores and restarts the previous service', () => {
  const f = fixture();
  expect(f.run({ FAIL_HEALTH: '1' }).status).not.toBe(0);
  expect(readFileSync(f.unit, 'utf8')).toBe('previous service\n');
  expect(() => readFileSync(join(f.state, 'deployed-revision'))).toThrow();
  expect(readFileSync(join(f.root, 'systemctl.log'), 'utf8')).toContain(
    '--user daemon-reload\n--user restart cliproxy-dashboard.service'
  );
});
