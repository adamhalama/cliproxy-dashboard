import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditAccount, QuotaMeter } from '../src/features/tailnet/TailnetApp';
import type { Account, QuotaWindow, SchedulerPlugin } from '../src/features/tailnet/types';

const now = Date.parse('2026-10-15T16:00:00Z');
const window: QuotaWindow = {
  kind: 'five_hour',
  state: 'active',
  usedPercent: 40,
  resetAt: '2026-10-15T18:16:00Z',
};
function meter(props: Partial<Parameters<typeof QuotaMeter>[0]>) {
  return renderToStaticMarkup(
    createElement(QuotaMeter, { kind: 'five_hour', window, now, ...props })
  );
}

describe('five-hour reserve meter', () => {
  test('marks the reserved share of the track while capacity remains', () => {
    const html = meter({ reserve: 10 });
    expect(html).toContain('Keeps 10% in reserve');
    expect(html).toContain('width:10%');
    expect(html).toContain('10% kept in reserve');
    expect(html).not.toContain('Reserve reached');
  });

  test('reports a reached reserve as paused until the window resets', () => {
    const html = meter({ reserve: 10, window: { ...window, usedPercent: 92 } });
    expect(html).toContain('Reserve reached · paused until reset');
  });

  test('does not claim a reached reserve from cached usage', () => {
    const html = meter({ reserve: 10, window: { ...window, usedPercent: 92, state: 'stale' } });
    expect(html).not.toContain('Reserve reached');
    expect(html).toContain('Keeps 10% in reserve');
  });

  test('warns when the running plugin does not enforce the reserve', () => {
    const html = meter({
      reserve: 10,
      reserveEnforced: false,
      window: { ...window, usedPercent: 95 },
    });
    expect(html).toContain('10% reserve not enforced');
    expect(html).not.toContain('Reserve reached');
  });

  test('says unconfirmed, not off, when the plugin version is unknown', () => {
    const html = meter({ reserve: 10, reserveEnforced: false, reserveUnconfirmed: true });
    expect(html).toContain('10% reserve unconfirmed');
    expect(html).not.toContain('not enforced');
  });

  test('shows the setting without a zone when usage is unavailable, and nothing without a reserve', () => {
    const scheduled = meter({ reserve: 10, scheduleOnly: true });
    expect(scheduled).toContain('Keeps 10% in reserve');
    expect(scheduled).not.toContain('width:10%');
    expect(meter({ reserve: 0 })).not.toContain('reserve');
    expect(meter({ reserve: 10, window: undefined })).not.toContain('reserve');
  });
});

const plus: Account = {
  id: 'synthetic-plus',
  provider: 'codex',
  alias: 'Plus (5h, first)',
  maskedIdentity: 'a•••@g•••',
  plan: 'Plus',
  priority: 100,
  reserveFiveHourPercent: 10,
  inRoster: true,
  blocked: false,
  lastCheckedAt: null,
  windows: [window],
};
const enforced: SchedulerPlugin = { version: '0.3.1-local-reserve', reserveEnforced: true };
function dialog(props: Partial<Parameters<typeof EditAccount>[0]>) {
  return renderToStaticMarkup(
    createElement(EditAccount, {
      account: plus,
      plugin: enforced,
      onClose: () => {},
      onSaved: () => {},
      ...props,
    })
  );
}

describe('five-hour reserve setting', () => {
  test('is editable while the running plugin enforces reserves', () => {
    const html = dialog({});
    expect(html).toContain('Five-hour reserve');
    expect(html).toMatch(/<input type="number" required="" min="0" max="99"[^>]*value="10"/);
    expect(html).not.toMatch(/max="99"[^>]*disabled/);
    expect(html).toContain('Use 0 to turn it off');
  });

  test('is locked when the plugin cannot enforce it or the version is unknown', () => {
    expect(dialog({ plugin: { version: '0.3.1', reserveEnforced: false } })).toMatch(
      /max="99"[^>]*disabled/
    );
    expect(dialog({ plugin: { version: '0.3.1', reserveEnforced: false } })).toContain(
      '(0.3.1) does not enforce reserves'
    );
    expect(dialog({ plugin: null })).toContain('could not be confirmed');
  });

  test('explains that a weekly-only account has no five-hour window to reserve', () => {
    const html = dialog({
      account: { ...plus, reserveFiveHourPercent: 0, windows: [{ ...window, kind: 'weekly' }] },
    });
    expect(html).toContain('reports no five-hour window');
  });

  test('a read-only preview cannot save', () => {
    const html = dialog({ readOnly: true });
    expect(html).toContain('This preview is read-only');
    expect(html).toMatch(/<button type="submit"[^>]*disabled/);
  });
});
