// The mark of an agent: a 5 by 5 glyph, mirror symmetric around its middle
// column, from the hash of the name, in one of eight hues. The page draws
// the mark itself, so an agent without a custom face costs no request, and
// the mark follows the theme. The same name always gives the same mark.

/** The number of hues of the marks, --mark-0 to --mark-7 in tokens.css. */
export const MARK_HUES = 8;

/** The fewest and the most lit cells of a mark, so no mark is empty or a block. */
export const MIN_CELLS = 6;
export const MAX_CELLS = 19;

export interface MarkGlyph {
  /** 25 cells, row by row from the top left. */
  cells: boolean[];
  /** The hue, 0 to MARK_HUES - 1. */
  hue: number;
}

/** hash32 is FNV-1a over the code points of a text, with a final mix, so short names spread well. */
export function hash32(text: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (const ch of text) h = Math.imul(h ^ (ch.codePointAt(0) || 0), 16777619) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const lit = (cells: boolean[]) => cells.reduce((n, c) => n + (c ? 1 : 0), 0);

/** fill sets the cells of the left three columns from 15 bits and mirrors them. */
function fill(bits: number): boolean[] {
  const cells = new Array<boolean>(25).fill(false);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const on = ((bits >>> (y * 3 + x)) & 1) === 1;
      cells[y * 5 + x] = on;
      cells[y * 5 + (4 - x)] = on;
    }
  }
  return cells;
}

/** markOf returns the glyph and the hue of a name. */
export function markOf(name: string): MarkGlyph {
  const key = String(name || '').toLowerCase();
  const a = hash32(key);
  const b = hash32(key, a ^ 0x9e3779b9);
  let cells = fill(a);
  // A sparse mark takes the cells of a second hash too, and a dense mark
  // keeps only the cells that both hashes light.
  if (lit(cells) < MIN_CELLS) {
    const more = fill(b);
    cells = cells.map((c, i) => c || more[i]);
  } else if (lit(cells) > MAX_CELLS) {
    const less = fill(b);
    cells = cells.map((c, i) => c && less[i]);
  }
  // The middle column fills or empties last, from the top, until the count fits.
  for (let y = 0; y < 5 && lit(cells) < MIN_CELLS; y++) cells[y * 5 + 2] = true;
  for (let y = 0; y < 5 && lit(cells) > MAX_CELLS; y++) cells[y * 5 + 2] = false;
  return { cells, hue: b % MARK_HUES };
}

/**
 * markPath writes the lit cells as one SVG path on a 5 by 5 grid. A run of
 * lit cells in a row becomes one rectangle.
 */
export function markPath(cells: boolean[]): string {
  const parts: string[] = [];
  for (let y = 0; y < 5; y++) {
    let x = 0;
    while (x < 5) {
      if (!cells[y * 5 + x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 5 && cells[y * 5 + x + w]) w++;
      parts.push(`M${x} ${y}h${w}v1h-${w}z`);
      x += w;
    }
  }
  return parts.join('');
}
