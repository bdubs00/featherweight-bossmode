import { afterEach, describe, expect, it } from 'vitest';
import type { BossConfig } from '../api/types';
import { DEFAULT_ACCENT, applyChoice, applyTheme, contrast, normalizeHex, onAccentOf, readChoice, safeLogo, setChoice, themeOf } from './theme';

const base: BossConfig = { manager: null, placement: 'queue', maxMembers: 16 };

describe('themeOf', () => {
  it('falls back to signal orange and no logo without a theme', () => {
    expect(themeOf(base)).toEqual({ accent: DEFAULT_ACCENT, onAccent: '#000000', name: '', logo: '' });
    expect(themeOf(null)).toEqual({ accent: DEFAULT_ACCENT, onAccent: '#000000', name: '', logo: '' });
    expect(themeOf({ ...base, theme: null })).toEqual(themeOf(base));
  });

  it('reads the accent, the name, and the logo of a deployment', () => {
    const t = themeOf({ ...base, theme: { accent: '#00b37a', name: ' Example Org ', logo: '/v1/bossmode/logo' } });
    expect(t).toEqual({ accent: '#00B37A', onAccent: '#000000', name: 'Example Org', logo: '/v1/bossmode/logo' });
  });

  it('keeps the default for an accent that is no hex color', () => {
    for (const accent of ['orange', 'rgb(1,2,3)', '#12345', '#GGGGGG', '', 42, null, 'red;--x:1', '#FF4D00 !important']) {
      expect(themeOf({ ...base, theme: { accent: accent as string } }).accent).toBe(DEFAULT_ACCENT);
    }
  });

  it('keeps the empty well for a logo off this origin', () => {
    for (const logo of ['https://example.com/logo.svg', '//example.com/x', '/ui/logo', '/v1/../ui/x', '/v1\\x', 'javascript:alert(1)', '/v1/a b', 7]) {
      expect(themeOf({ ...base, theme: { logo: logo as string } }).logo).toBe('');
    }
  });

  it('applies a partial theme field by field', () => {
    const t = themeOf({ ...base, theme: { name: 'Org' } });
    expect(t.accent).toBe(DEFAULT_ACCENT);
    expect(t.name).toBe('Org');
  });
});

describe('normalizeHex', () => {
  it('writes three digits as six', () => {
    expect(normalizeHex('#f40')).toBe('#FF4400');
    expect(normalizeHex(' #ff4d00 ')).toBe('#FF4D00');
  });
});

describe('onAccentOf', () => {
  it('puts black on a light accent and white on a dark one', () => {
    expect(onAccentOf('#FF4D00')).toBe('#000000');
    expect(onAccentOf('#8FD3FF')).toBe('#000000');
    expect(onAccentOf('#1A237E')).toBe('#FFFFFF');
  });

  it('keeps the label at 4.5 to 1 or more for the accents of the mockup', () => {
    for (const a of ['#FF4D00', '#8FD3FF', '#FFB800', '#00B37A']) expect(contrast(a, onAccentOf(a))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('safeLogo', () => {
  it('keeps a path under /v1/ with a query', () => {
    expect(safeLogo('/v1/bossmode/logo?v=3')).toBe('/v1/bossmode/logo?v=3');
  });
});

describe('applyTheme and the choice', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
    localStorage.clear();
  });

  it('sets the accent and its label color on the root', () => {
    applyTheme(themeOf({ ...base, theme: { accent: '#1A237E' } }));
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#1A237E');
    expect(document.documentElement.style.getPropertyValue('--on-accent')).toBe('#FFFFFF');
  });

  it('pins a theme with data-theme and forgets it for the system', () => {
    setChoice('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(readChoice()).toBe('dark');
    setChoice('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(readChoice()).toBe('system');
  });

  it('reads an unknown stored value as the system theme', () => {
    localStorage.setItem('fw.bossmode.theme', 'neon');
    expect(readChoice()).toBe('system');
    applyChoice(readChoice());
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
