// The page asks the backend only what exists: the skills of an agent that
// the front can answer, and a run that the fleet did not lose. A 404 there
// means none, in silence, and the page does not ask again.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setFetch, type FetchLike } from '../api/client';
import type { Fleet } from '../api/types';
import { forgetRuns, loadAgentSkills, loadRunOnce, skillsAnswerFor } from './actions';
import { ensureRuns, forgetLoads } from './fetchers';
import { store } from './store';

const FLEET: Fleet = {
  name: 'front-0',
  members: [
    { name: 'default/crew-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [{ name: 'migrator' }, { name: 'scribe' }], active: 0, inputRequired: 0 },
    { name: 'default/lab-0', state: 'quiet', lastSeen: '', canForward: true, accessMode: '', agents: [{ name: 'paybot' }, { name: 'bootstrap' }], active: 0, inputRequired: 0 },
  ],
  pools: [{ name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }] }],
};

let old: FetchLike | null = null;
let seen: string[] = [];

/** answer serves 404 for every path, as a front that holds none of these. */
function answer404(): void {
  seen = [];
  old = setFetch(async (input) => {
    seen.push(String(input));
    return new Response(JSON.stringify({ status: 404, detail: 'not here' }), { status: 404, headers: { 'Content-Type': 'application/problem+json' } });
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  store.dispatch({ type: 'agent-skills-forget' });
  forgetRuns();
});
afterEach(() => {
  if (old) setFetch(old);
  old = null;
});

describe('the skills of an agent', () => {
  it('come from the front for a pool, a worker of a pool, or a profile of the front, and not for a member outside the pools', () => {
    const s = { fleet: FLEET, agents: [{ name: 'default', role: 'owner' }] };
    expect(skillsAnswerFor(s, 'migrator')).toBe(true);
    expect(skillsAnswerFor(s, 'scribe')).toBe(true);
    expect(skillsAnswerFor(s, 'default')).toBe(true);
    expect(skillsAnswerFor(s, 'paybot')).toBe(false);
    // Before the page knows the fleet and the profiles, it asks.
    expect(skillsAnswerFor({ fleet: null, agents: null }, 'paybot')).toBe(true);
  });

  it('are none without a request for a profile that the front cannot answer, and none in silence after a 404', async () => {
    store.dispatch({ type: 'fleet', fleet: FLEET });
    store.dispatch({ type: 'agents', agents: [{ name: 'default', role: 'owner' }] });
    answer404();
    await loadAgentSkills('paybot');
    await loadAgentSkills('bootstrap');
    expect(seen).toEqual([]);
    await loadAgentSkills('scribe');
    expect(seen).toEqual(['/v1/agents/scribe/skills']);
    expect(store.get().agentSkills).toEqual({ paybot: [], bootstrap: [], scribe: [] });
    // A second view asks nothing again.
    await loadAgentSkills('scribe');
    expect(seen).toHaveLength(1);
  });
});

describe('a run that the fleet lost', () => {
  it('is read once, and never again, also after a reset of the stream', async () => {
    answer404();
    ensureRuns(['run-gone-1', 'run-gone-2']);
    await flush();
    await flush();
    expect(seen.sort()).toEqual(['/v1/runs/run-gone-1', '/v1/runs/run-gone-2']);
    expect(store.get().lost['run-gone-1']).toBe(true);
    // A reset forgets the marks of the loads, and the page still asks nothing of a lost run.
    forgetLoads();
    ensureRuns(['run-gone-1', 'run-gone-2']);
    await loadRunOnce('run-gone-1');
    await flush();
    expect(seen).toHaveLength(2);
  });
});
