import { describe, expect, it } from 'vitest';
import { applyCompletion, completionAt, mentionsIn, slashAt, MAX_MATCHES } from './mention';

const roster = ['migrator-1', 'migrator-2', 'reviewer', 'tester', 'writer'];

describe('the @ completion', () => {
  it('opens after an @ at the start of a word', () => {
    const c = completionAt('ask @rev', 8, roster)!;
    expect(c).toMatchObject({ start: 4, end: 8, query: 'rev', matches: ['reviewer'] });
    expect(completionAt('@', 1, roster)!.matches).toEqual(roster);
  });

  it('puts the handles that start with the query first', () => {
    const c = completionAt('@er', 3, ['tester', 'eraser', 'reviewer'])!;
    expect(c.matches).toEqual(['eraser', 'tester', 'reviewer']);
  });

  it('matches without regard to case', () => {
    expect(completionAt('@MIG', 4, roster)!.matches).toEqual(['migrator-1', 'migrator-2']);
  });

  it('stays closed in an address, without a match, and after a space', () => {
    expect(completionAt('mail bob@rev', 12, roster)).toBeNull();
    expect(completionAt('@zzz', 4, roster)).toBeNull();
    expect(completionAt('@reviewer ok', 12, roster)).toBeNull();
    expect(completionAt('no at here', 5, roster)).toBeNull();
  });

  it('opens after an opening bracket and covers the rest of the word', () => {
    const c = completionAt('(@revi', 6, roster)!;
    expect(c.start).toBe(1);
    // The query ends at the caret, and the completion replaces the whole word.
    const mid = completionAt('@revXYZ tail', 4, roster)!;
    expect(mid).toMatchObject({ start: 0, end: 7, query: 'rev', matches: ['reviewer'] });
    const mid2 = completionAt('@rev tail', 2, roster)!;
    expect(mid2).toMatchObject({ start: 0, end: 4, query: 'r' });
  });

  it('bounds the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => 'm' + i);
    expect(completionAt('@m', 2, many)!.matches).toHaveLength(MAX_MATCHES);
  });

  it('puts the handle in place with one space', () => {
    const text = 'please @rev check';
    const c = completionAt(text, 11, roster)!;
    expect(applyCompletion(text, c, 'reviewer')).toEqual({ text: 'please @reviewer check', caret: 17 });
    const t2 = 'hi @te';
    expect(applyCompletion(t2, completionAt(t2, 6, roster)!, 'tester')).toEqual({ text: 'hi @tester ', caret: 11 });
  });
});

describe('mentionsIn', () => {
  it('returns the handles of the roster that a text addresses, once each, in order', () => {
    expect(mentionsIn('@reviewer and @migrator-1, then @reviewer again', roster)).toEqual(['reviewer', 'migrator-1']);
  });

  it('ignores an address, an unknown handle, and trailing punctuation', () => {
    expect(mentionsIn('mail a@reviewer.com or @nobody', roster)).toEqual([]);
    expect(mentionsIn('thanks @tester.', roster)).toEqual(['tester']);
    expect(mentionsIn('ok @Writer!', roster)).toEqual(['writer']);
  });
});

describe('slashAt', () => {
  const names = ['ansible-style', 'release-notes', 'review'];

  it('completes a command at the start of the text', () => {
    const c = slashAt('/re', 3, names)!;
    expect(c.matches).toEqual(['release-notes', 'review']);
    expect(applyCompletion('/re', c, 'review')).toEqual({ text: '/review ', caret: 8 });
  });

  it('opens on a bare slash and never in the middle of a text', () => {
    expect(slashAt('/', 1, names)!.matches).toEqual(names);
    expect(slashAt('see /re', 7, names)).toBeNull();
    expect(slashAt('/re view', 8, names)).toBeNull();
  });
});
