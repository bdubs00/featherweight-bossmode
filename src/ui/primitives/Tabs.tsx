// Tabs sit on the header line. The current tab is ink and bold, with the
// accent bar under it. A tab with href is a link of the route, marked with
// aria-current. A tab without href is a tab of a tablist: the arrows, Home,
// and End move between the tabs, and the focus follows the selection.

import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { Chip, type ChipTone, countText } from './Chip';

export interface TabItem {
  id: string;
  label: string;
  href?: string;
  count?: number;
  countTone?: ChipTone;
  /** The count for a screen reader, such as 1 decision waits. */
  countLabel?: string;
}

export function Tabs({ label, items, current, onSelect, controls }: { label: string; items: TabItem[]; current: string; onSelect?: (id: string) => void; controls?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const chip = (it: TabItem) => (it.count ? <Chip tone={it.countTone || 'plain'} label={it.countLabel}>{countText(it.count)}</Chip> : null);
  if (!onSelect) {
    return (
      <nav class="tabs" aria-label={label}>
        {items.map((it) => (
          <a class={'tab' + (it.id === current ? ' on' : '')} href={it.href} aria-current={it.id === current ? 'page' : undefined}>
            <span>{it.label}</span>
            {chip(it)}
          </a>
        ))}
      </nav>
    );
  }
  const onKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((it) => it.id === current);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onSelect(items[n].id);
    const btn = list.current && (list.current.querySelectorAll('[role="tab"]')[n] as HTMLElement | undefined);
    if (btn) btn.focus();
  };
  return (
    <div class="tabs" role="tablist" aria-label={label} ref={list} onKeyDown={onKey}>
      {items.map((it) => (
        <button
          type="button"
          role="tab"
          class={'tab' + (it.id === current ? ' on' : '')}
          aria-selected={it.id === current}
          aria-controls={controls}
          tabIndex={it.id === current ? 0 : -1}
          onClick={() => onSelect(it.id)}
        >
          <span>{it.label}</span>
          {chip(it)}
        </button>
      ))}
    </div>
  );
}
