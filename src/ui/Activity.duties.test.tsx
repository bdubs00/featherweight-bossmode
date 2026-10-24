import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { ActivityList, ActivityMain, pick } from './Activity';
import { at, bridge, run, seat } from './testkit-b';
import { fakeApi, mount, settle, unmountAll } from './testkit-c';
import { currentNotice } from './notice';

let api: ReturnType<typeof fakeApi>;

beforeEach(() => {
  forgetDuties();
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
  it('names the duty of a run with a chip that opens the duty', async () => {
    api = fakeApi({ 'GET /v1/inbox': { items: [] } });
    const el = mount(<ActivityList />);
    await settle();
    const chip = rows(el)[0].querySelector('a.duty-chip')!;
    expect(chip.textContent).toBe('Nightly check');
    expect(chip.getAttribute('href')).toBe('#duties/nightly-check');
    expect(rows(el)[0].querySelector('.inbox-where')!.textContent).toBe('Homelab operationsNightly check');
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
    expect(main.querySelector('a[href="/ui#run/run-x"]')!.textContent).toBe('Open the run');
  });

  it('shows the card of a question of a duty that sits on no bridge, and decides it', async () => {
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
    expect(main.querySelector('.pane-head a.duty-chip')!.textContent).toBe('Restore test');
    act(() => row.focus());
    act(() => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    await settle();
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
