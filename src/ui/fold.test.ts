import { describe, expect, it } from 'vitest';
import type { Entry } from '../api/types';
import { FOLD_CHAT, FOLD_LINES, foldOf, foldShapes, foldWords, shapeKey, shapeOf, shapesOf, type Item } from './fold';

const NOW = new Date('2026-10-21T12:00:00Z');
let seq = 0;

function line(event = 'started', at = '2026-10-21T10:00:00Z'): Entry {
  return { seq: ++seq, at, from: { kind: 'system' }, text: 'a line', event };
}
function chat(from: string, to: string[], at = '2026-10-21T10:00:00Z'): Entry {
  return { seq: ++seq, at, from: { kind: 'agent', handle: from, run: 'r' }, to, text: 'hello' };
}
function msg(at = '2026-10-21T10:00:00Z'): Entry {
  return { seq: ++seq, at, from: { kind: 'person', name: 'alice@example.com' }, text: 'hi' };
}
function card(): Entry {
  return { seq: ++seq, at: '2026-10-21T10:00:00Z', from: { kind: 'system' }, text: 'x wants to run a command.', event: 'needs-you', decision: { run: 'r', id: 'a', label: 'Run command', state: 'pending' } };
}

const fold = (entries: Entry[]): Item[] => foldShapes(shapesOf(shapeKey(entries.map((e) => shapeOf(e, NOW)))));
const kinds = (items: Item[]) => items.map((i) => (i.kind === 'fold' ? 'fold:' + i.seqs.length : 'entry'));

describe('shapeOf', () => {
  it('names lines, chatter, cards, and other messages', () => {
    expect(shapeOf(line(), NOW).kind).toBe('line');
    expect(shapeOf(line('failed'), NOW).failed).toBe(true);
    expect(shapeOf(card(), NOW).kind).toBe('card');
    expect(shapeOf(chat('migrator-1', ['reviewer']), NOW)).toMatchObject({ kind: 'chat', who: ['migrator-1', 'reviewer'] });
    expect(shapeOf(msg(), NOW).kind).toBe('msg');
  });

  it('keeps a message to the operator, a message to everyone, and a pinned message out of the chatter', () => {
    expect(shapeOf(chat('migrator-1', ['operator']), NOW).kind).toBe('msg');
    expect(shapeOf(chat('migrator-1', []), NOW).kind).toBe('msg');
    expect(shapeOf({ ...chat('migrator-1', ['reviewer']), pinned: true }, NOW).kind).toBe('msg');
  });

  it('reads back the string of the shapes', () => {
    const shapes = [line(), chat('a', ['b', 'c']), msg()].map((e) => shapeOf(e, NOW));
    expect(shapesOf(shapeKey(shapes))).toEqual(shapes);
    expect(shapesOf('')).toEqual([]);
  });
});

describe('foldShapes', () => {
  it('folds three or more system lines in a row, and no fewer', () => {
    expect(FOLD_LINES).toBe(3);
    expect(kinds(fold([line(), line(), msg()]))).toEqual(['entry', 'entry', 'entry']);
    expect(kinds(fold([msg(), line(), line(), line(), line(), line(), msg()]))).toEqual(['entry', 'fold:5', 'entry']);
  });

  it('folds two or more messages of agents to agents, with every name of the talk', () => {
    expect(FOLD_CHAT).toBe(2);
    const items = fold([chat('migrator-1', ['reviewer']), chat('reviewer', ['migrator-1']), chat('migrator-1', ['reviewer']), chat('reviewer', ['migrator-1', 'tester'])]);
    expect(kinds(items)).toEqual(['fold:4']);
    const f = items[0] as Extract<Item, { kind: 'fold' }>;
    expect(foldWords(f)).toBe('migrator-1, reviewer, and tester: 4 messages');
    expect(kinds(fold([chat('a', ['b']), msg()]))).toEqual(['entry', 'entry']);
  });

  it('says how many updates a fold of lines holds, and counts its failures', () => {
    const items = fold([line(), line('failed'), line(), line('failed')]);
    const f = items[0] as Extract<Item, { kind: 'fold' }>;
    expect(foldWords(f)).toBe('4 updates');
    expect(f.failed).toBe(2);
  });

  it('never folds a decision card, and a card breaks a run of lines', () => {
    expect(kinds(fold([line(), line(), card(), line(), line()]))).toEqual(['entry', 'entry', 'entry', 'entry', 'entry']);
    expect(kinds(fold([card(), card(), card()]))).toEqual(['entry', 'entry', 'entry']);
  });

  it('never crosses the line of a new day', () => {
    const items = fold([line('started', '2026-10-20T10:00:00Z'), line('started', '2026-10-20T10:00:00Z'), line('started', '2026-10-21T10:00:00Z'), line('started', '2026-10-21T10:00:00Z')]);
    expect(kinds(items)).toEqual(['entry', 'entry', 'entry', 'entry']);
  });

  it('marks the entry after a fold, so it shows its sender again, and names the entry before each item', () => {
    const a = msg();
    const l = [line(), line(), line()];
    const b = msg();
    const items = fold([a, ...l, b]);
    expect(items[0]).toEqual({ kind: 'entry', seq: a.seq, prevSeq: 0, fresh: false });
    expect(items[1]).toMatchObject({ kind: 'fold', prevSeq: a.seq, key: 'line:' + l[0].seq });
    expect(items[2]).toEqual({ kind: 'entry', seq: b.seq, prevSeq: l[2].seq, fresh: true });
  });

  it('finds the fold that holds a seq', () => {
    const l = [line(), line(), line()];
    const items = fold([msg(), ...l]);
    expect(foldOf(items, l[1].seq)).toBe('line:' + l[0].seq);
    expect(foldOf(items, 99999)).toBe('');
  });
});
