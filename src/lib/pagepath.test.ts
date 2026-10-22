import { describe, expect, it } from 'vitest';
import { pageName, pageReason, withSuffix } from './pagepath';

describe('the page path', () => {
  it('takes a relative path whose last part ends with .md', () => {
    expect(pageReason('index.md')).toBe('');
    expect(pageReason('agents/reviewer/learned.md')).toBe('');
    expect(pageReason('search.md')).toBe('');
    expect(pageReason('notes/history.md')).toBe('');
  });

  it('refuses what the store refuses', () => {
    expect(pageReason('')).toMatch(/needs a path/);
    expect(pageReason('notes/plan')).toMatch(/ends with \.md/);
    expect(pageReason('old.md/plan.md')).toMatch(/Only the last part/);
    expect(pageReason('search')).toMatch(/route/);
    expect(pageReason('notes/history')).toMatch(/history/);
    expect(pageReason('/abs.md')).toMatch(/empty part/);
    expect(pageReason('a//b.md')).toMatch(/empty part/);
    expect(pageReason('.hidden/a.md')).toMatch(/dot/);
    expect(pageReason('../a.md')).toMatch(/dot/);
    expect(pageReason('a/b/c/d/e/f/g/h/i.md')).toMatch(/8 parts/);
    expect(pageReason('a\u0007.md')).toMatch(/control/);
    expect(pageReason('x'.repeat(510) + '.md')).toMatch(/512 bytes/);
    expect(pageReason('_index.md')).toMatch(/on its own/);
  });

  it('adds .md to what a person types', () => {
    expect(withSuffix(' runbooks/deploy ')).toBe('runbooks/deploy.md');
    expect(withSuffix('/notes/plan.md')).toBe('notes/plan.md');
    expect(withSuffix('search')).toBe('search.md');
    expect(withSuffix('dir/')).toBe('dir/');
    expect(withSuffix('')).toBe('');
  });

  it('shows the name without .md', () => {
    expect(pageName('agents/reviewer/learned.md')).toBe('learned');
    expect(pageName('index.md')).toBe('index');
  });
});
