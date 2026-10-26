import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Entry } from '../api/types';
import { store } from '../state/store';
import { HeartNote, ThreadView } from './Thread';
import { at, fakeFetch, mount, unmountAll } from './testkit-b';

afterEach(unmountAll);

describe('the note of a heart in a thread', () => {
  it('saves with Ctrl+Enter or Cmd+Enter, as a composer sends, and not with Enter alone', () => {
    const save = vi.fn();
    const el = mount(<HeartNote onSave={save} onCancel={() => {}} />);
    const box = el.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      box.value = 'Kept the names.';
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const key = (init: KeyboardEventInit) => {
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
      act(() => {
        box.dispatchEvent(e);
      });
      return e;
    };
    expect(key({}).defaultPrevented).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(key({ ctrlKey: true }).defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledWith('Kept the names.');
    key({ metaKey: true });
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('the reactions of an entry in a thread', () => {
  it('takes back a reaction of your own on a second press, as a toggle key', async () => {
    const ME = 'alice@example.com';
    act(() => store.dispatch({ type: 'me', me: { principal: { subject: ME, name: 'Alice' }, roles: {}, admin: false, canCreate: true } }));
    const e: Entry = { seq: 4, at: at(4), from: { kind: 'agent', handle: 'reviewer' }, to: [], text: 'Done.', reactions: { up: [ME], down: [], heart: [] } };
    const f = fakeFetch([['POST', /\/reactions$/, () => ({ ...e, reactions: { up: [], down: [], heart: [] } })]]);
    try {
      const el = mount(<ThreadView rows={[{ kind: 'entry', key: 'e-4', at: e.at, entry: e }]} bridge="b1" agentOf={(h) => h} />);
      const chip = el.querySelector('button.rchip') as HTMLButtonElement;
      // The chip of your own thumb is a pressed key, not a dead one.
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      expect(chip.disabled).toBe(false);
      act(() => chip.click());
      await act(async () => new Promise((r) => setTimeout(r, 0)));
      expect(f.calls.map((c) => [c.method, c.path, c.body])).toEqual([['POST', '/v1/bridges/b1/messages/4/reactions', { reaction: 'up' }]]);
    } finally {
      f.restore();
    }
  });
});
