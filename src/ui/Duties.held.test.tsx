// The held changes of 2026-10-26 on the Duties place: the run of a duty
// opens inside Bossmode, under its line of the history, and each line shows
// the first line of its answer (D6). The tab Playbooks lists the playbooks,
// each with its page, Rename, and Delete, and the notice of a saved
// playbook links to it (D9).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { Duty, DutyRecord, Playbook, Run, Whoami } from '../api/types';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { forgetPlaybooks } from '../state/playbooks';
import { forgetRuns } from '../state/actions';
import { forgetTranscripts } from './Conversation';
import { hrefOf } from '../lib/route';
import { answerLine } from '../lib/duties';
import { DutyList, DutyMain } from './Duties';
import { PlaybookList, PlaybookMain } from './Playbooks';
import { clearNotice, clearSaid, currentNotice, currentSaid, currentSaidLink } from './notice';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll, type Call } from './testkit-c';

const ALICE: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: { migrator: 'owner', scribe: 'owner' }, admin: false, canCreate: true };
const T = '2026-10-26T09:00:00Z';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const duty = (over: Partial<Duty>): Duty => ({
  name: 'nightly-report',
  agent: 'scribe',
  owner: 'alice@example.com',
  when: { schedule: { repeat: 'daily', times: ['02:00'], timeZone: 'UTC' } },
  do: { ask: { message: 'Write the report.' } },
  limits: { budget: { maxCostUSD: 0.5 }, overlap: 'skip', catchUp: '1h' },
  whileAway: { decider: 'manager', timeout: '2h', then: 'deny' },
  notify: { failure: ['owner'], needsYou: ['owner'] },
  paused: false,
  source: 'store',
  revision: 3,
  readback: 'Every day at 2:00 AM, UTC.',
  ...over,
});

const runOf = (id: string, output: string): Run => ({ id, agent: 'scribe', title: 'Nightly report', state: 'completed', seq: 4, output, createdAt: T, updatedAt: T });

const BOOK: Playbook = {
  name: 'weekly-patching',
  goal: 'Patch the lab hosts.\nThen report what changed.',
  placement: 'queue',
  seats: [
    { handle: 'patcher', agent: 'migrator', task: 'Patch each host. Reboot the ones that need it.' },
    { handle: 'reviewer', agent: 'reviewer', task: 'Review the patches.' },
  ],
  revision: 4,
  updatedAt: '2026-10-25T10:00:00Z',
};
const WHOLE: Playbook = { ...BOOK, caps: { maxTurns: 40, maxMessages: 200 }, delegation: { approve: true, report: true } };
const OPENS = duty({ name: 'patch-tuesday', do: { open: { playbook: 'weekly-patching' } }, limits: { budget: { maxTurns: 40 }, overlap: 'skip', catchUp: '1h' } });

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  sessionStorage.clear();
  forgetDuties();
  forgetPlaybooks();
  forgetRuns();
  forgetTranscripts();
  location.hash = '#duties';
  act(() => store.dispatch({ type: 'me', me: ALICE }));
});
afterEach(() => {
  unmountAll();
  clearNotice();
  clearSaid();
  if (api) api.restore();
});

function text(el: Element | null): string {
  if (!el) return '';
  const parts: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) parts.push(n.textContent || '');
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([,.])/g, '$1');
}

