import type { Account, ClaudeUsageWindow } from './types';
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
