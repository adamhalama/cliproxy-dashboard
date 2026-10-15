import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import codexIcon from '@/assets/icons/codex.svg';
import claudeIcon from '@/assets/icons/claude.svg';
import { copyToClipboard } from '@/utils/clipboard';
import { dashboardApi } from './api';
import { checkLoginTarget } from './login';
import { ClaudeUsage } from './ClaudeUsage';
import type { Account, DashboardStatus, LoginResult, QuotaWindow, SchedulerPlugin } from './types';
import styles from './TailnetApp.module.scss';

type Page = 'overview' | 'quota' | 'accounts' | 'routing' | 'connection';
type Provider = 'all' | Account['provider'];
type Sort = 'reset' | 'remaining' | 'priority';
type IconName =
  | 'grid'
  | 'quota'
  | 'users'
  | 'sliders'
  | 'server'
  | 'refresh'
  | 'search'
  | 'chevron'
  | 'external'
  | 'close'
  | 'plus'
  | 'shield'
  | 'check'
  | 'alert'
  | 'copy'
  | 'menu'
  | 'arrow';

const pages: Record<Page, { label: string; icon: IconName; description: string }> = {
  overview: {
    label: 'Overview',
    icon: 'grid',
    description: 'Your subscriptions and proxy, in one place.',
  },
  quota: {
    label: 'Quota management',
    icon: 'quota',
    description: 'Remaining capacity, reset windows, and accounts that need attention.',
  },
  accounts: {
    label: 'Accounts & login',
    icon: 'users',
    description: 'Manage account names, routing priority, and provider sign-ins.',
  },
  routing: {
    label: 'Routing & settings',
    icon: 'sliders',
    description: 'See how your subscriptions are ordered for the proxy.',
  },
  connection: {
    label: 'Connection',
    icon: 'server',
    description: 'Your dashboard and API endpoints on the Lenovo server.',
  },
};
const providerNames = { codex: 'Codex', claude: 'Claude' };
const resetCounts = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    quota: (
      <>
        <path d="M4 19a9 9 0 1 1 16 0" />
        <path d="m12 13 4-5" />
        <circle cx="12" cy="13" r="1.4" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 21v-3a6.5 6.5 0 0 1 13 0v3M16 5a3.5 3.5 0 0 1 0 7m3 2a6 6 0 0 1 2.5 4.5V21" />
      </>
    ),
    sliders: (
      <>
        <path d="M3 6h5m4 0h9M3 12h11m4 0h3M3 18h3m4 0h11M8 3v6m6 0v6M6 15v6" />
      </>
    ),
    server: (
      <>
        <rect x="3" y="3" width="18" height="7" rx="2" />
        <rect x="3" y="14" width="18" height="7" rx="2" />
        <path d="M7 6.5h.01M7 17.5h.01M12 6.5h5m-5 11h5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.2 6a7.5 7.5 0 0 1 12.4 1L20 12M4 12l1.4 5A7.5 7.5 0 0 0 17.8 18" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14" />
        <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4m0 4h.01" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  };
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function ProviderIcon({ provider }: { provider: Account['provider'] }) {
  return (
    <img
      className={styles.providerIcon}
      src={provider === 'codex' ? codexIcon : claudeIcon}
      alt=""
    />
  );
}

function readPage(): Page {
  const route = window.location.hash.replace(/^#\/?/, '');
  return Object.prototype.hasOwnProperty.call(pages, route) ? (route as Page) : 'quota';
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function dateLabel(value: string | null): string {
  if (!timestamp(value)) return 'Not available';
  return new Date(value!).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeUntil(value: string | null, now: number): string {
  const time = timestamp(value);
  if (!time) return 'Reset time unavailable';
  const minutes = Math.ceil((time - now) / 60000);
  if (minutes <= 0) return 'Reset passed · awaiting update';
  if (minutes < 60) return `Resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Resets in ${hours}h ${minutes % 60}m`;
  return `Resets in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function age(value: string | null, now: number): string {
  const time = timestamp(value);
  if (!time) return 'Not checked';
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function remaining(window?: QuotaWindow): number | null {
  if (window?.usedPercent == null || !Number.isFinite(window.usedPercent)) return null;
  return Math.max(0, Math.min(100, 100 - window.usedPercent));
}

function accountWindow(account: Account, kind: QuotaWindow['kind']): QuotaWindow | undefined {
  const window = account.windows.find((window) => window.kind === kind);
  if (window && account.provider === 'codex' && account.quotaSource !== 'provider') {
    return { ...window, usedPercent: null };
  }
  return window;
}

function quotaState(window: QuotaWindow | undefined, now: number): 'fresh' | 'stale' | 'unknown' {
  if (!window || remaining(window) === null) return 'unknown';
  if (
    /stale|expired|blocked|error|unknown/i.test(window.state) ||
    (timestamp(window.resetAt) > 0 && timestamp(window.resetAt) <= now)
  )
    return 'stale';
  return 'fresh';
}

function tone(value: number | null): string {
  return value === null
    ? styles.unknown
    : value <= 15
      ? styles.danger
      : value <= 60
        ? styles.warning
        : styles.good;
}

function manualResetState(account: Account, now: number): 'fresh' | 'stale' | 'unknown' {
  if (account.codexUsage?.manualResets?.availableCount == null) return 'unknown';
  const checked = timestamp(account.codexUsage.checkedAt);
  if (!checked) return 'unknown';
  return account.blocked || account.codexUsage.status === 'error' || now - checked > 10 * 60 * 1000
    ? 'stale'
    : 'fresh';
}

export function ManualResets({ account, now }: { account: Account; now: number }) {
  const state = manualResetState(account, now);
  const credits = account.codexUsage?.manualResets;
  return (
    <div className={styles.manualResets}>
      <span>Manual resets</span>
      <strong>
        {state === 'unknown'
          ? 'Not reported'
          : `${resetCounts.format(credits!.availableCount!)} available`}
      </strong>
      {state === 'stale' ? (
        <span className={styles.amberText}>Cached; needs update</span>
      ) : state === 'fresh' && credits?.applicableAvailableCount != null ? (
        <span>{resetCounts.format(credits.applicableAvailableCount)} applicable now</span>
      ) : null}
    </div>
  );
}

function reserveOf(account: Account): number {
  return account.provider === 'codex' ? (account.reserveFiveHourPercent ?? 0) : 0;
}

export function QuotaMeter({
  window,
  kind,
  now,
  blocked = false,
  scheduleOnly = false,
  reserve = 0,
  reserveEnforced = true,
  reserveUnconfirmed = false,
}: {
  window?: QuotaWindow;
  kind: QuotaWindow['kind'];
  now: number;
  blocked?: boolean;
  scheduleOnly?: boolean;
  reserve?: number;
  reserveEnforced?: boolean;
  /** The helper could not tell which plugin runs, so enforcement is unknown rather than off. */
  reserveUnconfirmed?: boolean;
}) {
  const value = blocked || scheduleOnly ? null : remaining(window);
  const state = quotaState(window, now);
  const stale = state === 'stale' || blocked;
  // The scheduler stops routing to an account once only its reserve is left.
  const showReserve = reserve > 0 && !!window;
  const reserveReached =
    showReserve && reserveEnforced && state === 'fresh' && value !== null && value <= reserve;
  return (
    <div className={`${styles.quotaMeter} ${stale ? styles.staleMeter : ''}`}>
      <div className={styles.meterHeading}>
        <span>{kind === 'weekly' ? 'Weekly limit' : '5-hour limit'}</span>
        <strong>
          {value === null ? '—' : `${Math.round(value)}%`}
          {value !== null && <span className={styles.srOnly}> remaining</span>}
        </strong>
      </div>
      <div
        className={`${styles.meterTrack} ${tone(value)} ${reserveReached ? styles.reserveHeld : ''}`}
        role={value === null ? undefined : 'meter'}
        aria-label={`${kind === 'weekly' ? 'Weekly' : '5-hour'} capacity remaining${showReserve ? `, ${reserve}% kept in reserve` : ''}${stale ? ' (cached, needs update)' : ''}`}
        aria-valuemin={value === null ? undefined : 0}
        aria-valuemax={value === null ? undefined : 100}
        aria-valuenow={value ?? undefined}
      >
        <span style={{ width: `${value ?? 0}%` }} />
        {showReserve && value !== null && (
          <i className={styles.reserveZone} style={{ width: `${reserve}%` }} />
        )}
      </div>
      <div
        className={`${styles.meterCaption} ${stale ? styles.staleCaption : ''}`}
        title={dateLabel(window?.resetAt ?? null)}
      >
        {blocked
          ? 'Unavailable · sign-in required'
          : scheduleOnly
            ? timestamp(window?.resetAt ?? null)
              ? `Scheduled reset ${dateLabel(window?.resetAt ?? null)}`
              : 'Reset schedule unavailable'
            : value === null
              ? 'Not reported'
              : timeUntil(window?.resetAt ?? null, now)}
      </div>
      {state === 'stale' && !blocked && !scheduleOnly && (
        <span className={styles.staleLabel}>Cached usage; needs update</span>
      )}
      {showReserve && (
        <span
          className={reserveReached || !reserveEnforced ? styles.reserveAlert : styles.reserveLabel}
          title={
            reserveEnforced
              ? `New requests skip this account once ${reserve}% of its five-hour window is left, until the window resets.`
              : reserveUnconfirmed
                ? 'The server could not confirm which scheduler plugin is running.'
                : 'The running scheduler plugin does not enforce this reserve.'
          }
        >
          {!reserveEnforced
            ? `${reserve}% reserve ${reserveUnconfirmed ? 'unconfirmed' : 'not enforced'}`
            : reserveReached
              ? 'Reserve reached · paused until reset'
              : `Keeps ${reserve}% in reserve`}
        </span>
      )}
      {!blocked && window?.state === 'RetryWait' && (
        <span
          className={styles.staleLabel}
          title="The scheduler is retrying quota window activation. This is not an authentication block."
        >
          Wake-up retry pending
        </span>
      )}
    </div>
  );
}

export function Summary({
  provider,
  accounts,
  now,
}: {
  provider: Account['provider'];
  accounts: Account[];
  now: number;
}) {
  const kind = provider === 'claude' ? 'five_hour' : 'weekly';
  const windows = accounts.map((account) => ({
    account,
    window: accountWindow(account, kind),
  }));
  const observed = windows.filter(
    (item) => !item.account.blocked && quotaState(item.window, now) === 'fresh'
  );
  const sum = observed.reduce((total, item) => total + (remaining(item.window) ?? 0), 0);
  const resets = observed
    .map((item) => timestamp(item.window?.resetAt ?? null))
    .filter((time) => time > now)
    .sort((a, b) => a - b);
  const stale = windows.filter(
    (item) => !item.account.blocked && quotaState(item.window, now) === 'stale'
  ).length;
  const resetAccounts = accounts.filter((account) => manualResetState(account, now) === 'fresh');
  const resetCount = resetAccounts.reduce(
    (total, account) => total + account.codexUsage!.manualResets!.availableCount!,
    0
  );
  return (
    <section className={styles.providerSummary} aria-label={`${providerNames[provider]} summary`}>
      <div className={styles.summaryHeading}>
        <span>
          <ProviderIcon provider={provider} />
          <strong>{providerNames[provider]}</strong>
        </span>
        <span>
          {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
        </span>
      </div>
      <span className={styles.summaryLabel}>
        {kind === 'weekly'
          ? observed.length
            ? 'Weekly remaining'
            : 'Weekly usage unavailable'
          : '5-hour capacity remaining'}
      </span>
      <div className={styles.summaryValue}>
        {observed.length ? `${Math.round(sum)}%` : '—'}
        <span>
          {observed.length ? `of ${observed.length * 100}% observed` : 'Quota unavailable'}
        </span>
      </div>
      <div className={styles.segments} aria-label="Remaining capacity per account">
        {windows.map(({ account, window }) => (
          <span
            key={account.id}
            className={`${styles.meterTrack} ${tone(account.blocked ? null : remaining(window))} ${account.blocked || quotaState(window, now) === 'stale' ? styles.staleSegment : ''}`}
            title={`${account.alias || account.maskedIdentity}: ${account.blocked || remaining(window) === null ? 'unavailable' : `${Math.round(remaining(window)!)}% remaining`}`}
          >
            <span style={{ width: `${account.blocked ? 0 : (remaining(window) ?? 0)}%` }} />
          </span>
        ))}
      </div>
      <div className={styles.summaryFoot}>
        {resets.length
          ? `Next reset ${timeUntil(new Date(resets[0]).toISOString(), now).replace('Resets ', '')}`
          : 'No upcoming reset reported'}
        {stale > 0 && <span className={styles.amberText}>{stale} cached / stale</span>}
        {observed.length < accounts.length && (
          <span>{accounts.length - observed.length} unavailable</span>
        )}
      </div>
      {provider === 'codex' && (
        <div className={styles.summaryResets}>
          <span>Manual resets</span>
          <strong>
            {resetAccounts.length ? `${resetCounts.format(resetCount)} available` : 'Not reported'}
          </strong>
          {resetAccounts.length > 0 && resetAccounts.length < accounts.length && (
            <span>{accounts.length - resetAccounts.length} unavailable</span>
          )}
        </div>
      )}
    </section>
  );
}

function AccountIdentity({ account }: { account: Account }) {
  return (
    <div className={styles.identity}>
      <div className={styles.identityName}>
        <strong title={account.alias || account.maskedIdentity}>
          {account.alias || account.maskedIdentity}
        </strong>
        {account.blocked && <span className={styles.blockedBadge}>Auth blocked</span>}
        {!account.blocked && account.windows.some((window) => window.state === 'RetryWait') && (
          <span
            className={styles.badge}
            title="Quota window activation is retrying; sign-in is not reported as blocked."
          >
            Wake-up retry
          </span>
        )}
      </div>
      <div className={styles.identityMeta}>
        <span>{account.plan || providerNames[account.provider]}</span>
        {account.alias && <span title={account.maskedIdentity}>{account.maskedIdentity}</span>}
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.modal}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className={styles.modalHeading}>
        <h2 id="modal-title">{title}</h2>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function EditAccount({
  account,
  plugin,
  readOnly = false,
  onClose,
  onSaved,
}: {
  account: Account;
  plugin?: SchedulerPlugin | null;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [alias, setAlias] = useState(account.alias);
  const [priority, setPriority] = useState(String(account.priority));
  const savedReserve = account.reserveFiveHourPercent ?? 0;
  const [reserve, setReserve] = useState(String(savedReserve));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // A reserve is editable only while the running plugin enforces it; older plugins drop it.
  const reserveEditable = !!plugin?.reserveEnforced && account.reserveFiveHourPercent != null;
  const noFiveHourWindow =
    account.windows.length > 0 && !account.windows.some((window) => window.kind === 'five_hour');
  const reserveChanged = reserveEditable && Number(reserve) !== savedReserve;
  const changed =
    alias.trim() !== account.alias || Number(priority) !== account.priority || reserveChanged;
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await dashboardApi.saveAccount(account.id, {
        priority: Number(priority),
        alias: alias.trim(),
        ...(reserveChanged ? { reserveFiveHourPercent: Number(reserve) } : {}),
      });
      onSaved(result.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this account.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title="Edit account"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form onSubmit={save} className={styles.form}>
        <div className={styles.modalIdentity}>
          <ProviderIcon provider={account.provider} />
          <span>{account.maskedIdentity}</span>
          <span className={styles.badge}>{account.plan}</span>
        </div>
        <label>
          Account name
          <input
            autoFocus
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            maxLength={64}
            pattern={'[A-Za-z0-9 ._\\(\\)+,\\/\\-]{1,64}'}
            placeholder="A name you recognize"
          />
        </label>
        <label>
          Routing priority
          <input
            type="number"
            required
            min="-1000"
            max="1000"
            step="1"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          />
          <span className={styles.fieldHelp}>
            Higher values are preferred. Your Plus and Team accounts use 100; ProLite uses 0.
          </span>
        </label>
        <label>
          Five-hour reserve
          <span className={styles.suffixInput}>
            <input
              type="number"
              required
              min="0"
              max="99"
              step="1"
              value={reserve}
              disabled={!reserveEditable}
              onChange={(event) => setReserve(event.target.value)}
              aria-describedby="reserve-help"
            />
            <span aria-hidden="true">%</span>
          </span>
          <span id="reserve-help" className={styles.fieldHelp}>
            {!reserveEditable
              ? plugin?.version
                ? `The running scheduler plugin (${plugin.version}) does not enforce reserves.`
                : 'Reserve enforcement could not be confirmed on the server.'
              : noFiveHourWindow
                ? 'This account reports no five-hour window, so a reserve has no effect.'
                : 'New requests skip this account once this share of its five-hour window is left, until the window resets. Use 0 to turn it off.'}
          </span>
        </label>
        <div className={styles.notice}>
          <Icon name="alert" />
          <p>
            {readOnly
              ? 'This preview is read-only. Make changes in the main dashboard.'
              : 'Saving briefly restarts the proxy. Check the name, priority, and reserve before you save.'}
          </p>
        </div>
        {error && (
          <p className={styles.errorText} role="alert">
            {error}
          </p>
        )}
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} disabled={pending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={pending || !changed || readOnly}
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LoginModal({
  provider,
  expectedAccount,
  onClose,
  onDone,
}: {
  provider: Account['provider'];
  expectedAccount?: Account;
  onClose: () => void;
  onDone: (result: LoginResult) => void;
}) {
  const [result, setResult] = useState<LoginResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [callback, setCallback] = useState('');
  async function action(type: 'start' | 'check' | 'callback') {
    setPending(true);
    setError('');
    try {
      const response = checkLoginTarget(
        await (type === 'start'
          ? dashboardApi.startLogin(provider)
          : type === 'callback'
            ? dashboardApi.claudeCallback(callback.trim())
            : dashboardApi.loginStatus()),
        provider,
        expectedAccount
      );
      setResult((previous) => (type === 'start' ? response : { ...previous, ...response }));
      if (response.state === 'succeeded') onDone(response);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign-in could not be completed.');
    } finally {
      setPending(false);
    }
  }
  const complete = !!result && result.state === 'succeeded';
  const awaitingScheduler = complete && result.verification !== 'scheduler-observed';
  const safeUrl = result?.url && /^https?:\/\//i.test(result.url) ? result.url : null;
  return (
    <Modal title={`${providerNames[provider]} sign-in`} onClose={onClose}>
      <div className={styles.form}>
        <p className={styles.modalIntro}>
          {expectedAccount
            ? `Reconnect ${expectedAccount.alias}. Choose the intended account (${expectedAccount.maskedIdentity}) on the provider’s sign-in page. A different account will not reconnect this subscription.`
            : provider === 'codex'
              ? 'Sign in with your ChatGPT account to add or reconnect a Codex subscription on Lenovo.'
              : 'Reconnect Claude on Lenovo using the provider’s browser sign-in.'}
        </p>
        {!result && (
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={pending}
              onClick={() => void action('start')}
            >
              <ProviderIcon provider={provider} />
              Start sign-in
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={pending}
              onClick={() => void action('check')}
            >
              <Icon name="refresh" />
              {pending ? 'Please wait…' : 'Check existing sign-in'}
            </button>
          </div>
        )}
        {result && (
          <>
            <div className={complete && !awaitingScheduler ? styles.successNotice : styles.notice}>
              <Icon name={complete ? 'check' : 'shield'} />
              <p>{result.message || 'Continue in the provider’s sign-in window.'}</p>
            </div>
            {/failed|cancelled|idle|wrong-account/i.test(result.state) && (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={pending}
                onClick={() => void action('start')}
              >
                {pending ? 'Starting sign-in…' : 'Start a new sign-in'}
              </button>
            )}
            {!complete && safeUrl && (
              <a className={styles.primaryButton} href={safeUrl} target="_blank" rel="noreferrer">
                Open {providerNames[provider]} sign-in
                <Icon name="external" />
              </a>
            )}
            {!complete && result.code && (
              <div className={styles.loginCode}>
                <span>Your sign-in code</span>
                <strong>{result.code}</strong>
                <span>Enter this code on the provider’s page.</span>
              </div>
            )}
            {!complete && provider === 'claude' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void action('callback');
                }}
                className={styles.callbackForm}
              >
                <label>
                  Callback URL
                  <input
                    type="url"
                    required
                    value={callback}
                    onChange={(event) => setCallback(event.target.value)}
                    placeholder="Paste the full return URL after sign-in"
                  />
                  <span className={styles.fieldHelp}>
                    After authorizing, paste the URL you are redirected to, even if that page does
                    not load.
                  </span>
                </label>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={pending || !callback.trim()}
                >
                  {pending ? 'Completing sign-in…' : 'Complete Claude sign-in'}
                </button>
              </form>
            )}
            <div className={styles.modalActions}>
              <button type="button" className={styles.button} onClick={onClose}>
                {complete ? 'Done' : 'Close'}
              </button>
              {(!complete || awaitingScheduler) && (
                <button
                  type="button"
                  className={styles.button}
                  disabled={pending}
                  onClick={() => void action('check')}
                >
                  <Icon name="refresh" />
                  {pending ? 'Checking…' : complete ? 'Check scheduler status' : 'Check sign-in'}
                </button>
              )}
            </div>
          </>
        )}
        {error && (
          <p className={styles.errorText} role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Endpoint({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);
  async function copy() {
    const success = await copyToClipboard(value);
    setCopied(success);
    setError(!success);
  }
  return (
    <div className={styles.endpoint}>
      <div>
        <h3>{label}</h3>
        <p>{description}</p>
      </div>
      <div className={styles.endpointValue}>
        <code>{value || 'Not available'}</code>
        <button
          type="button"
          className={styles.iconButton}
          disabled={!value}
          onClick={() => void copy()}
          aria-label={`Copy ${label}`}
          title={copied ? 'Copied' : 'Copy endpoint'}
        >
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
      </div>
      <span className={styles.fieldHelp} role="status">
        {copied ? 'Copied to clipboard' : error ? 'Select and copy the address above.' : ''}
      </span>
    </div>
  );
}

export function TailnetApp() {
  const [page, setPage] = useState<Page>(readPage);
  const [status, setStatus] = useState<DashboardStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingUsage, setRefreshingUsage] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [provider, setProvider] = useState<Provider>('all');
  const [sort, setSort] = useState<Sort>('reset');
  const [search, setSearch] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [login, setLogin] = useState<Account['provider'] | null>(null);
  const [loginTarget, setLoginTarget] = useState<Account | null>(null);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const result = await dashboardApi.status();
      if (alive.current) {
        setStatus(result);
        setError('');
      }
    } catch (error) {
      if (alive.current)
        setError(error instanceof Error ? error.message : 'Could not load the server snapshot.');
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
        setNow(Date.now());
      }
    }
  }, []);
  async function refreshUsage() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    setRefreshingUsage(true);
    setUsageError('');
    setNotice('');
    try {
      const result = await dashboardApi.refreshUsage(provider);
      if (alive.current) {
        setStatus(result);
        setError('');
        if (result.refreshErrors.length) {
          setUsageError(result.refreshErrors.join(' '));
        } else {
          setNotice('Usage refreshed. Reported provider limits are shown below.');
        }
      }
    } catch (error) {
      if (alive.current)
        setUsageError(error instanceof Error ? error.message : 'Could not refresh usage.');
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setRefreshing(false);
        setRefreshingUsage(false);
        setNow(Date.now());
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    const interval = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') void refresh();
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  useEffect(() => {
    const change = () => {
      setPage(readPage());
      setMobileNav(false);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.title = `${pages[page].label} · Lenovo Proxy Console`;
  }, [page]);
  const accounts = status?.accounts ?? [];
  function reconnect(account: Account) {
    setLoginTarget(account);
    setLogin(account.provider);
  }
  const blocked = accounts.filter((account) => account.blocked);
  const codexVisible =
    provider !== 'claude' && accounts.some((account) => account.provider === 'codex');
  const claudeVisible =
    provider !== 'codex' && accounts.some((account) => account.provider === 'claude');
  const codexBaseline = accounts.some(
    (account) => account.provider === 'codex' && account.quotaSource !== 'provider'
  );
  const stale = accounts.filter(
    (account) =>
      !account.blocked &&
      account.windows.some(
        (window) => quotaState(accountWindow(account, window.kind), now) === 'stale'
      )
  );
  const availableProviders = (['codex', 'claude'] as const).filter((value) =>
    accounts.some((account) => account.provider === value)
  );
  const query = search.trim().toLowerCase();
  const filtered = accounts.filter(
    (account) =>
      (provider === 'all' || account.provider === provider) &&
      (!query ||
        `${account.alias} ${account.maskedIdentity} ${account.plan} ${providerNames[account.provider]}`
          .toLowerCase()
          .includes(query))
  );
  function compare(a: Account, b: Account): number {
    const mainWindow = (account: Account) =>
      accountWindow(account, account.provider === 'claude' ? 'five_hour' : 'weekly');
    if (sort === 'priority') return b.priority - a.priority || a.alias.localeCompare(b.alias);
    if (sort === 'remaining')
      return (
        (b.blocked ? -1 : (remaining(mainWindow(b)) ?? -1)) -
        (a.blocked ? -1 : (remaining(mainWindow(a)) ?? -1))
      );
    const reset = (account: Account) => {
      const value = timestamp(mainWindow(account)?.resetAt ?? null);
      return value > now ? value : Number.MAX_SAFE_INTEGER;
    };
    return reset(a) - reset(b) || b.priority - a.priority;
  }
  const visibleAccounts = [...filtered].sort(compare);
  const configuredOrder = accounts
    .filter((account) => account.provider === 'codex')
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (timestamp(a.windows.find((window) => window.kind === 'weekly')?.resetAt ?? null) ||
          Number.MAX_SAFE_INTEGER) -
          (timestamp(b.windows.find((window) => window.kind === 'weekly')?.resetAt ?? null) ||
            Number.MAX_SAFE_INTEGER)
    );
  const proxyActive = status?.proxy === 'active';
  const reserveEnforced = !!status?.schedulerPlugin?.reserveEnforced;
  const reserveUnconfirmed = !reserveEnforced && !status?.schedulerPlugin?.version;
  const unenforcedReserves = reserveEnforced
    ? []
    : accounts.filter((account) => reserveOf(account) > 0);
  const navigate = (target: Page) => {
    window.location.hash = target;
    setPage(target);
    setMobileNav(false);
  };
  const navItem = (target: Page) => (
    <a
      href={`#${target}`}
      className={`${styles.navItem} ${page === target ? styles.navActive : ''}`}
      aria-current={page === target ? 'page' : undefined}
      onClick={() => setMobileNav(false)}
    >
      <Icon name={pages[target].icon} />
      <span>{pages[target].label}</span>
      {target === 'accounts' && accounts.length > 0 && (
        <span className={styles.navCount}>{accounts.length}</span>
      )}
    </a>
  );
  const providerTabs = (
    <div className={styles.providerTabs} role="group" aria-label="Filter by provider">
      {(['all', ...availableProviders] as Provider[]).map((value) => (
        <button
          type="button"
          key={value}
          className={`${styles.providerTab} ${provider === value ? styles.providerTabActive : ''}`}
          aria-pressed={provider === value}
          onClick={() => setProvider(value)}
        >
          {value === 'all' ? <Icon name="grid" /> : <ProviderIcon provider={value} />}
          <span>{value === 'all' ? 'All accounts' : providerNames[value]}</span>
          <span className={styles.tabCount}>
            {value === 'all'
              ? accounts.length
              : accounts.filter((account) => account.provider === value).length}
          </span>
        </button>
      ))}
    </div>
  );
  const summary = (
    <div className={styles.summaryPanel}>
      {availableProviders
        .filter((value) => provider === 'all' || provider === value)
        .map((value) => (
          <Summary
            key={value}
            provider={value}
            accounts={accounts.filter((account) => account.provider === value)}
            now={now}
          />
        ))}
    </div>
  );
  const ledger = (
    <div className={styles.ledger}>
      {availableProviders
        .filter((value) => provider === 'all' || provider === value)
        .map((value) => {
          const group = visibleAccounts.filter((account) => account.provider === value);
          if (!group.length) return null;
          return (
            <section
              key={value}
              className={styles.ledgerGroup}
              aria-label={`${providerNames[value]} accounts`}
            >
              <div className={styles.ledgerGroupHeading}>
                <h2>
                  <ProviderIcon provider={value} />
                  {providerNames[value]}
                  <span>{group.length}</span>
                </h2>
                <span>Quota remaining</span>
              </div>
              {group.map((account) => (
                <Fragment key={account.id}>
                  <article
                    className={`${styles.ledgerRow} ${account.blocked ? styles.blockedRow : ''}`}
                  >
                    <div>
                      <AccountIdentity account={account} />
                      <div className={styles.checkedAt} title={dateLabel(account.lastCheckedAt)}>
                        {account.provider === 'codex'
                          ? account.quotaSource === 'provider'
                            ? account.lastCheckedAt
                              ? `Provider usage checked ${age(account.lastCheckedAt, now).toLowerCase()}`
                              : 'Provider observation time unavailable'
                            : 'Usage not checked; reset schedule only'
                          : account.lastCheckedAt
                            ? `Checked ${age(account.lastCheckedAt, now).toLowerCase()}`
                            : 'Observation time unavailable'}
                      </div>
                      {account.provider === 'codex' && account.codexUsage?.status === 'error' && (
                        <div className={styles.usageCheckError}>
                          Provider usage check failed
                          {account.codexUsage.attemptedAt &&
                            ` ${age(account.codexUsage.attemptedAt, now).toLowerCase()}`}
                        </div>
                      )}
                      {account.provider === 'codex' && <ManualResets account={account} now={now} />}
                    </div>
                    <QuotaMeter
                      kind="weekly"
                      window={accountWindow(account, 'weekly')}
                      now={now}
                      blocked={account.blocked}
                      scheduleOnly={
                        account.provider === 'codex' && account.quotaSource !== 'provider'
                      }
                    />
                    <QuotaMeter
                      kind="five_hour"
                      window={accountWindow(account, 'five_hour')}
                      now={now}
                      blocked={account.blocked}
                      scheduleOnly={
                        account.provider === 'codex' && account.quotaSource !== 'provider'
                      }
                      reserve={reserveOf(account)}
                      reserveEnforced={reserveEnforced}
                      reserveUnconfirmed={reserveUnconfirmed}
                    />
                    <div className={styles.priorityCell}>
                      <span>Priority</span>
                      <strong>{account.provider === 'codex' ? account.priority : '—'}</strong>
                      <small>
                        {account.provider === 'claude'
                          ? 'Not applicable'
                          : account.inRoster
                            ? 'In rotation'
                            : 'Outside roster'}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={styles.quietButton}
                      onClick={() =>
                        account.blocked || account.provider === 'claude'
                          ? reconnect(account)
                          : setEditing(account)
                      }
                      aria-label={`${account.blocked || account.provider === 'claude' ? 'Reconnect' : 'Manage'} ${account.alias || account.maskedIdentity}`}
                    >
                      {account.blocked || account.provider === 'claude' ? 'Reconnect' : 'Manage'}
                      <Icon name="chevron" />
                    </button>
                  </article>
                  {account.provider === 'claude' && <ClaudeUsage account={account} now={now} />}
                </Fragment>
              ))}
            </section>
          );
        })}
    </div>
  );
  return (
    <div className={styles.app}>
      <a
        className={styles.skipLink}
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileNav && (
        <button
          className={styles.mobileScrim}
          type="button"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        className={`${styles.sidebar} ${mobileNav ? styles.sidebarOpen : ''}`}
        aria-label="Main navigation"
      >
        <a href="#quota" className={styles.brand} onClick={() => setMobileNav(false)}>
          <span className={styles.brandMark}>
            <Icon name="quota" />
          </span>
          <span>
            <strong>Proxy Console</strong>
            <small>Lenovo workspace</small>
          </span>
        </a>
        <nav>
          <div className={styles.navGroup}>
            <p>Workspace</p>
            {navItem('overview')}
            {navItem('quota')}
          </div>
          <div className={styles.navGroup}>
            <p>Gateway</p>
            {navItem('accounts')}
            {navItem('routing')}
          </div>
          <div className={styles.navGroup}>
            <p>System</p>
            {navItem('connection')}
          </div>
        </nav>
        <div className={styles.sidebarFoot}>
          <div className={styles.hostStatus}>
            <Icon name="server" />
            <div>
              <strong>Lenovo server</strong>
              <span>
                <i
                  className={
                    status
                      ? proxyActive
                        ? styles.statusDot
                        : styles.statusDotWarning
                      : styles.statusDotUnknown
                  }
                />
                {status ? (proxyActive ? 'Proxy running' : `Proxy ${status.proxy}`) : 'Connecting…'}
              </span>
            </div>
          </div>
          <div className={styles.privateNote}>
            <Icon name="shield" />
            <span>Private tailnet access</span>
          </div>
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.menuButton}`}
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Toggle navigation"
              aria-expanded={mobileNav}
            >
              <Icon name="menu" />
            </button>
            <span>Lenovo</span>
            <Icon name="chevron" />
            <strong>{pages[page].label}</strong>
          </div>
          <div className={styles.topbarBadges}>
            {status?.readOnly && (
              <span
                className={styles.previewBadge}
                title="This instance reads live status but cannot change accounts or the proxy."
              >
                Read-only preview
              </span>
            )}
            <span className={styles.tailnetBadge}>
              <Icon name="shield" />
              <span>Tailnet only</span>
            </span>
          </div>
        </header>
        <main id="main-content" className={styles.main} tabIndex={-1}>
          <div className={styles.pageHeading}>
            <div>
              <h1>{pages[page].label}</h1>
              <p>{pages[page].description}</p>
            </div>
            <button
              type="button"
              className={styles.button}
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <Icon name="refresh" className={refreshing ? styles.refreshing : undefined} />
              {refreshing && !refreshingUsage ? 'Reading snapshot…' : 'Refresh snapshot'}
            </button>
          </div>
          <div className={styles.snapshotLine}>
            <span>
              <i className={status ? styles.statusDot : styles.statusDotUnknown} />
              Saved server snapshot
              {status && (
                <span className={styles.snapshotTime}>
                  read {age(status.fetchedAt, now).toLowerCase()}
                </span>
              )}
            </span>
            <span>Snapshot read every 30s</span>
          </div>
          {notice && (
            <div className={styles.successNotice} role="status">
              <Icon name="check" />
              <p>{notice}</p>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setNotice('')}
                aria-label="Dismiss notification"
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          {error && (
            <div className={styles.errorNotice} role="alert">
              <Icon name="alert" />
              <div>
                <strong>Could not read the server snapshot</strong>
                <p>
                  {error}
                  {status
                    ? ' The last successful snapshot is shown below.'
                    : ' Check the server connection and try refreshing.'}
                </p>
              </div>
              <button
                type="button"
                className={styles.quietButton}
                disabled={refreshing}
                onClick={() => void refresh()}
              >
                Try again
              </button>
            </div>
          )}
          {loading && (
            <div className={styles.loadingState} role="status">
              <Icon name="refresh" className={styles.refreshing} />
              <h2>Reading your subscriptions</h2>
              <p>Connecting to the scheduler on Lenovo.</p>
            </div>
          )}
          {!loading && status && (
            <>
              {(page === 'quota' || page === 'overview') && (
                <>
                  {blocked.length > 0 && (
                    <div className={styles.attentionNotice}>
                      <Icon name="alert" />
                      <div>
                        <strong>
                          {blocked.length}{' '}
                          {blocked.length === 1 ? 'account needs' : 'accounts need'} a new sign-in
                        </strong>
                        <p>
                          Authentication is blocked. Quota is unavailable for these accounts until
                          authentication is restored.
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.quietButton}
                        onClick={() => navigate('accounts')}
                      >
                        Review accounts
                        <Icon name="arrow" />
                      </button>
                    </div>
                  )}
                  {unenforcedReserves.length > 0 && (
                    <div className={styles.attentionNotice}>
                      <Icon name="alert" />
                      <div>
                        <strong>
                          {reserveUnconfirmed
                            ? 'Five-hour reserve enforcement is unconfirmed'
                            : 'Five-hour reserves are not enforced'}
                        </strong>
                        <p>
                          {unenforcedReserves.length}{' '}
                          {unenforcedReserves.length === 1 ? 'account has' : 'accounts have'} a
                          reserve, but{' '}
                          {reserveUnconfirmed
                            ? 'the server could not confirm which scheduler plugin is running.'
                            : `the running scheduler plugin (${status.schedulerPlugin!.version}) does not enforce it.`}{' '}
                          These accounts may be used to their limit.
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.quietButton}
                        onClick={() => navigate('routing')}
                      >
                        View routing
                        <Icon name="arrow" />
                      </button>
                    </div>
                  )}
                  {providerTabs}
                  {codexVisible && codexBaseline && (
                    <div className={styles.notice}>
                      <Icon name="alert" />
                      <div>
                        <strong>Current Codex usage unavailable</strong>
                        <p>
                          Previous percentages were window activation baselines. Only reset
                          schedules are available for accounts without provider observations.{' '}
                          {status.codexUsageRefreshAvailable
                            ? 'Refresh usage to check provider limits.'
                            : 'The server collector needs an upgrade to report actual usage.'}
                        </p>
                      </div>
                    </div>
                  )}
                  {((codexVisible && status.codexUsageRefreshAvailable) ||
                    (claudeVisible && status.claudeUsageRefreshAvailable)) && (
                    <div className={styles.usageToolbar}>
                      <button
                        type="button"
                        className={styles.button}
                        disabled={refreshing}
                        aria-busy={refreshingUsage}
                        onClick={() => void refreshUsage()}
                      >
                        <Icon
                          name="refresh"
                          className={refreshingUsage ? styles.refreshing : undefined}
                        />
                        {refreshingUsage ? 'Refreshing usage…' : 'Refresh usage'}
                      </button>
                      <span>
                        {provider === 'all'
                          ? 'Checks Codex and Claude provider limits'
                          : `Checks ${providerNames[provider]} provider limits`}
                      </span>
                    </div>
                  )}
                  {(codexVisible || claudeVisible) && usageError && (
                    <div className={styles.errorNotice} role="alert">
                      <Icon name="alert" />
                      <div>
                        <strong>Provider usage refresh failed</strong>
                        <p>{usageError}</p>
                      </div>
                    </div>
                  )}
                  {accounts.length > 0 && summary}
                  {page === 'overview' && (
                    <div className={styles.overviewStrip}>
                      <div>
                        <span>Proxy service</span>
                        <strong>
                          <i className={proxyActive ? styles.statusDot : styles.statusDotWarning} />
                          {proxyActive ? 'Running on Lenovo' : status.proxy}
                        </strong>
                      </div>
                      <div>
                        <span>Routing policy</span>
                        <strong>Quota-aware rotation</strong>
                      </div>
                      <div>
                        <span>Needs attention</span>
                        <strong>
                          {blocked.length} blocked
                          {stale.length > 0 ? `, ${stale.length} stale` : ''}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className={styles.quietButton}
                        onClick={() => navigate('routing')}
                      >
                        View routing
                        <Icon name="arrow" />
                      </button>
                    </div>
                  )}
                  <div className={styles.ledgerToolbar}>
                    <label className={styles.search}>
                      <Icon name="search" />
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search accounts…"
                        aria-label="Search accounts"
                      />
                    </label>
                    <label className={styles.sortControl}>
                      Sort by
                      <select
                        value={sort}
                        onChange={(event) => setSort(event.target.value as Sort)}
                      >
                        <option value="reset">Next reset</option>
                        <option value="remaining">Most remaining</option>
                        <option value="priority">Priority</option>
                      </select>
                    </label>
                  </div>
                  {ledger}
                  {!visibleAccounts.length && (
                    <div className={styles.emptyState}>
                      <Icon name={accounts.length ? 'search' : 'users'} />
                      <h2>{accounts.length ? 'No accounts match' : 'No accounts reported yet'}</h2>
                      <p>
                        {accounts.length
                          ? 'Try another name, plan, or provider.'
                          : 'Add a provider account to start tracking quota.'}
                      </p>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={() =>
                          accounts.length
                            ? (setSearch(''), setProvider('all'))
                            : navigate('accounts')
                        }
                      >
                        {accounts.length ? 'Clear filters' : 'Add an account'}
                      </button>
                    </div>
                  )}
                  <p className={styles.ledgerNote}>
                    <Icon name="shield" />
                    Codex percentages use reported provider limits; reset schedules alone do not
                    establish remaining usage. Claude usage is checked every five minutes, and
                    either provider can be checked on demand. Refresh snapshot reads saved state.
                    {status.codexUsageRefreshAvailable &&
                      ' Refresh usage checks the selected providers.'}
                  </p>
                </>
              )}
              {page === 'accounts' && (
                <>
                  <div className={styles.sectionHeading}>
                    <h2>
                      Connected accounts<span>{accounts.length}</span>
                    </h2>
                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={() => setLogin('claude')}
                      >
                        <ProviderIcon provider="claude" />
                        Reconnect Claude
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => setLogin('codex')}
                      >
                        <Icon name="plus" />
                        Add Codex account
                      </button>
                    </div>
                  </div>
                  <div className={styles.accountList}>
                    {accounts.map((account) => (
                      <article key={account.id} className={styles.accountCard}>
                        <div className={styles.accountProvider}>
                          <ProviderIcon provider={account.provider} />
                        </div>
                        <AccountIdentity account={account} />
                        <div className={styles.accountStatus}>
                          <span className={account.blocked ? styles.blockedBadge : styles.badge}>
                            {account.blocked
                              ? 'Sign-in required'
                              : account.inRoster
                                ? 'In rotation'
                                : 'Outside roster'}
                          </span>
                          <small>
                            {account.provider === 'codex'
                              ? `Priority ${account.priority}${reserveOf(account) > 0 ? ` · ${reserveOf(account)}% 5h reserve` : ''}`
                              : 'Claude subscription'}
                          </small>
                        </div>
                        <div className={styles.actionRow}>
                          {account.provider === 'codex' && (
                            <button
                              type="button"
                              className={styles.button}
                              onClick={() => setEditing(account)}
                              aria-label={`Edit ${account.alias || account.maskedIdentity}`}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => reconnect(account)}
                          >
                            Reconnect
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!accounts.length && (
                    <div className={styles.emptyState}>
                      <Icon name="users" />
                      <h2>Connect your first account</h2>
                      <p>Use the provider buttons above to sign in on Lenovo.</p>
                    </div>
                  )}
                  <div className={styles.infoPanel}>
                    <Icon name="shield" />
                    <div>
                      <h3>Credentials stay on Lenovo</h3>
                      <p>
                        Sign in through the provider’s page. This console shows masked identities
                        and quota snapshots; account credentials stay on the server.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {page === 'routing' && (
                <>
                  <section className={styles.settingsPanel}>
                    <div className={styles.settingsTitle}>
                      <Icon name="sliders" />
                      <div>
                        <h2>Quota-aware routing</h2>
                        <p>The configured policy on your proxy.</p>
                      </div>
                      <span className={styles.badge}>Current configuration</span>
                    </div>
                    <p className={styles.policyDescription}>{status.policy.description}</p>
                    <div className={styles.settingRows}>
                      <div>
                        <span>Selection mode</span>
                        <strong>{status.policy.mode}</strong>
                      </div>
                      <div>
                        <span>Preferred subscriptions</span>
                        <strong>
                          Plus / Team <span className={styles.priorityTag}>100</span>
                        </strong>
                      </div>
                      <div>
                        <span>Fallback subscription</span>
                        <strong>
                          ProLite <span className={styles.priorityTag}>0</span>
                        </strong>
                      </div>
                      <div>
                        <span>Five-hour reserve</span>
                        <strong>
                          {reserveEnforced ? (
                            <span className={styles.healthyBadge}>Enforced</span>
                          ) : (
                            <span className={styles.blockedBadge}>
                              {reserveUnconfirmed ? 'Unconfirmed' : 'Not enforced'}
                            </span>
                          )}
                          <span className={styles.settingDetail}>
                            {status.schedulerPlugin?.version
                              ? `Scheduler plugin ${status.schedulerPlugin.version}`
                              : 'Scheduler plugin version unknown'}
                          </span>
                        </strong>
                      </div>
                      <div>
                        <span>Reset probing</span>
                        <strong>{status.policy.resetProbing ? 'Enabled' : 'Disabled'}</strong>
                      </div>
                    </div>
                  </section>
                  <div className={styles.sectionHeading}>
                    <div>
                      <h2>Configured Codex order</h2>
                      <p>
                        Estimated from priority and weekly reset time. This is not the currently
                        selected account.
                      </p>
                    </div>
                  </div>
                  <div className={styles.routingList}>
                    {configuredOrder.map((account, index) => (
                      <article className={styles.routingRow} key={account.id}>
                        <span className={styles.orderNumber}>{index + 1}</span>
                        <ProviderIcon provider={account.provider} />
                        <AccountIdentity account={account} />
                        <div className={styles.routingReset}>
                          <span>Weekly reset</span>
                          <strong>
                            {dateLabel(
                              account.windows.find((window) => window.kind === 'weekly')?.resetAt ??
                                null
                            )}
                          </strong>
                        </div>
                        <div className={styles.routingPriority}>
                          <span>Priority</span>
                          <strong>{account.priority}</strong>
                        </div>
                        <div className={styles.routingReserve}>
                          <span>5h reserve</span>
                          <strong className={reserveOf(account) > 0 ? '' : styles.dimValue}>
                            {account.reserveFiveHourPercent == null
                              ? '—'
                              : reserveOf(account) > 0
                                ? `${reserveOf(account)}%`
                                : 'None'}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className={styles.quietButton}
                          onClick={() => setEditing(account)}
                          aria-label={`Edit priority and reserve for ${account.alias || account.maskedIdentity}`}
                        >
                          Edit
                          <Icon name="chevron" />
                        </button>
                      </article>
                    ))}
                  </div>
                  <p className={styles.ledgerNote}>
                    <Icon name="alert" />
                    Authentication blocks, unavailable quota, and provider eligibility can change
                    which account handles a request. Edit an account only when you want to change
                    its configured priority or five-hour reserve.
                  </p>
                </>
              )}
              {page === 'connection' && (
                <>
                  <section className={styles.settingsPanel}>
                    <div className={styles.settingsTitle}>
                      <Icon name="server" />
                      <div>
                        <h2>Hosted on Lenovo</h2>
                        <p>The dashboard, backend, and CLI proxy run on the server.</p>
                      </div>
                      <span className={proxyActive ? styles.healthyBadge : styles.blockedBadge}>
                        {proxyActive ? 'Proxy running' : status.proxy}
                      </span>
                    </div>
                    <Endpoint
                      label="Dashboard"
                      value={status.dashboardUrl}
                      description="Open from your Tailscale-connected device. Your tailnet identity grants access; no password is needed."
                    />
                    <Endpoint
                      label="Codex / OpenAI API"
                      value={status.gatewayUrl ? `${status.gatewayUrl.replace(/\/$/, '')}/v1` : ''}
                      description="Use this base URL in Codex and OpenAI-compatible clients. No API key is needed on your tailnet."
                    />
                    <Endpoint
                      label="Claude API"
                      value={status.gatewayUrl}
                      description="Use the gateway root as your Anthropic-compatible base URL. No API token is needed on your tailnet."
                    />
                    <div className={styles.settingRows}>
                      <div>
                        <span>Proxy service</span>
                        <strong>{status.proxy}</strong>
                      </div>
                      <div>
                        <span>Claude quota timer</span>
                        <strong>{status.claudeTimer}</strong>
                      </div>
                      <div>
                        <span>Quota source</span>
                        <strong>{status.source}</strong>
                      </div>
                      <div>
                        <span>Snapshot read</span>
                        <strong>{dateLabel(status.fetchedAt)}</strong>
                      </div>
                    </div>
                  </section>
                  <div className={styles.infoPanel}>
                    <Icon name="shield" />
                    <div>
                      <h3>Your Tailscale identity is your access</h3>
                      <p>
                        The dashboard and API recognize your allowed tailnet identity, so you do not
                        need another password or API key. Keep Tailscale connected. Your proxy stays
                        on Lenovo when you close this page.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          <footer className={styles.footer}>
            <span>Lenovo Proxy Console</span>
            <span>Built on CLI Proxy API Management Center</span>
          </footer>
        </main>
      </div>
      {editing && (
        <EditAccount
          account={editing}
          plugin={status?.schedulerPlugin}
          readOnly={!!status?.readOnly}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message || 'Account updated.');
            void refresh();
          }}
        />
      )}
      {login && (
        <LoginModal
          provider={login}
          expectedAccount={loginTarget ?? undefined}
          onClose={() => {
            setLogin(null);
            setLoginTarget(null);
          }}
          onDone={(result) => {
            setNotice(result.message);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

export default TailnetApp;
