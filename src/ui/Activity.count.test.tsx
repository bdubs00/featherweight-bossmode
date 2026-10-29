import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { ActivityList, ActivityMain, holdFor, pick } from './Activity';
import { Shell } from './Shell';
import { at, bridge, run, seat } from './testkit-b';
import { fakeApi, mount, settle, unmountAll } from './testkit-c';

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  forgetDuties();
  holdFor(0);
  pick('');
  location.hash = '#activity';
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    const extra = { unread: 1, lastSeq: 1 };
    store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Release notes', undefined, extra)] });
    store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Release notes', [seat('writer', 'writer', 'idle'), seat('reviewer', 'reviewer', 'idle')], extra) });
    store.dispatch({ type: 'run', run: run('run-writer', 'writer', 'completed') });
    store.dispatch({ type: 'channel', bridge: 'b1', page: { bridge: 'b1', messages: [{ seq: 1, at: at(4), from: { kind: 'agent', handle: 'writer', run: 'run-writer' }, text: 'The notes of the release are ready.' }], next: 0, prev: 0 }, mode: 'latest' });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

/** The inbox of alice: a team to check and a note that waits, and the one count of the front, which also counts a task of Needs you that Activity lists elsewhere. */
const INBOX = {
  items: [
    { kind: 'result', bridge: 'b1', agent: 'writer', text: 'Release notes: the agents finished, and the result waits for a check.', since: at(5) },
    { kind: 'note', agent: 'triage', run: 'run-9', note: 'triage.01', text: 'triage wrote a note, ports.md. Keep it?', since: at(6) },
  ],
  waiting: { count: 3, needsYou: 1, toCheck: 1, notes: 1 },
};

const rows = (el: HTMLElement) => [...el.querySelectorAll('.inbox-row')] as HTMLElement[];

describe('Activity and the one count', () => {
  it('shows the one count of the front on the app bar and on the head of Activity (plan A7)', async () => {
    api = fakeApi({ 'GET /v1/inbox': INBOX });
    const el = mount(<Shell route={{ place: 'activity' }} list={<ActivityList />} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    await settle();
    expect(el.querySelector('.place-count .sr')!.textContent).toBe('3 items need you');
    expect(el.querySelector('header .chip .sr')!.textContent).toBe('3 need you');
  });

  it('gives a team whose agents finished the keys of the board, Looks right and Needs work, never Done (plan A10)', async () => {
    api = fakeApi({ 'GET /v1/inbox': INBOX, 'POST /v1/work/review': { bridge: 'b1', reaction: 'up', closed: true } });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain item="v:b:b1" />
      </>,
    );
    await settle();
    // The newest message of the team is its result: it has no row of a message, and no key Done.
    expect(rows(el).map((r) => r.getAttribute('data-key'))).toEqual(['v:b:b1', 'n:triage.01']);
    const team = rows(el)[0];
    expect(team.querySelector('b')!.textContent).toBe('Release notes');
    expect(team.querySelector('.status-word')!.textContent).toBe('to check');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'Done')).toBe(false);
    const main = el.querySelector('.inbox-main-pane')!;
    expect(main.textContent).toContain('The notes of the release are ready.');
    expect(main.querySelector('.card a[href="#bridge/b1"]')!.textContent).toBe('Open the team');
    const keys = [...main.querySelectorAll('.result-keys button')].map((b) => b.textContent);
    expect(keys).toEqual(['Needs work', 'Looks right']);
    const right = [...main.querySelectorAll<HTMLButtonElement>('.result-keys button')].find((b) => b.textContent === 'Looks right')!;
    await act(async () => right.click());
    await settle();
    expect(api.calls.find((c) => c.method === 'POST' && c.path === '/v1/work/review')!.body).toEqual({ bridge: 'b1', verdict: 'up' });
  });

  it('shows a note of Know-how that waits, and opens what the agent learned to decide it (plan A17)', async () => {
    api = fakeApi({ 'GET /v1/inbox': INBOX });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain item="n:triage.01" />
      </>,
    );
    await settle();
    const note = rows(el).find((r) => r.getAttribute('data-key') === 'n:triage.01')!;
    expect([note.querySelector('b')!.textContent, note.querySelector('.status-word')!.textContent, note.querySelector('.inbox-text')!.textContent]).toEqual(['triage', 'needs you', 'triage wrote a note, ports.md. Keep it?']);
    const main = el.querySelector('.inbox-main-pane')!;
    const open = main.querySelector('.card a')!;
    expect([open.textContent, open.getAttribute('href')]).toEqual(['Read it and decide', '#knowhow/triage']);
    expect(main.textContent).toContain('Until you keep it, the agent does not use it.');
  });
});
