// The glyphs that screen B adds to the 24-unit set. The lead moves them into
// src/ui/icons.tsx after the merge (docs/DESIGN.md, section 11.1, rule 5).

import type { JSX } from 'preact';

export type GlyphBName = 'board';

const G: Record<GlyphBName, JSX.Element> = {
  // A panel of nine lights, for the board.
  board: (
    <>
      <rect x="4" y="4" width="4" height="4" rx="1" />
      <rect x="10" y="4" width="4" height="4" rx="1" />
      <rect x="16" y="4" width="4" height="4" rx="1" />
      <rect x="4" y="10" width="4" height="4" rx="1" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <rect x="16" y="10" width="4" height="4" rx="1" />
      <rect x="4" y="16" width="4" height="4" rx="1" />
      <rect x="10" y="16" width="4" height="4" rx="1" />
      <rect x="16" y="16" width="4" height="4" rx="1" />
    </>
  ),
};

/** GlyphB draws one glyph of screen B, as decoration, in the style of Glyph. */
export function GlyphB({ name, size = 18 }: { name: GlyphBName; size?: number }) {
  return (
    <svg class="glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      {G[name]}
    </svg>
  );
}
