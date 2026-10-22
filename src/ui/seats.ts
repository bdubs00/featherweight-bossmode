// The seats of a bridge in view of the workers of their agents: the rows
// of the picker of Add, the draft of a new seat, and the capacity line of
// the channel. The page never says pool: an agent has workers.

import type { Agent, FaceMeta, Fleet, Member } from '../api/types';
import { handleReason, nextHandle } from '../lib/handles';
import { cap } from '../lib/words';
import { workersOf } from '../lib/workers';

/** One agent in the picker. */
export interface PickRow {
  agent: string;
  name: string;
  tagline: string;
  /** The free workers of the agent, less the new seats that wait in the members pane. -1 when the fleet is not known. */
  free: number;
}

export interface PickGroups {
  /** The agents with a seat on this bridge. */
  here: PickRow[];
  /** Every other agent that the person can seat. */
  others: PickRow[];
}

/** canSeat reports whether the person can start runs of an agent: an owner or an operator can. */
export const canSeat = (a: Agent): boolean => a.role === 'owner' || a.role === 'operator';

/**
 * pickGroups builds the two groups of the picker. A query keeps the agents
 * whose name, display name, or tagline holds it. drafts names the agents of
 * the new seats that wait, so a click on the last free worker shows the
 * agent as waiting for a worker at once.
 */
export function pickGroups(agents: Agent[], faces: Record<string, FaceMeta>, seats: Pick<Member, 'agent' | 'fired'>[], fleet: Fleet | null, query = '', drafts: string[] = []): PickGroups {
  const q = query.trim().toLowerCase();
  const seated = new Set(seats.filter((m) => !m.fired).map((m) => m.agent));
  const here: PickRow[] = [];
  const others: PickRow[] = [];
  for (const a of agents) {
    if (!canSeat(a)) continue;
    const f = faces[a.name];
    const name = (f && f.displayName) || cap(a.name);
    const tagline = (f && f.tagline) || a.description || '';
    if (q && !(a.name + '\n' + name + '\n' + tagline).toLowerCase().includes(q)) continue;
    const waiting = drafts.filter((d) => d === a.name).length;
    const free = fleet ? Math.max(0, workersOf(fleet, a.name).free - waiting) : -1;
    (seated.has(a.name) ? here : others).push({ agent: a.name, name, tagline, free });
  }
  return { here, others };
}

/** freeWords is the capacity of an agent in the picker: "1 free", or "waiting for a worker". */
export function freeWords(free: number): string {
  return free > 0 ? free + ' free' : 'waiting for a worker';
}

/** A new seat in the members pane, before Seat sends it. */
export interface Draft {
  id: number;
  agent: string;
  handle: string;
  task: string;
}

/**
 * taskOfGoal fills the task of a new seat from the goal of the bridge: its
 * first sentence, without the end mark, so the person edits a short task.
 */
export function taskOfGoal(goal: string, title = ''): string {
  const text = String(goal || '').replace(/\s+/g, ' ').trim() || String(title || '').trim();
  const first = text.split(/(?<=[.!?])\s/)[0] || text;
  return first.replace(/[.!?]+$/, '').trim();
}

/** draftOf makes the new seat of an agent: the next free handle, and the task from the goal. */
export function draftOf(id: number, agent: string, taken: string[], goal: string, title = ''): Draft {
  return { id, agent, handle: nextHandle(agent, taken), task: taskOfGoal(goal, title) };
}

/** seatReason says why a seat cannot go out, or "" for a good one. */
export function seatReason(handle: string, taken: string[]): string {
  return handleReason(handle, taken);
}

/**
 * wavesLine is the capacity line of a channel: "Runs in waves: 5 seats
 * share 3 workers.", when the seats of the bridge outnumber the workers of
 * their agents, else "". A fired seat does not count, and neither does an
 * unknown fleet or a fleet with no worker for these agents.
 */
export function wavesLine(seats: Member[], fleet: Fleet | null): string {
  if (!fleet) return '';
  const live = seats.filter((m) => !m.fired);
  const agents = [...new Set(live.map((m) => m.agent))];
  const workers = agents.reduce((n, a) => n + workersOf(fleet, a).workers.length, 0);
  if (workers === 0 || live.length <= workers) return '';
  return `Runs in waves: ${live.length} seats share ${workers} ${workers === 1 ? 'worker' : 'workers'}.`;
}
