// Mark is the face of an agent: a square well with a 5 by 5 glyph from the
// hash of the name, in the hue of the name. The page draws it, so an agent
// without a custom face costs no request. A custom face, a picture that a
// person uploaded, shows instead, read behind the token as a blob URL in an
// image, never as markup. The manager takes ink.

import { useMemo } from 'preact/hooks';
import { markOf, markPath } from '../../lib/mark';
import { useFace } from '../../lib/faces';
import type { Tone } from '../../lib/presence';
import { useSelect } from '../../state/store';

export type MarkSize = 20 | 24 | 32 | 36 | 40 | 64 | 72 | 96;

/** The size of the glyph in a well, a multiple of 5 so each cell is whole pixels. */
export function glyphPx(size: number): number {
  return Math.max(10, Math.round((size * 0.6) / 5) * 5);
}

/** MarkGlyph draws the glyph of a name. */
export function MarkGlyph({ name, size, ink }: { name: string; size: number; ink?: boolean }) {
  const g = useMemo(() => markOf(name), [name]);
  const px = glyphPx(size);
  return (
    <svg class={'mark-glyph ' + (ink ? 'hue-ink' : 'hue-' + g.hue)} width={px} height={px} viewBox="0 0 5 5" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
      <path d={markPath(g.cells)} />
    </svg>
  );
}

export interface MarkProps {
  agent: string;
  size?: MarkSize;
  /** A faint halo of a status color, for the header of a member conversation. */
  halo?: { tone: Tone; word: string };
  /** The name for a screen reader. Without it and without a halo, the mark is decoration. */
  label?: string;
  /** True on a selected row, where the well turns paper. */
  selected?: boolean;
  /** Ink instead of the hue of the name. The manager gets ink on its own. */
  ink?: boolean;
  class?: string;
}

export function Mark({ agent, size = 32, halo, label, selected, ink, class: cls }: MarkProps) {
  const face = useSelect((s) => s.faces[agent]);
  const manager = useSelect((s) => (s.config && s.config.manager ? s.config.manager.agent : 'manager'));
  const custom = !!(face && face.custom);
  const url = useFace(custom ? agent : '', custom && face ? face.hash : '');
  const named = label || (halo ? agent : '');
  return (
    <span
      class={'mark s' + size + (selected ? ' sel' : '') + (halo ? ' halo halo-' + halo.tone : '') + (cls ? ' ' + cls : '')}
      role={named ? 'img' : undefined}
      aria-label={named ? named + (halo ? ', ' + halo.word : '') : undefined}
      aria-hidden={named ? undefined : 'true'}
      title={halo ? halo.word : undefined}
    >
      {custom && url ? <img src={url} alt="" draggable={false} /> : <MarkGlyph name={agent} size={size} ink={ink !== undefined ? ink : agent === manager} />}
    </span>
  );
}
