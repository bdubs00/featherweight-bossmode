// The agents of the fleet as the screens read them from the store: the
// picker of Add, the people list, the new-bridge screen, the Skills place,
// and the new-agent screen read one list, so an agent shows the same way
// everywhere. The list keeps its identity while its content stays the
// same, so a component that reads it redraws only on a real change.

import type { Agent } from '../api/types';
import { fleetAgents } from '../lib/agents';
import type { State } from './reducer';

let last: { fleet: State['fleet']; agents: State['agents']; rosters: State['rosters']; runs: State['runs'] } | null = null;
let lastList: Agent[] = [];
let lastKey = '';

/** knownAgents names the agents of which the page knows a run: the agents of the seats, and of the runs in the store. */
function knownAgents(s: Pick<State, 'rosters' | 'runs'>): Set<string> {
  const out = new Set<string>();
  for (const r of Object.values(s.rosters)) for (const h of r.order) if (r.byHandle[h]) out.add(r.byHandle[h].agent);
  for (const r of Object.values(s.runs)) if (r.agent) out.add(r.agent);
  return out;
}

/**
 * selectAgents is the list of the agents of the fleet (src/lib/agents.ts),
 * or null while the page knows neither the fleet nor the profiles of the
 * front.
 */
export function selectAgents(s: State): Agent[] | null {
  if (!s.fleet && !s.agents) return null;
  if (last && last.fleet === s.fleet && last.agents === s.agents && last.rosters === s.rosters && last.runs === s.runs) return lastList;
  last = { fleet: s.fleet, agents: s.agents, rosters: s.rosters, runs: s.runs };
  const list = fleetAgents(s.fleet, s.agents, knownAgents(s));
  const key = JSON.stringify(list);
  if (key !== lastKey) {
    lastKey = key;
    lastList = list;
  }
  return lastList;
}

/** forgetAgents drops the memory of selectAgents, for the tests. */
export function forgetAgents(): void {
  last = null;
  lastList = [];
  lastKey = '';
}
