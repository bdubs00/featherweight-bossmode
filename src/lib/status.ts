// The statuses of the page: the word and the light of every worker, every
// agent, and every seat. The page keeps one state per worker, from the
// stream: the phase of its Task from the task events, the state of its
// member from the member events, and the runs that it holds from the run
// events and GET /v1/fleet/runs. statusOf derives every word from that
// state, so the header, the people list, a roster, the head of a
// conversation, and the Workers pane say the same thing at the same
// moment. The presence that a bridge sends stands only where the page
// lacks the facts: a newest run that the page does not hold, or a finished
// run on a worker whose phase the page does not know. The functions here
// are pure, so the tests read them without a page.

import type { Fleet, FleetMember, Member, Presence, Run } from '../api/types';
import { derivePresence, phaseOf, seatLight, type Light } from './presence';

/** The facts that the page holds about the workers. */
export interface Facts {
  /** GET /v1/fleet, with the member and the task events of the stream applied. */
  fleet: Fleet | null;
  /** The runs that the page holds, from the run events and the reads of the page. */
  runs: Record<string, Run>;
  /** True once the page read the open runs of the fleet, so an open run that it does not hold does not exist. */
  openRuns: boolean;
  /** The runs that the fleet lost, by id: a lost line named them, or a read answered 404. */
  lost?: Record<string, true>;
}

/** The state of one worker: a Task of the workers of an agent, or a member of the fleet with no Task. */
export interface WorkerState {
  /** The name of its member, atespace/name, as the events name it. */
  member: string;
  /** The name of the worker, such as crew-0. */
  name: string;
  /** The agent whose workers hold it, or "" for a member of the fleet with no Task. */
  agent: string;
  /** The phase of its Task, or the phase that the state of a member with no Task stands for, or "" when the page cannot tell. */
  phase: string;
  /** The state of its member: live, quiet, or stopped, or "" when the fleet does not list it. */
  state: string;
  /** False for a worker of an older configuration. */
  current: boolean;
  /** The open runs that it holds. */
  runs: string[];
  /** True while it holds an open run. */
  busy: boolean;
  /** True when the Task says that it is blocked. */
  blocked: boolean;
  /** When the fleet last saw its member. */
  lastSeen: string;
}

/** factsOf puts the facts together. Without the open runs, the count of active runs of the fleet view stands in. */
export function factsOf(fleet: Fleet | null | undefined, runs: Record<string, Run> = {}, openRuns = false, lost: Record<string, true> = {}): Facts {
  return { fleet: fleet || null, runs, openRuns, lost };
}

/** runOf is a run that the page holds and the fleet did not lose. A run of the archive is on no worker, so it does not count. */
function runOf(f: Facts, id: string): Run | undefined {
  if (!id || (f.lost && f.lost[id])) return undefined;
  const r = f.runs[id];
  return r && r.archived ? undefined : r;
}

/** The run states that are not finished: a worker that holds such a run is busy. */
const OPEN = new Set(['queued', 'running', 'input-required', 'suspended']);

/** The run states that decide the presence of a seat without the phase of its worker. */
const DECIDES = new Set(['failed', 'input-required', 'queued', 'running', 'suspended']);

/** shortName is the name of a member without its atespace. */
const shortName = (member: string): string => member.slice(member.lastIndexOf('/') + 1);

/**
 * phaseOfState is the phase that the state of a member stands for, as the
 * workbench maps them: live runs, quiet sleeps, and stopped runs no more.
 */
function phaseOfState(m: FleetMember | undefined): string {
  if (!m) return '';
  if (m.self) return 'Running';
  switch (m.state) {
    case 'live':
      return 'Running';
    case 'quiet':
    case 'suspended':
      return 'Suspended';
    case 'stopped':
      return 'Failed';
  }
  return '';
}

interface Index {
  /** The workers of the agents, in the order of the fleet. */
  list: WorkerState[];
  /** Every worker and every member, by its full name and by its short name. */
  by: Map<string, WorkerState>;
}

const indexes = new WeakMap<Facts, Index>();

