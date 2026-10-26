import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAID_MS, clearNotice, clearSaid, currentNotice, currentSaid, holdSaid, showError, showSaid } from './notice';

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

describe('a notice that the person reads', () => {
  it('stays while the pointer or the focus rests on it, and goes its time after both leave', () => {
    vi.useFakeTimers();
    showSaid('Saved the playbook Weekly patching.', { label: 'See the playbook', href: '#duties/playbooks/weekly-patching' });
    vi.advanceTimersByTime(SAID_MS - 1000);
    holdSaid(true);
    vi.advanceTimersByTime(SAID_MS * 3);
    expect(currentSaid()).toBe('Saved the playbook Weekly patching.');
    holdSaid(false);
    vi.advanceTimersByTime(SAID_MS - 1);
    expect(currentSaid()).toBe('Saved the playbook Weekly patching.');
    vi.advanceTimersByTime(1);
    expect(currentSaid()).toBe('');
  });
});
