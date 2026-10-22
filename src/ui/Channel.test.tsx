import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import type { Entry, Fleet } from '../api/types';
import type { EntryA } from '../state/bridges-a';
import { Channel, cardOrder, pagesOfBridge } from './Channel';
import { bridgeOf, entryOf, fakeFetch, memberOf, mount, settle, unmountAll } from './testkit-a';

const B = 'b-chan';
const sys = (seq: number, event: string, text: string) => entryOf(seq, { from: { kind: 'system' }, event, text });
const card = (seq: number, state: string) =>
  entryOf(seq, { from: { kind: 'system' }, event: 'needs-you', text: 'migrator-2 wants to run a command.', decision: { run: 'run-migrator-2', id: 'ap-' + seq, tool: 'bash', label: 'Run command', input: { command: 'git push' }, state: state as 'pending' } });

const messages: Entry[] = [
  sys(1, 'opened', 'alice opened the bridge with 3 members.'),
  sys(2, 'started', 'migrator-1 started.'),
  sys(3, 'started', 'migrator-2 started.'),
  sys(4, 'failed', 'reviewer failed: The run reached its limit of 40 turns.'),
  entryOf(5, { from: { kind: 'person', name: 'alice@example.com', display: 'Alice' }, text: 'Start with cron.' }),
  entryOf(6, { from: { kind: 'agent', handle: 'migrator-1' }, to: ['migrator-2'], text: 'I take cron.' }),
  entryOf(7, { from: { kind: 'agent', handle: 'migrator-2' }, to: ['migrator-1'], text: 'I take nginx.' }),
  card(8, 'allow'),
  card(9, 'pending'),
];

const fleet: Fleet = {
  name: 'front-0',
  members: [{ name: 'default/crew-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 1, inputRequired: 0 }],
  pools: [{ name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }] }],
};

let f: ReturnType<typeof fakeFetch>;

beforeAll(() => {
  const members = [memberOf('migrator-1', { presence: 'working', activity: { turn: 1, phrase: 'Read', since: '' } }), memberOf('migrator-2', { presence: 'needs-you' })];
  f = fakeFetch([
    ['GET', /^\/v1\/bridges\/b-chan$/, () => ({ ...bridgeOf(B, { title: 'Migrate the remaining Puppet modules', lastSeq: 9, read: 9 }), members })],
    ['GET', /^\/v1\/bridges\/b-chan\/messages/, () => ({ bridge: B, messages, next: 0, prev: 0 })],
    ['PUT', /\/read$/, () => null],
    ['GET', /^\/v1\/pages$/, () => ({ pages: [] })],
    ['PATCH', /^\/v1\/bridges\/b-chan$/, (body) => ({ ...bridgeOf(B), ...(body as object), members })],
  ]);
  act(() => {
    store.dispatch({ type: 'fleet', fleet });
    store.dispatch({ type: 'bridges', bridges: [bridgeOf(B, { title: 'Migrate the remaining Puppet modules', lastSeq: 9, read: 9 })] });
  });
});
afterEach(unmountAll);
afterAll(() => f.restore());

describe('the channel', () => {
  it('has the title, the tabs with the count of the decisions that wait, Close bridge, and More', async () => {
    const el = mount(<Channel id={B} />);
    await settle();
    expect(el.querySelector('h1')!.textContent).toBe('Migrate the remaining Puppet modules');
    const tabs = [...el.querySelectorAll('nav.tabs a.tab')];
    expect(tabs.map((t) => t.firstChild!.textContent)).toEqual(['Posts', 'Wiki', 'Decisions']);
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(tabs[1].getAttribute('href')).toBe('#bridge/b-chan/wiki');
    expect(tabs[2].getAttribute('href')).toBe('#bridge/b-chan/decisions');
    expect(tabs[2].querySelector('.chip-amber .sr')!.textContent).toBe('1 decision waits');
    expect([...el.querySelectorAll('.pane-actions button')].map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['Close bridge', 'More']);
    act(() => (el.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    expect([...el.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent)).toEqual(['What the manager can do']);
  });

  it('folds the system lines and the agent chatter, and opens a fold in place', async () => {
    const el = mount(<Channel id={B} />);
    await settle();
    const folds = [...el.querySelectorAll('.fold-key')];
    expect(folds.map((x) => x.querySelector('span')!.textContent)).toEqual(['4 updates', 'migrator-1 and migrator-2: 2 messages']);
    expect(folds[0].querySelector('.status')!.textContent).toBe('1 failed');
    expect(el.querySelector('#entry-b-chan-2')).toBeNull();
    act(() => (folds[0] as HTMLButtonElement).click());
    expect(folds[0].getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#entry-b-chan-2')).not.toBeNull();
    expect(el.querySelector('#entry-b-chan-4 .led-red')).not.toBeNull();
    // A card never folds.
    expect(el.querySelector('#entry-b-chan-9 .card')).not.toBeNull();
    expect(el.querySelector('#entry-b-chan-8 .card')).not.toBeNull();
  });

  it('says once that the seats run in waves', async () => {
    const el = mount(<Channel id={B} />);
    await settle();
    const waves = el.querySelectorAll('.waves');
    expect(waves.length).toBe(1);
    expect(waves[0].textContent).toBe('Runs in waves: 2 seats share 1 worker.');
    expect(el.textContent).not.toMatch(/pool/i);
  });

  it('opens the tab Decisions with the cards, waiting first', async () => {
    const el = mount(<Channel id={B} tab="decisions" />);
    await settle();
    expect(el.querySelector('.tab.on')!.firstChild!.textContent).toBe('Decisions');
    expect([...el.querySelectorAll('.cards article')].map((a) => a.id)).toEqual(['entry-b-chan-9', 'entry-b-chan-8']);
    expect(el.querySelector('.composer')).toBeNull();
    const list = [card(1, 'allow'), card(2, 'pending'), { ...card(3, 'pending') }, { ...card(4, 'allow'), decision: { ...card(4, 'allow').decision!, state: 'unknown' } }, entryOf(5)] as EntryA[];
    expect(cardOrder(list)).toEqual([2, 3, 4, 1]);
  });

  it('lists the pages of the bridge in the tab Wiki', () => {
    expect(pagesOfBridge(['bridges/b-chan/plan.md', 'bridges/b-chan2/x.md', 'index.md', 'bridges/b-chan/a/b.md'], 'b-chan')).toEqual(['bridges/b-chan/a/b.md', 'bridges/b-chan/plan.md']);
  });

  it('asks before it closes the bridge, in the words of its key', async () => {
    const el = mount(<Channel id={B} />);
    await settle();
    act(() => ([...el.querySelectorAll('.pane-actions button')].find((b) => b.textContent === 'Close bridge') as HTMLButtonElement).click());
    const dialog = el.querySelector('dialog.confirm')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Close Migrate the remaining Puppet modules?');
    expect(dialog.querySelector('p')!.textContent).toBe('Members finish what they do. The channel takes no new message. The manager writes a report.');
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Close bridge']);
  });

  it('says a bridge is not here, with the key Bridges', () => {
    const el = mount(<Channel id="b-gone" />);
    expect(el.querySelector('.empty p')!.textContent).toBe('This bridge is not here. It was removed, or you cannot see it.');
    expect(el.querySelector('.empty a')!.textContent).toBe('Bridges');
  });
});
