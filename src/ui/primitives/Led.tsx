// Led is a status: a 9-pixel square light and its word. The word carries
// the meaning, and the light repeats it. Only the amber light breathes,
// because only "needs you" asks for an action. With quiet, the word leaves
// the screen and stays in the tooltip and in the accessible name.

import type { Tone } from '../../lib/presence';

export type { Tone };

export interface LedProps {
  tone: Tone;
  /** The word beside the light, such as working or needs you. */
  word: string;
  /** True for a fired seat: the word shows struck through. */
  struck?: boolean;
  /** True to keep the word for a screen reader and a tooltip only. */
  quiet?: boolean;
  /** A sentence for the tooltip. */
  label?: string;
  class?: string;
}

export function Led({ tone, word, struck, quiet, label, class: cls }: LedProps) {
  return (
    <span class={'status tone-' + tone + (struck ? ' struck' : '') + (cls ? ' ' + cls : '')} title={label || (quiet ? word : undefined)}>
      <span class={'led led-' + tone + (tone === 'amber' ? ' breathe' : '')} aria-hidden="true" />
      <span class={quiet ? 'sr' : 'status-word'}>{word}</span>
    </span>
  );
}
