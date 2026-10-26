import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { Item, Run } from '../api/types';
import { store } from '../state/store';
import { RunPane, RunView, bridgeWords, plainItems } from './RunPane';
import { at, bridge, fakeFetch, mount, seat, unmountAll } from './testkit-b';

const ME = 'alice@example.com';
const HEAD = '[bridge "walk-bridge-1" 01m5v2x2k9fv7dcgczteesgt8g] @reviewer from operator: ';
const RUN: Run = { id: 'run-reviewer', agent: 'reviewer', title: 'Review', state: 'completed', output: 'Done.', seq: 3, createdAt: at(8), updatedAt: at(11) };
const ITEMS: Item[] = [
  { seq: 1, time: at(8), kind: 'user', text: HEAD + 'reply in one short line: what is 2 plus 2?', who: ME },
  { seq: 2, time: at(9), kind: 'assistant', text: '@operator 2 plus 2 is 4.' },
  { seq: 3, time: at(10), kind: 'user', text: HEAD + 'Answer to your question in entry 5: Right, thanks.', who: ME },
  { seq: 4, time: at(11), kind: 'user', text: '[bridge "walk \\"one\\"" 01m5v2x2k9fv7dcgczteesgt8g] to everyone from migrator-1: I take cron.', who: ME },
];

let restore = () => {};
beforeAll(() => {
  const f = fakeFetch([
    ['GET', /^\/v1\/runs\/run-reviewer$/, () => RUN],
    ['GET', /^\/v1\/runs\/run-reviewer\/result$/, () => ({ title: 'Review', summary: 'Done.', steps: [], files: [] })],
    ['GET', /^\/v1\/runs\/run-reviewer\/transcript/, () => ({ run: RUN, items: ITEMS, next: 0, prev: 0 })],
  ]);
  restore = f.restore;
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: ME, name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'bridge', bridge: bridge('b1', 'walk-bridge-1', [seat('reviewer', 'reviewer', 'idle', { runs: ['run-reviewer'] })]) });
    store.dispatch({ type: 'run', run: RUN });
  });
});
afterAll(() => {
  unmountAll();
  restore();
});

const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

describe('the words of a message of a bridge in a run', () => {
  it('reads the sender and the words without the header of the server', () => {
    expect(bridgeWords(HEAD + 'Check the role.')).toEqual({ text: 'Check the role.', from: '' });
    expect(bridgeWords(HEAD + 'Answer to your question in entry 5: Right, thanks.')).toEqual({ text: 'Right, thanks.', from: '' });
    expect(bridgeWords('[bridge "a" 01abc] @a @b from migrator-1: Hi.')).toEqual({ text: 'Hi.', from: 'migrator-1' });
    expect(bridgeWords('Your task is in your instructions.')).toBeNull();
    // A message that holds no header comes back as it was, in the same list.
    const plain: Item[] = [{ seq: 1, time: at(1), kind: 'assistant', text: 'Hi.' }];
    expect(plainItems(plain)).toBe(plain);
  });

  it('shows the words of the person as theirs, and the words of a seat under its handle', async () => {
    const el = mount(<RunPane bridge="b1" runId="run-reviewer" handle="reviewer" />);
    await settle();
    const msgs = [...el.querySelectorAll('.thread .tmsg')].map((m) => ({ who: m.querySelector('.tmsg-head b') ? m.querySelector('.tmsg-head b')!.textContent : '', text: m.querySelector('.tmsg-plain, .md') ? m.querySelector('.tmsg-plain, .md')!.textContent!.trim() : '' }));
    expect(msgs.filter((m) => m.who === 'You').map((m) => m.text)).toEqual(['reply in one short line: what is 2 plus 2?', 'Right, thanks.']);
    expect(el.textContent).not.toContain('[bridge');
    expect(el.textContent).not.toContain('from operator');
    expect(el.textContent).not.toContain('entry 5');
    expect(msgs.find((m) => m.who === 'migrator-1')!.text).toBe('I take cron.');
    // The pane has a way back to the members at every width.
    expect(el.querySelector('.pane-head a.back.to-here')!.getAttribute('href')).toBe('#bridge/b1/roster');
  });
});

describe('the times of a run', () => {
  it('says when a run started, and when it ended, never the start as the end', () => {
    const el = mount(<RunView runId="run-reviewer" result={null} who="reviewer" />);
    const line = el.querySelector('.run-times')!;
    const times = [...line.querySelectorAll('time')].map((t) => t.getAttribute('datetime'));
    expect(line.textContent).toMatch(/^started .+, ended .+$/);
    expect(times[0]).not.toBe(times[1]);
    expect(times).toEqual([RUN.createdAt, RUN.updatedAt]);
    act(() => store.dispatch({ type: 'run', run: { ...RUN, state: 'running' } }));
    expect(el.querySelector('.run-times')!.textContent).toMatch(/^started /);
    expect(el.querySelector('.run-times')!.textContent).not.toContain('ended');
    expect(el.querySelectorAll('.run-times time').length).toBe(1);
  });
});
