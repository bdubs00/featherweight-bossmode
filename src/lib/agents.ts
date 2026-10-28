// The agents of the fleet: the agents that the pools run and that the
// members of the fleet hold. GET /v1/agents names only the profiles of the
// front itself, so the page reads the fleet for the agents that a person
// can seat, list, and open. A profile of the front adds its description,
// its role, and its lists to an agent of the fleet of the same name.

import type { Agent, Fleet, Whoami } from '../api/types';

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

/**
 * mayStart reports whether the person can start a run of some agent: an
 * admin, a person who can create agents, and a person with the role owner
 * or operator on an agent. A person whose roles name no agent, such as the
 * static token of a fleet whose agents all run in pools, may start too,
 * because the backend decides. A viewer of every agent may not.
 */
export function mayStart(me: Pick<Whoami, 'admin' | 'canCreate' | 'roles'> | null | undefined): boolean {
  if (!me) return false;
  const roles = Object.values(me.roles || {});
  return me.admin || me.canCreate || roles.length === 0 || roles.some((r) => r === 'owner' || r === 'operator');
}

type Roles = Pick<Whoami, 'admin' | 'roles'> & { canCreate?: boolean };

/**
 * viewsOnly reports whether the person only views an agent: the role
 * viewer on it, and no admin. The front refuses such a person a run and a
 * message of the agent, so the page offers no composer.
 */
export function viewsOnly(me: Roles | null | undefined, agent: string): boolean {
  return !!me && !me.admin && !!me.roles && me.roles[agent] === 'viewer';
}

/**
 * viewsAll reports whether the person views every agent and operates none,
 * such as a sponsor: roles that name agents, none of them owner or
 * operator, and no admin. The wiki refuses such a person, so the page reads
 * no page of the wiki for them. A person whose roles name no agent may, as
 * the server decides.
 */
export function viewsAll(me: Roles | null | undefined): boolean {
  if (!me || me.admin) return false;
  const roles = Object.values(me.roles || {});
  return roles.length > 0 && !roles.some((r) => r === 'owner' || r === 'operator');
}

/** mayCreateAgent reports whether the person can make an agent: an admin, or a person whom the server lets create one. */
export const mayCreateAgent = (me: Roles | null | undefined): boolean => !me || !!me.admin || me.canCreate !== false;

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
