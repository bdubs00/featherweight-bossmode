// The fake server reads words back with rules. These tests hold the rules of
// the title and of the name of a duty that the walk of 2026-10-28 fixed: a
// stop inside a word ends no clause, and a name ends between two words.
import { describe, expect, it } from 'vitest';

// A path in a variable keeps the module of the fake out of the type check of the page.
const path = '../../fake/routes-door.mjs';

describe('the fake door', () => {
  it('keeps a version number and a host whole in a title', async () => {
    const { titleOf } = await import(/* @vite-ignore */ path);
    expect(titleOf('What changed in our release notes since 2.3?', '')).toBe('What changed in our release notes since 2.3?');
    expect(titleOf('Summarize example.com. Then tell me.', '')).toBe('Summarize example.com');
    expect(titleOf('Every night, check the hosts. Tell me only when something drifted.', 'every night')).toBe('Check the hosts');
  });
  it('cuts the name of a duty between two words', async () => {
    const { slug } = await import(/* @vite-ignore */ path);
    expect(slug('Sum up what our competitors Acme and Globex shipped last week')).toBe('sum-up-what-our-competitors-acme-and');
    expect(slug('Short one')).toBe('short-one');
    expect(slug('a'.repeat(60))).toHaveLength(40);
  });
});

// The fake serves the shapes of round 2 with the rules of the workbench: a
// duty that does the same work, and a result that found something.
const work = '../../fake/routes-work.mjs';

describe('the fake of round 2', () => {
  it('names a duty of the person with the same agent and two words of work in common', async () => {
    const { sameOf } = await import(/* @vite-ignore */ path);
    const duties = [
      { name: 'weekly-competitor-summary', title: 'Weekly competitor summary', agent: 'writer', owner: 'alice@example.com', do: { ask: { message: 'Sum up what our competitors shipped last week.' } } },
      { name: 'nightly-notes', agent: 'scribe', owner: 'alice@example.com', do: { ask: { message: 'Draft the notes.' } } },
    ];
    const words = 'Every Monday at 9am, sum up what our competitors shipped last week.';
    expect(sameOf(duties, 'alice@example.com', 'writer', words)).toEqual({ duty: 'weekly-competitor-summary', title: 'Weekly competitor summary' });
    expect(sameOf(duties, 'bob@example.com', 'writer', words)).toBeNull();
    expect(sameOf(duties, 'alice@example.com', 'ops', words)).toBeNull();
  });
  it('puts a run of a duty in review when it asks for a check, or when it tells what it found and found something', async () => {
    const { inReview, foundLine } = await import(/* @vite-ignore */ work);
    const found = { state: 'completed', output: '\nFound: web-2 drifted.\n\nThe table.', metadata: { 'workbench.found': '1' } };
    expect(foundLine(found)).toBe('Found: web-2 drifted.');
    expect(inReview(found)).toBe(true);
    expect(inReview({ ...found, output: 'Nothing drifted.' })).toBe(false);
    expect(inReview({ ...found, reactions: { up: 1 } })).toBe(false);
    expect(inReview({ state: 'completed', output: 'x', metadata: { 'workbench.review': '1' } })).toBe(true);
  });
});
