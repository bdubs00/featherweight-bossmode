import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { setToken } from '../api/client';
import type { Entry } from '../api/types';
import { App } from './App';
import { showError } from './notice';
import { at, bridge, fakeFetch, FLEET, mount, seat, unmountAll } from './testkit-b';

// The whole page against a small fake backend. A relative link without #
// loads /bossmode/<path>, where the page starts with no address and opens
// the default route, so every link of the page must name a route of the
// page, a route of the API or of /ui, or an outside address.

const SAFE = /^(#|\/v1\/|\/ui|https?:|mailto:)/;

const members = [seat('migrator-1', 'migrator', 'working'), seat('reviewer', 'reviewer', 'idle')];
const sys = (seq: number, event: string, text: string, more: Partial<Entry> = {}): Entry => ({ seq, at: at(seq), from: { kind: 'system' }, to: [], text, event, ...more });
const messages: Entry[] = [
  sys(1, 'opened', 'token opened the bridge with 2 members.'),
  { seq: 2, at: at(2), from: { kind: 'person', name: 'token' }, to: [], text: 'Read [the plan](plan.md), [the style](../../runbooks/ansible-style.md), [the site](https://example.com/), and [a file](roles/cron/tasks/main.yml).' },
  sys(3, 'changed', 'The report is in the wiki: [bridges/b1/report.md](bridges/b1/report.md).'),
  { seq: 4, at: at(4), from: { kind: 'agent', handle: 'migrator-1', run: 'run-migrator-1' }, to: [], text: 'Done.', cut: true },
];
const LEARNED = `# What people liked from migrator

## 2026-10-22, bridge "Migrate Puppet" (b1), migrator-1, run 01RUN

- What token asked: Migrate cron.
- What migrator did: Kept the names.
- The note of token: Good.
- [Open the run](#run/01RUN)
`;

/** A routine that needs you, with the evidence of a rehearsal, a replay, and one disagreement. */
const ROUTINE = {
  agent: 'migrator',
  routine: { name: 'ack', version: 1, questions: { team: { type: 'choice', criteria: { a: '', b: '' }, act: 0.8 } }, steps: [{ tool: 'gitea.issue_write', input: '{"method": "add_labels"}' }], after: [] },
  standing: 'rehearsing',
  ready: true,
  history: [{ at: at(0), by: 'token', standing: 'rehearsing' }],
  source: { runs: 3, from: '2026-10-01', to: '2026-10-10', proposedBy: 'fw routine propose' },
  createdAt: at(0),
  updatedAt: at(0),
};
const EVIDENCE = {
  days: [{ day: '2026-10-22', decided: 3, acted: 2, agreed: 2, disagreed: 0, handed: 1, applied: 0, failed: 0 }],
  questions: { team: { bands: [{ from: 0.8, to: 1, runs: 2, agreed: 2 }] } },
  disagreements: [{ run: 'run-9', input: '#9 A ticket', answers: { team: { said: 'a', observed: 'b' } } }],
  sentBack: { applied: 0, agreed: 0 },
  replay: { matched: 3, total: 3, at: at(0), runs: [{ run: 'run-8', input: '#8 A past ticket', same: true }] },
};

const stream = () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

let restore = () => {};

beforeAll(() => {
  setToken('t');
  const f = fakeFetch([
    ['GET', /^\/v1\/whoami$/, () => ({ principal: { subject: 'token', kind: 'token' }, roles: {}, admin: true, canCreate: true })],
    ['GET', /^\/v1\/bossmode$/, () => ({ manager: { agent: 'manager', member: 'default/boss-0', run: '' }, placement: 'queue', maxMembers: 16, chat: { agent: 'manager', member: 'default/boss-0' } })],
    ['GET', /^\/v1\/bossmode\/stream/, stream],
    ['GET', /^\/v1\/bridges$/, () => ({ bridges: [bridge('b1', 'Migrate Puppet')] })],
    ['GET', /^\/v1\/bridges\/b1$/, () => bridge('b1', 'Migrate Puppet', members)],
    ['GET', /^\/v1\/bridges\/b1\/messages/, () => ({ bridge: 'b1', messages, next: 0, prev: 0 })],
    ['PUT', /\/read$/, () => null],
    ['GET', /^\/v1\/faces$/, () => ({ faces: [] })],
    ['GET', /^\/v1\/agents$/, () => ({ agents: [{ name: 'default', role: 'owner' }] })],
    ['GET', /^\/v1\/fleet$/, () => FLEET],
    ['GET', /^\/v1\/bossmode\/skills$/, () => ({ skills: [{ name: 'ansible-style', description: 'Write roles.', origin: 'imported' }] })],
    ['GET', /^\/v1\/tools$/, () => ({ tools: [{ name: 'bash', description: 'x', text: 'Runs a command.', source: 'builtin' }] })],
    ['GET', /^\/v1\/pages$/, () => ({ pages: [{ path: 'bridges/b1/plan.md', title: 'Plan', hash: 'h', size: 1, by: 'token', at: at(0) }] })],
    ['GET', /^\/v1\/pages\/bridges\/b1\/plan\.md$/, () => ({ path: 'bridges/b1/plan.md', title: 'Plan', hash: 'h', size: 1, by: 'token', at: at(0), text: 'Follow [the house style](../../runbooks/ansible-style.md) and [the notes](notes.md). See [the outside](../../../../etc/hosts).' })],
    ['GET', /^\/v1\/pages\/agents\/migrator\/learned\.md$/, () => ({ path: 'agents/migrator/learned.md', title: 'Liked', hash: 'l', size: 1, by: 'bossmode', at: at(0), text: LEARNED })],
    ['GET', /^\/v1\/pools\//, () => FLEET.pools![0]],
    ['GET', /^\/v1\/fleet\/runs/, () => ({ runs: [] })],
    ['GET', /^\/v1\/routines$/, () => ({ routines: [ROUTINE] })],
    ['GET', /^\/v1\/routines\/summary/, () => ({ runs: 3, byRoutine: 1, byAgent: 1, withPerson: 1, costUSD: { routine: 0.001, agent: 0.02 }, sentBack: 0 })],
    ['GET', /^\/v1\/routines\/migrator\/ack$/, () => ({ ...ROUTINE, evidence: EVIDENCE })],
  ]);
  restore = f.restore;
});
afterAll(() => {
  unmountAll();
  restore();
});

const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

const visit = async (hash: string) => {
  await act(async () => {
    location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await settle();
};

describe('the links of the page', () => {
  it('name a route of the page, of the API, of /ui, or an outside address, on every screen', async () => {
    const el = mount(<App />);
    await vi.waitFor(() => expect(el.querySelector('.appbar, nav')).not.toBeNull());
    const seen: string[] = [];
    for (const hash of ['#bridge/b1', '#bridge/b1/wiki', '#fleet', '#member/b1/migrator-1', '#member/b1/migrator-1/profile', '#skills', '#skills/add', '#pages/bridges/b1/plan.md', '#chat', '#chat/new', '#manager', '#activity', '#new', '#new-agent', '#board', '#routines', '#routines/migrator/ack', '#routines/migrator/ack/evidence', '#routines/migrator/ack/runbook', '#routines/migrator/ack/agent']) {
      await visit(hash);
      for (const a of document.querySelectorAll('a[href]')) seen.push(hash + ' ' + a.getAttribute('href'));
    }
    expect(seen.length).toBeGreaterThan(50);
    expect(seen.filter((x) => !SAFE.test(x.split(' ')[1]))).toEqual([]);
  });

  it('give Add skill the address of the chooser', async () => {
    await visit('#skills');
    const keys = [...document.querySelectorAll('a')].filter((a) => a.textContent === 'Add skill');
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.getAttribute('href')).toBe('#skills/add');
  });
});

describe('the notice of a failed action', () => {
  it('clears when the person moves to another screen', async () => {
    const el = mount(<App />);
    await vi.waitFor(() => expect(el.querySelector('.appbar, nav')).not.toBeNull());
    await visit('#wiki');
    act(() => showError(new Error('The save failed.')));
    await vi.waitFor(() => expect(el.querySelector('[role=alert]')).not.toBeNull());
    expect(el.querySelector('[role=alert]')!.textContent).toContain('The save failed.');
    await visit('#fleet');
    expect(el.querySelector('[role=alert]')).toBeNull();
  });
});
