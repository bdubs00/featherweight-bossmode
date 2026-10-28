import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { awayWords, tellWords, REVIEW_LINE } from '../lib/duties';
import { ActivityList, ActivityMain, holdFor, pick } from './Activity';
import { AppBar } from './Shell';
import { noteProblem } from './ResultKeys';
import { at, run } from './testkit-b';
import { fakeApi, mount, settle, unmountAll } from './testkit-c';

let api: ReturnType<typeof fakeApi> | null = null;

beforeEach(() => {
  forgetDuties();
  holdFor(0);
  pick('');
  location.hash = '#activity';
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'bridges', bridges: [] });
    store.dispatch({ type: 'run', run: run('run-notes', 'scribe', 'completed', { title: 'Release notes of yesterday', output: '## For people who run the fleet\n\n- A pool keeps its workers.', metadata: { 'workbench.duty': 'daily-notes', 'workbench.review': '1' } }) });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
  api = null;
});

const ITEM = { kind: 'result', run: 'run-notes', approval: '', duty: 'daily-notes', agent: 'scribe', bridge: '', text: 'Release notes of yesterday is ready to check.', since: at(1) };

describe('a result to check in Activity', () => {
  it('shows a row To check, and a card with the answer, Looks right, and Needs work', async () => {
    api = fakeApi({ 'GET /v1/inbox': { items: [ITEM] }, 'POST /v1/runs/run-notes/reactions': { id: 'run-notes', state: 'completed' } });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain item="v:run-notes" />
      </>,
    );
    await settle();
    const row = el.querySelector('.inbox-row')!;
    expect(row.querySelector('b')!.textContent).toBe('scribe');
    expect(row.querySelector('.status-word')!.textContent).toBe('to check');
    const main = el.querySelector('.inbox-main-pane')!;
    expect(main.querySelector('h2')!.textContent).toBe('For people who run the fleet');
    expect(main.querySelector('a[href="#duties/daily-notes/run/run-notes"]')!.textContent).toBe('Open the run');
    const key = (t: string) => [...main.querySelectorAll('button')].find((b) => b.textContent === t)!;
    await act(async () => key('Needs work').click());
    await act(async () => key('Send back').click());
    expect(main.textContent).toContain('Say what must change.');
    const box = main.querySelector('textarea')!;
    await act(async () => {
      box.value = 'Name the version in the title.';
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => key('Send back').click());
    await settle();
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ seq: 0, reaction: 'down', note: 'Name the version in the title.' });
  });

  it('counts a result to check on the app bar, as it needs a person', async () => {
    api = fakeApi({ 'GET /v1/inbox': { items: [ITEM] } });
    const el = mount(<AppBar route={{ place: 'activity' }} onSignOut={() => {}} onReach={() => {}} />);
    await settle();
    expect(el.querySelector('.place-count .sr')!.textContent).toBe('1 item needs you');
  });

  it('refuses an empty note and a note past 1 KB', () => {
    expect(noteProblem('  ')).toBe('Say what must change.');
    expect(noteProblem('x'.repeat(1025))).toBe('Say it in at most 1,000 characters.');
    expect(noteProblem('Shorter, please.')).toBe('');
  });
});

describe('the words of a duty about its results', () => {
  it('reads back the results that the person hears of, and the check of each result', () => {
    expect(tellWords({ failure: ['owner'], needsYou: ['owner'], result: ['owner'], resultWhen: 'always' })).toBe('Failures, questions, and each result.');
    expect(tellWords({ failure: ['owner'], result: ['owner'], resultWhen: 'found' })).toBe('Failures and each result that found something.');
    expect(tellWords({ failure: ['owner'], needsYou: ['owner'] })).toBe('Failures and questions.');
    expect(REVIEW_LINE).toBe('Each result waits for you to check it: Looks right or Needs work.');
  });
  it('names the decider while away, as the save dialog says it', () => {
    expect(awayWords({ decider: 'manager', timeout: '2h', then: 'deny' })).toBe('The manager decides a question for you. After 2 hours without an answer, the answer is no.');
    expect(awayWords({ decider: 'nobody', timeout: '24h', then: 'deny' })).toBe('Nobody decides a question for you. After a day without an answer, the answer is no.');
  });
});

describe('More on a phone', () => {
  it('opens a menu of the places that the bar leaves out', async () => {
    window.matchMedia = ((q: string) => ({ matches: /max-width: 799px/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    api = fakeApi({ 'GET /v1/inbox': { items: [] } });
    act(() => store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, routines: true, work: true } }));
    const el = mount(<AppBar route={{ place: 'work' }} onSignOut={() => {}} onReach={() => {}} />);
    await settle();
    expect([...el.querySelectorAll('.places > .place .place-label')].map((x) => x.textContent)).toEqual(['Work', 'Results', 'Activity', 'Chat', 'Wiki']);
    const more = el.querySelector('.place-more') as HTMLButtonElement;
    await act(async () => more.click());
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect([...el.querySelectorAll('.menu-more [role="menuitem"]')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Bridges', '#bridges'],
      ['Fleet', '#fleet'],
      ['Duties', '#duties'],
      ['Skills', '#skills'],
      ['Routines', '#routines'],
      ['Manager', '#manager'],
    ]);
    act(() => store.dispatch({ type: 'config', config: null }));
  });
});
