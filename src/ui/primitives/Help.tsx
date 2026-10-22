// Help is the question mark that holds a definition. The chrome never
// explains: a definition, such as what a worker is, sits behind this key and
// opens on a click, on Enter, or on Space. Escape and a click elsewhere
// close it. The definition opens toward the end of the line, and it flips
// toward the start when it would run past the edge of its pane.

import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

/** The space that the definition keeps from the edge of its pane. */
const MARGIN = 8;

/** flipOf reports whether a definition that opens toward the end of the line runs past the end of its pane. */
export function flipOf(pop: { right: number }, pane: { right: number }): boolean {
  return pop.right > pane.right - MARGIN;
}

export function Help({ label, children }: { label: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const key = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) {
      setFlip(false);
      return;
    }
    const p = pop.current;
    const k = key.current;
    if (!p || !k) return;
    const pane = k.closest('.pane');
    const right = pane ? pane.getBoundingClientRect().right : window.innerWidth;
    setFlip(flipOf(p.getBoundingClientRect(), { right }));
  }, [open]);
  return (
    <span class="help" ref={box}>
      <button
        ref={key}
        type="button"
        class="help-key"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        ?
      </button>
      {open && (
        <span ref={pop} class={'help-pop' + (flip ? ' flip' : '')} role="note">
          {children}
        </span>
      )}
    </span>
  );
}
