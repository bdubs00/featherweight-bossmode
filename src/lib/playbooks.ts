// A playbook is the form of New bridge without a title, saved under a name:
// the goal, the placement, the seats, the caps, and what the manager can
// do. Save as playbook takes them from a bridge, New bridge fills its form
// from one, and the action open of a duty opens a bridge from one.

import type { PlaybookBody } from '../api/routes';
import type { Bridge, Caps, Member, Playbook } from '../api/types';
import { firstLine, nameOf } from './duties';

const NAME = /^[a-z0-9_-]{1,63}$/;

/** playbookBodyOf takes a playbook from a bridge: its goal, its placement, its seats that are not fired, its caps, and what the manager can do. */
export function playbookBodyOf(b: Bridge, members: Member[]): PlaybookBody {
  const caps: Partial<Caps> = {};
  for (const [k, v] of Object.entries(b.caps || {}) as [keyof Caps, number | undefined][]) if (typeof v === 'number' && v > 0) caps[k] = v;
  const body: PlaybookBody = {
    goal: b.goal || '',
    placement: b.placement || 'queue',
    seats: members.filter((m) => !m.fired).map((m) => ({ handle: m.handle, agent: m.agent, task: m.task })),
    delegation: { ...b.delegation },
  };
  if (Object.keys(caps).length) body.caps = caps;
  return body;
}

/** playbookName makes a name from the title of a bridge, such as weekly-patching. */
export const playbookName = (title: string): string => nameOf(title);

/** playbookReason says why a name cannot name a playbook, or "". */
export function playbookReason(name: string): string {
  if (!name) return 'Give the playbook a name.';
  if (!NAME.test(name)) return 'A name holds 1 to 63 of a to z, 0 to 9, hyphens, and underscores.';
  return '';
}

/** keepsWords reads back what a playbook keeps, such as It keeps the goal, 3 seats, the caps, and what the manager can do. */
export function keepsWords(seats: number): string {
  return 'It keeps the goal, ' + (seats === 1 ? '1 seat' : seats + ' seats') + ', the placement, the caps, and what the manager can do.';
}

/** playbookLabel names a playbook in a choice: its name as it is, and the first line of its goal. */
export function playbookLabel(p: Pick<Playbook, 'name' | 'goal'>): string {
  const goal = firstLine(p.goal || '');
  return p.name + (goal ? ': ' + goal : '');
}
