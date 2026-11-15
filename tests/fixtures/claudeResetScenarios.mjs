// Synthetic `cliproxy-quota status` output for Claude limit reset grants. No real account,
// credential, or provider data. Timestamps are relative to `now` so freshness stays meaningful.
// Used by tests and by tests/fixtures/claude-reset-helper.sh for browser checks.

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;

function iso(now, offset) {
  return new Date(now + offset).toISOString();
}

function grant(fields) {
  return {
    label: '',
    startsAt: null,
    expiresAt: null,
    clears: [],
    paused: false,
    usableNow: false,
    useRequiresLimit: true,
    ...fields,
  };
}

function usage(now, manualResets, checkedAt = iso(now, -2 * minute)) {
  return {
    checkedAt,
    windows: [
      {
        id: 'five_hour',
        label: '5-hour limit',
        usedPercent: 100,
        resetAt: iso(now, 3 * hour),
        periodHours: 5,
      },
      {
        id: 'seven_day',
        label: 'Weekly limit',
        usedPercent: 64,
        resetAt: iso(now, 3 * day),
        periodHours: 168,
      },
      {
        id: 'seven_day_fable',
        label: 'Weekly Fable',
        usedPercent: 92,
        resetAt: iso(now, 3 * day),
        periodHours: 168,
      },
    ],
    extraUsage: {
      enabled: false,
      monthlyLimitCents: null,
      usedCreditsCents: null,
      usedPercent: null,
    },
    ...(manualResets === undefined ? {} : { manualResets }),
  };
}

function mixedGrants(now) {
  return [
    grant({
      id: 'full_reset',
      label: 'Full reset',
      total: 2,
      remaining: 1,
      startsAt: iso(now, -10 * day),
      expiresAt: iso(now, 15 * day),
      clears: ['five_hour', 'seven_day'],
      usableNow: true,
    }),
    grant({
      id: 'fable_reset',
      label: 'Fable reset',
      total: 1,
      remaining: 1,
      expiresAt: iso(now, 6 * day),
      clears: ['seven_day_fable'],
      usableNow: true,
    }),
    grant({
      id: 'fable_spent',
      label: 'Fable reset',
      total: 1,
      remaining: 0,
      expiresAt: iso(now, 20 * day),
      clears: ['seven_day_fable'],
    }),
    grant({
      id: 'full_upcoming',
      label: 'Full reset',
      total: 1,
      remaining: 1,
      startsAt: iso(now, 2 * day),
      expiresAt: iso(now, 30 * day),
      clears: ['five_hour', 'seven_day'],
    }),
    grant({
      id: 'full_expired',
      label: 'Full reset',
      total: 1,
      remaining: 1,
      expiresAt: iso(now, -1 * day),
      clears: ['five_hour', 'seven_day'],
    }),
    grant({
      id: 'paused_grant',
      label: 'Fable reset',
      total: 1,
      remaining: 1,
      expiresAt: iso(now, 9 * day),
      clears: ['seven_day_fable'],
      paused: true,
    }),
    grant({
      id: 'unknown_scope',
      label: '',
      total: 1,
      remaining: 1,
      clears: ['iguana_window'],
    }),
  ];
}

const scenarios = {
  /** Every grant state at once on a fresh observation. */
  mixed: (now) => ({ usage: usage(now, { eligible: true, grants: mixedGrants(now) }) }),
  /** Provider says the account is not eligible. */
  ineligible: (now) => ({ usage: usage(now, { eligible: false, grants: mixedGrants(now) }) }),
  /** Explicit zero: eligible with only spent grants. */
  zero: (now) => ({
    usage: usage(now, {
      eligible: true,
      grants: [
        grant({
          id: 'full_reset',
          label: 'Full reset',
          total: 1,
          remaining: 0,
          expiresAt: iso(now, 5 * day),
          clears: ['five_hour', 'seven_day'],
        }),
      ],
    }),
  }),
  /** Eligible with no grants at all. */
  empty: (now) => ({ usage: usage(now, { eligible: true, grants: [] }) }),
  /** Saved two hours ago; counts are cached. */
  stale: (now) => ({
    usage: usage(now, { eligible: true, grants: mixedGrants(now) }, iso(now, -2 * hour)),
  }),
  /** Latest Claude check failed; saved counts remain. */
  failed: (now) => ({
    usage: usage(now, { eligible: true, grants: mixedGrants(now) }),
    failed: true,
  }),
  /** Account paused in the dashboard; it is not contacted. */
  paused: (now) => ({
    usage: usage(now, { eligible: true, grants: mixedGrants(now) }),
    paused: true,
  }),
  /** Updated helper, but the provider block was missing or malformed. */
  missing: (now) => ({ usage: usage(now, null) }),
  /** Helper before reset grants: the field is absent. */
  legacy: (now) => ({ usage: usage(now, undefined) }),
};

export const claudeResetScenarioNames = Object.keys(scenarios);

/** The helper's `status` output for one scenario. */
export function claudeResetStatus(name, now = Date.now()) {
  const scenario = scenarios[name]?.(now);
  if (!scenario) throw new Error(`Unknown scenario ${name}`);
  const fiveHour = scenario.usage.windows[0];
  const checked = scenario.usage.checkedAt;
  return [
    'cliproxy: active',
    'claude-quota-probe.timer: active',
    scenario.failed
      ? `claude: error, used ${fiveHour.usedPercent}%, resets ${fiveHour.resetAt}, last check ${checked}, last probe -, error: synthetic provider check failed`
      : `claude: active, used ${fiveHour.usedPercent}%, resets ${fiveHour.resetAt}, last check ${checked}, last probe -`,
    `claude usage: ${JSON.stringify(scenario.usage)}`,
    `account control: ${JSON.stringify({
      available: true,
      accounts: [
        { provider: 'claude', id: 'claude-synthetic.json', paused: scenario.paused === true },
      ],
    })}`,
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(claudeResetStatus(process.argv[2] || 'mixed'));
}
