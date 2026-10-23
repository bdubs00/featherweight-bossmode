import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoutineRecord } from '../api/routines';
import { fakeApi } from '../ui/testkit-c';
import { store } from './store';
import { forgetRoutines, loadRoutine, loadRoutines, move, routineChanged, routines, useRoutinesView } from './routines';
import { mount, unmountAll } from '../ui/testkit-c';

const rec = (name: string, standing: RoutineRecord['standing'], updatedAt = '2026-10-22T09:00:00Z'): RoutineRecord => ({
  agent: 'triage',
  routine: { name, version: 1, steps: [] },
  standing,
  ready: false,
  history: [],
  createdAt: '2026-10-01T09:00:00Z',
  updatedAt,
});
const withEvidence = (r: RoutineRecord): RoutineRecord => ({ ...r, evidence: { days: [], questions: {}, disagreements: [], sentBack: { applied: 0, agreed: 0 } } });

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

let api: ReturnType<typeof fakeApi>;
beforeEach(() => forgetRoutines());
afterEach(() => {
  unmountAll();
  forgetRoutines();
  if (api) api.restore();
});

/** View stands for a pane of the place that shows. */
function View() {
  useRoutinesView();
  return null;
}

describe('the routines of the page', () => {
  it('reads the list once, then each routine that is not retired with its evidence', async () => {
    api = fakeApi({
      'GET /v1/routines': { routines: [rec('a', 'live'), rec('b', 'retired')] },
      'GET /v1/routines/triage/a': withEvidence(rec('a', 'live')),
    });
    await Promise.all([loadRoutines(), loadRoutines()]);
    expect(api.calls.map((c) => c.path)).toEqual(['/v1/routines', '/v1/routines/triage/a']);
    const s = routines.get();
    expect(s.order).toEqual(['triage/a', 'triage/b']);
    expect(s.byKey['triage/a'].evidence).toBeTruthy();
    expect(s.byKey['triage/b'].evidence).toBeUndefined();
  });

  it('reads a routine again on a routine event of the stream while the place is open, once for a burst', async () => {
    let n = 0;
    api = fakeApi({
      'GET /v1/routines': { routines: [rec('a', 'rehearsing')] },
      'GET /v1/routines/triage/a': () => ({ body: withEvidence(rec('a', ++n > 1 ? 'live' : 'rehearsing')) }),
    });
    await loadRoutines();
    // While no pane of the place shows, an event reads nothing.
    routineChanged({ kind: 'routine', agent: 'triage', name: 'a' });
    await flush();
    expect(api.calls.filter((c) => c.path === '/v1/routines/triage/a')).toHaveLength(1);
    mount(<View />);
    routineChanged({ kind: 'routine', agent: 'triage', name: 'a' });
    routineChanged({ kind: 'routine', agent: 'triage', name: 'a' });
    await flush();
    expect(api.calls.filter((c) => c.path === '/v1/routines/triage/a')).toHaveLength(2);
    expect(routines.get().byKey['triage/a'].standing).toBe('live');
  });

  it('keeps the record of a move when an older read answers after it', async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((r) => (release = r));
    let n = 0;
    api = fakeApi({
      'GET /v1/routines/triage/a': async () => {
        n++;
        if (n === 1) {
          await slow;
          return { body: withEvidence(rec('a', 'rehearsing')) };
        }
        return { body: withEvidence(rec('a', 'live')) };
      },
      'POST /v1/routines/triage/a/standing': { ok: true },
    });
    const first = loadRoutine('triage', 'a');
    await move('triage', 'a', 'live', 1);
    expect(routines.get().byKey['triage/a'].standing).toBe('live');
    release();
    await first;
    expect(routines.get().byKey['triage/a'].standing).toBe('live');
  });

  it('keeps the evidence of a routine whose record did not change when the list loads again', async () => {
    api = fakeApi({
      'GET /v1/routines': { routines: [rec('a', 'live')] },
      'GET /v1/routines/triage/a': withEvidence(rec('a', 'live')),
    });
    await loadRoutines();
    api.restore();
    api = fakeApi({ 'GET /v1/routines': { routines: [rec('a', 'live')] }, 'GET /v1/routines/triage/a': () => ({ status: 500, body: { detail: 'down' } }) });
    await loadRoutines();
    expect(routines.get().byKey['triage/a'].evidence).toBeTruthy();
  });

  it('reads the list again after a reset of the stream, and moves the id of a routine event', async () => {
    api = fakeApi({ 'GET /v1/routines': { routines: [] } });
    await loadRoutines();
    store.dispatch({ type: 'stream', event: { id: '77', kind: 'routine', data: { kind: 'routine', agent: 'triage', name: 'a' } } });
    expect(store.get().stream.lastId).toBe('77');
    store.dispatch({ type: 'stream', event: { id: '78', kind: 'reset', data: null } });
    await flush();
    expect(api.calls.filter((c) => c.path === '/v1/routines')).toHaveLength(2);
  });
});
