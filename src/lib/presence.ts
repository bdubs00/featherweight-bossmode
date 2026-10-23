// The presence of a member: its light and its word, from the table of
// section 6.5 of the plan. Color is never the only signal: each status has
// a word, and the light only repeats it. Two statuses of one color differ in
// their word, and a fired seat shows its word struck through.

import type { Presence, Run, RunState } from '../api/types';

/** The color of a status light. tokens.css holds each one as --led-<tone>. */
export type Tone = 'green' | 'amber' | 'red' | 'grey';

export interface Light {
  /** The word beside the light. */
  word: string;
  tone: Tone;
  /** True when the word shows struck through. */
  struck?: boolean;
  /** A sentence for a tooltip and a screen reader. */
  label: string;
}

export const PRESENCE: Record<Presence, Light> = {
  working: { word: 'working', tone: 'green', label: 'Works on its task now.' },
  'needs-you': { word: 'needs you', tone: 'amber', label: 'Waits for your approval, your answer, or a connection.' },
  waiting: { word: 'waiting for a worker', tone: 'grey', label: 'It has no run yet. It starts when a worker takes it.' },
  'not-started': { word: 'not started', tone: 'grey', label: 'The manager stopped before it seated this member. A message starts it.' },
  idle: { word: 'idle', tone: 'grey', label: 'Finished its turn. A message starts the next one.' },
  asleep: { word: 'asleep', tone: 'grey', label: 'Its worker sleeps. A message wakes it.' },
  limit: { word: 'at its limit', tone: 'grey', label: 'Stopped at a limit of its budget. Continue gives it more room.' },
  error: { word: 'error', tone: 'red', label: 'Its newest run failed, or its worker stopped.' },
  fired: { word: 'fired', tone: 'grey', struck: true, label: 'Fired. It gets no message.' },
};

/** The status of a seat whose run waits in the queue for a free worker. */
export const WAITING: Light = { word: 'waiting for a worker', tone: 'grey', label: 'Every worker of its agent is busy. It starts when one is free.' };

/** presenceOf returns the light of a presence. An unknown word shows as it is, in grey. */
export function presenceOf(p: string | undefined | null): Light {
  if (p && Object.prototype.hasOwnProperty.call(PRESENCE, p)) return PRESENCE[p as Presence];
  const word = p ? String(p).replace(/-/g, ' ') : 'unknown';
  return { word, tone: 'grey', label: 'The workbench reports ' + word + '.' };
}

/**
 * seatLight is the light of a seat on a roster. A seat that the workbench
 * calls working while its newest run still waits in the queue shows
 * "waiting for a worker", so the operator sees capacity where seating
 * happens.
 */
export function seatLight(presence: string | undefined | null, runState?: string): Light {
  if (presence === 'working' && runState === 'queued') return WAITING;
  return presenceOf(presence);
}

/**
 * atLimit reports whether a run stopped at a limit of its budget: no fault,
 * and Continue goes on with the same run with more room.
 */
export function atLimit(run: Pick<Run, 'state' | 'error'> | null | undefined): boolean {
  return !!run && run.state === 'failed' && /^budget exceeded\b/.test(run.error || '');
}

/** The phases of an ax Task, as the fleet view reports them. */
export type TaskPhase = 'Pending' | 'Running' | 'Suspended' | 'Failed' | 'Terminating' | string;

/**
 * derivePresence applies the table of section 6.5: the newest run of the
 * member in the bridge and the phase of the Task that holds it give the
 * presence, as the workbench derives it. A Task that sleeps or starts
 * counts as asleep, and a Task that fails or stops counts as an error. A
 * run that stopped at a limit of its budget is at its limit, not an error.
 * statusOf of src/lib/status.ts calls it for every seat whose facts the
 * page holds.
 */
export function derivePresence(m: { fired?: boolean; run?: Pick<Run, 'state' | 'error'> | null; taskPhase?: TaskPhase; blocked?: boolean }): Presence {
  if (m.fired) return 'fired';
  const state: RunState | undefined = m.run ? m.run.state : undefined;
  if (m.blocked || m.taskPhase === 'Failed' || m.taskPhase === 'Terminating') return 'error';
  if (atLimit(m.run)) return 'limit';
  if (state === 'failed') return 'error';
  if (state === 'input-required') return 'needs-you';
  if (m.taskPhase === 'Suspended' || m.taskPhase === 'Pending') return 'asleep';
  if (state === 'queued' || state === 'running' || state === 'suspended') return 'working';
  return 'idle';
}

/** The lights of the phases of a worker. One object per phase, so a selector that returns one keeps its identity. */
const PHASES: Record<string, Light> = {
  Running: { word: 'awake', tone: 'green', label: 'The worker is up.' },
  Suspended: { word: 'asleep', tone: 'grey', label: 'The worker sleeps. A request wakes it.' },
  Pending: { word: 'starting', tone: 'grey', label: 'The worker starts.' },
  Failed: { word: 'failed', tone: 'red', label: 'The worker failed.' },
  Terminating: { word: 'stopping', tone: 'grey', label: 'The worker stops.' },
};

/** phaseOf returns the light of a worker from the phase of its Task. */
export function phaseOf(phase: string): Light {
  if (phase && Object.prototype.hasOwnProperty.call(PHASES, phase)) return PHASES[phase];
  return { word: phase ? phase.toLowerCase() : 'unknown', tone: 'grey', label: 'The worker reports ' + (phase || 'nothing') + '.' };
}

/** The status of a run, in the words of the page. */
export function runStatus(r: Pick<Run, 'state' | 'output'>): Light {
  switch (r.state) {
    case 'input-required':
      return { word: 'needs you', tone: 'amber', label: 'Waits for your approval or your answer.' };
    case 'queued':
      return { word: 'waiting for a worker', tone: 'grey', label: 'Waits in the queue for a free worker.' };
    case 'running':
    case 'suspended':
      return { word: 'working', tone: 'green', label: 'Runs, or pauses between two steps.' };
    case 'completed':
      return r.output
        ? { word: 'ready', tone: 'grey', label: 'Finished with an answer to review.' }
        : { word: 'ended', tone: 'grey', label: 'Finished with no answer.' };
    case 'failed':
      return { word: 'failed', tone: 'red', label: 'Stopped with an error.' };
    case 'canceled':
      return { word: 'stopped', tone: 'grey', label: 'A person stopped it.' };
  }
  return presenceOf(r.state);
}
