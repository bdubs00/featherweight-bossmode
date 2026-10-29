// The newest pass of the checks of done of a run, with the limit of a pass
// that ran after the run stopped at a limit of its budget.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Run } from '../api/types';
import { forgetPasses } from '../state/donepass';
import { DonePass } from './DonePass';
import { fakeFetch, mount, settle, unmountAll } from './testkit-a';

const base: Run = { id: 'run-a', agent: 'writer', state: 'failed', error: 'budget exceeded: maxToolCalls', seq: 40, createdAt: '', updatedAt: '' };

/** pass is the event fw.done.checked of a run at the seq before its end. */
const pass = (limit?: string) => ({ seq: 39, type: 'fw.done.checked', data: { passed: true, checks: [{ name: 'The answer', tool: 'answer', passed: true }], attempt: 1, attempts: 3, answer: 0, ...(limit ? { limit } : {}) } });

let f: ReturnType<typeof fakeFetch>;
let events: unknown[] = [];

beforeAll(() => {
  f = fakeFetch([['GET', /^\/v1\/runs\/run-[a-z]+\/events/, () => ({ events })]]);
});
beforeEach(() => {
  forgetPasses();
  events = [];
});
afterEach(unmountAll);
afterAll(() => f.restore());

describe('the checks of done of a run', () => {
  it('says that a pass ran after the run stopped at its limit of tool calls', async () => {
    events = [{ seq: 38, type: 'fw.tool.responded', data: {} }, pass('maxToolCalls'), { seq: 40, type: 'fw.run.finished', data: {} }];
    const el = mount(<DonePass run={{ ...base, done: { state: 'checked', attempt: 1, attempts: 3, checks: [{ name: 'The answer', tool: 'answer', passed: true }] } }} />);
    await settle();
    expect(el.querySelector('.done-pass-head')!.textContent).toBe('Its checks passed.');
    expect(el.querySelector('.done-pass-limit')!.textContent).toBe('Checked after its limit of tool calls.');
    expect([...el.querySelectorAll('.done-pass-checks li')].map((x) => x.textContent)).toEqual(['The answer: passed']);
    // The page reads the end of the ledger, where the pass sits.
    expect(f.seen.some((s) => /\/v1\/runs\/run-a\/events\?from=33&limit=8/.test(s.path))).toBe(true);
  });

  it('words each limit as the workbench does, and says nothing of a limit for a pass at the end of a turn', async () => {
    events = [pass('maxCallsPerTurn')];
    const el = mount(<DonePass run={{ ...base, id: 'run-b', done: { state: 'failed', checks: [{ tool: 'bash', passed: false, why: 'exit code 1' }] } }} />);
    await settle();
    expect(el.querySelector('.done-pass-head')!.textContent).toBe('Not done: 1 of 1 check failed.');
    expect(el.querySelector('.done-pass-limit')!.textContent).toBe('Checked after its limit of tool calls in one step.');
    expect(el.querySelector('.done-pass-checks li.failed')!.textContent).toBe('bash: failed: exit code 1');

    events = [pass()];
    const done = mount(<DonePass run={{ ...base, id: 'run-c', state: 'completed', error: '', done: { state: 'checked' } }} />);
    await settle();
    expect(done.querySelector('.done-pass-head')!.textContent).toBe('Its checks passed.');
    expect(done.querySelector('.done-pass-limit')).toBeNull();
  });

  it('reads nothing for a run that works or has no definition of done', async () => {
    const none = mount(<DonePass run={{ ...base, id: 'run-d' }} />);
    const working = mount(<DonePass run={{ ...base, id: 'run-e', state: 'running', done: { state: 'fixing', checks: [{ tool: 'bash', passed: false }] } }} />);
    await settle();
    expect(none.textContent).toBe('');
    expect(working.querySelector('.done-pass-head')!.textContent).toBe('A check failed, and it fixes its work.');
    expect(f.seen.some((s) => /run-[de]\/events/.test(s.path))).toBe(false);
  });
});