/** indexOf builds the state of each worker once per set of facts. */
function indexOf(f: Facts): Index {
  const known = indexes.get(f);
  if (known) return known;
  const list: WorkerState[] = [];
  const by = new Map<string, WorkerState>();
  const fleet = f.fleet;
  if (fleet) {
    const held = new Map<string, string[]>();
    for (const r of Object.values(f.runs)) {
      if (!r || !r.member || r.archived || !OPEN.has(r.state) || (f.lost && f.lost[r.id])) continue;
      const k = shortName(r.member);
      held.set(k, [...(held.get(k) || []), r.id]);
    }
    const members = fleet.members || [];
    const memberOf = (full: string, name: string) => members.find((m) => m.name === full) || members.find((m) => m.name === name);
    const stateOf = (full: string, name: string, m: FleetMember | undefined, phase: string, agent: string, current: boolean): WorkerState => {
      // A run names its worker as atespace/name, or by its name alone.
      const runs = (held.get(name) || []).filter((id) => f.runs[id].member === full || f.runs[id].member === name);
      // Before the page reads the open runs, the count of the fleet view stands in.
      const busy = runs.length > 0 || (!f.openRuns && !!m && (m.active || 0) > 0);
      return { member: full, name, agent, phase, state: m ? m.state : '', current, runs, busy, blocked: !!(m && m.blockedReason), lastSeen: m ? m.lastSeen : '' };
    };
    for (const p of fleet.pools || []) {
      for (const t of p.tasks || []) {
        const full = p.atespace ? p.atespace + '/' + t.name : t.name;
        const m = memberOf(full, t.name);
        const w = stateOf(full, t.name, m, t.phase || phaseOfState(m), p.agent, t.current !== false);
        list.push(w);
        by.set(full, w);
        if (!by.has(t.name)) by.set(t.name, w);
      }
    }
    // A member with no Task, such as the front itself, is no worker of an agent, but a run can sit on it.
    for (const m of members) {
      if (by.has(m.name)) continue;
      const w = stateOf(m.name, shortName(m.name), m, phaseOfState(m), '', true);
      by.set(m.name, w);
      if (!by.has(w.name)) by.set(w.name, w);
    }
  }
  const out = { list, by };
  indexes.set(f, out);
  return out;
}

/** workerStates lists the state of each worker of the agents, in the order of the fleet. */
export function workerStates(f: Facts): WorkerState[] {
  return indexOf(f).list;
}

/** workerOf returns the state of a worker or a member, by its full name or its name alone. */
export function workerOf(f: Facts, member: string): WorkerState | undefined {
  if (!member) return undefined;
  const by = indexOf(f).by;
  return by.get(member) || by.get(shortName(member));
}

/** newestRun is the id of the newest run of a seat, or "". */
const newestRun = (m: Pick<Member, 'runs'>): string => (m.runs && m.runs.length ? m.runs[m.runs.length - 1] : '');

/**
 * seatPresence is the presence of a seat, from derivePresence of the newest
 * run of the seat and the phase of the worker that holds it. Where the page
 * lacks the run, or lacks the phase for a finished run, the presence of the
 * bridge stands. A run that the fleet lost counts as missing, and so does a
 * run on a worker that left the fleet view, as after a roll of the workers.
 * A seat whose question waits for you needs you, unless it is fired or in
 * error.
 */
export function seatPresence(f: Facts, m: Pick<Member, 'fired' | 'presence' | 'runs' | 'question'>): Presence {
  const p = runPresence(f, m);
  // A question of the seat waits for you (the question of the member).
  return m.question && p !== 'fired' && p !== 'error' ? 'needs-you' : p;
}

/** runPresence is the presence of a seat from its newest run and its worker, as seatPresence says it without a question. */
function runPresence(f: Facts, m: Pick<Member, 'fired' | 'presence' | 'runs'>): Presence {
  if (m.fired) return 'fired';
  const run = runOf(f, newestRun(m));
  if (!run) return m.presence;
  const w = run.member ? workerOf(f, run.member) : undefined;
  if (run.member && !w && f.fleet) return m.presence;
  if (w && w.phase) return derivePresence({ run, taskPhase: w.phase, blocked: w.blocked });
  // A finished run on a worker whose phase the page does not know: idle or asleep, the bridge says which.
  if (DECIDES.has(run.state)) return derivePresence({ run, blocked: !!(w && w.blocked) });
  return m.presence;
}

/** The light of an agent from its workers, one object per word, so a selector keeps its identity. */
const AWAKE = phaseOf('Running');
const ASLEEP = phaseOf('Suspended');
const STARTING = phaseOf('Pending');
const FAILED = phaseOf('Failed');

