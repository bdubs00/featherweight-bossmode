import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { ActivityList, ActivityMain, holdFor, pick } from './Activity';
import { Shell } from './Shell';
import { at, bridge, run, seat } from './testkit-b';
import { fakeApi, keyNamed, mount, settle, unmountAll } from './testkit-c';
import { currentNotice } from './notice';

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  forgetDuties();
  // A decision of a key waits a moment before it goes out. The tests wait little.
  holdFor(0);
  pick('');
  location.hash = '#activity';
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Homelab operations')] });
    store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Homelab operations', [seat('checker', 'migrator', 'error')]) });
    store.dispatch({ type: 'run', run: run('run-checker', 'migrator', 'failed', { error: 'The run reached its limit of 40 turns.', metadata: { 'workbench.duty': 'nightly-check' } }) });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

const ITEMS = {
  items: [
    { kind: 'failure', run: 'run-x', duty: 'daily-report', agent: 'scribe', text: 'The run reached its limit of turns.', since: at(1) },
    { kind: 'paused', duty: 'monthly-summary', agent: 'writer', text: 'Three runs in a row failed.', since: at(2) },
    { kind: 'approval', run: 'run-checker', bridge: 'b1', agent: 'migrator', text: 'A question of the bridge.' },
  ],
};

const rows = (el: HTMLElement) => [...el.querySelectorAll('.inbox-row')] as HTMLElement[];

