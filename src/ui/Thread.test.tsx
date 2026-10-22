import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { HeartNote } from './Thread';
import { mount, unmountAll } from './testkit-b';

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
