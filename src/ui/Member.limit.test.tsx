import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { MemberMain } from './Member';
import { forgetTranscripts } from './Conversation';
import { at, fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';

const LIMIT = 'budget exceeded: maxTurns: the run used 12 turns, and its limit is 12 (budget.maxTurns)';
const RUN = { id: 'run-limit', agent: 'reviewer', state: 'failed' as const, error: LIMIT, seq: 9, createdAt: at(0), updatedAt: at(5), member: 'default/crew-0' };

let calls: Call[] = [];
let restore = () => {};

beforeEach(() => {
  const f = fakeFetch([
    ['GET', /^\/v1\/bridges\/b1\/messages/, () => ({ bridge: 'b1', messages: [], next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-limit\/transcript/, () => ({ run: RUN, items: [], next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-limit\/result$/, () => ({ runId: 'run-limit', title: 'Review', agent: 'reviewer', status: 'failed', error: LIMIT, started: at(0), changed: at(5) })],
    ['GET', /^\/v1\/runs\/run-limit$/, () => RUN],
    ['PATCH', /^\/v1\/bridges\/b1\/members\/checker$/, (b) => ({ handle: 'checker', agent: 'reviewer', task: 'Check the roles', runs: ['run-limit'], fired: false, muted: false, presence: 'working', ...(b as object) })],
  ]);
  calls = f.calls;
  restore = f.restore;
  forgetTranscripts();
  seedFleet();
  act(() => {
    store.dispatch({ type: 'member', bridge: 'b1', member: { handle: 'checker', agent: 'reviewer', task: 'Check the roles', runs: ['run-limit'], fired: false, muted: false, presence: 'limit' } });
    store.dispatch({ type: 'run', run: RUN });
  });
});

afterEach(() => {
  unmountAll();
  restore();
});

describe('the conversation of a seat at its limit', () => {
  it('says at its limit with its limit over the composer, and Continue goes on with the same run', async () => {
    const el = mount(<MemberMain bridge="b1" handle="checker" tab="chat" />);
    const bar = el.querySelector('.seat-bar')!;
    expect(bar.querySelector('.status-word')!.textContent).toBe('at its limit');
    expect(bar.querySelector('.led-red')).toBeNull();
    expect(bar.querySelector('.seat-bar-why')!.textContent).toBe('Stopped at its turn limit');
    const key = bar.querySelector('.seat-again') as HTMLButtonElement;
    expect(key.textContent).toBe('Continue');
    act(() => key.click());
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/v1/bridges/b1/members/checker', body: { continue: true } });
    act(() => (el.querySelector('button[aria-label="More for checker"]') as HTMLButtonElement).click());
    expect([...el.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Profile', 'Mute', 'Continue', 'Seat again', 'Change task', 'Fire']);
  });
});
