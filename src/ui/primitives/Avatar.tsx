// Avatar is a person: initials on an ink square. A person has no face in
// the API, and the page gives a person no color, so people and agents never
// look alike. A duty, which starts the runs of the principal duty:<name>,
// shows the clock of the place Duties in place of initials.

import { personName } from '../../lib/words';
import { Glyph } from '../icons';

/** initialsOf takes the first letters of the first two words of a name, or the first two letters of one word. */
export function initialsOf(name: string): string {
  const parts = String(name || '')
    .split(/[\s._@-]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return [...parts[0]].slice(0, 2).join('').toUpperCase();
  return (([...parts[0]][0] || '') + ([...parts[1]][0] || '')).toUpperCase();
}

export function Avatar({ subject, display, size = 32 }: { subject: string; display?: string; size?: 20 | 24 | 32 | 36 }) {
  if (/^duty:./.test(subject || ''))
    return (
      <span class={'avatar avatar-duty s' + size} aria-hidden="true">
        <Glyph name="duties" size={Math.round(size * 0.6)} />
      </span>
    );
  return (
    <span class={'avatar s' + size} aria-hidden="true">
      {initialsOf(personName(subject, display))}
    </span>
  );
}
