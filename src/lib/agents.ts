// The agents of the fleet: the agents that the pools run and that the
// members of the fleet hold. GET /v1/agents names only the profiles of the
// front itself, so the page reads the fleet for the agents that a person
// can seat, list, and open. A profile of the front adds its description,
// its role, and its lists to an agent of the fleet of the same name.

import type { Agent, Fleet } from '../api/types';

/**
 * fleetAgents lists the agents of the fleet by name: the agent of each
 * pool, and each agent that a member other than the front holds. A profile
 * of the front that no pool runs and no member holds shows only when the
 * page knows a run of it, such as a seat on a bridge. known names those
 * agents. The role of an agent is the role of the person on it: the role
 * that a member names, else the role of the profile of the front, else ""
 * when the page cannot tell.
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
  for (const o of own || []) {
    const a = byName.get(o.name);
    if (a) byName.set(o.name, { ...o, role: a.role || o.role || '', description: o.description || a.description });
    else if (ran.has(o.name)) byName.set(o.name, { ...o, role: o.role || '' });
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** canSeat reports whether the person can start runs of an agent: an owner or an operator can, and so can a person whose role the page cannot tell, because the backend checks it. */
export const canSeat = (a: Pick<Agent, 'role'>): boolean => !a.role || a.role === 'owner' || a.role === 'operator';
