// Keyboard reach for lists. One item of a list is in the tab order at a
// time. ArrowDown and ArrowUp, or j and k, move between the items, Home and
// End go to the ends, and Enter opens an item that is not a button.

import { useEffect, useRef, type MutableRef } from 'preact/hooks';

/** isTyping reports whether a key event comes from a field that takes text. */
export function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t || !t.tagName) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return false;
}

export interface RovingOptions {
  /** Which item takes the tab stop first: the first or the last. */
  start?: 'first' | 'last';
  onEnter?: (item: HTMLElement) => void;
}

/** useRoving makes the [data-item] elements of a container one list for the keyboard. */
export function useRoving<T extends HTMLElement>(opts: RovingOptions = {}): MutableRef<T | null> {
  const ref = useRef<T | null>(null);
  const active = useRef<HTMLElement | null>(null);
  const attached = useRef<{ root: HTMLElement; off: () => void } | null>(null);
  const o = useRef(opts);
  o.current = opts;

  const items = (root: HTMLElement): HTMLElement[] =>
    [...root.querySelectorAll<HTMLElement>('[data-item]')].filter((el) => el.closest('[data-roving]') === root);

  // The container can appear after the first draw, such as after a
  // loading state, so each draw checks that the handlers sit on it.
  useEffect(() => {
    const root = ref.current;
    if (attached.current && attached.current.root !== root) {
      attached.current.off();
      attached.current = null;
    }
    if (root && !attached.current) {
      root.setAttribute('data-roving', '');
      const onFocus = (e: FocusEvent) => {
        const t = (e.target as HTMLElement).closest('[data-item]') as HTMLElement | null;
        if (!t || t.closest('[data-roving]') !== root || t === active.current) return;
        if (active.current) active.current.setAttribute('tabindex', '-1');
        t.setAttribute('tabindex', '0');
        active.current = t;
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e)) return;
        const all = items(root);
        const cur = (e.target as HTMLElement).closest('[data-item]') as HTMLElement | null;
        // Keys inside an item, such as on its buttons, move only with the arrows.
        if (!cur || !all.includes(cur)) return;
        const onItem = e.target === cur;
        const i = all.indexOf(cur);
        let next = -1;
        if (e.key === 'ArrowDown' || (e.key === 'j' && onItem)) next = Math.min(i + 1, all.length - 1);
        else if (e.key === 'ArrowUp' || (e.key === 'k' && onItem)) next = Math.max(i - 1, 0);
        else if (e.key === 'Home' && onItem) next = 0;
        else if (e.key === 'End' && onItem) next = all.length - 1;
        else if (e.key === 'Enter' && onItem && o.current.onEnter && !['BUTTON', 'A'].includes(cur.tagName)) {
          e.preventDefault();
          o.current.onEnter(cur);
          return;
        }
        if (next < 0) return;
        e.preventDefault();
        all[next].focus();
        all[next].scrollIntoView({ block: 'nearest' });
      };
      root.addEventListener('focusin', onFocus);
      root.addEventListener('keydown', onKey);
      attached.current = {
        root,
        off: () => {
          root.removeEventListener('focusin', onFocus);
          root.removeEventListener('keydown', onKey);
        },
      };
    }
    // After each draw, exactly one item holds the tab stop.
    if (!root) return;
    const all = items(root);
    if (all.length === 0) return;
    let cur = active.current && all.includes(active.current) ? active.current : null;
    if (!cur) cur = o.current.start === 'last' ? all[all.length - 1] : all[0];
    active.current = cur;
    for (const el of all) {
      const want = el === cur ? '0' : '-1';
      if (el.getAttribute('tabindex') !== want) el.setAttribute('tabindex', want);
    }
  });

  // The handlers leave with the component.
  useEffect(
    () => () => {
      if (attached.current) attached.current.off();
      attached.current = null;
    },
    [],
  );

  return ref;
}

/** smooth is the scroll behavior that respects prefers-reduced-motion. */
export function smooth(): ScrollBehavior {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
