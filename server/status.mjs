import { createHash } from 'node:crypto';

export function accountId(filename) {
  return createHash('sha256').update(filename).digest('hex').slice(0, 20);
}

function percentage(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function timestamp(value) {
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

export function parseStatus(output, fetchedAt = new Date().toISOString()) {
  const accounts = [];
  const authFiles = new Map();
  let account = null;
  let proxy = 'unknown';
  let claudeTimer = 'unknown';
  for (const line of output.split('\n')) {
    if (line.startsWith('cliproxy: ')) proxy = line.slice(10).trim();
    else if (line.startsWith('claude-quota-probe.timer: ')) claudeTimer = line.slice(25).trim();
    else if (/^codex-[A-Za-z0-9._@+-]+\.json$/.test(line)) {
      const plan = line.includes('prolite')
        ? 'Business Pro Lite'
        : line.endsWith('-team.json')
          ? 'Team'
          : line.endsWith('-plus.json')
            ? 'Plus'
            : 'Codex';
      const identity = line
        .replace(/^codex-(?:[a-f0-9]+-)?/, '')
        .replace(/-(?:self-serve-business-prolite|team|plus)\.json$/, '');
      account = {
        id: accountId(line),
        provider: 'codex',
        alias: plan,
        maskedIdentity: identity.replace(
          /([A-Za-z0-9._+-])[A-Za-z0-9._+-]*@([A-Za-z0-9])[A-Za-z0-9.-]*/g,
          '$1•••@$2•••'
        ),
        plan,
        priority: 0,
        inRoster: false,
        blocked: false,
        windows: [],
        lastCheckedAt: null,
      };
      accounts.push(account);
      authFiles.set(account.id, line);
    } else if (account && line.startsWith('  alias: ')) {
      const match = line.match(/^  alias: (.*?)  priority: (-?\d+)  in roster: (true|false)$/);
      if (match) {
        account.alias = match[1] === '-' ? account.plan : match[1];
        account.priority = Number(match[2]);
        account.inRoster = match[3] === 'true';
      }
    } else if (account && /^  (five_hour|weekly):/.test(line)) {
      const match = line.match(/^  (five_hour|weekly): ([A-Za-z]+), used ([\d.]+)%, resets (.+)$/);
      if (match) {
        account.windows.push({
          kind: match[1],
          state: match[2],
          usedPercent: percentage(match[3]),
          resetAt: timestamp(match[4]),
        });
        if (/AuthBlocked|Disabled|Failed|Error/i.test(match[2])) account.blocked = true;
      }
    } else if (line.startsWith('claude: ')) {
      account = null;
      const match = line.match(
        /^claude: ([a-z_]+), used ([\d.]+)%, resets (.*?), last check (.*?), last probe /
      );
      if (match)
        accounts.push({
          id: 'claude-subscription',
          provider: 'claude',
          alias: 'Claude subscription',
          maskedIdentity: 'Server Claude account',
          plan: 'Claude',
          priority: 0,
          inRoster: true,
          blocked: /error|failed|blocked/.test(match[1]) || line.includes(', error:'),
          windows: [
            {
              kind: 'five_hour',
              state: match[1],
              usedPercent: percentage(match[2]),
              resetAt: timestamp(match[3]),
            },
          ],
          lastCheckedAt: timestamp(match[4]),
        });
      else if (line !== 'claude: no state file')
        accounts.push({
          id: 'claude-subscription',
          provider: 'claude',
          alias: 'Claude subscription',
          maskedIdentity: 'Server Claude account',
          plan: 'Claude',
          priority: 0,
          inRoster: true,
          blocked: /error|failed|blocked/i.test(line),
          windows: [],
          lastCheckedAt: null,
        });
    }
  }
  if (proxy === 'unknown') throw new Error('Quota helper returned an unreadable status.');
  return { data: { fetchedAt, proxy, claudeTimer, accounts }, authFiles };
}

export function parseLogin(output) {
  const code = output.match(/device code:\s*(\S+)/i)?.[1];
  const deviceUrl = output.match(/device URL:\s*(https:\/\/\S+)/i)?.[1];
  const claudeUrl = output.match(/^https:\/\/claude\.ai\/oauth\/authorize\S*$/m)?.[0];
  const state = output.includes('state: succeeded')
    ? 'succeeded'
    : output.includes('state: failed')
      ? 'failed'
      : output.includes('state: waiting') || code || claudeUrl
        ? 'waiting'
        : 'unknown';
  return {
    state,
    ...(code ? { code } : {}),
    ...(deviceUrl || claudeUrl ? { url: deviceUrl || claudeUrl } : {}),
    message:
      state === 'succeeded'
        ? 'Account saved on the server. Refresh accounts to see it.'
        : state === 'failed'
          ? 'No credential was saved. Start the sign-in again.'
          : state === 'waiting'
            ? 'Complete sign-in in your browser, then check the result.'
            : 'No sign-in result is available.',
  };
}
