import {
  claudeResetCachedNotice,
  claudeResetFreshness,
  claudeResetGrantStatus,
  claudeResetPartial,
  claudeResetScope,
  claudeResetsLeft,
} from './claudeResets';
import { formatResetExpiry, resetExpiryCountdown } from './resetExpiry';
import type { Account, ClaudeResetGrant, ClaudeUsageWindow } from './types';
import styles from './ClaudeUsage.module.scss';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function dateLabel(value: string | null): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function UsageBar({ label, used }: { label: string; used: number }) {
  return (
    <div
      className={`${styles.track} ${used >= 85 ? styles.highUsage : ''}`}
      role="meter"
      aria-label={`${label} used`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.max(0, Math.min(100, used))}
      aria-valuetext={`${percent.format(used)}% used`}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, used))}%` }} />
    </div>
  );
}

function UsageWindow({ window, now }: { window: ClaudeUsageWindow; now: number }) {
  const used = window.usedPercent;
  const reset = dateLabel(window.resetAt);
  const resetPassed = reset !== null && Date.parse(window.resetAt!) <= now;
  const amounts = [
    { label: 'Used', value: window.usedDollars },
    { label: 'Limit', value: window.limitDollars },
    { label: 'Remaining', value: window.remainingDollars },
  ].filter((amount) => amount.value !== null);

  return (
    <div className={styles.window}>
      <div className={styles.windowHeading}>
        <h4>{window.label}</h4>
        <strong>
          {used === null ? 'Percentage not reported' : `${percent.format(used)}% used`}
        </strong>
      </div>
      {used !== null && <UsageBar label={window.label} used={used} />}
      <div className={styles.windowMeta}>
        {used !== null && <span>{percent.format(Math.max(0, 100 - used))}% remaining</span>}
        {window.periodHours !== null && (
          <span>{percent.format(window.periodHours)}-hour window</span>
        )}
      </div>
      {amounts.length > 0 && (
        <dl className={styles.amounts}>
          {amounts.map((amount) => (
            <div key={amount.label}>
              <dt>{amount.label}</dt>
              <dd>{dollars.format(amount.value!)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={resetPassed ? styles.warning : styles.reset}>
        {reset ? (
          <>
            {resetPassed ? 'Reset passed' : 'Resets'}{' '}
            <time dateTime={window.resetAt!}>{reset}</time>
            {resetPassed && '; awaiting update'}
          </>
        ) : (
          'Reset time not reported'
        )}
      </p>
    </div>
  );
}

const counts = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function GrantTime({ label, value, now }: { label: string; value: string | null; now: number }) {
  if (!value) return null;
  const at = Date.parse(value);
  return (
    <span>
      {label} <time dateTime={value}>{formatResetExpiry(at)}</time>
      {at > now && ` (${resetExpiryCountdown(at, now).replace(/^Expires /, '')})`}
    </span>
  );
}

function ResetGrant({
  grant,
  index,
  eligible,
  freshness,
  windows,
  now,
}: {
  grant: ClaudeResetGrant;
  index: number;
  eligible: boolean;
  freshness: ReturnType<typeof claudeResetFreshness>;
  windows: ClaudeUsageWindow[];
  now: number;
}) {
  const status = claudeResetGrantStatus(grant, eligible, freshness, now);
  const label = grant.label || `Limit reset ${index + 1}`;
  return (
    <li className={styles.grant}>
      <div className={styles.windowHeading}>
        <h5>{label}</h5>
        <strong>
          {counts.format(grant.remaining)} of {counts.format(grant.total)} left
        </strong>
      </div>
      <p className={styles.scope}>
        {grant.clears.length ? (
          <>
            Clears{' '}
            {grant.clears.map((key, position) => {
              const scope = claudeResetScope(key, windows);
              return (
                <span key={key}>
                  {position > 0 && ', '}
                  {scope ?? <code title="Provider limit key">{key}</code>}
                </span>
              );
            })}
            {claudeResetPartial(grant) && <>; does not reset the full weekly limit</>}
          </>
        ) : (
          'Limits cleared not reported'
        )}
      </p>
      <div className={styles.windowMeta}>
        <span
          className={
            status.tone === 'warning'
              ? styles.warning
              : status.tone === 'ready'
                ? styles.ready
                : undefined
          }
        >
          {status.text}
        </span>
        {grant.startsAt && Date.parse(grant.startsAt) > now && (
          <GrantTime label="Starts" value={grant.startsAt} now={now} />
        )}
        {grant.expiresAt ? (
          <GrantTime
            label={Date.parse(grant.expiresAt) <= now ? 'Ended' : 'Expires'}
            value={grant.expiresAt}
            now={now}
          />
        ) : (
          <span>Expiry not reported</span>
        )}
      </div>
    </li>
  );
}

function LimitResets({ account, now }: { account: Account; now: number }) {
  const usage = account.claudeUsage!;
  const resets = usage.manualResets;
  const freshness = claudeResetFreshness(account, now);
  return (
    <div className={styles.resets}>
      <div className={styles.extraHeading}>
        <h4>Limit resets</h4>
        <span>
          {!resets
            ? 'Not reported'
            : `${counts.format(claudeResetsLeft(resets.grants, now))} left${resets.eligible ? '' : ' · account not eligible'}`}
        </span>
      </div>
      {resets && freshness !== 'fresh' && freshness !== 'unreported' && (
        <p className={styles.warning}>{claudeResetCachedNotice[freshness]}</p>
      )}
      {resets ? (
        resets.grants.length ? (
          <ul className={styles.grants}>
            {resets.grants.map((grant, index) => (
              <ResetGrant
                key={grant.id}
                grant={grant}
                index={index}
                eligible={resets.eligible}
                freshness={freshness}
                windows={usage.windows}
                now={now}
              />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No reset grants reported.</p>
        )
      ) : (
        <p className={styles.empty}>
          {resets === null
            ? 'Reset grant details were missing or unreadable in the latest saved check.'
            : 'The server collector does not report reset grants yet.'}
        </p>
      )}
      <p className={styles.note}>Read-only. Viewing never uses a reset.</p>
    </div>
  );
}

export function ClaudeUsage({ account, now }: { account: Account; now: number }) {
  const usage = account.claudeUsage;
  const checked = dateLabel(usage?.checkedAt ?? null);
  const stale =
    usage?.checkedAt && checked !== null && now - Date.parse(usage.checkedAt) > 10 * 60 * 1000;
  const extra = usage?.extraUsage;

  return (
    <section
      className={styles.usage}
      aria-label={`Claude usage for ${account.alias || account.maskedIdentity}`}
    >
      <header className={styles.heading}>
        <h3>Claude usage</h3>
        {usage && (
          <span>
            {checked ? (
              <>
                Checked <time dateTime={usage.checkedAt!}>{checked}</time>
              </>
            ) : (
              'Observation time unavailable'
            )}
          </span>
        )}
      </header>
      {!usage ? (
        <p className={styles.empty}>
          Detailed usage is not available from the server collector yet.
        </p>
      ) : (
        <>
          {account.blocked ? (
            <p className={styles.warning}>
              Saved observation; the latest Claude check failed. Usage may be out of date.
            </p>
          ) : stale ? (
            <p className={styles.warning}>Stale observation; the latest usage check is overdue.</p>
          ) : null}
          {usage.windows.length ? (
            <div className={styles.windows}>
              {usage.windows.map((window) => (
                <UsageWindow key={window.id} window={window} now={now} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No usage windows reported.</p>
          )}
          <LimitResets account={account} now={now} />
          <div className={styles.extra}>
            <div className={styles.extraHeading}>
              <h4>Extra usage</h4>
              <span>{extra ? (extra.enabled ? 'Enabled' : 'Disabled') : 'Not reported'}</span>
            </div>
            {extra && (
              <div className={styles.extraDetails}>
                <dl className={styles.amounts}>
                  <div>
                    <dt>Spent</dt>
                    <dd>
                      {extra.usedCreditsCents === null
                        ? 'Not reported'
                        : dollars.format(extra.usedCreditsCents / 100)}
                    </dd>
                  </div>
                  <div>
                    <dt>Monthly limit</dt>
                    <dd>
                      {extra.monthlyLimitCents === null
                        ? 'Not reported'
                        : dollars.format(extra.monthlyLimitCents / 100)}
                    </dd>
                  </div>
                </dl>
                {extra.usedPercent !== null && (
                  <div className={styles.extraMeter}>
                    <span>{percent.format(extra.usedPercent)}% used</span>
                    <UsageBar label="Extra usage monthly limit" used={extra.usedPercent} />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