/** fieldOf finds the control of a field by its label. */
function fieldOf(root: ParentNode, label: string): HTMLInputElement | null {
  const f = [...root.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')!.textContent === label);
  return f ? (f.querySelector('input, textarea, select') as HTMLInputElement | null) : null;
}

function more(el: Element, item: string): void {
  click(el.querySelector('button[aria-label="More"]'));
  click([...el.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === item));
}

describe('the run of a duty', () => {
  const RUNS = [
    { at: ago(10), run: '01KNEW', state: 'completed', costUSD: 0.02 },
    { at: ago(1450), run: '01KOLD', state: 'completed', costUSD: 0.03 },
  ];
  const routes = () => ({
    'GET /v1/duties': { duties: [duty({})], paused: false },
    'GET /v1/duties/nightly-report': { ...duty({}), history: RUNS },
    'GET /v1/runs/01KNEW': runOf('01KNEW', '## Report of the night\n\nAll **12** backups restored.'),
    'GET /v1/runs/01KOLD': runOf('01KOLD', 'Two backups failed: db-1 and db-2.'),
    'GET /v1/runs/01KNEW/result': { runId: '01KNEW', title: 'Nightly report', agent: 'scribe', status: 'ready', summary: 'All 12 backups restored.', started: T, changed: T },
    'GET /v1/runs/01KNEW/transcript': {
      run: runOf('01KNEW', 'All 12 backups restored.'),
      items: [
        { seq: 1, time: T, kind: 'user', text: 'Write the report.', who: 'duty:nightly-report' },
        { seq: 2, time: T, kind: 'assistant', text: 'All 12 backups restored.' },
      ],
      next: 0,
      prev: 0,
    },
  });

  it('shows the first line of the answer on each line of the history, read from the run, which wakes no worker', async () => {
    expect(answerLine('## Report of the night\n\nAll **12** backups restored.')).toBe('Report of the night');
    expect(answerLine('\n\n- **Done.**')).toBe('Done.');
    expect(answerLine('x'.repeat(60) + ' ' + 'y'.repeat(60))).toBe('x'.repeat(60) + '…');
    api = fakeApi(routes());
    const el = mount(<DutyMain name="nightly-report" />);
    await settle();
    const lines = [...el.querySelectorAll('.duty-run')];
    expect(text(lines[0].querySelector('.duty-run-answer'))).toBe('Report of the night');
    expect(text(lines[1].querySelector('.duty-run-answer'))).toBe('Two backups failed: db-1 and db-2.');
    // The page reads the run objects alone. Their result and their conversation wait until the person opens a run.
    expect(api.calls.some((c) => c.path.endsWith('/result') || c.path.endsWith('/transcript'))).toBe(false);
    expect(lines[0].querySelector('a.duty-run-link')!.getAttribute('href')).toBe('#duties/nightly-report/run/01KNEW');
    expect(lines[0].querySelector('a.duty-run-link')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a run in a pane under its line, with its result and its conversation, and Hide the run closes it', async () => {
    api = fakeApi(routes());
    const el = mount(<DutyMain name="nightly-report" run="01KNEW" />);
    await settle();
    const line = el.querySelector('.duty-run.open')!;
    const key = line.querySelector('a.duty-run-link')!;
    expect(key.textContent).toBe('Hide the run');
    expect(key.getAttribute('href')).toBe('#duties/nightly-report');
    expect(key.getAttribute('aria-expanded')).toBe('true');
    const pane = line.querySelector('.duty-runpane')!;
    expect(key.getAttribute('aria-controls')).toBe(pane.id);
    expect(text(pane.querySelector('.run-head h3'))).toBe('Nightly report');
    expect(text(pane.querySelector('.run-summary'))).toContain('All 12 backups restored.');
    expect(text(pane.querySelector('.thread'))).toContain('Write the report.');
    // The other line stays closed, and no link of the page leads to the old dashboard.
    expect(el.querySelectorAll('.duty-runpane').length).toBe(1);
    expect([...el.querySelectorAll('a')].some((a) => (a.getAttribute('href') || '').startsWith('/ui'))).toBe(false);
  });
});

describe('the tab Playbooks', () => {
  const routes = (more: Record<string, unknown> = {}) => ({
    'GET /v1/playbooks': { playbooks: [BOOK, { ...BOOK, name: 'restore-drill', goal: 'Restore the backups of last night.', seats: [{ handle: 'backup', agent: 'backup', task: 'Restore.' }], updatedAt: '2026-10-20T10:00:00Z' }] },
    'GET /v1/playbooks/weekly-patching': WHOLE,
    'GET /v1/duties': { duties: [OPENS, duty({})], paused: false },
    ...more,
  });

  it('sits beside the duties, and lists each playbook with the first line of its goal and its seats', async () => {
    api = fakeApi(routes());
    const duties = mount(<DutyList />);
    const books = mount(<PlaybookList current="weekly-patching" />);
    await settle();
    expect([...duties.querySelectorAll('.duty-tabs a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')])).toEqual([
      ['Duties', '#duties', 'page'],
      ['Playbooks', '#playbooks', null],
    ]);
    expect(books.querySelector('.duty-tabs a[aria-current="page"]')!.textContent).toBe('Playbooks');
    expect(text(books.querySelector('.pane-head'))).toContain('Playbooks');
    const rows = [...books.querySelectorAll('.duty-row')];
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['#playbooks/weekly-patching', '#playbooks/restore-drill']);
    expect(text(rows[0])).toBe('Weekly patching Patch the lab hosts. 2 seats');
    expect(rows[0].getAttribute('aria-current')).toBe('page');
    typeIn(books.querySelector('input[type="search"]'), 'restore');
    expect([...books.querySelectorAll('.duty-row')].map((r) => r.getAttribute('href'))).toEqual(['#playbooks/restore-drill']);
  });

  it('shows a playbook: its goal, its seats, how its bridge runs, the duties that open it, and Make a duty', async () => {
    api = fakeApi(routes());
    const el = mount(<PlaybookMain name="weekly-patching" />);
    await settle();
    expect(text(el.querySelector('h1'))).toBe('Weekly patching');
    expect(el.querySelector('.book-goal')!.textContent).toBe('Patch the lab hosts.\nThen report what changed.');
    expect([...el.querySelectorAll('.book-seat')].map(text)).toEqual(['patcher Patch each host.', 'reviewer Review the patches.']);
    expect(text(el.querySelector('section[aria-labelledby="book-runs"]'))).toBe('How its bridge runs Keep warm workers Most messages: 200 Most turns: 40 The manager can: decide for members, write a report on close.');
    const users = el.querySelector('section[aria-labelledby="book-users"]')!;
    expect([...users.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Patch tuesday', '#duties/patch-tuesday']]);
    expect(keyNamed(el, 'Make a duty')!.getAttribute('href')).toBe(hrefOf({ place: 'duties', fresh: true, seed: { act: 'open', playbook: 'weekly-patching', agent: 'migrator' } }));
  });

  it('deletes a playbook after it asks, with a notice, and goes back to the tab', async () => {
    location.hash = '#playbooks/weekly-patching';
    api = fakeApi(routes({ 'DELETE /v1/playbooks/weekly-patching': () => ({ status: 204 }) }));
    const el = mount(<PlaybookMain name="weekly-patching" />);
    await settle();
    more(el, 'Delete');
    const ask = document.querySelector('dialog.confirm')!;
    expect(text(ask.querySelector('h2'))).toBe('Delete Weekly patching?');
    expect(text(ask)).toContain('1 duty opens a bridge from it. A duty that opens a bridge from it stops until you pick another playbook.');
    click(keyNamed(ask, 'Delete'));
    await settle();
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/playbooks/weekly-patching')).toBe(true);
    expect(currentSaid()).toBe('Deleted the playbook Weekly patching.');
    expect(location.hash).toBe('#playbooks');
  });

  it('renames a playbook: it saves it whole under the new name, moves the duties that open it, and deletes the old name', async () => {
    location.hash = '#playbooks/weekly-patching';
    api = fakeApi(
      routes({
        'GET /v1/duties/patch-tuesday': { ...OPENS, history: [] },
        'PUT /v1/playbooks/patch-day': (c: Call) => ({ body: { name: 'patch-day', ...(c.body as object), revision: 1 } }),
        'PUT /v1/duties/patch-tuesday': (c: Call) => ({ body: { ...OPENS, ...(c.body as object) } }),
        'DELETE /v1/playbooks/weekly-patching': () => ({ status: 204 }),
      }),
    );
    const el = mount(<PlaybookMain name="weekly-patching" />);
    await settle();
    more(el, 'Rename');
    const ask = document.querySelector('dialog.confirm')!;
    expect(text(ask.querySelector('h2'))).toBe('Rename Weekly patching');
    expect(text(ask)).toContain('The duty that opens a bridge from it moves to the new name.');
    // A name that a playbook holds already is refused.
    typeIn(fieldOf(ask, 'Name'), 'Restore drill');
    click(keyNamed(ask, 'Rename'));
    expect(text(fieldOf(ask, 'Name')!.closest('label')!.querySelector('.field-error'))).toBe('A playbook of this name exists. Pick another name.');
    typeIn(fieldOf(ask, 'Name'), 'Patch day');
    expect(text(ask.querySelector('#rename-slug'))).toBe('It saves as patch-day.');
    click(keyNamed(ask, 'Rename'));
    await settle();
    const saved = api.calls.find((c) => c.method === 'PUT' && c.path === '/v1/playbooks/patch-day')!;
    expect(saved.body).toEqual({ goal: WHOLE.goal, placement: 'queue', seats: WHOLE.seats, caps: WHOLE.caps, delegation: WHOLE.delegation });
    const moved = api.calls.find((c) => c.method === 'PUT' && c.path === '/v1/duties/patch-tuesday')!;
    expect((moved.body as DutyRecord).do).toEqual({ open: { playbook: 'patch-day' } });
    expect((moved.body as DutyRecord).revision).toBe(3);
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/playbooks/weekly-patching')).toBe(true);
    expect(currentSaid()).toBe('Renamed the playbook to Patch day.');
    expect(currentSaidLink()).toEqual({ label: 'See the playbook', href: '#playbooks/patch-day' });
    expect(location.hash).toBe('#playbooks/patch-day');
  });

  it('keeps the old playbook when a duty that opens it does not move, and says which one', async () => {
    api = fakeApi(
      routes({
        'GET /v1/duties/patch-tuesday': { ...OPENS, history: [] },
        'PUT /v1/playbooks/patch-day': (c: Call) => ({ body: { name: 'patch-day', ...(c.body as object) } }),
        'PUT /v1/duties/patch-tuesday': () => ({ status: 409, body: { detail: 'the duty changed' } }),
      }),
    );
    const el = mount(<PlaybookMain name="weekly-patching" />);
    await settle();
    more(el, 'Rename');
    const ask = document.querySelector('dialog.confirm')!;
    typeIn(fieldOf(ask, 'Name'), 'Patch day');
    click(keyNamed(ask, 'Rename'));
    await settle();
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(currentNotice()).toBe('Saved the playbook as Patch day. Patch tuesday still opens a bridge from Weekly patching, so that playbook stays too.');
  });
});
