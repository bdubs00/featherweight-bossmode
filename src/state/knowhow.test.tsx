import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JournalEntry, NoteRecord, WaitingChange } from '../api/knowhow';
import { fakeApi, mount, unmountAll } from '../ui/testkit-c';
import { store } from './store';
import { decide, forgetKnowhow, knowhow, knowhowChanged, loadAgent, loadAllWaiting, loadNote, loadOlder, putAway, saveNote, setAskFirst, useKnowhowView, JOURNAL_PAGE } from './knowhow';

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const SUMMARY = {
  agent: 'triage',
  days: 7,
  costPerJob: { usd: 0.021, runs: 400, previousUsd: 0.025, trend: 'down' },
  doneByRoutines: { runs: 380, byRoutine: 140, share: 0.37 },
  notesCorrected: 3,
  normal: { runs: 380, doneWell: 346, byRoutine: 140, costPerJobUsd: 0.02 },
  heldBack: { runs: 20, doneWell: 16, byRoutine: 0, costPerJobUsd: 0.04 },
  compare: { enough: true, heldBack: 20, normal: 300, oneIn: 16, doneWellWithout: 0.8, doneWellWith: 0.91, line: 'Held back 1 in 16 runs.' },
};
/** A public id of the workbench: an id that starts with its time, and the agent in base64url. */
const pid = (n: number) => '01K8' + String(n).padStart(22, '0') + '-dHJpYWdl';
const entry = (id: string, at: string): JournalEntry => ({ id, at, agent: 'triage', what: 'learned', subject: { note: id + '.md', scope: 'agent' }, why: 'Two runs failed.', runs: ['r1'], by: 'review', undo: { revision: 1 } });
const WAIT: WaitingChange = { id: pid(1), at: '2026-10-27T09:00:00Z', agent: 'triage', what: 'learned', subject: { note: 'gotchas/vpn.md', scope: 'agent' }, why: 'Three runs passed with it.', by: 'review', text: 'The VPN portal needs the full domain.' };
const NOTE: NoteRecord = { agent: 'triage', scope: { kind: 'agent' }, name: 'mine.md', hash: 'h1', state: 'unchecked', description: 'Mine', by: 'person:alice@example.com', at: '2026-10-20T10:00:00Z', uses: 0, text: 'Old text.', sources: [{ ref: 'run:r9' }] };

/** routes answers the header of triage. */
const routes = (more: Record<string, unknown> = {}) => ({
  'GET /v1/knowhow/summary': SUMMARY,
  'GET /v1/knowhow/settings/triage': { agent: 'triage', askFirst: true, review: { on: true, agent: 'review', every: '24h0m0s' } },
  'GET /v1/knowhow/waiting': { waiting: [WAIT] },
  'GET /v1/knowhow/journal': { entries: [entry('a', '2026-10-27T10:00:00Z')] },
  ...more,
});

let api: ReturnType<typeof fakeApi>;
beforeEach(() => forgetKnowhow());
afterEach(() => {
  unmountAll();
  forgetKnowhow();
  if (api) api.restore();
});

/** View stands for a pane of the place that shows. */
function View() {
  useKnowhowView();
  return null;
}

