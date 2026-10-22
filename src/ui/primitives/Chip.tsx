// Chip is a count or a short state on a heading line: plain with a line
// edge, ink for unread, and amber for decisions that wait. Counts sit on
// the heading line as chips, never under it.

import type { ComponentChildren } from 'preact';

export type ChipTone = 'plain' | 'ink' | 'amber';

/** countText writes a count, with 99+ above 99. */
export function countText(n: number): string {
  return n > 99 ? '99+' : String(n);
}

export function Chip({ children, tone = 'plain', label, class: cls }: { children: ComponentChildren; tone?: ChipTone; label?: string; class?: string }) {
  return (
    <span class={'chip chip-' + tone + (cls ? ' ' + cls : '')}>
      {label ? (
        <>
          <span aria-hidden="true">{children}</span>
          <span class="sr">{label}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
