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
