import { describe, expect, it } from 'vitest';
import { since, whyWords } from './words';

describe('since', () => {
  const now = Date.parse('2026-10-21T20:00:00Z');
  it('writes a short meta for a list', () => {
    expect(since('2026-10-21T19:59:40Z', now)).toBe('now');
    expect(since('2026-10-21T19:46:00Z', now)).toBe('14 min');
    expect(since('2026-10-21T17:00:00Z', now)).toBe('3 h');
    expect(since('2026-10-19T20:00:00Z', now)).toBe('2 d');
    expect(since('2026-10-01T20:00:00Z', now)).not.toMatch(/ago|min|h$|d$/);
    expect(since('nonsense', now)).toBe('');
  });
});

describe('whyWords', () => {
  it('names the rule that holds a call as a short label', () => {
    expect(whyWords('rule: ask bash: git push*')).toBe('Rule: ask before git push');
    expect(whyWords('rule: ask destructive')).toBe('Rule: ask before a tool that changes things');
    expect(whyWords('rule: ask github')).toBe('Rule: ask before github');
    expect(whyWords('default')).toBe('Rule: ask first');
    expect(whyWords('')).toBe('');
    expect(whyWords('the budget is low')).toBe('The budget is low');
  });
});
