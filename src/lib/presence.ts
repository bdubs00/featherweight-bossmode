// The presence of a member: its light, its word, and its icon, from the
// table of section 6.5 of the plan. Color is never the only signal, so each
// presence has a word and an icon of its own shape.

import type { Presence, Run, RunState } from '../api/types';

/** The tone of a light. Each tone is a color variable of the page. */
export type Tone = 'ok' | 'need' | 'quiet' | 'bad' | 'tint';

/** The icons of the statuses. ui/icons.tsx draws each one. */
export type StatusIcon = 'play' | 'hand' | 'ring' | 'moon' | 'cross' | 'slash' | 'hourglass' | 'check' | 'stop' | 'dot';

export interface Light {
  /** The word beside the light. */
  word: string;
  tone: Tone;
  icon: StatusIcon;
  /** True when the handle shows struck through. */
  struck?: boolean;
  /** A sentence for a screen reader and a tooltip. */
  label: string;
}

export const PRESENCE: Record<Presence, Light> = {
  working: { word: 'working', tone: 'ok', icon: 'play', label: 'Works on its task now.' },
  'needs-you': { word: 'needs you', tone: 'need', icon: 'hand', label: 'Waits for an approval, an answer, or a connection.' },
  idle: { word: 'idle', tone: 'quiet', icon: 'ring', label: 'Finished its turn. Its Task is live.' },
  asleep: { word: 'asleep', tone: 'quiet', icon: 'moon', label: 'Its Task sleeps. A message wakes it.' },
  error: { word: 'error', tone: 'bad', icon: 'cross', label: 'Its newest run failed, or its Task stopped.' },
  fired: { word: 'fired', tone: 'quiet', icon: 'slash', struck: true, label: 'Its seat is fired. It gets no message.' },
};

/** presenceOf returns the light of a presence. An unknown word shows as it is. */
export function presenceOf(p: string | undefined | null): Light {
  if (p && Object.prototype.hasOwnProperty.call(PRESENCE, p)) return PRESENCE[p as Presence];
  const word = p ? String(p).replace(/-/g, ' ') : 'unknown';
  return { word, tone: 'quiet', icon: 'dot', label: 'The workbench reports ' + word + '.' };
}

/** The phases of an ax Task, as the pools report them. */
export type TaskPhase = 'Pending' | 'Running' | 'Suspended' | 'Failed' | 'Terminating' | string;

/**
 * derivePresence applies the table of section 6.5: the newest run of the
 * member in the bridge and the state of its Task give the presence. The
 * workbench sends the presence, and the page uses this function only when
 * a member arrives without one.
 */
export function derivePresence(m: { fired?: boolean; run?: Pick<Run, 'state'> | null; taskPhase?: TaskPhase; blocked?: boolean }): Presence {
  if (m.fired) return 'fired';
  const state: RunState | undefined = m.run ? m.run.state : undefined;
  if (state === 'failed' || m.blocked || m.taskPhase === 'Failed' || m.taskPhase === 'Terminating') return 'error';
  if (state === 'input-required') return 'needs-you';
  if (m.taskPhase === 'Suspended') return 'asleep';
  if (state === 'queued' || state === 'running' || state === 'suspended') return 'working';
  return 'idle';
}

/** phaseOf returns the light of a Task phase, for the Fleet place. */
export function phaseOf(phase: string): Light {
  switch (phase) {
    case 'Running':
      return { word: 'running', tone: 'ok', icon: 'play', label: 'The Task is up.' };
    case 'Suspended':
      return { word: 'asleep', tone: 'quiet', icon: 'moon', label: 'The Task sleeps. A request wakes it.' };
    case 'Pending':
      return { word: 'starting', tone: 'tint', icon: 'hourglass', label: 'The Task starts.' };
    case 'Failed':
      return { word: 'failed', tone: 'bad', icon: 'cross', label: 'The Task failed.' };
    case 'Terminating':
      return { word: 'stopping', tone: 'quiet', icon: 'stop', label: 'The Task stops.' };
  }
  return { word: phase ? phase.toLowerCase() : 'unknown', tone: 'quiet', icon: 'dot', label: 'The Task reports ' + (phase || 'nothing') + '.' };
}

/** The status word of a run, as the shared views of /ui name it. */
export function runStatus(r: Pick<Run, 'state' | 'output'>): Light {
  switch (r.state) {
    case 'input-required':
      return { word: 'needs you', tone: 'need', icon: 'hand', label: 'Waits for an approval or an answer.' };
    case 'queued':
    case 'running':
    case 'suspended':
      return { word: 'working', tone: 'tint', icon: 'play', label: 'Is queued, running, or paused.' };
    case 'completed':
      return r.output
        ? { word: 'ready', tone: 'ok', icon: 'check', label: 'Completed with an answer to review.' }
        : { word: 'ended', tone: 'quiet', icon: 'ring', label: 'Completed with no answer.' };
    case 'failed':
      return { word: 'failed', tone: 'bad', icon: 'cross', label: 'Stopped with an error.' };
    case 'canceled':
      return { word: 'canceled', tone: 'quiet', icon: 'stop', label: 'Stopped by a person.' };
  }
  return presenceOf(r.state);
}
