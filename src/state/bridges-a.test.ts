import { describe, expect, it } from 'vitest';
import { errorReason, unreadText } from './bridges-a';

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
