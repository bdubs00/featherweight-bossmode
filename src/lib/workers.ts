// The workers of an agent, from the state of each worker that the page
// keeps (src/lib/status.ts). An agent has workers: the Tasks of the pools
// that run it. The page never says pool to an operator. Keep is the number
// of workers that the agent keeps, the wanted count of its pools. A worker
// is busy while it holds an open run, and free otherwise, also while it
// sleeps, because a request wakes it.

import type { BossConfig, Fleet, Template } from '../api/types';
import { workerStates, type Facts } from './status';

export interface Worker {
  /** The name of the worker, such as crew-0. */
  name: string;
  /** The name of its member, atespace/name, as the events name it. */
  member: string;
  /** The phase of its Task: Running, Suspended, Pending, Failed, or Terminating. */
  phase: string;
  awake: boolean;
  busy: boolean;
  /** False for a worker of an older configuration. */
  current: boolean;
}

export interface Workers {
  /** The number of workers that the agent keeps. */
  keep: number;
  workers: Worker[];
  awake: number;
  busy: number;
  free: number;
}

/** workersOf returns the workers of an agent. An agent with no worker gets zeros. */
export function workersOf(f: Facts | null | undefined, agent: string): Workers {
  const out: Workers = { keep: 0, workers: [], awake: 0, busy: 0, free: 0 };
  if (!f || !f.fleet) return out;
  for (const p of f.fleet.pools || []) if (p.agent === agent) out.keep += p.wanted || 0;
  for (const w of workerStates(f)) {
    if (w.agent !== agent) continue;
    const awake = w.phase === 'Running';
    out.workers.push({ name: w.name, member: w.member, phase: w.phase, awake, busy: w.busy, current: w.current });
    if (awake) out.awake++;
    if (w.busy) out.busy++;
  }
  out.free = out.workers.filter((w) => !w.busy && w.phase !== 'Failed' && w.phase !== 'Terminating').length;
  return out;
}

/**
 * poolName is the name of the pool that the front makes for a new agent:
 * the name in lower case, with a hyphen for each character that is not a
 * letter or a digit, and no hyphen at either end.
 */
export function poolName(agent: string): string {
  return String(agent || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** poolNameOf names the pool that runs an agent: the pool of the fleet view, else the pool that the front makes for it. */
export function poolNameOf(fleet: Fleet | null | undefined, agent: string): string {
  const p = fleet && fleet.pools ? fleet.pools.find((x) => x.agent === agent) : undefined;
  return p ? p.name : poolName(agent);
}

/** templatesOf reads the worker templates of the settings, or [] without them. */
export function templatesOf(config: BossConfig | null | undefined): Template[] {
  const t = config ? config.templates : null;
  if (!Array.isArray(t)) return [];
  return t.filter((x) => !!x && typeof x.name === 'string' && x.name !== '').map((x) => ({ name: x.name, default: !!x.default }));
}
