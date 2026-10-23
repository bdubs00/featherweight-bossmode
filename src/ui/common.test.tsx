import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { Confirm } from './common';

let box: HTMLElement | null = null;

afterEach(() => {
  if (box) {
    render(null, box);
    box.remove();
    box = null;
  }
});

/** Asker is a key that opens a confirmation, as a screen of the page does. */
function Asker({ seen }: { seen: boolean[] }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" id="ask" onClick={() => setAsking(true)} onFocus={() => seen.push(!!document.querySelector('dialog.confirm[open]'))}>
        Ask
      </button>
      {asking && (
        <Confirm title="Remove it?" confirm="Remove" onConfirm={() => setAsking(false)} onCancel={() => setAsking(false)}>
          <p>It goes.</p>
        </Confirm>
      )}
    </>
  );
}

describe('Confirm', () => {
  it('gives the focus back to the key that opened it only once the dialog is closed, because an open modal dialog keeps the focus from the page', () => {
    box = document.createElement('div');
    document.body.appendChild(box);
    const seen: boolean[] = [];
    act(() => render(<Asker seen={seen} />, box!));
    const ask = box.querySelector('#ask') as HTMLButtonElement;
    ask.focus();
    act(() => ask.click());
    expect(document.activeElement!.textContent).toBe('Cancel');
    seen.length = 0;
    act(() => (box!.querySelector('[data-cancel]') as HTMLButtonElement).click());
    expect(box.querySelector('dialog.confirm')).toBeNull();
    expect(document.activeElement).toBe(ask);
    expect(seen).toEqual([false]);
  });
});