describe('the know-how of an agent', () => {
  it('reads the numbers, the switch, what waits, and the journal of an agent', async () => {
    api = fakeApi(routes() as never);
    await loadAgent('triage');
    expect(api.calls.map((c) => c.path).sort()).toEqual(['/v1/knowhow/journal?agent=triage&limit=50', '/v1/knowhow/settings/triage', '/v1/knowhow/summary?agent=triage&days=7', '/v1/knowhow/waiting?agent=triage']);
    const a = knowhow.get().agents.triage;
    expect(a.summary!.notesCorrected).toBe(3);
    expect(a.settings).toMatchObject({ askFirst: true, review: { on: true } });
    expect(a.waiting!.map((w) => w.id)).toEqual([WAIT.id]);
    expect(a.journal!.map((e) => e.id)).toEqual(['a']);
    expect(a.more).toBe(false);
  });

  it('keeps the reason of a read that failed, and marks the place off only on the 404 that says Know-how is off', async () => {
    api = fakeApi({ ...routes(), 'GET /v1/knowhow/waiting': () => ({ status: 500, body: { detail: 'The store did not answer.' } }) } as never);
    await loadAgent('triage');
    expect(knowhow.get().agents.triage.errors.waiting).toBe('The store did not answer.');
    expect(knowhow.get().off).toBe(false);
    api.restore();
    // A 404 for an agent that the person cannot view is no reason to say that Know-how is off.
    api = fakeApi({});
    forgetKnowhow();
    await loadAgent('triage');
    expect(knowhow.get().off).toBe(false);
    api.restore();
    const off = 'Know-how is off on this server, because its bus keeps no store for it. An admin runs the server with the bus nats or mem.';
    api = fakeApi({ 'GET /v1/knowhow/journal': () => ({ status: 404, body: { detail: off } }), 'GET /v1/knowhow/summary': () => ({ status: 404, body: { detail: off } }) } as never);
    forgetKnowhow();
    await loadAgent('triage');
    expect(knowhow.get()).toMatchObject({ off: true, offReason: off });
  });

  it('reads older entries before the oldest one, by its id, and adds them at the end', async () => {
    const page = Array.from({ length: JOURNAL_PAGE }, (_, i) => entry(pid(100 - i), new Date(Date.UTC(2026, 9, 27, 10) - i * 60000).toISOString()));
    api = fakeApi(routes({ 'GET /v1/knowhow/journal': (c: { path: string }) => ({ body: { entries: c.path.includes('before=') ? [entry('old', '2026-10-01T10:00:00Z')] : page } }) }) as never);
    await loadAgent('triage');
    expect(knowhow.get().agents.triage.more).toBe(true);
    await loadOlder('triage');
    const last = api.calls[api.calls.length - 1];
    expect(last.path).toBe('/v1/knowhow/journal?agent=triage&limit=50&before=' + page[page.length - 1].id);
    const j = knowhow.get().agents.triage.journal!;
    expect(j).toHaveLength(JOURNAL_PAGE + 1);
    expect(j[j.length - 1].id).toBe('old');
    expect(knowhow.get().agents.triage.more).toBe(false);
  });

  it('turns the switch and keeps what the server answers', async () => {
    api = fakeApi(routes({ 'PUT /v1/knowhow/settings/triage': { agent: 'triage', askFirst: false, review: { on: true } } }) as never);
    await setAskFirst('triage', false);
    expect(api.calls[0].body).toEqual({ askFirst: false });
    expect(knowhow.get().agents.triage.settings).toMatchObject({ askFirst: false });
  });

  it('keeps a waiting change, then reads the agent again; a 409 reads it again too and goes on to the screen', async () => {
    api = fakeApi(routes({ ['POST /v1/knowhow/waiting/' + WAIT.id]: { kept: true, entry: null } }) as never);
    await loadAgent('triage');
    await decide('triage', WAIT.id, true);
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({ keep: true });
    expect(api.calls.filter((c) => c.path.startsWith('/v1/knowhow/waiting?'))).toHaveLength(2);
    api.restore();
    api = fakeApi(routes({ ['POST /v1/knowhow/waiting/' + WAIT.id]: () => ({ status: 409, body: { detail: 'a later change touched it' } }) }) as never);
    await expect(decide('triage', WAIT.id, true)).rejects.toMatchObject({ status: 409 });
    expect(api.calls.some((c) => c.path.startsWith('/v1/knowhow/waiting?'))).toBe(true);
  });

  it('reads the changes that wait for every agent, for the list of agents', async () => {
    api = fakeApi(routes() as never);
    await loadAllWaiting();
    expect(api.calls[0].path).toBe('/v1/knowhow/waiting');
    expect(knowhow.get().allWaiting!.map((w) => w.agent)).toEqual(['triage']);
  });

  it('keeps the switch and what waits for an agent when the list of every agent answers last', async () => {
    let release!: () => void;
    const late = new Promise<void>((r) => (release = r));
    api = fakeApi(
      routes({
        'GET /v1/knowhow/waiting?agent=triage': { waiting: [] },
        'GET /v1/knowhow/waiting': async () => {
          await late;
          return { body: { waiting: [] } };
        },
      }) as never,
    );
    const all = loadAllWaiting();
    await loadAgent('triage');
    expect(knowhow.get().agents.triage.settings).toMatchObject({ askFirst: true });
    release();
    await all;
    expect(knowhow.get().allWaiting).toEqual([]);
    expect(knowhow.get().agents.triage.settings).toMatchObject({ askFirst: true });
    expect(knowhow.get().agents.triage.waiting).toEqual([]);
  });
});

