import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAID_MS, clearNotice, clearSaid, currentNotice, currentSaid, showError, showSaid } from './notice';

afterEach(() => {
  clearNotice();
  clearSaid();
  vi.useRealTimers();
});

describe('the notice of an action that worked', () => {
  it('shows its sentence for a few seconds, and gives way to a failed action', () => {
    vi.useFakeTimers();
    showSaid('Saved the playbook weekly-patching.');
    expect(currentSaid()).toBe('Saved the playbook weekly-patching.');
    vi.advanceTimersByTime(SAID_MS - 1);
    expect(currentSaid()).toBe('Saved the playbook weekly-patching.');
    vi.advanceTimersByTime(1);
    expect(currentSaid()).toBe('');
    showSaid('Saved.');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    showError(new Error('The store is busy.'));
    expect(currentSaid()).toBe('');
    expect(currentNotice()).toBe('The store is busy.');
  });
});
