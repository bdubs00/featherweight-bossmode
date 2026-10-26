import { afterEach, describe, expect, it } from 'vitest';
import { focusHome, focusLost, holdFocus } from './keys';

afterEach(() => {
  document.body.innerHTML = '';
});

const tick = () => new Promise((r) => setTimeout(r, 0));

/** pane draws a pane with a heading, a list with a marked row, and a card with two keys. */
function pane(): HTMLElement {
  const el = document.createElement('section');
  el.className = 'pane pane-main';
  el.innerHTML =
    '<header class="pane-head"><h1>Bridge</h1></header>' +
    '<div class="rows"><a href="#a" data-item>A</a><a href="#b" data-item aria-current="page">B</a></div>' +
    '<div class="card"><p>Allow it?</p><span class="keys"><button id="allow">Allow</button></span><button id="later">Later</button></div>';
  document.body.appendChild(el);
  return el;
}

describe('the focus after a move or an action', () => {
  it('goes to the next key that still stands where the removed key stood', async () => {
    const el = pane();
    const allow = el.querySelector('#allow') as HTMLButtonElement;
    allow.focus();
    const after = holdFocus();
    allow.parentElement!.remove();
    expect(focusLost()).toBe(true);
    after();
    await tick();
    expect(document.activeElement).toBe(el.querySelector('#later'));
  });

  it('goes to the home of the pane when the whole part is gone', async () => {
    const el = pane();
    const allow = el.querySelector('#allow') as HTMLButtonElement;
    allow.focus();
    const after = holdFocus();
    el.querySelector('.card')!.remove();
    after();
    await tick();
    // The home of a pane is the row that its list marks.
    expect(document.activeElement).toBe(el.querySelector('[aria-current="page"]'));
  });

  it('leaves a focus that still stands, and takes the heading where no row is marked', async () => {
    const el = pane();
    const later = el.querySelector('#later') as HTMLButtonElement;
    later.focus();
    const after = holdFocus();
    after();
    await tick();
    expect(document.activeElement).toBe(later);
    el.querySelector('.rows')!.remove();
    expect(focusHome(el)).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('h1'));
    expect(el.querySelector('h1')!.getAttribute('tabindex')).toBe('-1');
  });
});
