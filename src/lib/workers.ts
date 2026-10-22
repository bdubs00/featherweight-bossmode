// The workers of an agent, from the fleet view. An agent has workers: the
// Tasks of the pools that run it. The page never says pool to an operator.
// Keep is the number of workers that the agent keeps, the wanted count of
// its pools. A worker is busy while its fleet member has an active run, and
// free otherwise, also while it sleeps, because a request wakes it.

import type { BossConfig, Fleet, Template } from '../api/types';

export interface Worker {
  /** The name of the worker, such as crew-0. */
  name: string;
  /** The phase of its Task: Running, Suspended, Pending, Failed, or Terminating. */
  phase: string;
  awake: boolean;
  busy: boolean;
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
export function workersOf(fleet: Fleet | null | undefined, agent: string): Workers {
  const out: Workers = { keep: 0, workers: [], awake: 0, busy: 0, free: 0 };
  if (!fleet) return out;
  const active = new Map((fleet.members || []).map((m) => [m.name, m.active || 0]));
  for (const p of fleet.pools || []) {
    if (p.agent !== agent) continue;
    out.keep += p.wanted || 0;
    for (const t of p.tasks || []) {
      const busy = (active.get(p.atespace + '/' + t.name) || active.get(t.name) || 0) > 0;
      const awake = t.phase === 'Running';
      out.workers.push({ name: t.name, phase: t.phase, awake, busy });
      if (awake) out.awake++;
      if (busy) out.busy++;
    }
  }
  out.free = out.workers.filter((w) => !w.busy && w.phase !== 'Failed' && w.phase !== 'Terminating').length;
  return out;
}

/** awakeWorkers counts the workers of the whole fleet that are awake. */
export function awakeWorkers(fleet: Fleet | null | undefined): number {
  if (!fleet) return 0;
  let n = 0;
  for (const p of fleet.pools || []) for (const t of p.tasks || []) if (t.phase === 'Running') n++;
  return n;
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