/** What a status is about: a seat of a bridge, a worker by its name, or an agent by its workers. */
export type Subject = { seat: Pick<Member, 'fired' | 'presence' | 'runs' | 'question'> } | { worker: string } | { agent: string };

/**
 * statusOf is the status of a seat, a worker, or an agent, as a light and
 * its word. Every screen takes its words from here.
 *
 * - A seat: its presence (seatPresence), and waiting for a worker while its
 *   newest run waits in the queue.
 * - A worker: the phase of its Task, as awake, asleep, starting, failed, or
 *   stopping. null for a worker that the page does not know.
 * - An agent: awake when one of its workers is up, starting when one
 *   starts, failed when every one failed, else asleep. null for an agent
 *   with no worker.
 */
export function statusOf(f: Facts, s: Subject): Light | null {
  if ('seat' in s) {
    const run = runOf(f, newestRun(s.seat));
    return seatLight(seatPresence(f, s.seat), run ? run.state : undefined);
  }
  if ('worker' in s) {
    const w = workerOf(f, s.worker);
    return w ? phaseOf(w.phase) : null;
  }
  const ws = workerStates(f).filter((w) => w.agent === s.agent);
  if (ws.length === 0) return null;
  if (ws.some((w) => w.phase === 'Running')) return AWAKE;
  if (ws.some((w) => w.phase === 'Pending')) return STARTING;
  if (ws.every((w) => w.phase === 'Failed')) return FAILED;
  return ASLEEP;
}

/** awakeCount counts the workers of the fleet that are awake, for the headers. */
export function awakeCount(f: Facts): number {
  return workerStates(f).filter((w) => statusOf(f, { worker: w.member }) === AWAKE).length;
}

/**
 * awakeFor reports whether a read of a run finds its worker awake: true
 * while the run works or its worker is up, false while its worker sleeps
 * or starts, and null when the page cannot tell. A read of a run that does
 * not work goes to its worker and wakes it, so the page reads such a run
 * only on an action of the person.
 */
export function awakeFor(f: Facts, run: Pick<Run, 'state' | 'member'> | undefined): boolean | null {
  if (!run) return null;
  if (run.state === 'queued' || run.state === 'running') return true;
  const w = run.member ? workerOf(f, run.member) : undefined;
  if (!w || !w.phase) return null;
  return w.phase === 'Running';
}

/** The lamps of the readout of the fleet, in the order of attention. */
export const LAMP_ORDER = ['failed', 'working', 'awake', 'starting', 'asleep', 'stopping'] as const;
export type LampKind = (typeof LAMP_ORDER)[number];

/** One lamp of the readout: a worker and its kind. */
export interface Lamp {
  kind: LampKind;
  /** The name of the worker, such as crew-0. */
  worker: string;
  /** The agent whose workers hold it. */
  agent: string;
}

/** The readout of the fleet: one lamp per worker, and the count of each kind. */
export interface Readout {
  lamps: Lamp[];
  counts: Record<LampKind, number>;
}

/**
 * lampOf is the kind of the lamp of a worker: failed, working while it is
 * awake and holds an open run, awake while it holds none, starting,
 * asleep, or stopping. A worker that sleeps with an open run, such as a run
 * that waits for a decision, is asleep.
 */
export function lampOf(w: Pick<WorkerState, 'phase' | 'busy' | 'blocked'>): LampKind {
  if (w.blocked || w.phase === 'Failed') return 'failed';
  if (w.phase === 'Running') return w.busy ? 'working' : 'awake';
  if (w.phase === 'Pending') return 'starting';
  if (w.phase === 'Terminating') return 'stopping';
  return 'asleep';
}

/** readoutOf builds the readout of the fleet from the state of each worker, with its lamps in the order of attention. */
export function readoutOf(f: Facts): Readout {
  const counts = Object.fromEntries(LAMP_ORDER.map((k) => [k, 0])) as Record<LampKind, number>;
  const lamps = workerStates(f).map((w) => ({ kind: lampOf(w), worker: w.name, agent: w.agent }));
  for (const l of lamps) counts[l.kind]++;
  const rank = (k: LampKind) => LAMP_ORDER.indexOf(k);
  lamps.sort((a, b) => rank(a.kind) - rank(b.kind));
  return { lamps, counts };
}
