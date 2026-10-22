// Led is a status: a 9-pixel square light and its word. The word carries
// the meaning, and the light repeats it. Only the amber light breathes,
// because only "needs you" asks for an action. With quiet, the word leaves
// the screen and stays in the tooltip and in the accessible name. With
// still, the light holds, for a status that reports a moment that passed.
// LineLed is the bare light of a line whose sentence is its word, such as a
// system line of a channel or the line of a decision that someone made.

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
  /** True when nothing waits for an action: an amber light holds and does not breathe. */
  still?: boolean;
  /** A sentence for the tooltip. */
  label?: string;
  class?: string;
}

export function Led({ tone, word, struck, quiet, still, label, class: cls }: LedProps) {
  return (
    <span class={'status tone-' + tone + (struck ? ' struck' : '') + (cls ? ' ' + cls : '')} title={label || (quiet ? word : undefined)}>
      <span class={'led led-' + tone + (tone === 'amber' && !still ? ' breathe' : '')} aria-hidden="true" />
      <span class={quiet ? 'sr' : 'status-word'}>{word}</span>
    </span>
  );
}

/**
 * LineLed is the light of a line whose text is its word: a system line, the
 * title of a card, or a decided line. It never breathes, because the line
 * reports what happened, and a screen reader reads the text beside it.
 */
export function LineLed({ tone, large }: { tone: Tone; large?: boolean }) {
  return <span class={'led led-' + tone + (large ? ' led-l' : '')} aria-hidden="true" />;
}
