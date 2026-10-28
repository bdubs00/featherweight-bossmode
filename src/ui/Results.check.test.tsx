import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { awayWords, tellWords, REVIEW_LINE } from '../lib/duties';
import { ActivityList, ActivityMain, holdFor, pick, sameWords } from './Activity';
import { forgetSeen } from './Manager';
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
    // The heading of the answer starts below the title of its card, an h3 (F18).
    expect(main.querySelector('.card h3')!.textContent).toBe('Release notes of yesterday');
    expect(main.querySelector('.card .md h4')!.textContent).toBe('For people who run the fleet');
    expect(main.querySelector('.card .md h2')).toBeNull();
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

  it('shows what the run was asked and its whole answer, and says to check in its head', async () => {
    const long = '## Notes\n\n' + 'A line of the notes. '.repeat(120) + '\n\nThe last line.';
    act(() => store.dispatch({ type: 'run', run: run('run-notes', 'scribe', 'completed', { title: 'Release notes of yesterday', input: 'Draft the release notes of yesterday.', output: long, metadata: { 'workbench.duty': 'daily-notes', 'workbench.review': '1' } }) }));
    api = fakeApi({ 'GET /v1/inbox': { items: [ITEM] } });
    const el = mount(<ActivityMain item="v:run-notes" />);
    await settle();
    const card = el.querySelector('.inbox-main-pane .card')!;
    expect(card.querySelector('.result-ask')!.textContent).toBe('The task Draft the release notes of yesterday.');
    // A person judges the whole result, never its first 1,500 characters.
    expect(card.textContent).toContain('The last line.');
    expect(card.textContent).not.toContain('…');
    expect(el.querySelector('.pane-head [aria-label="scribe, to check"], .pane-head [title="scribe, to check"]')).not.toBeNull();
  });

  it('takes a to Looks right and d to Needs work from the row of a result, and judges nothing by a key alone', async () => {
    api = fakeApi({ 'GET /v1/inbox': { items: [ITEM] } });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain item="v:run-notes" />
      </>,
    );
    await settle();
    const row = el.querySelector('.inbox-row') as HTMLElement;
    const press = async (key: string) => {
      row.focus();
      await act(async () => {
        row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 80));
      });
    };
    await press('a');
    expect(document.activeElement!.textContent).toBe('Looks right');
    await press('d');
    expect(document.activeElement!.textContent).toBe('Needs work');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('reads the inbox again when a run whose owner checks each result ends, so a reworked result comes back at once', async () => {
    api = fakeApi({ 'GET /v1/inbox': { items: [] } });
    mount(<AppBar route={{ place: 'activity' }} onSignOut={() => {}} onReach={() => {}} />);
    await settle();
    act(() => store.dispatch({ type: 'run', run: run('run-notes', 'scribe', 'running', { metadata: { 'workbench.review': '1' } }) }));
    await settle();
    const before = api.calls.filter((c) => c.path === '/v1/inbox').length;
    act(() => store.dispatch({ type: 'run', run: run('run-notes', 'scribe', 'completed', { seq: 4, metadata: { 'workbench.review': '1' } }) }));
    await settle();
    expect(api.calls.filter((c) => c.path === '/v1/inbox').length).toBeGreaterThan(before);
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
      ['Teams', '#bridges'],
      ['Fleet', '#fleet'],
      ['Duties', '#duties'],
      ['Skills', '#skills'],
      ['Know-how', '#knowhow'],
      ['Manager', '#manager'],
    ]);
    act(() => store.dispatch({ type: 'config', config: null }));
  });

  it('gives More the dot of the manager while More hides the place Manager, and its label the size of the other places', async () => {
    window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    forgetSeen();
    localStorage.removeItem('fw.bossmode.everyPlace');
    api = fakeApi({ 'GET /v1/inbox': { items: [] }, 'GET /v1/fleet/runs': { runs: [] } });
    const conv = (state: 'running' | 'completed', seq: number) => run('run-mgr', 'manager', state, { seq, principal: 'alice@example.com', input: 'How is the fleet?' });
    act(() => {
      store.dispatch({ type: 'config', config: { manager: { agent: 'manager', member: 'default/boss-0', run: '' }, placement: 'queue', maxMembers: 16, routines: true, work: true } });
      store.dispatch({ type: 'run', run: conv('running', 2) });
    });
    const el = mount(<AppBar route={{ place: 'work' }} onSignOut={() => {}} onReach={() => {}} />);
    await settle();
    const more = el.querySelector('.place-more') as HTMLButtonElement;
    expect(more.querySelector('.place-dot')).toBeNull();
    act(() => store.dispatch({ type: 'run', run: conv('completed', 5) }));
    await settle();
    expect(more.querySelector('.place-dot')!.textContent).toBe('The manager answered.');
    // Every place in sight: the dot goes back to the place Manager.
    await act(async () => more.click());
    expect(el.querySelector('.place-more .place-dot')).toBeNull();
    expect(el.querySelector('a.place[href="#manager"] .place-dot')).not.toBeNull();
    localStorage.removeItem('fw.bossmode.everyPlace');
    forgetSeen();
    act(() => store.dispatch({ type: 'config', config: null }));
  });

  it('opens every place in a wide window as a disclosure, and Escape on More folds them back without leaving the screen', async () => {
    window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    localStorage.removeItem('fw.bossmode.everyPlace');
    api = fakeApi({ 'GET /v1/inbox': { items: [] } });
    act(() => store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, routines: true, work: true } }));
    const el = mount(<AppBar route={{ place: 'results' }} onSignOut={() => {}} onReach={() => {}} />);
    await settle();
    const more = el.querySelector('.place-more') as HTMLButtonElement;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await act(async () => more.click());
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.textContent).toBe('Fewer');
    expect(el.querySelectorAll('a.place').length).toBe(11);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => {
      more.dispatchEvent(esc);
    });
    expect(esc.defaultPrevented).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect([...el.querySelectorAll('a.place .place-label')].map((x) => x.textContent)).toEqual(['Work', 'Results', 'Activity', 'Chat', 'Wiki']);
    localStorage.removeItem('fw.bossmode.everyPlace');
    act(() => store.dispatch({ type: 'config', config: null }));
  });
});

describe('the task of a result', () => {
  it('stays out when it only repeats the title of the run', () => {
    expect(sameWords('Name one thing to check on a homelab today, in one line.', 'Name one thing to check on a homelab today, in one line')).toBe(true);
    expect(sameWords('Draft the release notes of yesterday.', 'Release notes of yesterday')).toBe(false);
  });
});