describe('Activity and the duties', () => {
  it('names a duty by its title once the page reads the duties', async () => {
    api = fakeApi({
      'GET /v1/inbox': { items: [{ kind: 'failure', run: 'run-x', duty: 'walk-duty-7', agent: '', text: 'The run failed.', since: at(1) }] },
      'GET /v1/duties': { duties: [{ name: 'walk-duty-7', title: 'Walk Duty 7', agent: 'scribe', when: {}, do: {}, limits: {} }], paused: false },
    });
    const el = mount(<ActivityList />);
    await settle();
    const row = rows(el).find((r) => r.querySelector('a.duty-chip[href="#duties/walk-duty-7"]'))!;
    expect(row.querySelector('a.duty-chip')!.textContent).toBe('Walk Duty 7');
    expect(row.querySelector('a.duty-chip')!.getAttribute('title')).toBe('Open the duty Walk Duty 7');
    // A row with no agent names the duty by its title too.
    expect(row.querySelector('b')!.textContent).toBe('Walk Duty 7');
  });

  it('names the duty of a run with a chip that opens the duty', async () => {
    api = fakeApi({ 'GET /v1/inbox': { items: [] } });
    const el = mount(<ActivityList />);
    await settle();
    const chip = rows(el)[0].querySelector('a.duty-chip')!;
    // A duty goes by its name as it is until the page reads its title.
    expect(chip.textContent).toBe('nightly-check');
    expect(chip.getAttribute('href')).toBe('#duties/nightly-check');
    expect(rows(el)[0].querySelector('.inbox-where')!.textContent).toBe('Homelab operationsnightly-check');
  });

  it('shows the failed runs and the paused duties of the inbox, and a question of a bridge only once', async () => {
    api = fakeApi({ 'GET /v1/inbox': ITEMS });
    const el = mount(<ActivityList />);
    await settle();
    expect(rows(el).map((r) => [r.querySelector('b')!.textContent, r.querySelector('.status-word')!.textContent, r.querySelector('.inbox-text')!.textContent])).toEqual([
      ['checker', 'error', 'Stopped at 40 turns'],
      ['scribe', 'failed', 'The run reached its limit of turns.'],
      ['writer', 'paused', 'Three runs in a row failed.'],
    ]);
    expect(rows(el)[1].querySelector('a.duty-chip')!.getAttribute('href')).toBe('#duties/daily-report');
    expect(el.querySelector('header .chip .sr')!.textContent).toBe('3 items');
  });

  it('counts on the app bar each row that needs you, with the failed runs and the paused duties, and no new message', async () => {
    api = fakeApi({ 'GET /v1/inbox': ITEMS });
    act(() => {
      const extra = { needsYou: 1, unread: 1, lastSeq: 1 };
      store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Homelab operations', undefined, extra)] });
      store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Homelab operations', [seat('checker', 'migrator', 'error'), seat('asker', 'migrator', 'needs-you'), seat('scribe', 'scribe', 'idle')], extra) });
      store.dispatch({ type: 'run', run: run('run-asker', 'migrator', 'input-required', { pending: { id: 'ap-1', tool: 'bash', input: { command: 'git push' }, reason: 'default', requestedAt: at(3) } }) });
      store.dispatch({ type: 'run', run: run('run-scribe', 'scribe', 'completed') });
      store.dispatch({ type: 'channel', bridge: 'b1', page: { bridge: 'b1', messages: [{ seq: 1, at: at(4), from: { kind: 'agent', handle: 'scribe', run: 'run-scribe' }, text: 'The report is in the wiki.' }], next: 0, prev: 0 }, mode: 'latest' });
    });
    const el = mount(<Shell route={{ place: 'activity' }} list={<ActivityList />} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    await settle();
    // The list holds a decision, a failed seat, a failed run of a duty, a paused duty, and a finished seat whose message takes Done.
    expect(rows(el).map((r) => r.getAttribute('data-key'))).toEqual(['d:run-asker/ap-1', 's:b1/checker', 'u:failure/daily-report', 'u:paused/monthly-summary', 'm:b1']);
    expect(el.querySelector('header .chip .sr')!.textContent).toBe('5 items');
    // The app bar counts the same rows. Only the new message needs nobody.
    expect(el.querySelector('.place-count .sr')!.textContent).toBe('4 items need you');
  });

  it('shows a failed run of a duty in the main pane, with the chip of the duty and the run', async () => {
    api = fakeApi({ 'GET /v1/inbox': ITEMS });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain item="u:failure/daily-report" />
      </>,
    );
    await settle();
    const main = el.querySelector('.inbox-main-pane')!;
    expect(main.querySelector('h1')!.textContent).toBe('scribe');
    expect(main.querySelector('.pane-head a.duty-chip')!.getAttribute('href')).toBe('#duties/daily-report');
    expect(main.querySelector('.inbox-reason')!.textContent).toBe('The run reached its limit of turns.');
    // The run opens on the page of its duty, in Bossmode.
    expect(main.querySelector('a[href="#duties/daily-report/run/run-x"]')!.textContent).toBe('Open the run');
  });

  it('links no run for a failed start that the queue never took, whose run is empty', async () => {
    api = fakeApi({ 'GET /v1/inbox': { items: [{ kind: 'failure', run: '', approval: '', duty: 'daily-report', agent: 'scribe', bridge: '', text: 'The queue of scribe did not answer.', since: at(1) }] } });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain item="u:failure/daily-report" />
      </>,
    );
    await settle();
    const main = el.querySelector('.inbox-main-pane')!;
    expect(main.querySelector('.inbox-reason')!.textContent).toBe('The queue of scribe did not answer.');
    expect([...el.querySelectorAll('a')].some((a) => a.textContent === 'Open the run' || (a.getAttribute('href') || '').includes('/run/'))).toBe(false);
    expect(api.calls.some((c) => c.path.startsWith('/v1/runs/'))).toBe(false);
  });

  it('shows the card of a question of a duty on no bridge from the approval of its item, decides it, and reads the inbox again', async () => {
    let reads = 0;
    api = fakeApi({
      'GET /v1/inbox': () => ({ body: ++reads === 1 ? { items: [{ kind: 'approval', run: 'run-ask', approval: 'ap-1', duty: 'restore-test', agent: 'backup', bridge: '', text: 'backup wants to run restic restore.', since: at(3) }] } : { items: [] } }),
      'POST /v1/runs/run-ask/approvals/ap-1': {},
    });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    await settle(8);
    const row = rows(el).find((r) => r.querySelector('b')!.textContent === 'backup')!;
    expect(row.querySelector('.inbox-text')!.textContent).toBe('backup wants to run restic restore.');
    const main = el.querySelector('.inbox-main-pane')!;
    expect(main.querySelector('.inbox-said')!.textContent).toBe('backup wants to run restic restore.');
    expect(main.querySelector('.card')).toBeTruthy();
    // The card needs no read of the run.
    expect(api.calls.some((c) => c.path.startsWith('/v1/runs/run-ask') && c.method === 'GET')).toBe(false);
    act(() => (keyNamed(main, 'Allow') as HTMLButtonElement).click());
    await settle();
    expect(api.calls.filter((c) => c.method === 'POST').map((c) => [c.path, c.body])).toEqual([['/v1/runs/run-ask/approvals/ap-1', { decision: 'allow' }]]);
    expect(reads).toBe(2);
  });

  it('reads the run of a question of a duty that names no approval, then shows its card and decides it', async () => {
    const asking = run('run-ask', 'backup', 'input-required', { pending: { id: 'ap-1', tool: 'bash', input: { command: 'restic restore latest' }, reason: 'ask', requestedAt: at(3) }, metadata: { 'workbench.duty': 'restore-test' } });
    api = fakeApi({
      'GET /v1/inbox': { items: [{ kind: 'approval', run: 'run-ask', duty: 'restore-test', agent: 'backup', text: 'backup wants to run a command.', since: at(3) }] },
      'GET /v1/runs/run-ask': asking,
      'GET /v1/runs/run-ask/result': { runId: 'run-ask', status: 'needs-input' },
      'POST /v1/runs/run-ask/approvals/ap-1': {},
    });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    await settle(8);
    const row = rows(el).find((r) => r.querySelector('b')!.textContent === 'backup')!;
    expect(row.querySelector('.inbox-text')!.textContent).toBe('backup wants to run a command');
    expect(row.querySelector('a.duty-chip')!.getAttribute('href')).toBe('#duties/restore-test');
    // The main pane shows the card, which needs no bridge.
    const main = el.querySelector('.inbox-main-pane')!;
    expect(main.querySelector('.card')).toBeTruthy();
    expect(main.querySelector('.pane-head a.duty-chip')!.textContent).toBe('restore-test');
    act(() => row.focus());
    act(() => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    await settle(8);
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/v1/runs/run-ask/approvals/ap-1')).toBe(true);
  });

  it('shows the bridges alone when the front has no inbox', async () => {
    api = fakeApi({});
    const el = mount(<ActivityList />);
    await settle();
    expect(rows(el).length).toBe(1);
    expect(currentNotice()).toBe('');
  });
});
