import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import type { Entry, Fleet } from '../api/types';
import { Channel, cardOrder } from './Channel';
import { bridgeOf, entryOf, fakeFetch, memberOf, mount, settle, unmountAll } from './testkit-a';
import { typeIn } from './testkit-c';
import { setFetch } from '../api/client';
import { clearNotice, currentNotice } from './notice';

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
/** The width of the window that the stub of matchMedia reports. */
let width = 1600;

beforeAll(() => {
  window.matchMedia = ((q: string) => {
    const min = /min-width: (\d+)px/.exec(q);
    const max = /max-width: (\d+)px/.exec(q);
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    return { matches, media: q, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  const members = [memberOf('migrator-1', { presence: 'working', activity: { turn: 1, phrase: 'Read', since: '' } }), memberOf('migrator-2', { presence: 'needs-you' })];
  f = fakeFetch([
    ['GET', /^\/v1\/bridges\/b-chan$/, () => ({ ...bridgeOf(B, { title: 'Migrate the remaining Puppet modules', lastSeq: 9, read: 9 }), members })],
    ['GET', /^\/v1\/bridges\/b-chan\/messages/, () => ({ bridge: B, messages, next: 0, prev: 0 })],
    ['PUT', /\/read$/, () => null],
    ['GET', /^\/v1\/pages$/, () => ({ pages: [] })],
    [
      'GET',
      /^\/v1\/bridges\/b-chan\/pages$/,
      () => ({
        bridge: B,
        pages: [
          { path: 'bridges/b-chan/plan.md', title: 'The plan', hash: 'h1', size: 9, by: 'alice@example.com', at: '2026-10-21T20:00:00Z' },
          { path: 'k3s/monitoring/alerts.md', title: 'Alerts of the node', hash: 'h2', size: 9, by: 'agent:migrator', run: 'run-migrator-1', seat: 'migrator-1', at: '2026-10-21T20:01:00Z' },
        ],
        count: 2,
      }),
    ],
    ['PATCH', /^\/v1\/bridges\/b-chan$/, (body) => ({ ...bridgeOf(B), ...(body as object), members })],
  ]);
  act(() => {
    store.dispatch({ type: 'fleet', fleet });
    store.dispatch({ type: 'bridges', bridges: [bridgeOf(B, { title: 'Migrate the remaining Puppet modules', lastSeq: 9, read: 9 })] });
  });
});
afterEach(() => {
  unmountAll();
  width = 1600;
});
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
    expect([...el.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent)).toEqual(['What the manager can do', 'Save as playbook', 'Make this a duty']);
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

  it('leaves out the line of a decision whose card the channel holds, and words the other lines', async () => {
    const D = 'b-dec';
    const dec: Entry[] = [
      sys(1, 'started', 'migrator-2 started: Migrate the nginx module. Read the plan with front.pages_read.'),
      entryOf(2, { ...card(2, 'deny'), decision: { ...card(2, 'deny').decision!, decidedBy: 'token', note: 'No remote.' } }),
      entryOf(3, { from: { kind: 'system' }, event: 'decided', text: 'the token of the fleet denied the call of migrator-2, with the note: No remote.', mirrors: { run: 'run-migrator-2', seq: 7, type: 'fw.approval.decided' } }),
      entryOf(4, { from: { kind: 'system' }, event: 'decided', text: 'alice@example.com allowed the call of migrator-9.', mirrors: { run: 'run-migrator-9', seq: 4, type: 'fw.approval.decided' } }),
      entryOf(5, { from: { kind: 'person', name: 'token' }, text: 'Push it.' }),
      sys(6, 'asleep', 'migrator-2 went to sleep. A message wakes its Task.'),
    ];
    const g = fakeFetch([
      ['GET', /^\/v1\/bridges\/b-dec$/, () => ({ ...bridgeOf(D, { lastSeq: 6, read: 6 }), members: [memberOf('migrator-2')] })],
      ['GET', /^\/v1\/bridges\/b-dec\/messages/, () => ({ bridge: D, messages: dec, next: 0, prev: 0 })],
      ['PUT', /\/read$/, () => null],
    ]);
    try {
      act(() => {
        store.dispatch({ type: 'me', me: { principal: { subject: 'token', kind: 'token' }, roles: {}, admin: false, canCreate: true } });
        store.dispatch({ type: 'bridges', bridges: [bridgeOf(B, { title: 'Migrate the remaining Puppet modules', lastSeq: 9, read: 9 }), bridgeOf(D, { lastSeq: 6, read: 6 })] });
      });
      const el = mount(<Channel id={D} />);
      await settle();
      expect(el.querySelector('#entry-b-dec-3')).toBeNull();
      expect(el.querySelector('#entry-b-dec-2 .decided p')!.firstChild!.textContent).toBe('You denied this');
      const lines = [...el.querySelectorAll('.sys .sys-text')].map((x) => x.textContent);
      expect(lines).toEqual(['migrator-2 took the seat', "alice allowed migrator-9's command", 'migrator-2 went to sleep']);
      expect(el.querySelector('#entry-b-dec-5 header b')!.textContent).toBe('You');
    } finally {
      g.restore();
    }
  });

  it('folds the sleep and wake lines of a seat with nothing between them into one quiet line', async () => {
    const N = 'b-nap';
    const alice = { kind: 'person' as const, name: 'alice@example.com', display: 'Alice' };
    const naps: Entry[] = [
      entryOf(1, { from: alice, text: 'Start with cron.' }),
      sys(2, 'asleep', 'migrator-1 went to sleep. A message wakes its Task.'),
      sys(3, 'started', 'migrator-1 woke up.'),
      sys(4, 'asleep', 'migrator-1 went to sleep'),
      sys(5, 'started', 'migrator-1 woke up'),
      entryOf(6, { from: alice, text: 'How far is cron?' }),
      sys(7, 'asleep', 'migrator-1 went to sleep.'),
    ];
    const g = fakeFetch([
      ['GET', /^\/v1\/bridges\/b-nap$/, () => ({ ...bridgeOf(N, { lastSeq: 7, read: 7 }), members: [memberOf('migrator-1')] })],
      ['GET', /^\/v1\/bridges\/b-nap\/messages/, () => ({ bridge: N, messages: naps, next: 0, prev: 0 })],
      ['PUT', /\/read$/, () => null],
    ]);
    try {
      act(() => store.dispatch({ type: 'bridges', bridges: [bridgeOf(B, { title: 'Migrate the remaining Puppet modules', lastSeq: 9, read: 9 }), bridgeOf(N, { lastSeq: 7, read: 7 })] }));
      const el = mount(<Channel id={N} />);
      await settle();
      expect([...el.querySelectorAll('.sys .sys-text')].map((x) => x.textContent)).toEqual(['migrator-1 slept and woke up 2 times', 'migrator-1 went to sleep']);
      expect(el.querySelector('.fold-key')).toBeNull();
    } finally {
      g.restore();
    }
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
    const list = [card(1, 'allow'), card(2, 'pending'), { ...card(3, 'pending') }, { ...card(4, 'allow'), decision: { ...card(4, 'allow').decision!, state: 'unknown' } }, entryOf(5)] as Entry[];
    expect(cardOrder(list)).toEqual([2, 3, 4, 1]);
    // A question of a seat is a decision for you: it waits with the cards, and an answered one goes with the decided.
    const asks = [...list, entryOf(6, { to: ['operator'], text: 'Restart sshd?', ask: { choices: ['Yes', 'No'] } }), entryOf(7, { to: ['operator'], text: 'Which host?', ask: {} })];
    expect(cardOrder(asks, (e) => e.seq === 6)).toEqual([2, 3, 6, 4, 7, 1]);
  });

  it('lists the pages of the work of the bridge in the tab Wiki, wherever its seats wrote them, and keeps the list current', async () => {
    const el = mount(<Channel id={B} tab="wiki" />);
    await settle();
    const rows = () => [...el.querySelectorAll('.prow')] as HTMLAnchorElement[];
    expect(rows().map((a) => a.getAttribute('href'))).toEqual(['#pages/bridges/b-chan/plan.md', '#pages/k3s/monitoring/alerts.md']);
    expect(rows().map((a) => a.querySelector('.prow-title')!.textContent)).toEqual(['The plan', 'Alerts of the node']);
    // The folder of the bridge needs no name, a page elsewhere keeps its path, and each row names who wrote it.
    expect(rows().map((a) => a.querySelector('.prow-path')!.textContent)).toEqual(['plan', 'k3s/monitoring/alerts']);
    expect(rows()[0].querySelector('.prow-meta')!.textContent).toMatch(/^alice/);
    expect(rows()[1].querySelector('.prow-seat')!.textContent).toBe('migrator-1');
    expect(rows()[1].querySelector('.prow-seat .mark')).not.toBeNull();
    // A page that a seat of the bridge writes joins the list, and a page that a person writes again leaves it.
    const page = (path: string, more: object) => ({ type: 'stream' as const, event: { id: '', kind: 'page' as const, data: { path, title: '', hash: 'h', size: 1, by: 'agent:migrator', at: '2026-10-21T20:05:00Z', ...more } } });
    act(() => store.dispatch(page('k3s/monitoring/rules.md', { title: 'Rules', run: 'run-migrator-2' })));
    expect(rows().map((a) => a.getAttribute('href'))).toEqual(['#pages/bridges/b-chan/plan.md', '#pages/k3s/monitoring/alerts.md', '#pages/k3s/monitoring/rules.md']);
    expect(rows()[2].querySelector('.prow-seat')!.textContent).toBe('migrator-2');
    act(() => store.dispatch(page('k3s/monitoring/alerts.md', { title: 'Alerts', by: 'bob@example.com' })));
    expect(rows().map((a) => a.querySelector('.prow-title')!.textContent)).toEqual(['The plan', 'Rules']);
  });

  it('asks before it closes the bridge, in the words of its key', async () => {
    const el = mount(<Channel id={B} />);
    await settle();
    act(() => ([...el.querySelectorAll('.pane-actions button')].find((b) => b.textContent === 'Close bridge') as HTMLButtonElement).click());
    const dialog = el.querySelector('dialog.confirm')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Close Migrate the remaining Puppet modules?');
    expect(dialog.querySelector('p')!.textContent).toBe('Members finish what they do. The channel takes no new message. The manager writes a report. You can reopen it from More.');
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Close bridge']);
  });

  it('moves Close bridge into More below 1500 pixels, so the title keeps its room, and the tabs to a strip where the window is narrow', async () => {
    width = 1440;
    let el = mount(<Channel id={B} />);
    await settle();
    expect([...el.querySelectorAll('.pane-actions button')].map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['More']);
    expect(el.querySelector('.pane-actions a.collapsed-only')!.getAttribute('href')).toBe('#bridge/b-chan/roster');
    act(() => (el.querySelector('button[aria-label="More"]') as HTMLButtonElement).click());
    expect([...el.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent)).toEqual(['What the manager can do', 'Save as playbook', 'Make this a duty', 'Close bridge']);
    expect(el.querySelector('.pane-head .tabs')).not.toBeNull();
    unmountAll();
    width = 390;
    el = mount(<Channel id={B} />);
    await settle();
    expect(el.querySelector('.pane-head .tabs')).toBeNull();
    expect(el.querySelector('.tab-strip .tabs')).not.toBeNull();
  });

  it('says a bridge is not here, with the key Bridges, and raises no notice for the 404', async () => {
    clearNotice();
    const el = mount(<Channel id="b-gone" />);
    expect(el.querySelector('.empty p')!.textContent).toBe('This bridge is not here. It was removed, or you cannot see it.');
    expect(el.querySelector('.empty a')!.textContent).toBe('Bridges');
    await settle();
    expect(f.seen.some((x) => x.path.startsWith('/v1/bridges/b-gone'))).toBe(true);
    expect(currentNotice()).toBe('');
  });
});

describe('a closed bridge', () => {
  const S = 'b-shut';
  const ask = entryOf(3, { from: { kind: 'agent', handle: 'reviewer', run: 'run-reviewer' }, to: ['operator'], text: 'Which host?', ask: {} });
  const shut = () => ({ ...bridgeOf(S, { title: 'Done work', state: 'closed', lastSeq: 3, read: 3, needsYou: 1 }), members: [memberOf('reviewer', { question: 3 })] });
  let g: ReturnType<typeof fakeFetch>;
  beforeAll(() => {
    g = fakeFetch([
      ['GET', /^\/v1\/bridges\/b-shut$/, shut],
      ['GET', /^\/v1\/bridges\/b-shut\/messages/, () => ({ bridge: S, messages: [sys(1, 'opened', 'alice opened the bridge.'), ask], next: 0, prev: 0 })],
      ['GET', /^\/v1\/bridges\/b-shut\/pages$/, () => ({ bridge: S, pages: [], count: 0 })],
      ['GET', /^\/v1\/pages$/, () => ({ pages: [] })],
      ['PUT', /\/read$/, () => null],
    ]);
    act(() => store.dispatch({ type: 'bridges', bridges: [bridgeOf(B, { title: 'Migrate the remaining Puppet modules', lastSeq: 9, read: 9 }), shut()] }));
  });
  afterAll(() => g.restore());

  it('counts no question as waiting, shows it as the message it is, and says that nothing waits', async () => {
    const el = mount(<Channel id={S} tab="decisions" />);
    await settle();
    const tabs = [...el.querySelectorAll('nav.tabs a.tab')];
    expect(tabs[2].querySelector('.chip-amber')).toBeNull();
    expect(el.querySelector('.cards-none')!.textContent).toBe('Nothing waits for you. The cards below were decided or answered.');
    expect(el.querySelector('.card-row.waiting')).toBeNull();
    expect(el.querySelector('#entry-b-shut-3')!.textContent).toContain('Which host?');
  });

  it('says in the tab Wiki what the pages of a bridge are, with the key New page', async () => {
    const el = mount(<Channel id={S} tab="wiki" />);
    await settle();
    expect(el.querySelector('.tab-list .empty p')!.textContent).toBe('No page yet. The members keep their notes and reports here, and you can write one too.');
    expect([...el.querySelectorAll('.tab-list .empty a')].map((a) => a.textContent)).toEqual(['New page']);
  });
});

describe('the files of a message in the channel', () => {
  const pick = (el: HTMLElement, files: File[]) => {
    const input = el.querySelector('.composer input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const submit = async (el: HTMLElement) => {
    await act(async () => {
      (el.querySelector('.composer form, form.composer') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
  };

  it('keeps the draft and its files when the front refuses them, and says what to do', async () => {
    const answers = [
      { status: 409, detail: 'files go only to a member with a run, and reviewer has none yet: send them once it works, or address another member' },
      { status: 413, detail: '' },
    ];
    const posts: unknown[] = [];
    const old = setFetch(async (input, init) => {
      if (init && init.method === 'POST' && String(input).endsWith('/v1/bridges/b-chan/messages')) {
        posts.push(JSON.parse(String(init.body)));
        const a = answers.shift()!;
        return new Response(a.detail ? JSON.stringify({ detail: a.detail }) : '<html>Request Entity Too Large</html>', { status: a.status, headers: { 'Content-Type': a.detail ? 'application/problem+json' : 'text/html' } });
      }
      return old(input, init);
    });
    try {
      const el = mount(<Channel id={B} />);
      await settle();
      typeIn(el.querySelector('.composer textarea'), 'The schedule');
      pick(el, [new File(['name,role'], 'team.csv')]);
      await submit(el);
      expect(posts[0]).toEqual({ text: 'The schedule', files: [{ name: 'team.csv', data: 'bmFtZSxyb2xl' }] });
      expect(currentNotice()).toBe('Files go only to a member with a run, and reviewer has none yet: send them once it works, or address another member.');
      expect((el.querySelector('.composer textarea') as HTMLTextAreaElement).value).toBe('The schedule');
      expect([...el.querySelectorAll('.composer .attached li')].map((li) => li.textContent)).toEqual(['team.csv9 B']);
      await submit(el);
      expect(posts).toHaveLength(2);
      expect(currentNotice()).toBe('The files are too large to send. Remove some, and send again.');
      expect([...el.querySelectorAll('.composer .attached li')].map((li) => li.textContent)).toEqual(['team.csv9 B']);
    } finally {
      setFetch(old);
      clearNotice();
    }
  });

  it('names the files of an entry with their sizes, also of an entry without text', async () => {
    const withFiles = [
      ...messages,
      entryOf(10, { from: { kind: 'person', name: 'alice@example.com', display: 'Alice' }, text: '', files: [{ name: 'team.csv', size: 25, mediaType: 'text/plain' }, { name: 'plan.pdf', size: 2_200_000, mediaType: 'application/pdf' }] }),
    ];
    const old = setFetch(async (input, init) => {
      if ((!init || !init.method || init.method === 'GET') && /\/v1\/bridges\/b-chan\/messages/.test(String(input))) {
        return new Response(JSON.stringify({ bridge: B, messages: withFiles, next: 0, prev: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return old(input, init);
    });
    try {
      act(() => store.dispatch({ type: 'bridges', bridges: [bridgeOf(B, { title: 'Migrate the remaining Puppet modules', lastSeq: 10, read: 10 })] }));
      const el = mount(<Channel id={B} />);
      await settle();
      const row = el.querySelector('article[data-seq="10"]')!;
      expect([...row.querySelectorAll('.attached li')].map((li) => li.textContent)).toEqual(['team.csv25 B', 'plan.pdf2.1 MB']);
      expect(row.querySelector('.attached')!.getAttribute('aria-label')).toBe('Attached files');
      expect(row.querySelector('.attached button')).toBeNull();
      expect(row.getAttribute('aria-label')).toBe('Alice, team.csv and plan.pdf');
    } finally {
      setFetch(old);
    }
  });
});
