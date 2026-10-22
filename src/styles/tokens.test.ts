import { describe, expect, it } from 'vitest';
import css from './tokens.css?raw';
import { contrast } from '../lib/theme';

/** block returns the declarations of the first rule that starts with a selector. */
function block(selector: string): Map<string, string> {
  const i = css.indexOf(selector);
  expect(i).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  const out = new Map<string, string>();
  for (const decl of css.slice(open + 1, close).split(';')) {
    const m = /^\s*(--[a-z0-9-]+|color-scheme)\s*:\s*([\s\S]+?)\s*$/.exec(decl.replace(/\/\*[\s\S]*?\*\//g, ''));
    if (m) out.set(m[1], m[2].replace(/\s+/g, ' '));
  }
  return out;
}

const light = block(':root {');
const graphiteMedia = block(":root:not([data-theme='light'])");
const graphitePicked = block(":root[data-theme='dark']");

describe('the tokens', () => {
  it('keeps the graphite of the system and the graphite that a person picks equal', () => {
    expect([...graphitePicked.entries()]).toEqual([...graphiteMedia.entries()]);
  });

  it('redefines in graphite only names that the light theme defines', () => {
    for (const k of graphitePicked.keys()) expect(light.has(k)).toBe(true);
  });

  it('holds the six base values of the design in both themes', () => {
    for (const k of ['--paper', '--chrome', '--line', '--recess', '--ink', '--muted']) {
      expect(light.has(k)).toBe(true);
      expect(graphitePicked.has(k)).toBe(true);
    }
  });

  it('keeps every word of a status at 4.5 to 1 on the paper of its theme', () => {
    for (const [theme, paper] of [
      [light, light.get('--paper')!],
      [graphitePicked, graphitePicked.get('--paper')!],
    ] as const) {
      for (const k of ['--ink', '--muted', '--word-green', '--word-amber', '--word-red']) {
        const v = theme.get(k) || light.get(k)!;
        expect(contrast(v, paper), k + ' on ' + paper).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the four-pixel radius and the default accent', () => {
    expect(light.get('--r')).toBe('4px');
    expect(light.get('--accent')!.toUpperCase()).toBe('#FF4D00');
  });
});
