import { describe, expect, it } from 'vitest';
import { MARK_HUES, MAX_CELLS, MIN_CELLS, centered, hash32, markOf, markPath } from './mark';

const names = ['migrator', 'reviewer', 'tester', 'writer', 'scribe', 'manager', 'a', 'b', 'x1', 'release-notes', 'Ünïcode', ''];

describe('markOf', () => {
  it('gives the same mark for the same name', () => {
    for (const n of names) expect(markOf(n)).toEqual(markOf(n));
  });

  it('ignores the case of the name', () => {
    expect(markOf('Migrator')).toEqual(markOf('migrator'));
  });

  it('draws a mirror-symmetric glyph', () => {
    for (const n of names) {
      const { cells } = markOf(n);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) expect(cells[y * 5 + x]).toBe(cells[y * 5 + (4 - x)]);
    }
  });

  it('never draws an empty mark or a full block', () => {
    for (let i = 0; i < 2000; i++) {
      const n = markOf('agent-' + i).cells.filter(Boolean).length;
      expect(n).toBeGreaterThanOrEqual(MIN_CELLS);
      expect(n).toBeLessThanOrEqual(MAX_CELLS);
    }
  });

  it('spreads names over every hue', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(markOf('agent-' + i).hue);
    expect(seen.size).toBe(MARK_HUES);
  });

  it('sets the lit rows in the middle of the glyph, one row off at most', () => {
    const rows = (cells: boolean[]) => [0, 1, 2, 3, 4].map((y) => cells.slice(y * 5, y * 5 + 5).some(Boolean));
    for (let i = 0; i < 2000; i++) {
      const r = rows(markOf('agent-' + i).cells);
      const top = r.indexOf(true);
      const bottom = 4 - r.lastIndexOf(true);
      expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
    }
    // The mark of chat lit only its three lower rows, and sat at the foot of its well.
    const chat = rows(markOf('chat').cells);
    expect(chat.indexOf(true)).toBe(1);
    expect(chat.lastIndexOf(true)).toBe(3);
  });

  it('gives different names different marks', () => {
    const shapes = new Set(['migrator', 'reviewer', 'tester', 'writer', 'scribe'].map((n) => markOf(n).cells.join()));
    expect(shapes.size).toBe(5);
  });
});

describe('centered', () => {
  it('moves a glyph by whole rows and keeps its shape', () => {
    const cells = new Array<boolean>(25).fill(false);
    cells[20] = cells[24] = true;
    const out = centered(cells);
    expect(out[10]).toBe(true);
    expect(out[14]).toBe(true);
    expect(out.filter(Boolean).length).toBe(2);
  });

  it('leaves a glyph that fills its rows, or an empty one, as it is', () => {
    const full = new Array<boolean>(25).fill(false);
    full[2] = full[22] = true;
    expect(centered(full)).toBe(full);
    const none = new Array<boolean>(25).fill(false);
    expect(centered(none)).toBe(none);
  });
});

describe('hash32', () => {
  it('is an unsigned 32-bit number', () => {
    for (const n of names) {
      const h = hash32(n);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('markPath', () => {
  it('joins a run of cells into one rectangle', () => {
    const cells = new Array<boolean>(25).fill(false);
    cells[0] = cells[1] = cells[2] = true;
    cells[24] = true;
    expect(markPath(cells)).toBe('M0 0h3v1h-3zM4 4h1v1h-1z');
  });

  it('draws nothing for no cell', () => {
    expect(markPath(new Array<boolean>(25).fill(false))).toBe('');
  });
});
