// A seat whose newest run stopped at a limit of its budget, the
// freshness of a row of the bridges, and the words of the lines that go
// with them.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetRuns } from '../state/actions';
import { reduce, initialState } from '../state/reducer';
import { atLimit, derivePresence, presenceOf } from '../lib/presence';
import { lineWords } from '../lib/lines';
import { Roster } from './Roster';
import { BridgeList } from './BridgeList';
import { bridgeOf, entryOf, fakeFetch, memberOf, mount, settle, unmountAll } from './testkit-a';

const B = 'b-limit';
const LIMIT = 'budget exceeded: maxTurns: the run used 12 turns, and its limit is 12 (budget.maxTurns)';

let f: ReturnType<typeof fakeFetch>;

beforeAll(() => {
  f = fakeFetch([
    ['GET', /^\/v1\/pages$/, () => ({ pages: [] })],
    ['GET', /^\/v1\/runs\/run-reviewer$/, () => ({ id: 'run-reviewer', agent: 'reviewer', state: 'failed', error: LIMIT, seq: 9, createdAt: '', updatedAt: '' })],
    ['PATCH', /\/members\//, (body) => ({ ...memberOf('reviewer', { presence: 'working' }), ...(body as object) })],
  ]);
  forgetRuns();
  act(() => {
    store.dispatch({ type: 'agents', agents: [{ name: 'reviewer', role: 'owner' }, { name: 'migrator', role: 'owner' }] });
    store.dispatch({ type: 'bridge', bridge: { ...bridgeOf(B), members: [memberOf('reviewer', { presence: 'limit' }), memberOf('migrator-1', { presence: 'idle' })] } });
  });
});
afterEach(unmountAll);
afterAll(() => f.restore());

const row = (el: HTMLElement, handle: string) => [...el.querySelectorAll('li.member')].find((x) => x.querySelector('.handle')!.textContent === handle)!;

describe('a seat at its limit', () => {
  it('derives its own status from the run, not error', () => {
    expect(atLimit({ state: 'failed', error: LIMIT })).toBe(true);
    expect(atLimit({ state: 'failed', error: 'model: 400 Bad Request' })).toBe(false);
    expect(atLimit({ state: 'completed', error: LIMIT })).toBe(false);
    expect(derivePresence({ run: { state: 'failed', error: LIMIT }, taskPhase: 'Running' })).toBe('limit');
    expect(derivePresence({ run: { state: 'failed', error: LIMIT }, taskPhase: 'Suspended' })).toBe('limit');
    expect(derivePresence({ run: { state: 'failed', error: LIMIT }, taskPhase: 'Failed' })).toBe('error');
    expect(derivePresence({ run: { state: 'failed', error: 'model: 400' } })).toBe('error');
    expect(presenceOf('limit')).toMatchObject({ word: 'at its limit', tone: 'grey' });
  });

  it('shows at its limit with its limit, and Continue on its row and in its menu, which goes on with the same run', async () => {
    const el = mount(<Roster bridge={B} />);
    await settle();
    const li = row(el, 'reviewer');
    expect(li.querySelector('.status')!.textContent).toBe('at its limit');
    expect(li.querySelector('.led-red')).toBeNull();
    expect(li.querySelector('.act.fail')!.textContent).toBe('Stopped at its turn limit');
    expect(li.querySelector('a.open')!.getAttribute('aria-label')).toBe('reviewer, at its limit. Do the work of reviewer. Stopped at its turn limit. Open its conversation.');
    const key = li.querySelector('.member-keys button') as HTMLButtonElement;
    expect(key.textContent).toBe('Continue');
    expect(key.getAttribute('aria-label')).toBe('Continue reviewer');
    act(() => key.click());
    await settle();
    expect(f.seen.filter((s) => s.method === 'PATCH').pop()).toEqual({ method: 'PATCH', path: '/v1/bridges/b-limit/members/reviewer', body: { continue: true } });
    act(() => (li.querySelector('button[aria-label="More for reviewer"]') as HTMLButtonElement).click());
    const items = [...li.querySelectorAll('[role="menuitem"]')].map((x) => x.querySelector('.t')!.textContent);
    expect(items).toEqual(['Open conversation', 'Mute', 'Continue', 'Seat again', 'Change task', 'Fire']);
    expect(row(el, 'migrator-1').querySelector('.member-keys')).toBeNull();
  });

  it('words the lines of a continue and of the cap of turns', () => {
    const me = { subject: 'alice@example.com', name: 'Alice' };
    expect(lineWords({ event: 'task', text: 'alice@example.com continued reviewer' }, me)).toMatchObject({ text: 'You continued reviewer' });
    expect(lineWords({ event: 'task', text: 'bob@example.com continued reviewer' }, me)).toMatchObject({ text: 'bob continued reviewer' });
    expect(lineWords({ event: 'cap', text: 'The bridge reached its cap of 1000 turns' }, me)).toMatchObject({ text: 'The team reached its cap of 1000 turns' });
  });
});

describe('the freshness of a bridge', () => {
  it('follows the newest entry of the channel', () => {
    let s = reduce(initialState, { type: 'bridges', bridges: [bridgeOf('fr', { lastSeq: 4, lastAt: '2026-10-21T10:00:00Z' })] });
    const e = entryOf(5);
    s = reduce(s, { type: 'entry', bridge: 'fr', entry: e });
    expect(s.bridges.byId.fr.lastAt).toBe(e.at);
  });

  it('shows on each row how long ago its newest entry came, and working while a seat works', () => {
    const at = new Date(Date.now() - 14 * 60_000).toISOString();
    act(() => {
      store.dispatch({ type: 'bridges', bridges: [bridgeOf('fr-1', { title: 'Migrate cron', memberCount: 2, lastAt: at }), bridgeOf('fr-2', { title: 'Quiet one', memberCount: 1, createdAt: '2026-10-20T10:00:00Z' })] });
      store.dispatch({ type: 'bridge', bridge: { ...bridgeOf('fr-1', { title: 'Migrate cron', memberCount: 2, lastAt: at }), members: [memberOf('cron-1', { presence: 'working' }), memberOf('cron-2', { presence: 'idle' })] } });
    });
    const el = mount(<BridgeList current="" />);
    const one = [...el.querySelectorAll('a.brow')].find((a) => a.querySelector('.brow-title')!.textContent === 'Migrate cron')!;
    expect(one.querySelector('.brow-meta')!.textContent).toBe('2 membersworking14 min');
    expect(one.querySelector('time.brow-when')!.getAttribute('datetime')).toBe(at);
    expect(one.getAttribute('aria-label')).toBe('Migrate cron, working, last entry 14 minutes ago');
    // A bridge without an entry yet shows no time.
    const two = [...el.querySelectorAll('a.brow')].find((a) => a.querySelector('.brow-title')!.textContent === 'Quiet one')!;
    expect(two.querySelector('time')).toBeNull();
  });
});
