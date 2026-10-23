import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { FollowBox, nearEnd } from './Thread';

/** A scroll box of a given content height and window, which jsdom does not lay out. */
function sized(el: HTMLElement, content: () => number, view = 500): void {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: content });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => view });
  el.scrollTo = ((o: ScrollToOptions) => {
    el.scrollTop = o.top || 0;
  }) as typeof el.scrollTo;
}

let box: HTMLElement | null = null;
afterEach(() => {
  if (box) act(() => render(null, box!));
  box?.remove();
  box = null;
});

describe('a conversation that follows its end', () => {
  it('counts the end and a screen above it as near the end', () => {
    const el = document.createElement('div');
    sized(el, () => 3000);
    el.scrollTop = 2500;
    expect(nearEnd(el)).toBe(true);
    el.scrollTop = 2050;
    expect(nearEnd(el)).toBe(true);
    el.scrollTop = 1000;
    expect(nearEnd(el)).toBe(false);
  });

  it('follows a new entry near the end, and offers New below to a person who scrolled up to read', () => {
    let height = 3000;
    box = document.createElement('div');
    document.body.appendChild(box);
    const draw = (end: string) => act(() => render(<FollowBox end={end}><p>text</p></FollowBox>, box!));
    draw('1');
    const scroll = box.querySelector('.scroll') as HTMLElement;
    sized(scroll, () => height);
    // Within a screen of the end, a new entry, such as a card that needs the person, comes into view.
    scroll.scrollTop = 2200;
    act(() => {
      scroll.dispatchEvent(new Event('scroll'));
    });
    height = 3600;
    draw('2');
    expect(scroll.scrollTop).toBe(3600);
    expect(box.querySelector('.fresh')).toBeNull();
    // A person who scrolled up to read keeps the place, and New below takes them down.
    scroll.scrollTop = 400;
    act(() => {
      scroll.dispatchEvent(new Event('scroll'));
    });
    height = 4200;
    draw('3');
    expect(scroll.scrollTop).toBe(400);
    const key = box.querySelector('.fresh') as HTMLButtonElement;
    expect(key.textContent).toBe('New below');
    act(() => key.click());
    expect(scroll.scrollTop).toBe(4200);
    expect(box.querySelector('.fresh')).toBeNull();
  });
});
