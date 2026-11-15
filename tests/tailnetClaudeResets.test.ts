import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error Standalone adapter modules run directly in Node.
import { parseStatus } from '../server/status.mjs';
// @ts-expect-error Standalone adapter modules run directly in Node.
import { parseClaudeUsage } from '../server/claude-usage.mjs';
// @ts-expect-error Synthetic fixture module runs directly in Node.
import { claudeResetStatus } from './fixtures/claudeResetScenarios.mjs';
import { ClaudeUsage } from '../src/features/tailnet/ClaudeUsage';
import { ClaudeLimitResets } from '../src/features/tailnet/TailnetApp';
import {
  claudeResetFreshness,
  claudeResetGrantStatus,
  claudeResetsLeft,
} from '../src/features/tailnet/claudeResets';
import type { Account } from '../src/features/tailnet/types';

const now = Date.parse('2026-11-15T12:00:00Z');
const grant = {
  id: 'full_reset',
  label: 'Full reset',
  total: 2,
  remaining: 1,
  startsAt: '2026-11-01T00:00:00Z',
  expiresAt: '2026-11-30T23:59:59Z',
  clears: ['five_hour', 'seven_day'],
  paused: false,
  usableNow: true,
  useRequiresLimit: true,
};
const base = { checkedAt: '2026-11-15T11:58:00Z', windows: [], extraUsage: null };
const parse = (manualResets: unknown) =>
  parseClaudeUsage(JSON.stringify({ ...base, manualResets })).manualResets;

function claude(name: string): Account {
  return parseStatus(claudeResetStatus(name, now), new Date(now).toISOString()).data.accounts[0];
}
const row = (account: Account) =>
  renderToStaticMarkup(createElement(ClaudeLimitResets, { account, now }));
const details = (account: Account) =>
  renderToStaticMarkup(createElement(ClaudeUsage, { account, now }));
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('Claude reset grant adapter', () => {
  test('keeps allowlisted fields, explicit zero, and drops unsafe clears and raw fields', () => {
    const resets = parse({
      eligible: true,
      account_uuid: 'secret',
      grants: [
        {
          ...grant,
          label: ' Full\u0007\n reset ',
          clears: ['five_hour', 'Bad Key', 'five_hour', { access_token: 'secret' }, 'seven_day'],
          access_token: 'secret',
        },
        { ...grant, id: 'fable_reset', label: 'Fable reset', remaining: 0, total: 0, clears: null },
      ],
    });
    expect(resets.grants[0]).toEqual({ ...grant, label: 'Full reset' });
    expect(resets.grants[1]).toMatchObject({ remaining: 0, total: 0, clears: [] });
    expect(JSON.stringify(resets)).not.toContain('secret');
  });

  test('missing flags take refusing defaults', () => {
    const [parsed] = parse({
      eligible: false,
      grants: [{ id: 'g', total: 1, remaining: 1 }],
    }).grants;
    expect(parsed).toMatchObject({
      paused: false,
      usableNow: false,
      useRequiresLimit: true,
      startsAt: null,
      expiresAt: null,
      label: '',
    });
  });

  test('any malformed grant or block becomes null rather than a guessed count', () => {
    for (const block of [
      null,
      'yes',
      [],
      {},
      { eligible: 'true', grants: [] },
      { eligible: true, grants: {} },
      { eligible: true, grants: Array.from({ length: 17 }, (_, i) => ({ ...grant, id: `g${i}` })) },
      { eligible: true, grants: [grant, grant] },
      ...[
        { id: '../bad' },
        { id: 'A' },
        { remaining: 3 },
        { remaining: -1 },
        { total: 1.5 },
        { total: '2' },
        { total: null },
        { remaining: 1e9, total: 1e9 },
        { usableNow: 'true' },
        { paused: 1 },
        { expiresAt: 'soon' },
        { startsAt: 5 },
        { clears: 'five_hour' },
      ].map((fields) => ({ eligible: true, grants: [{ ...grant, ...fields }] })),
    ]) {
      expect(parse(block)).toBeNull();
    }
  });

  test('old helpers omit the field; status pipeline keeps it with the account', () => {
    expect('manualResets' in parseClaudeUsage(JSON.stringify(base))).toBe(false);
    expect(claude('legacy').claudeUsage?.manualResets).toBeUndefined();
    expect(claude('missing').claudeUsage?.manualResets).toBeNull();
    expect(claude('mixed').claudeUsage?.manualResets?.grants).toHaveLength(7);
  });
});

