// The profile of one agent: its tools, its skills, its rules, and the role
// of the person on it, from GET /v1/agents/{name}. The front answers a
// profile of its own, and a profile that the workers of a pool run
// (docs/CONTRACT.md, section 13). The page reads each profile once per
// load. Without an answer, the agent of the fleet stands in: its name, its
// description, and the role of the person, with no lists.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Agent } from '../api/types';
import { selectAgents } from './agents';
import { useSelect } from './store';

const cache = new Map<string, Agent | null>();
const reads = new Map<string, Promise<Agent | null>>();

/** readProfile reads the profile of an agent once, or null when the page cannot read it. */
export function readProfile(name: string): Promise<Agent | null> {
  if (cache.has(name)) return Promise.resolve(cache.get(name) || null);
  let p = reads.get(name);
  if (!p) {
    p = api
      .agent(name)
      .then((a) => (a && a.name ? a : null))
      .catch(() => null)
      .then((a) => {
        cache.set(name, a);
        reads.delete(name);
        return a;
      });
    reads.set(name, p);
  }
  return p;
}

/** forgetProfiles drops the profiles that the page read, for the tests and after a change of a profile. */
export function forgetProfiles(): void {
  cache.clear();
  reads.clear();
}

/**
 * useProfile is the profile of an agent: undefined while it loads, the
 * profile of GET /v1/agents/{name} with the role of the person, else the
 * agent of the fleet, else null.
 */
/** useFleetAgent is the agent of the fleet or of the front of that name, with no read. */
export function useFleetAgent(name: string): Agent | undefined {
  return useSelect((s) => (selectAgents(s) || []).find((a) => a.name === name) || (s.agents || []).find((a) => a.name === name));
}

export function useProfile(name: string): Agent | null | undefined {
  const [got, setGot] = useState<{ name: string; a: Agent | null } | null>(() => (cache.has(name) ? { name, a: cache.get(name) || null } : null));
  const fleetEntry = useFleetAgent(name);
  useEffect(() => {
    if (!name) return;
    let live = true;
    readProfile(name).then((a) => live && setGot({ name, a }));
    return () => {
      live = false;
    };
  }, [name]);
  const read = got && got.name === name ? got.a : cache.has(name) ? cache.get(name) || null : undefined;
  return useMemo(() => {
    if (!name) return null;
    if (read === undefined) return undefined;
    if (read) return { ...read, role: read.role || (fleetEntry && fleetEntry.role) || '' };
    return fleetEntry || null;
  }, [name, read, fleetEntry]);
}
