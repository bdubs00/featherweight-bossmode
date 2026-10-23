// The theme of the page: the accent and the logo of the deployment, from
// GET /v1/bossmode, and the choice of the person between the light and the
// graphite theme. Without a theme, or with a value that fails a check, the
// page keeps its defaults: signal orange and the monogram in the logo well.

import { useEffect, useState } from 'preact/hooks';
import type { BossConfig } from '../api/types';

/** The accent of the page when the deployment names none. */
export const DEFAULT_ACCENT = '#FF4D00';

/** The theme that the page applies. */
export interface Theme {
  /** The accent, as #RRGGBB. */
  accent: string;
  /** The color of a label on the accent: black or white. */
  onAccent: string;
  /** The name of the organization, or "". */
  name: string;
  /** The path of the logo on this origin, or "". */
  logo: string;
}

/** normalizeHex returns a hex color of 3 or 6 digits as #RRGGBB, or "" for any other value. */
export function normalizeHex(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return '';
  const d = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return '#' + d.toUpperCase();
}

/** luminance is the relative luminance of a #RRGGBB color, from WCAG 2. */
export function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** contrast is the contrast ratio of two #RRGGBB colors. */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** onAccentOf picks black or white for a label on the accent, whichever has the higher contrast. */
export function onAccentOf(accent: string): string {
  return contrast(accent, '#000000') >= contrast(accent, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

/**
 * safeLogo keeps a logo path only when it is a path on this origin under
 * /v1/, with no dot part, no backslash, and no control character. The page
 * reads the logo with the bearer token, so it never sends the token to
 * another place.
 */
export function safeLogo(v: unknown): string {
  if (typeof v !== 'string') return '';
  const p = v.trim();
  if (!p.startsWith('/v1/') || p.includes('\\') || /[\u0000-\u001f\u007f\s]/.test(p)) return '';
  const path = p.split(/[?#]/)[0];
  if (path.split('/').some((part) => part === '..' || part === '.')) return '';
  return p;
}

/** themeOf reads the theme of the settings, with the defaults for what is missing or wrong. */
export function themeOf(config: BossConfig | null | undefined): Theme {
  const t = config && config.theme && typeof config.theme === 'object' ? config.theme : null;
  const accent = (t && normalizeHex(t.accent)) || DEFAULT_ACCENT;
  const name = t && typeof t.name === 'string' ? t.name.trim().slice(0, 80) : '';
  return { accent, onAccent: onAccentOf(accent), name, logo: t ? safeLogo(t.logo) : '' };
}

/** applyTheme sets the accent of a theme on the root element. */
export function applyTheme(t: Theme, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--on-accent', t.onAccent);
}

/* ---------- the choice of the person ---------- */

/** The theme that the person picks: the one of the system, light, or graphite. */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** The key of the choice in localStorage, a convenience of one browser. */
export const CHOICE_KEY = 'fw.bossmode.theme';

/** readChoice reads the choice of the person, or "system". */
export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(CHOICE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** applyChoice sets data-theme on the root element, or removes it for the system theme. */
export function applyChoice(c: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (c === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', c);
}

const choiceListeners = new Set<() => void>();

/** setChoice keeps and applies the choice of the person. */
export function setChoice(c: ThemeChoice): void {
  try {
    if (c === 'system') localStorage.removeItem(CHOICE_KEY);
    else localStorage.setItem(CHOICE_KEY, c);
  } catch {
    // No storage: the choice lasts for this page only.
  }
  applyChoice(c);
  for (const f of [...choiceListeners]) f();
}

/** useChoice returns the current choice and redraws when it changes. */
export function useChoice(): ThemeChoice {
  const [c, setC] = useState<ThemeChoice>(readChoiceFromRoot);
  useEffect(() => {
    const f = () => setC(readChoiceFromRoot());
    choiceListeners.add(f);
    return () => {
      choiceListeners.delete(f);
    };
  }, []);
  return c;
}

function readChoiceFromRoot(): ThemeChoice {
  const v = document.documentElement.getAttribute('data-theme');
  return v === 'light' || v === 'dark' ? v : 'system';
}