describe('Claude reset grant states', () => {
  test('freshness: failed, stale, and paused observations are cached, never live', () => {
    expect(claudeResetFreshness(claude('mixed'), now)).toBe('fresh');
    expect(claudeResetFreshness(claude('stale'), now)).toBe('stale');
    expect(claudeResetFreshness(claude('failed'), now)).toBe('failed');
    expect(claudeResetFreshness(claude('paused'), now)).toBe('paused');
    expect(claudeResetFreshness(claude('missing'), now)).toBe('unreported');
    for (const name of ['stale', 'failed', 'paused']) {
      const account = claude(name);
      const statuses = account.claudeUsage!.manualResets!.grants.map((entry) =>
        claudeResetGrantStatus(entry, true, claudeResetFreshness(account, now), now)
      );
      expect(statuses.some((status) => status.tone === 'ready')).toBe(false);
    }
  });

  test('expired, spent, upcoming, paused, ineligible, and unusable grants', () => {
    const status = (fields: object, eligible = true) =>
      claudeResetGrantStatus({ ...grant, ...fields }, eligible, 'fresh', now).text;
    expect(status({})).toBe('Usable now');
    expect(status({ expiresAt: '2026-11-15T11:00:00Z' })).toBe('Expired');
    expect(status({ remaining: 0 })).toBe('Spent');
    expect(status({ startsAt: '2026-11-16T00:00:00Z' })).toBe('Upcoming');
    expect(status({ paused: true })).toBe('Paused by provider');
    expect(status({}, false)).toBe('Account not eligible');
    expect(status({ usableNow: false })).toBe('Not usable now; only once a limit is reached');
    expect(status({ usableNow: false, useRequiresLimit: false })).toBe('Not usable now');
  });

  test('balance excludes expired grants and keeps explicit zero', () => {
    const grants = claude('mixed').claudeUsage!.manualResets!.grants;
    // full 1 + fable 1 + spent 0 + upcoming 1 + expired (excluded) + paused 1 + unknown 1
    expect(claudeResetsLeft(grants, now)).toBe(5);
    expect(claudeResetsLeft(claude('zero').claudeUsage!.manualResets!.grants, now)).toBe(0);
  });
});

describe('Claude reset grant display', () => {
  test('row balance distinguishes unavailable from zero and only fresh data claims usability', () => {
    expect(text(row(claude('mixed')))).toBe('Limit resets5 left2 grants usable now');
    expect(text(row(claude('zero')))).toBe('Limit resets0 left');
    expect(text(row(claude('missing')))).toBe('Limit resetsNot reported');
    expect(text(row(claude('legacy')))).toBe('Limit resetsNot reported');
    expect(text(row(claude('ineligible')))).toBe('Limit resets5 leftNot eligible');
    expect(text(row(claude('stale')))).toBe('Limit resets5 leftCached; needs update');
    expect(text(row(claude('failed')))).toBe('Limit resets5 leftCached; needs update');
    expect(text(row(claude('paused')))).toBe('Limit resets5 leftPaused; cached');
  });

  test('details show counts, scopes as returned, partial Fable resets, and states', () => {
    const html = text(details(claude('mixed')));
    expect(html).toContain('Full reset1 of 2 left');
    expect(html).toContain('Clears 5-hour limit, Weekly limit');
    expect(html).toContain('Fable reset0 of 1 left');
    expect(html).toContain('Clears Weekly Fable; does not reset the full weekly limit');
    expect(html).not.toMatch(/Clears Weekly Fable[^;]*Weekly limit/);
    expect(html).toContain('Limit reset 7');
    expect(html).toContain('Clears iguana_window; does not reset the full weekly limit');
    for (const state of ['Usable now', 'Spent', 'Upcoming', 'Expired', 'Paused by provider']) {
      expect(html).toContain(state);
    }
    expect(html).toContain('Expiry not reported');
    expect(html).toMatch(/Expires \d+\.\d+\. 2026 \d\d:\d\d \(in 15d 0h\)/);
    expect(html).toContain('Read-only. Viewing never uses a reset.');
    expect(details(claude('mixed'))).not.toMatch(/<button/);
  });

  test('cached and unavailable details never advertise live availability', () => {
    for (const [name, notice] of [
      ['stale', 'latest check is overdue'],
      ['failed', 'latest Claude check failed'],
      ['paused', 'Account paused'],
    ]) {
      const html = text(details(claude(name)));
      expect(html).toContain(notice);
      expect(html).not.toContain('Usable now');
      expect(html).toContain('Availability needs a fresh check');
    }
    const ineligible = text(details(claude('ineligible')));
    expect(ineligible).toContain('5 left · account not eligible');
    expect(ineligible).not.toContain('Usable now');
    expect(text(details(claude('missing')))).toContain('missing or unreadable');
    expect(text(details(claude('legacy')))).toContain('does not report reset grants yet');
    expect(text(details(claude('empty')))).toContain('No reset grants reported.');
    expect(text(details(claude('zero')))).toContain('0 of 1 left');
  });
});
