import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { JournalEntry, KnowhowSummary, NoteItem, NoteRecord, WaitingChange } from '../api/knowhow';
import type { RoutineRecord } from '../api/routines';
import type { Whoami } from '../api/types';
import { forgetAgents } from '../state/agents';
import { forgetKnowhow, knowhowChanged } from '../state/knowhow';
import { forgetRoutines } from '../state/routines';
import { store } from '../state/store';
import { dateWords } from '../lib/routines';
import { dayWords } from '../lib/words';
import { KnowhowAgents, KnowhowMain } from './Knowhow';
import { clearNotice, clearSaid, currentNotice, currentSaid } from './notice';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll, type Call } from './testkit-c';

const OWNER: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: { triage: 'owner', 'identity-desk': 'owner', ops: 'operator' }, admin: false, canCreate: true };

const pool = (agent: string) => ({ name: agent, atespace: 'default', agent, intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: agent + '-0', phase: 'Running', current: true }] });
const face = (agent: string, displayName: string, tagline: string) => ({ agent, displayName, tagline, hash: 'h', custom: false });

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();

/** The answer of summary.go of the workbench for triage: 400 runs, 20 held back, and the line of the server. */
const SUMMARY: KnowhowSummary = {
  agent: 'triage',
  days: 7,
  costPerJob: { usd: 0.021, runs: 400, previousUsd: 0.025, trend: 'down' },
  doneByRoutines: { runs: 380, byRoutine: 140, share: 140 / 380 },
  notesCorrected: 3,
  normal: { runs: 380, doneWell: 346, byRoutine: 140, costPerJobUsd: 0.02 },
  heldBack: { runs: 20, doneWell: 16, byRoutine: 0, costPerJobUsd: 0.04 },
  compare: { enough: true, heldBack: 20, normal: 300, oneIn: 16, doneWellWithout: 0.8, doneWellWith: 0.91, line: 'Held back 1 in 16 runs. Done well: 80% without what it learned, 91% with it.' },
};
/** Identity desk held back 4 runs, so the server says that there are not enough. */
const FEW: KnowhowSummary = {
  ...SUMMARY,
  agent: 'identity-desk',
  costPerJob: { usd: 0.031, runs: 64, previousUsd: 0.03, trend: 'flat' },
  doneByRoutines: { runs: 60, byRoutine: 12, share: 0.2 },
  normal: { runs: 60, doneWell: 50, byRoutine: 12, costPerJobUsd: 0.03 },
  heldBack: { runs: 4, doneWell: 3, byRoutine: 0, costPerJobUsd: 0.05 },
  compare: { enough: false, heldBack: 4, normal: 30, line: 'Not enough held-back runs yet.' },
  notesCorrected: 0,
};

/** pid is a public id of the workbench: an id that starts with its time, and the agent in base64url. */
const pid = (n: number) => '01K8' + String(n).padStart(22, '0') + '-dHJpYWdl';
const SETTINGS = { agent: 'triage', askFirst: true, review: { on: true, agent: 'review', every: '24h0m0s' } };

const WAIT: WaitingChange = { id: pid(1), at: at(30), agent: 'triage', what: 'learned', subject: { note: 'gotchas/vpn-portal.md', scope: 'agent' }, why: 'Three runs failed on the short name of the portal and passed with the full one.', runs: ['r1', 'r2'], by: 'review', text: 'The VPN portal answers only on its full domain, vpn.corp.example.com.' };

const JOURNAL: JournalEntry[] = [
  { id: pid(11), at: at(20), agent: 'triage', what: 'stepped-back', subject: { routine: 'acknowledge-a-new-ticket' }, why: 'A canary run disagreed with the agent on the team.', runs: ['r7'], by: '' },
  // An older server gave a move to out of date an undo. The page offers none: it would make the agent trust the note over its source.
  { id: pid(12), at: at(40), agent: 'triage', what: 'out-of-date', subject: { note: 'gotchas/gitea-labels.md', scope: 'agent' }, why: 'The page agents/triage/labels.md changed.', by: '', undo: { revision: 3, after: 4 } },
  { id: pid(13), at: at(60 * 30), agent: 'triage', what: 'learned', subject: { note: 'gotchas/gitea-labels.md', scope: 'agent' }, why: 'Two runs failed on a label with a space and passed without it.', runs: ['r3', 'r4'], by: 'review', undo: { revision: 0, after: 3 } },
  // An entry that was taken back already offers no second undo.
  { id: pid(14), at: at(60 * 31), agent: 'triage', what: 'learned', subject: { note: 'gotchas/old.md', scope: 'agent' }, why: 'One run passed.', by: 'review', undo: { revision: 0, after: 1 }, undoneBy: pid(15) },
];
const J3 = JOURNAL[2].id;

