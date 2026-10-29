// The sign-off of a result: Looks right and Needs work go to POST
// /v1/work/review, which lands also on a run whose worker is gone, and the
// line that stays says what happened to the note.

import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { fakeApi, mount, settle, unmountAll } from '../testkit-c';
import { forgetAnswers } from './data';
import { SignOff } from './WayOut';

let api: ReturnType<typeof fakeApi> | null = null;

afterEach(() => {
  unmountAll();
  forgetAnswers();
  if (api) api.restore();
  api = null;
});

const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)!;

describe('SignOff', () => {
  it('sends Needs work on a run whose worker is gone to the check of the front, which keeps the note with the result', async () => {
    api = fakeApi({ 'POST /v1/work/review': { run: 'run-old', reaction: 'down', followUp: false, kept: true }, 'GET /v1/work': { sentence: '', lanes: [], cards: [], days: 7 }, 'GET /v1/inbox': { items: [] } });
    const el = mount(<SignOff run="run-old" title="The notes of Oct 24" result="The notes of Oct 24." />);
    act(() => button(el, 'Needs work').click());
    const box = el.querySelector('textarea')!;
    act(() => {
      box.value = 'Name the date in the title.';
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(el, 'Send back').click());
    await settle();
    const call = api.calls.find((c) => c.method === 'POST' && c.path === '/v1/work/review')!;
    expect(call.body).toEqual({ run: 'run-old', verdict: 'down', note: 'Name the date in the title.' });
    expect(el.querySelector('.cf-done')!.textContent).toContain('your note stays with the result');
  });

  it('sends Looks right on a channel to the check of the channel', async () => {
    api = fakeApi({ 'POST /v1/work/review': { bridge: 'br-1', reaction: 'up', followUp: false, closed: true }, 'GET /v1/work': { sentence: '', lanes: [], cards: [], days: 7 }, 'GET /v1/inbox': { items: [] } });
    const el = mount(<SignOff bridge="br-1" title="Release notes" result="The notes are ready." />);
    await act(async () => button(el, 'Looks right').click());
    await settle();
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({ bridge: 'br-1', verdict: 'up' });
    expect(el.querySelector('.cf-done')!.textContent).toContain('You marked this right');
  });
});
