import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuotaMeter } from '../src/features/tailnet/TailnetApp';
import { resetWeekday } from '../src/features/tailnet/resetExpiry';
import type { QuotaWindow } from '../src/features/tailnet/types';

const now = new Date(2026, 10, 15, 21, 38).getTime(); // Sunday
const resetAt = new Date(2026, 10, 19, 5, 7); // Thursday
const window: QuotaWindow = {
  kind: 'weekly',
  state: 'active',
  usedPercent: 43,
  resetAt: resetAt.toISOString(),
};
function meter(props: Partial<Parameters<typeof QuotaMeter>[0]>) {
  return renderToStaticMarkup(createElement(QuotaMeter, { kind: 'weekly', window, now, ...props }));
}

describe('reset weekday toggle', () => {
  test('formats a reset as the local weekday and 24-hour time', () => {
    expect(resetWeekday(resetAt.getTime())).toBe('Thursday 05:07');
    expect(resetWeekday(new Date(2026, 10, 18, 20, 0).getTime())).toBe('Wednesday 20:00');
  });

  test('shows a clickable countdown that can switch to the reset day', () => {
    const countdown = meter({ onToggleReset: () => {} });
    expect(countdown).toContain('<button');
    expect(countdown).toContain('aria-pressed="false"');
    expect(countdown).toContain('Resets in 3d 7h');
    expect(countdown).toContain('Click to show all reset days');

    const day = meter({ onToggleReset: () => {}, resetDay: true });
    expect(day).toContain('aria-pressed="true"');
    expect(day).toContain('Resets Thursday 05:07');
    expect(day).toContain('Click to show all countdowns');
  });

  test('keeps plain text without a toggle handler or once the reset has passed', () => {
    expect(meter({})).not.toContain('<button');
    const passed = meter({
      onToggleReset: () => {},
      resetDay: true,
      now: resetAt.getTime() + 60_000,
    });
    expect(passed).not.toContain('<button');
    expect(passed).toContain('Reset passed');
  });
});
