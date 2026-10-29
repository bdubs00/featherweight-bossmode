// Pop is a key that opens a small menu of links and actions: the places of
// the grid, and the account. ArrowUp and ArrowDown move in the menu, Escape
// closes it and gives the focus back to its key, and a click elsewhere
// closes it.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface PopItem {
  label: string;
  href?: string;
  onSelect?: () => void;
  /** True for a choice that is on, such as the theme in use. */
  checked?: boolean;
  /** A line before the item. */
  sep?: boolean;
}

export function Pop({ label, keyClass, keyBody, items, head, align = 'start' }: { label: string; keyClass: string; keyBody: ComponentChildren; items: PopItem[]; head?: ComponentChildren; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const first = list.current && (list.current.querySelector('[role^="menuitem"]') as HTMLElement | null);
    if (first) first.focus();
    const away = (e: Event) => {
      const t = e.target as Node;
      if (list.current && !list.current.contains(t) && btn.current && !btn.current.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const close = () => {
    setOpen(false);
    if (btn.current) btn.current.focus();
  };
  const onKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const all = [...(list.current ? list.current.querySelectorAll<HTMLElement>('[role^="menuitem"]') : [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[(i + 1) % all.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      all[(i - 1 + all.length) % all.length].focus();
    } else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div class="cf-pop">
      <button ref={btn} type="button" class={keyClass} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {keyBody}
      </button>
      {open && (
        <div ref={list} class={'menu cf-menu cf-menu-' + align} role="menu" aria-label={label} onKeyDown={onKey}>
          {head && (
            <>
              <div class="menu-head" role="presentation">
                {head}
              </div>
              <div class="menu-sep" role="separator" />
            </>
          )}
          {items.map((it) => (
            <>
              {it.sep && <div class="menu-sep" role="separator" />}
              {it.href ? (
                <a role="menuitem" href={it.href} onClick={() => setOpen(false)}>
                  <span class="t">{it.label}</span>
                </a>
              ) : (
                <button
                  type="button"
                  role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={it.checked === undefined ? undefined : it.checked}
                  onClick={() => {
                    setOpen(false);
                    if (it.onSelect) it.onSelect();
                  }}
                >
                  <span class="t">
                    {it.label}
                    {it.checked && <span class="cf-check" aria-hidden="true" />}
                  </span>
                </button>
              )}
            </>
          ))}
        </div>
      )}
    </div>
  );
}
