import { describe, expect, it } from 'vitest';
import { errorReason, since, unreadText, whyWords } from './words';

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

describe('unreadText', () => {
  it('writes the count, 99+ above 99, and 2000+ at the bound of the backend', () => {
    expect(unreadText({ unread: 2 })).toBe('2');
    expect(unreadText({ unread: 150 })).toBe('99+');
    expect(unreadText({ unread: 2000, unreadMore: true })).toBe('2000+');
  });
});

describe('errorReason', () => {
  it('says where a run stopped at a limit', () => {
    expect(errorReason({ state: 'failed', error: 'The run reached its limit of 40 turns.' })).toBe('Stopped at 40 turns');
    expect(errorReason({ state: 'failed', error: 'budget: the run reached its limit of 2.00 USD. Raise it to go on.' })).toBe('Stopped at 2.00 USD');
  });

  it('gives the first sentence of another error, and nothing without one', () => {
    expect(errorReason({ state: 'failed', error: 'The worker stopped. It can start again.' })).toBe('The worker stopped');
    expect(errorReason({ state: 'completed' })).toBe('');
    expect(errorReason(undefined)).toBe('');
  });
});