describe('a note', () => {
  it('saves the text for the version that the person read, with its sources, and says whether the change waits (202)', async () => {
    let n = 0;
    let puts = 0;
    api = fakeApi(
      routes({
        'GET /v1/knowhow/notes/triage/agent/mine.md': () => ({ body: ++n > 1 ? { ...NOTE, text: 'New text.', hash: 'h2' } : NOTE }),
        'PUT /v1/knowhow/notes/triage/agent/mine.md': () => (++puts === 1 ? { body: { note: { ...NOTE, text: undefined, hash: 'h2' } } } : { status: 202, body: { note: NOTE, waiting: { ...WAIT, what: 'updated' } } }),
      }) as never,
    );
    const rec = await loadNote(NOTE);
    expect(await saveNote(rec, 'New text.')).toBe(false);
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toEqual({ text: 'New text.', ifHash: 'h1', sources: [{ ref: 'run:r9' }] });
    expect(knowhow.get().notes['triage|agent||mine.md'].hash).toBe('h2');
    expect(await saveNote(knowhow.get().notes['triage|agent||mine.md'], 'Newer text.')).toBe(true);
  });

  it('reads a note again on a 412, keeps the error for the screen, and names the principal of a principal note', async () => {
    const duty = { ...NOTE, scope: { kind: 'principal' as const, principal: 'duty:nightly-sweep' }, name: 'gotchas/a b.md' };
    const path = '/v1/knowhow/notes/triage/principal/gotchas/a%20b.md';
    let n = 0;
    api = fakeApi({ ['GET ' + path + '?principal=duty%3Anightly-sweep']: () => ({ body: { ...duty, hash: ++n > 1 ? 'h2' : 'h1' } }), ['DELETE ' + path + '?principal=duty%3Anightly-sweep&ifHash=h1']: () => ({ status: 412, body: { detail: 'hash' } }) } as never);
    const rec = await loadNote(duty);
    await expect(putAway(rec)).rejects.toMatchObject({ status: 412 });
    expect(knowhow.get().notes['triage|principal|duty:nightly-sweep|gotchas/a b.md'].hash).toBe('h2');
  });
});

describe('the stream', () => {
  it('reads an agent again on a knowhow event only while the place shows, and moves the id of the event', async () => {
    api = fakeApi(routes() as never);
    await loadAgent('triage');
    knowhowChanged({ kind: 'knowhow', agent: 'triage' });
    await flush();
    expect(api.calls.filter((c) => c.path.startsWith('/v1/knowhow/summary'))).toHaveLength(1);
    mount(<View />);
    knowhowChanged({ kind: 'knowhow', agent: 'triage' });
    await flush();
    expect(api.calls.filter((c) => c.path.startsWith('/v1/knowhow/summary'))).toHaveLength(2);
    store.dispatch({ type: 'stream', event: { id: '91', kind: 'knowhow', data: { kind: 'knowhow', agent: 'triage' } } });
    expect(store.get().stream.lastId).toBe('91');
  });

  it('reads every agent again after a reset of the stream', async () => {
    api = fakeApi(routes() as never);
    await loadAgent('triage');
    store.dispatch({ type: 'stream', event: { id: '92', kind: 'reset', data: null } });
    await flush();
    expect(api.calls.filter((c) => c.path.startsWith('/v1/knowhow/summary'))).toHaveLength(2);
  });
});
