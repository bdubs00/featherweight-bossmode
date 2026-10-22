// Help is the question mark that holds a definition. The chrome never
// explains: a definition, such as what a worker is, sits behind this key and
// opens on a click, on Enter, or on Space. Escape and a click elsewhere
// close it.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export function Help({ label, children }: { label: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const key = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
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
        <span class="help-pop" role="note">
          {children}
        </span>
      )}
    </span>
  );
}
