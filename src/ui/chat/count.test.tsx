// The count of Needs you of the chat-first page is the one count of the
// front, the same number as the badge of the older places.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../../state/store';
import { forgetDuties } from '../../state/duties';
import { useAttention } from '../../state/activity';
import { at, bridge, seat } from '../testkit-b';
import { fakeApi, mount, settle, unmountAll } from '../testkit-c';
import { forgetChatData, useNeedsCount } from './data';
import { Sidebar } from './Sidebar';

let api: ReturnType<typeof fakeApi> | null = null;

beforeEach(() => {
  forgetDuties();
  forgetChatData();
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Release notes')] });
    store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Release notes', [seat('writer', 'writer', 'idle')]) });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
  api = null;
});

/** Counts shows the two counts that the page reads elsewhere: the title of the tab and the badge of the older places. */
function Counts() {
  return (
    <p>
      <span class="title-count">{useNeedsCount()}</span>
      <span class="badge-count">{useAttention()}</span>
    </p>
  );
}

const card = (id: string, stage: string, extra: object = {}) => ({ id, kind: 'conversation', title: 'Task ' + id, from: { kind: 'person', name: 'alice@example.com' }, stage, next: 'you', opened: at(1), since: at(2), agents: ['writer'], parts: { total: 1 }, links: { run: 'run-' + id }, costUSD: 0, ...extra });

describe('the one count of Needs you', () => {
  it('shows the count of the front in the sidebar, in the title of the tab, and on the badge of the older places', async () => {
    api = fakeApi({
      'GET /v1/inbox': {
        items: [{ kind: 'note', agent: 'triage', note: 'triage.01', text: 'triage wrote a note, ports.md. Keep it?', since: at(6) }],
        waiting: { count: 3, needsYou: 1, toCheck: 1, notes: 1 },
      },
      'GET /v1/work': { sentence: '', lanes: [], cards: [card('a', 'needs-you'), card('b', 'review'), card('c', 'stopped')], days: 30, waiting: { count: 3, needsYou: 1, toCheck: 1, notes: 1 } },
      'GET /v1/knowhow/waiting': { waiting: [] },
      'GET /v1/duties': { duties: [] },
    });
    const el = mount(
      <>
        <Sidebar route={{ view: 'home' }} />
        <Counts />
      </>,
    );
    await settle();
    await settle();
    expect(el.querySelector('.cf-needs .cf-sec-n')!.textContent).toBe('3');
    expect(el.querySelector('.title-count')!.textContent).toBe('3');
    expect(el.querySelector('.badge-count')!.textContent).toBe('3');
    // One row per counted task and per note: the stopped task lets itself go.
    expect([...el.querySelectorAll('.cf-needs .cf-need .cf-row-title')].map((t) => t.textContent)).toEqual(['Triage: Keep this note?', 'Writer needs you', 'Ready to sign off']);
  });
});
