// The agents of the fleet: the agents that the pools run and that the
// members of the fleet hold. GET /v1/agents names only the profiles of the
// front itself, so the page reads the fleet for the agents that a person
// can seat, list, and open. A profile of the front adds its description,
// its role, and its lists to an agent of the fleet of the same name.

import type { Agent, Fleet } from '../api/types';

/**
 * fleetAgents lists the agents of the fleet by name: the agent of each
 * pool, and each agent that a member other than the front holds. A profile
 * of the front itself, such as default, shows only when a pool runs it or
 * the page knows a run of it, such as a seat on a bridge, also when a
 * member holds a profile of that name. known names the agents with a run.
 * The role of an agent is the role of the person on it: the role that a
 * member names, else the role of the profile of the front, else "" when
 * the page cannot tell.
 */
export function fleetAgents(fleet: Fleet | null | undefined, own: Agent[] | null | undefined, known: Iterable<string> = []): Agent[] {
  const byName = new Map<string, Agent>();
  const add = (name: string): Agent => {
    let a = byName.get(name);
    if (!a) {
      a = { name, role: '' };
      byName.set(name, a);
    }
    return a;
  };
  if (fleet) {
    for (const p of fleet.pools || []) if (p.agent) add(p.agent);
    for (const m of fleet.members || []) {
      if (m.self) continue;
      for (const x of m.agents || []) {
        if (!x || !x.name) continue;
        const a = add(x.name);
        if (!a.role && x.role) a.role = x.role;
        if (!a.description && x.description) a.description = x.description;
      }
    }
  }
  const ran = new Set(known);
  const pooled = new Set(fleet ? (fleet.pools || []).map((p) => p.agent) : []);
  for (const o of own || []) {
    if (!pooled.has(o.name) && !ran.has(o.name)) {
      byName.delete(o.name);
      continue;
    }
    const a = byName.get(o.name);
    byName.set(o.name, { ...o, role: (a && a.role) || o.role || '', description: o.description || (a && a.description) });
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** canSeat reports whether the person can start runs of an agent: an owner or an operator can, and so can a person whose role the page cannot tell, because the backend checks it. */
export const canSeat = (a: Pick<Agent, 'role'>): boolean => !a.role || a.role === 'owner' || a.role === 'operator';

/** holdsTask reports whether the fleet view lists a Task of a member: a worker of a pool. */
export function holdsTask(fleet: Fleet, member: string): boolean {
  return (fleet.pools || []).some((p) => (p.tasks || []).some((t) => member === p.atespace + '/' + t.name || member === t.name));
}

/**
 * worksSeats reports whether an agent can work a seat of a bridge: a pool
 * runs it, or a worker of a pool holds it. A profile that only a member
 * outside the pools holds, such as the profile of an old test, has no
 * worker for a seat. Without the fleet, the page cannot tell, so every
 * agent counts.
 */
export function worksSeats(fleet: Fleet | null | undefined, agent: string): boolean {
  if (!fleet) return true;
  if ((fleet.pools || []).some((p) => p.agent === agent)) return true;
  return (fleet.members || []).some((m) => !m.self && (m.agents || []).some((a) => a && a.name === agent) && holdsTask(fleet, m.name));
}