const item = (name: string, more: Partial<NoteItem> = {}): NoteItem => ({ agent: 'triage', scope: { kind: 'agent' }, name, hash: 'h-' + name, state: 'checked', description: name, by: 'review', at: at(90), uses: 7, sources: 2, ...more });
const NOTES: NoteItem[] = [
  item('gotchas/gitea-labels.md', { state: 'out-of-date', description: 'Gitea refuses a label name with a space.' }),
  item('places/team-labels.md', { description: 'The team labels live under team/ in Gitea.' }),
  item('gotchas/old-portal.md', { state: 'resting', description: 'The old portal answered on port 8443.', uses: 0 }),
  item('mine/escalation.md', { scope: { kind: 'principal', principal: 'alice@example.com' }, by: 'person:alice@example.com', state: 'unchecked', description: 'I escalate P1 tickets by phone.', sources: 0 }),
  item('sweep/stale-tickets.md', { scope: { kind: 'principal', principal: 'duty:nightly-sweep' }, description: 'A ticket with no answer for 14 days is closed with a note.' }),
];
const OOD: NoteRecord = { ...(NOTES[0] as unknown as NoteRecord), text: 'Gitea refuses a label name with a space. Use a dash.', sources: [{ ref: 'run:r3' }, { ref: 'page:agents/triage/labels.md', version: 'v1' }], outOfDate: { since: at(40), source: 'page:agents/triage/labels.md' } };
const MINE: NoteRecord = { ...(NOTES[3] as unknown as NoteRecord), text: 'I escalate P1 tickets by phone.', sources: [] };

const routine = (name: string, more: Partial<RoutineRecord> = {}): RoutineRecord => ({ agent: 'triage', routine: { name, version: 1, steps: [] }, standing: 'rehearsing', ready: false, history: [], createdAt: at(9000), updatedAt: at(100), ...more });
const ROUTINES = [routine('acknowledge-a-new-ticket', { ready: true }), routine('reset-a-password', { standing: 'live', agent: 'identity-desk' }), routine('close-a-duplicate', { standing: 'live' })];

/** routes answers the know-how of triage and identity-desk, and the routines. */
function routes(more: Record<string, unknown> = {}): Record<string, unknown> {
  const t: Record<string, unknown> = {
    'GET /v1/knowhow/waiting': { waiting: [WAIT] },
    'GET /v1/knowhow/waiting?agent=triage': { waiting: [WAIT] },
    'GET /v1/knowhow/waiting?agent=identity-desk': { waiting: [] },
    'GET /v1/knowhow/summary?agent=triage&days=7': SUMMARY,
    'GET /v1/knowhow/summary?agent=identity-desk&days=7': FEW,
    'GET /v1/knowhow/settings/triage': SETTINGS,
    'GET /v1/knowhow/settings/identity-desk': { ...SETTINGS, agent: 'identity-desk', askFirst: false },
    'GET /v1/knowhow/journal?agent=triage&limit=50': { entries: JOURNAL },
    'GET /v1/knowhow/journal?agent=identity-desk&limit=50': { entries: [] },
    'GET /v1/knowhow/notes?agent=triage': { notes: NOTES },
    'GET /v1/knowhow/notes/triage/agent/gotchas/gitea-labels.md': OOD,
    'GET /v1/knowhow/notes/triage/agent/places/team-labels.md': { ...NOTES[1], text: 'The team labels live under team/ in Gitea.', sources: [{ ref: 'run:r5' }] },
    'GET /v1/knowhow/notes/triage/principal/mine/escalation.md?principal=alice%40example.com': MINE,
    'GET /v1/routines': { routines: ROUTINES },
    'GET /v1/routines/summary': { runs: 0, byRoutine: 0, byAgent: 0, withPerson: 0, costUSD: { routine: 0, agent: 0 }, sentBack: 0 },
  };
  for (const r of ROUTINES) t['GET /v1/routines/' + r.agent + '/' + r.routine.name] = { ...r, evidence: { days: [], questions: {}, disagreements: [], sentBack: { applied: 0, agreed: 0 } } };
  return { ...t, ...more };
}

