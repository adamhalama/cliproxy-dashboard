import { describe, expect, test } from 'bun:test';
import { buildClaudeUsageRequestUrl } from '@/features/quota/providers/claude/data';
import { CLAUDE_USAGE_URL } from '@/utils/quota';

describe('Claude usage refresh requests', () => {
  test('uses a distinct URL for each refresh so reset results are not replayed', () => {
    const first = buildClaudeUsageRequestUrl(100);
    const second = buildClaudeUsageRequestUrl(200);

    expect(first).toBe(`${CLAUDE_USAGE_URL}?quota_refresh=100`);
    expect(second).toBe(`${CLAUDE_USAGE_URL}?quota_refresh=200`);
    expect(first).not.toBe(second);
  });
});
