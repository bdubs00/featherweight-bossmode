// ReactionChip shows one kind of reaction on an entry with its count: a
// thumb up, a thumb down, or a heart. The heart is filled with the accent,
// one of its three uses. A chip of the person's own reaction has an ink
// edge. With onClick, the chip is a toggle key: it adds the same reaction,
// and on the person's own reaction it takes the reaction back.

import type { ReactionKind } from '../../api/types';
import { Glyph } from '../icons';

export const REACTION_NAMES: Record<ReactionKind, [string, string]> = {
  up: ['thumb up', 'thumbs up'],
  down: ['thumb down', 'thumbs down'],
  heart: ['heart', 'hearts'],
};

export function reactionLabel(kind: ReactionKind, count: number, mine?: boolean): string {
  const [one, many] = REACTION_NAMES[kind];
  return count + ' ' + (count === 1 ? one : many) + (mine ? ', yours among them' : '');
}

export function ReactionChip({ kind, count, mine, names, onClick, disabled }: { kind: ReactionKind; count: number; mine?: boolean; names?: string; onClick?: () => void; disabled?: boolean }) {
  const inner = (
    <>
      <Glyph name={kind === 'up' ? 'thumb-up' : kind === 'down' ? 'thumb-down' : 'heart'} size={13} class={kind === 'heart' ? 'heart' : ''} />
      <span aria-hidden="true">{count}</span>
      <span class="sr">{reactionLabel(kind, count, mine)}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" class={'rchip' + (mine ? ' mine' : '')} aria-pressed={!!mine} title={names} disabled={disabled} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return (
    <span class={'rchip' + (mine ? ' mine' : '')} title={names}>
      {inner}
    </span>
  );
}