/** text is the words of an element as a person reads them. */
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
    .replace(/ ([,.:])/g, '$1');
}

/** The words that never show on a screen of Know-how (docs/KNOWHOW.md, section 2, and docs/ROUTINES.md, section 1). */
const NEVER = /\b(memory|memories|ledger|cache|compile|guard|provenance|pointer|taint|librarian|holdout|ablation|manifest|CAS|hash|procedure|rung|shadow|decider|calibration|receipt|template)\b/i;

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  forgetKnowhow();
  forgetRoutines();
  forgetAgents();
  act(() => {
    store.dispatch({ type: 'me', me: OWNER });
    store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, routines: true } });
    store.dispatch({ type: 'fleet', fleet: { name: 'front-0', members: [], pools: [pool('triage'), pool('identity-desk'), pool('ops')] } });
    store.dispatch({ type: 'faces', faces: [face('triage', 'Triage', 'Sorts each new helpdesk ticket.'), face('identity-desk', 'Identity desk', 'Resets passwords.'), face('ops', 'Ops', 'Keeps the services up.')] });
  });
});
afterEach(() => {
  unmountAll();
  clearNotice();
  clearSaid();
  if (api) api.restore();
});

describe('the agents', () => {
  it('lists the agents that need you first, on the wash, with what needs them, and keeps the tab in each address', async () => {
    api = fakeApi(routes() as never);
    const el = mount(<KnowhowAgents current="triage" tab="notes" />);
    await settle();
    expect(text(el.querySelector('.pane-head'))).toContain('Know-how');
    expect([...el.querySelectorAll('.rt-group-head span:first-child')].map(text)).toEqual(['Needs you', 'Agents']);
    const rows = [...el.querySelectorAll('.kh-row')];
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['#knowhow/triage/notes', '#knowhow/identity-desk/notes', '#knowhow/ops/notes']);
    expect(text(rows[0])).toBe('Triage needs you 1 change waits, 1 routine needs a sign-off');
    expect(rows[0].classList.contains('need')).toBe(true);
    expect(rows[0].getAttribute('aria-current')).toBe('page');
    expect(rows[0].querySelector('.led-amber.breathe')).not.toBeNull();
    expect(text(rows[1])).toBe('Identity desk Resets passwords.');
    expect(api.calls.some((c) => c.path === '/v1/knowhow/waiting')).toBe(true);
  });
});

