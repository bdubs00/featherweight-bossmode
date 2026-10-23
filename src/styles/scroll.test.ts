import { describe, expect, it } from 'vitest';
import shell from './shell.css?raw';
import fleet from './fleet.css?raw';

/** rule returns the declarations of the first rule of a sheet whose selector is exactly sel. */
function rule(css: string, sel: string): string {
  const m = new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css);
  expect(m, sel).not.toBeNull();
  return m![2];
}

describe('the panes', () => {
  it('scroll down and never sideways, and wrap a long word', () => {
    const scroll = rule(shell, '.scroll');
    expect(scroll).toMatch(/overflow-x:\s*hidden/);
    expect(scroll).toMatch(/overflow-y:\s*auto/);
    expect(scroll).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('break a long code span of a heart, and a long line of what an agent can do', () => {
    expect(rule(fleet, '.liked-body p')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(fleet, '.abilities')).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
