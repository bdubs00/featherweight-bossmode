// Make this a job: the readback of a channel lets the person pick the agent
// of the channel that runs the job, and the job posts in that channel.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { TaskPlan } from '../../api/types';
import { store } from '../../state/store';
import { bridge, seat } from '../testkit-b';
import { fakeApi, mount, settle, unmountAll } from '../testkit-c';
import { MakeJob } from './MakeJob';

let api: ReturnType<typeof fakeApi> | null = null;

beforeEach(() => {
  act(() => {
    store.dispatch({ type: 'bridge', bridge: bridge('br-notes', 'Release notes for 2.4', [seat('scribe', 'writer', 'idle'), seat('reviewer-2', 'reviewer', 'idle')], { goal: 'Draft the release notes of 2.4.' }) });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
  api = null;
});

/** planOf answers the plan of the channel for the agent that the request names, else the first. */
function planOf(handle: string): TaskPlan {
  const agent = handle === 'reviewer-2' ? 'reviewer' : 'writer';
  return {
    words: 'Draft the release notes of 2.4. every Friday at 4pm',
    kind: 'repeat',
    title: 'Draft the release notes of 2.4',
    who: [{ agent, name: agent, does: 'does it in the channel', handle }],
    others: [],
    members: [
      { handle: 'scribe', agent: 'writer', name: 'Writer', task: 'The task of scribe' },
      { handle: 'reviewer-2', agent: 'reviewer', name: 'Reviewer', task: 'The task of reviewer-2' },
    ],
    when: { said: 'every friday at 4pm', readback: 'Every Friday at 4:00 PM, Berlin time.', next: [] },
    cost: { basis: 'The job spends nothing of its own: ' + handle + ' spends from its budget in the channel.', per: 'channel', runsPerMonth: 4 },
    asks: [],
    quiet: [],
    tell: 'each',
    result: 'A post in the channel Release notes for 2.4 for each run',
    gaps: [],
    problems: [],
    start: { duty: { name: 'draft-the-release-notes-of-2-4', agent, when: { schedule: { repeat: 'weekly' } }, do: { post: { bridge: 'br-notes', to: [handle], message: 'Draft the release notes of 2.4.' } }, limits: { overlap: 'skip' } } as never },
    open: '#duties/draft-the-release-notes-of-2-4',
  };
}

describe('Make this a job', () => {
  it('reads the channel back, lets the person pick its agent, and makes a job that posts in the channel with no cost', async () => {
    api = fakeApi({
      'POST /v1/work/plan': (c) => ({ body: planOf(((c.body as { handle?: string }).handle as string) || 'scribe') }),
      'PUT /v1/duties/draft-the-release-notes-of-2-4': (c) => ({ body: { ...(c.body as object), readback: 'Every Friday at 4:00 PM, Berlin time.' } }),
      'GET /v1/duties': { duties: [] },
      'GET /v1/work': { sentence: '', lanes: [], cards: [], days: 30 },
    });
    let closed = false;
    const el = mount(<MakeJob bridge="br-notes" onClose={() => (closed = true)} />);
    const when = el.querySelector('#cf-job-when input, input#cf-job-when, input') as HTMLInputElement;
    act(() => {
      when.value = 'every Friday at 4pm';
      when.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const read = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Read it back')!;
    act(() => read.click());
    await settle();
    const first = api.calls.find((c) => c.method === 'POST')!;
    expect(first.body).toEqual({ words: 'Draft the release notes of 2.4. every Friday at 4pm', agent: 'writer', bridge: 'br-notes' });
    // The agents of the channel are the choices, and the job asks for no amount.
    const choices = [...el.querySelectorAll('input[type=radio]')] as HTMLInputElement[];
    expect(choices.map((c) => c.value)).toEqual(['scribe', 'reviewer-2']);
    expect(choices[0].checked).toBe(true);
    expect(el.textContent).not.toContain('The most one run can cost');
    expect(el.textContent).toContain('A post in the channel Release notes for 2.4 for each run');
    // A pick reads the plan back with that agent.
    act(() => {
      choices[1].dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    const second = api.calls.filter((c) => c.method === 'POST')[1];
    expect((second.body as { handle?: string }).handle).toBe('reviewer-2');
    const make = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Make the job')!;
    act(() => make.click());
    await settle();
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect((put.body as { do: { post: { bridge: string; to: string[] } } }).do.post).toEqual({ bridge: 'br-notes', to: ['reviewer-2'], message: 'Draft the release notes of 2.4.' });
    expect(closed).toBe(true);
  });
});