describe('the header of an agent', () => {
  it('shows the four numbers of the last 7 days, the held-back line, and the switch, under three tabs', async () => {
    api = fakeApi(routes({ 'PUT /v1/knowhow/settings/triage': { ...SETTINGS, askFirst: false } }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    expect(text(el.querySelector('h1'))).toBe('Triage');
    const tabs = el.querySelector('.kh-tabs-head .tabs')!;
    expect([...tabs.querySelectorAll('.tab')].map((t) => t.firstChild!.textContent)).toEqual(['What it learned', 'Notes', 'Routines']);
    expect(tabs.querySelector('.tab.on')!.firstChild!.textContent).toBe('What it learned');
    // What it learned counts the changes that wait in amber, and Routines the routines that need a sign-off.
    expect(text(tabs.querySelector('.tab:first-child .chip-amber'))).toBe('1 1 change waits');
    expect(text(tabs.querySelector('.tab:last-child .chip-amber'))).toBe('1 1 routine needs a sign-off');
    const head = el.querySelector('.kh-head')!;
    expect(text(head.querySelector('h2'))).toBe('Last 7 days');
    expect([...head.querySelectorAll('.kh-figs > div')].map((d) => [text(d.querySelector('dd')), text(d.querySelector('dt'))])).toEqual([
      ['$0.02', 'cost per job, down 16%'],
      ['37% of 380', 'done by routines'],
      ['3', 'notes corrected'],
    ]);
    expect(text(head.querySelector('.kh-held'))).toBe('Held back 1 in 16 runs. Done well: 80% without what it learned, 91% with it. Cost per job: $0.04 without, $0.02 with.');
    // The after-work review runs, so no line says otherwise.
    expect(head.querySelector('.kh-review')).toBeNull();
    const sw = head.querySelector('input[role="switch"]') as HTMLInputElement;
    expect(text(sw.closest('label'))).toBe('Ask me before it keeps what it learns');
    expect(sw.checked).toBe(true);
    act(() => sw.click());
    await settle();
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toEqual({ askFirst: false });
    expect((head.querySelector('input[role="switch"]') as HTMLInputElement).checked).toBe(false);
  });

  it('keeps the switch and lets an answered card go when the list of every agent answers last', async () => {
    let release!: () => void;
    let kept = false;
    api = fakeApi(
      routes({
        'GET /v1/knowhow/waiting?agent=triage': () => ({ body: { waiting: kept ? [] : [WAIT] } }),
        'GET /v1/knowhow/waiting': async () => {
          if (kept) await new Promise<void>((r) => (release = r));
          return { body: { waiting: kept ? [] : [WAIT] } };
        },
        ['POST /v1/knowhow/waiting/' + WAIT.id]: () => {
          kept = true;
          return { body: { kept: true, entry: null } };
        },
      }) as never,
    );
    const list = mount(<KnowhowAgents current="triage" />);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    expect(el.querySelector('.kh-waiting .card')).not.toBeNull();
    click(keyNamed(el.querySelector('.kh-waiting .card')!, 'Keep'));
    await settle();
    release();
    await settle();
    expect(el.querySelector('.kh-waiting .card')).toBeNull();
    expect(el.querySelector('.kh-head input[role="switch"]')).not.toBeNull();
    expect(text(list.querySelector('.kh-row'))).not.toContain('1 change waits');
  });

  it('keeps the header on every tab, and the cards of what waits on What it learned only', async () => {
    api = fakeApi(routes() as never);
    const el = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    expect(el.querySelector('.kh-head .kh-figs')).not.toBeNull();
    expect(el.querySelector('.kh-waiting')).toBeNull();
    expect(el.querySelector('.kh-notes')).not.toBeNull();
  });

  it('shows no percentage while the server says that too few runs were held back, and says when the after-work review is off', async () => {
    api = fakeApi(routes({ 'GET /v1/knowhow/settings/identity-desk': { agent: 'identity-desk', askFirst: false, review: { on: false, reason: 'The after-work review is off: no agent is set.' } } }) as never);
    const el = mount(<KnowhowMain agent="identity-desk" tab="learned" />);
    await settle();
    expect(text(el.querySelector('.kh-held'))).toBe('Not enough held-back runs yet.');
    expect(text(el.querySelector('.kh-figs > div'))).toBe('cost per job, about the same $0.03');
    expect(text(el.querySelector('.kh-review'))).toBe('The after-work review is off: no agent is set.');
    expect(el.querySelector('.kh-waiting')).toBeNull();
    expect(text(el.querySelector('.kh-journal'))).toBe('Nothing learned yet.');
  });

  it('says so in place on a server that keeps no know-how, with its reason behind the question mark, and keeps the tab Routines', async () => {
    const off = 'Know-how is off on this server, because its bus keeps no store for it. An admin runs the server with the bus nats or mem.';
    const no = () => ({ status: 404, body: { detail: off } });
    api = fakeApi({ 'GET /v1/routines': { routines: ROUTINES }, 'GET /v1/knowhow/journal': no, 'GET /v1/knowhow/summary': no, 'GET /v1/knowhow/settings/triage': no, 'GET /v1/knowhow/waiting': no } as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    expect(text(el.querySelector('.kh-body'))).toBe('Know-how is off on this server. ?');
    click(el.querySelector('[aria-label="Why Know-how is off"]'));
    expect(el.querySelector('.help-pop')!.textContent).toBe(off);
    unmountAll();
    const r = mount(<KnowhowMain agent="triage" tab="routines" />);
    await settle();
    expect(r.querySelector('.rt-row[href$="acknowledge-a-new-ticket"]')).not.toBeNull();
    expect(r.textContent).not.toContain('Know-how is off');
  });
});

describe('the changes that wait', () => {
  it('shows each one as the card Keep this?, with Not now and Keep, and keeps it with Keep', async () => {
    api = fakeApi(routes({ ['POST /v1/knowhow/waiting/' + WAIT.id]: { kept: true, entry: null } }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    const card = el.querySelector('.kh-waiting .card')!;
    expect(text(card.querySelector('h3'))).toBe('Keep this?');
    expect(card.querySelector('.led-amber.breathe')).not.toBeNull();
    expect(text(card.querySelector('.kh-what'))).toBe('A new note: VPN portal');
    expect(text(card.querySelector('.kh-text'))).toBe('The VPN portal answers only on its full domain, vpn.corp.example.com.');
    expect(text(card.querySelector('.kh-why'))).toBe('Three runs failed on the short name of the portal and passed with the full one.');
    // A run opens in its chat on this page, not on the dashboard at /ui.
    expect([...card.querySelectorAll('.kh-runs a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Run 1', '#chat/r1'],
      ['Run 2', '#chat/r2'],
    ]);
    expect([...card.querySelectorAll('.card-actions button')].map(text)).toEqual(['Not now', 'Keep']);
    expect(card.querySelector('.key-primary')!.textContent).toBe('Keep');
    click(keyNamed(card, 'Keep'));
    await settle();
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/v1/knowhow/waiting/' + WAIT.id);
    expect(post.body).toEqual({ keep: true });
  });

  it('leaves a change with Not now, and says in a quiet line, not a notice, that its note changed since', async () => {
    api = fakeApi(routes({ ['POST /v1/knowhow/waiting/' + WAIT.id]: () => ({ status: 409, body: { detail: 'a later change touched it' } }) }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    click(keyNamed(el.querySelector('.kh-waiting .card')!, 'Not now'));
    await settle();
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({ keep: false });
    expect(text(el.querySelector('.kh-waiting .rt-changed'))).toBe('This note changed since. Read it again.');
    expect(currentNotice()).toBe('');
  });

  it('never moves a card of the first read, and settles once a card that arrives on the stream', async () => {
    let n = 0;
    const later: WaitingChange = { ...WAIT, id: 'w2', subject: { note: 'gotchas/printer.md' } };
    api = fakeApi(routes({ 'GET /v1/knowhow/waiting?agent=triage': () => ({ body: { waiting: ++n > 1 ? [later, WAIT] : [WAIT] } }) }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    expect(el.querySelector('.kh-waiting .card')!.classList.contains('settle')).toBe(false);
    knowhowChanged({ kind: 'knowhow', agent: 'triage' });
    await settle();
    const cards = [...el.querySelectorAll('.kh-waiting .card')];
    expect(cards.map((c) => c.classList.contains('settle'))).toEqual([true, false]);
  });

  it('lets an operator decide a change of their own notes, and not a change of the agent notes', async () => {
    act(() => store.dispatch({ type: 'me', me: { ...OWNER, roles: { triage: 'operator' } } }));
    const own: WaitingChange = { ...WAIT, id: pid(2), subject: { note: 'mine/vpn.md', scope: 'principal', principal: 'alice@example.com' } };
    api = fakeApi(routes({ 'GET /v1/knowhow/waiting?agent=triage': { waiting: [own, WAIT] } }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    const cards = [...el.querySelectorAll('.kh-waiting .card')];
    expect(cards.map((c) => [...c.querySelectorAll('.card-actions button')].map(text))).toEqual([['Not now', 'Keep'], []]);
    expect(cards[1].classList.contains('quiet')).toBe(true);
  });

  it('shows a person who does not own the agent the change in a quiet card with no key, and no switch', async () => {
    act(() => store.dispatch({ type: 'me', me: { ...OWNER, roles: {} } }));
    api = fakeApi(routes() as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    const card = el.querySelector('.kh-waiting .card')!;
    expect(card.classList.contains('quiet')).toBe(true);
    expect(card.querySelector('button')).toBeNull();
    expect(text(card)).toContain('Waits for a decision of an owner of Triage.');
    expect(el.querySelector('input[role="switch"]')).toBeNull();
    expect(text(el.querySelector('.kh-asks'))).toBe('It asks an owner before it keeps what it learns.');
    expect(keyNamed(el, 'Undo')).toBeUndefined();
  });
});

describe('What it learned', () => {
  it('lists the journal by day, each entry with its time, its sentence, who, its runs, and Undo where it can be undone', async () => {
    api = fakeApi(routes() as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    const j = el.querySelector('.kh-journal')!;
    expect([...j.querySelectorAll('.kh-day-head')].map(text)[0]).toBe(dayWords(JOURNAL[0].at));
    const rows = [...j.querySelectorAll('.kh-entry')];
    expect(rows).toHaveLength(4);
    expect(rows[0].querySelector('time')!.getAttribute('dateTime')).toBe(JOURNAL[0].at);
    expect(text(rows[0].querySelector('.kh-what'))).toBe('The routine Acknowledge a new ticket stepped back to rehearsing.');
    expect(text(rows[0].querySelector('.kh-why'))).toBe('A canary run disagreed with the agent on the team.');
    expect(rows[0].querySelector('.kh-runs a')!.textContent).toBe('The run');
    expect(text(rows[1].querySelector('.kh-what'))).toBe('The note Gitea labels went out of date.');
    expect(text(rows[2].querySelector('.kh-meta'))).toBe('By the after-work review Run 1 Run 2');
    // Only an entry that the server can undo has the key.
    // Only an entry that the server can undo, and that nobody took back yet, has the key.
    expect(rows.map((r) => !!keyNamed(r, 'Undo'))).toEqual([false, false, true, false]);
  });

  it('takes an entry back with Undo, and says in place when a later change touched its note', async () => {
    let n = 0;
    api = fakeApi(routes({ ['POST /v1/knowhow/journal/' + J3 + '/undo']: () => (++n === 1 ? { status: 409, body: { detail: 'a later change touched it' } } : { body: { entry: JOURNAL[2], undone: JOURNAL[2] } }) }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    const row = el.querySelectorAll('.kh-entry')[2];
    click(keyNamed(row, 'Undo'));
    await settle();
    expect(text(row.querySelector('.kh-refused'))).toBe('A later change touched this note. Take that one back first.');
    expect(currentNotice()).toBe('');
    click(keyNamed(row, 'Undo'));
    await settle();
    expect(api.calls.filter((c) => c.path === '/v1/knowhow/journal/' + J3 + '/undo')).toHaveLength(2);
    expect(currentSaid()).toBe('Undone: Learned the note Gitea labels.');
    expect(api.calls.filter((c) => c.path === '/v1/knowhow/journal?agent=triage&limit=50')).toHaveLength(2);
  });

  it('points to Notes when the note of an entry went out of date since, where the owner corrects it', async () => {
    api = fakeApi(routes({ ['POST /v1/knowhow/journal/' + J3 + '/undo']: () => ({ status: 409, body: { detail: 'the note went out of date after this change', outOfDate: true } }) }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="learned" />);
    await settle();
    const row = el.querySelectorAll('.kh-entry')[2];
    click(keyNamed(row, 'Undo'));
    await settle();
    expect(text(row.querySelector('.kh-refused'))).toBe('This note went out of date since. Edit it or put it away in Notes.');
    expect(row.querySelector('.kh-refused a')!.getAttribute('href')).toBe('#knowhow/triage/notes');
    expect(currentNotice()).toBe('');
  });
});

describe('Notes', () => {
  it('groups the notes by scope with their labels, and opens one in place with its text, what put it out of date, and its sources', async () => {
    api = fakeApi(routes() as never);
    const el = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    const notes = el.querySelector('.kh-notes')!;
    expect([...notes.querySelectorAll('.kh-group-head span:first-child')].map(text)).toEqual(['Your notes', 'Agent notes', 'The duty nightly-sweep']);
    const agentRows = [...notes.querySelectorAll('.kh-group')[1].querySelectorAll('.kh-note-head')];
    expect(agentRows.map((r) => text(r.querySelector('.kh-note-top')))).toEqual([
      'Gitea refuses a label name with a space. out of date',
      'The team labels live under team/ in Gitea. checked',
      'The old portal answered on port 8443. resting',
    ]);
    expect(text(agentRows[0].querySelector('.kh-meta'))).toContain('Gitea labels By the after-work review');
    expect(text(agentRows[0].querySelector('.kh-meta'))).toContain('used 7 times');
    expect(agentRows[0].getAttribute('aria-expanded')).toBe('false');
    click(agentRows[0]);
    await settle();
    expect(agentRows[0].getAttribute('aria-expanded')).toBe('true');
    const body = notes.querySelector('.kh-note-body')!;
    expect(text(body.querySelector('.kh-text'))).toBe('Gitea refuses a label name with a space. Use a dash.');
    expect(text(body.querySelector('.kh-ood'))).toBe('Out of date since ' + dateWords(OOD.outOfDate!.since) + ': the page agents/triage/labels.md changed.');
    expect(body.querySelector('.kh-ood a')!.getAttribute('href')).toBe('#pages/agents/triage/labels.md');
    expect(text(body.querySelector('.kh-sources'))).toBe('Sources: a run the page agents/triage/labels.md');
    expect(body.querySelector('.kh-sources a')!.getAttribute('href')).toBe('#chat/r3');
    // The note went out of date, so its owner corrects it: Edit and Put away, and no undo.
    expect([...body.querySelectorAll('button')].map(text)).toEqual(['Edit', 'Put away']);
    // A note of the agent that the person did not write, and that is not out of date, has no key.
    click(agentRows[1]);
    await settle();
    const team = notes.querySelector('.kh-note-body')!;
    expect(text(team.querySelector('.kh-text'))).toBe('The team labels live under team/ in Gitea.');
    expect(team.querySelector('button')).toBeNull();
  });

  it('lets an owner correct an out-of-date note of the agent with its sources, and an operator not', async () => {
    const path = '/v1/knowhow/notes/triage/agent/gotchas/gitea-labels.md';
    api = fakeApi(routes({ ['PUT ' + path]: { note: { ...NOTES[0], state: 'checked' } } }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    click(el.querySelectorAll('.kh-group')[1].querySelector('.kh-note-head'));
    await settle();
    const body = el.querySelector('.kh-note-body')!;
    click(keyNamed(body, 'Edit'));
    typeIn(body.querySelector('textarea'), 'Gitea refuses a space or a slash in a label name.');
    click(keyNamed(body, 'Save'));
    await settle();
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toEqual({ text: 'Gitea refuses a space or a slash in a label name.', ifHash: OOD.hash, sources: OOD.sources });
    unmountAll();
    act(() => store.dispatch({ type: 'me', me: { ...OWNER, roles: { triage: 'operator' } } }));
    const op = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    click(op.querySelectorAll('.kh-group')[1].querySelector('.kh-note-head'));
    await settle();
    expect(op.querySelector('.kh-note-body button')).toBeNull();
  });

  it('gives a viewer whom the wiki refuses the source page as words, not as a link', async () => {
    act(() => store.dispatch({ type: 'me', me: { ...OWNER, roles: { triage: 'viewer', 'identity-desk': 'viewer', ops: 'viewer' } } }));
    api = fakeApi(routes() as never);
    const el = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    click(el.querySelectorAll('.kh-group')[1].querySelector('.kh-note-head'));
    await settle();
    const body = el.querySelector('.kh-note-body')!;
    expect(text(body.querySelector('.kh-ood'))).toBe('Out of date since ' + dateWords(OOD.outOfDate!.since) + ': the page agents/triage/labels.md changed.');
    expect(body.querySelector('.kh-ood a')).toBeNull();
    expect([...body.querySelectorAll('.kh-sources a')].map((a) => a.getAttribute('href'))).toEqual(['#chat/r3']);
    expect(body.querySelector('button')).toBeNull();
  });

  it('edits a note that the person wrote, keeps the draft on a 412 with a quiet line, and saves it again over the newer version', async () => {
    let reads = 0;
    const path = '/v1/knowhow/notes/triage/principal/mine/escalation.md?principal=alice%40example.com';
    let puts = 0;
    api = fakeApi(
      routes({
        ['GET ' + path]: () => ({ body: ++reads > 1 ? { ...MINE, hash: 'h-new', text: 'I escalate P1 tickets by phone and by chat.' } : MINE }),
        ['PUT ' + path]: (_c: Call) => (++puts === 1 ? { status: 412, body: { detail: 'hash' } } : { body: { ok: true } }),
      }) as never,
    );
    const el = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    click(el.querySelector('.kh-group .kh-note-head'));
    await settle();
    const body = el.querySelector('.kh-note-body')!;
    expect([...body.querySelectorAll('button')].map(text)).toEqual(['Edit', 'Put away']);
    click(keyNamed(body, 'Edit'));
    typeIn(body.querySelector('textarea'), 'I escalate P1 tickets by phone, day and night.');
    click(keyNamed(body, 'Save'));
    await settle();
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toEqual({ text: 'I escalate P1 tickets by phone, day and night.', ifHash: 'h-' + 'mine/escalation.md', sources: [] });
    expect(text(body.querySelector('.rt-changed'))).toBe('This note changed since. Read it again.');
    // The newer text shows above the draft, which stays.
    expect(text(body.querySelector('.kh-text'))).toBe('I escalate P1 tickets by phone and by chat.');
    expect((body.querySelector('textarea') as HTMLTextAreaElement).value).toBe('I escalate P1 tickets by phone, day and night.');
    expect(currentNotice()).toBe('');
    click(keyNamed(body, 'Save'));
    await settle();
    expect(api.calls.filter((c) => c.method === 'PUT')[1].body).toMatchObject({ ifHash: 'h-new' });
    expect(el.querySelector('.kh-note-body textarea')).toBeNull();
  });

  it('offers Edit to an operator on their own notes only, as the server lets them change those', async () => {
    act(() => store.dispatch({ type: 'me', me: { ...OWNER, roles: { triage: 'operator' } } }));
    api = fakeApi(routes() as never);
    const el = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    const groups = el.querySelectorAll('.kh-group');
    click(groups[0].querySelector('.kh-note-head'));
    await settle();
    expect([...groups[0].querySelectorAll('.kh-note-body button')].map(text)).toEqual(['Edit', 'Put away']);
    click(groups[1].querySelector('.kh-note-head'));
    await settle();
    expect(groups[1].querySelector('.kh-note-body button')).toBeNull();
  });

  it('says so when a change of a note waits for a decision (202)', async () => {
    const path = '/v1/knowhow/notes/triage/principal/mine/escalation.md?principal=alice%40example.com';
    api = fakeApi(routes({ ['PUT ' + path]: () => ({ status: 202, body: { note: MINE, waiting: { ...WAIT, what: 'updated' } } }) }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    click(el.querySelector('.kh-group .kh-note-head'));
    await settle();
    const body = el.querySelector('.kh-note-body')!;
    click(keyNamed(body, 'Edit'));
    typeIn(body.querySelector('textarea'), 'By phone, and by chat.');
    click(keyNamed(body, 'Save'));
    await settle();
    expect(currentSaid()).toBe('The change waits for a decision in What it learned.');
  });

  it('puts away a note that the person wrote', async () => {
    const path = '/v1/knowhow/notes/triage/principal/mine/escalation.md';
    api = fakeApi(routes({ ['DELETE ' + path + '?principal=alice%40example.com&ifHash=h-mine%2Fescalation.md']: { note: { ...MINE, text: undefined, state: 'put-away' } } }) as never);
    const el = mount(<KnowhowMain agent="triage" tab="notes" />);
    await settle();
    click(el.querySelector('.kh-group .kh-note-head'));
    await settle();
    click(keyNamed(el.querySelector('.kh-note-body')!, 'Put away'));
    await settle();
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true);
    expect(currentSaid()).toBe('Put away the note Escalation.');
  });
});

describe('the tab Routines', () => {
  it('holds the routines of the agent, and goes away on a server that keeps no routines', async () => {
    api = fakeApi(routes() as never);
    const el = mount(<KnowhowMain agent="triage" tab="routines" />);
    await settle();
    const rows = [...el.querySelectorAll('.rt-row')];
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['#routines/triage/acknowledge-a-new-ticket', '#routines/triage/close-a-duplicate']);
    unmountAll();
    act(() => store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, routines: false } }));
    const off = mount(<KnowhowMain agent="triage" tab="routines" />);
    await settle();
    expect([...off.querySelectorAll('.kh-tabs-head .tab')].map((t) => t.firstChild!.textContent)).toEqual(['What it learned', 'Notes']);
    expect(off.querySelector('.kh-journal')).not.toBeNull();
  });
});

describe('the words of the place', () => {
  it('never shows a word that section 2 of the contract forbids, on any tab', async () => {
    api = fakeApi(routes() as never);
    for (const tab of ['learned', 'notes', 'routines'] as const) {
      const el = mount(<KnowhowMain agent="triage" tab={tab} />);
      const list = mount(<KnowhowAgents current="triage" tab={tab} />);
      await settle();
      if (tab === 'notes') {
        for (const h of el.querySelectorAll('.kh-note-head')) click(h);
        await settle();
      }
      for (const box of [el, list]) {
        expect(box.textContent).not.toMatch(NEVER);
        for (const a of box.querySelectorAll('[aria-label], [title]')) expect((a.getAttribute('aria-label') || '') + ' ' + (a.getAttribute('title') || '')).not.toMatch(NEVER);
      }
      unmountAll();
    }
  });
});
