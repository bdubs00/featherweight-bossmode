import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { DoneSec, KeepField, Profile, forgetProfileReads } from './Profile';
import { FLEET, fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';
import { forgetProfiles } from '../state/profiles';
import { store } from '../state/store';
import { clearSaid, currentSaid } from './notice';
import { forgetQueued } from '../state/queued';

let calls: Call[] = [];
let restore = () => {};

// What people liked, as the server writes it: the newest entry first. The
// newest heading says channel, as the server writes it now, and the older
// one says bridge, as an older page keeps it.
const LEARNED = [
  '# What people liked from migrator',
  '',
  '## 2026-10-22, channel "Migrate Puppet" (b1), migrator-1, run 01RUN1',
  '',
  '- What alice asked: Migrate the cron module.',
  '- What migrator did: Ran the lint.',
  '- The note of alice: Clean.',
  '- [Open the run](#run/01RUN1)',
  '',
  '## 2026-10-21, bridge "Migrate Puppet" (b1), migrator-2, run 01RUN2',
  '',
  '- What bob asked: Keep the names.',
  '- What migrator did: Kept the names.',
  '- [Open the run](#run/01RUN2)',
  '',
].join('\n');

// The fleet names crew as the pool of migrator, so the profile reads that
// pool for Keep and the gaps. Its phases are older than the stream, as the
// read of another replica of the front can be: the page shows the stream.
const POOL = { name: 'crew', wanted: 1, actual: 1, ready: 1, tasks: [{ name: 'crew-0', phase: 'Suspended' }, { name: 'crew-9', phase: 'Suspended', current: false }], gaps: ['crew-9 runs an older configuration.'] };

/** The fleet of the stream: crew-0 is awake, and crew-9 of an older configuration too. */
const STREAM_FLEET = { ...FLEET, pools: FLEET.pools!.map((p) => (p.name === 'crew' ? { ...p, tasks: [...p.tasks, { name: 'crew-9', phase: 'Running', current: false }] } : p)) };

beforeEach(() => {
  forgetProfiles();
  forgetProfileReads();
  forgetQueued();
  const f = fakeFetch([
    ['PATCH', /^\/v1\/pools\/crew$/, (b) => ({ ...POOL, wanted: (b as { replicas: number }).replicas })],
    ['GET', /^\/v1\/pools\/crew$/, () => POOL],
    // The front answers a delete of a pool with 202 and the pool, which deletes its workers once they are idle.
    ['DELETE', /^\/v1\/pools\/crew$/, () => ({ ...POOL, wanted: 0, deleting: true })],
    ['GET', /^\/v1\/bossmode\/agents\/migrator\/today$/, () => ({ runs: 7, costUSD: 1.9, decisions: 2 })],
    ['GET', /^\/v1\/pages\/agents\/migrator\/learned\.md$/, () => ({ path: 'agents/migrator/learned.md', text: LEARNED })],
    ['GET', /^\/v1\/runs\/run-migrator-2$/, () => ({ id: 'run-migrator-2', agent: 'migrator', state: 'completed', seq: 1, createdAt: '', updatedAt: '' })],
  ]);
  calls = f.calls;
  restore = f.restore;
  seedFleet();
  act(() => store.dispatch({ type: 'fleet', fleet: STREAM_FLEET }));
});

afterEach(() => {
  unmountAll();
  restore();
});

const typeIn = (input: HTMLInputElement, v: string) =>
  act(() => {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
const enter = (input: HTMLInputElement) =>
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

describe('the Keep field', () => {
  it('refuses a number that is not whole, at the moment the person enters it', () => {
    const saved = vi.fn();
    const el = mount(<KeepField agent="migrator" value={3} owner onSaved={saved} />);
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('3');
    typeIn(input, '2.5');
    enter(input);
    expect(el.querySelector('[role="alert"]')!.textContent).toBe('Keep is a whole number, 0 or more.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('changes Keep in place with the number of replicas', async () => {
    const saved = vi.fn();
    const el = mount(<KeepField agent="migrator" value={3} owner onSaved={saved} />);
    const input = el.querySelector('input') as HTMLInputElement;
    typeIn(input, '5');
    enter(input);
    await vi.waitFor(() => expect(saved).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/v1/pools/crew', body: { replicas: 5 } });
    expect(saved.mock.calls[0][0].wanted).toBe(5);
  });

  it('sends nothing when the number stays the same, and shows the number alone to a person who is not an owner', () => {
    const el = mount(<KeepField agent="migrator" value={3} owner onSaved={() => {}} />);
    enter(el.querySelector('input') as HTMLInputElement);
    expect(calls.length).toBe(0);
    const ro = mount(<KeepField agent="reviewer" value={2} owner={false} onSaved={() => {}} />);
    expect(ro.querySelector('input')).toBeNull();
    expect(ro.textContent).toBe('Keep 2');
  });
});

describe('the profile', () => {
  it('shows What people liked, the workers with Keep, and Today, and never says pool', async () => {
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.workers li').length).toBe(2));
    await vi.waitFor(() => expect(el.querySelectorAll('.liked li').length).toBe(2));
    await vi.waitFor(() => expect(el.querySelector('.today')).not.toBeNull());
    const heads = [...el.querySelectorAll('.prof-sec h3')].map((h) => h.textContent);
    expect(heads).toEqual(['What it can do', 'What people liked', 'Workers', 'Today']);
    // Each heart: the note of the person first, what was asked as a muted line, the answer, and Open the run.
    const first = el.querySelectorAll('.liked li')[0];
    expect([...first.querySelectorAll('.liked-body > *')].map((x) => x.className + ' ' + x.textContent)).toEqual([
      'liked-note Liked because: Clean.',
      'liked-asked clip Asked: Migrate the cron module.',
      'liked-did Answer: Ran the lint.',
      'prof-link Open the run',
    ]);
    expect(first.querySelector('a.prof-link')!.getAttribute('href')).toBe('#bridge/b1/run/01RUN1/migrator-1');
    expect(el.querySelectorAll('.liked li')[1].querySelector('.liked-note')).toBeNull();
    // The entry of the older form links its run in its channel too.
    expect(el.querySelectorAll('.liked li')[1].querySelector('a.prof-link')!.getAttribute('href')).toBe('#bridge/b1/run/01RUN2/migrator-2');
    expect(el.querySelector('.liked')!.textContent).not.toMatch(/\bbridge\b/);
    expect([...el.querySelectorAll('.prof-link')].map((a) => a.getAttribute('href'))).toContain('#pages/agents/migrator/learned.md');
    expect(el.querySelector('.help-key')!.getAttribute('aria-label')).toBe('What is a worker');
    expect((el.querySelector('.keep input') as HTMLInputElement).value).toBe('1');
    const row = el.querySelectorAll('.workers li')[0];
    expect(row.querySelector('.worker-name')!.textContent).toBe('crew-0');
    expect(row.querySelector('.status-word')!.textContent).toBe('awake');
    expect(el.querySelectorAll('.workers li')[1].textContent).toContain('old setup');
    expect(el.querySelector('.worker-old')!.getAttribute('title')).toBe('It takes the new setup of the agent when it starts again.');
    // The words of the server for the gaps sit in a fold under one plain line.
    expect(el.querySelector('.worker-gaps > p')!.textContent).toBe('Some changes have not reached the workers of this agent yet. An admin can read why.');
    expect(el.querySelector('.worker-gaps details li')!.textContent).toBe('crew-9 runs an older configuration.');
    expect(el.querySelector('.today')!.textContent).toBe('7 runs$1.902 decisions');
    expect(el.querySelector('.prof-skills')!.textContent).toMatch(/^\d+ skills?$/);
    expect(el.querySelector('.prof-skills')!.tagName).toBe('SPAN');
    expect(el.textContent!.toLowerCase()).not.toContain('pool');
    expect(calls.some((c) => c.path === '/v1/pools/crew')).toBe(true);
  });

  it('says under $0.01 for a day that cost less than one cent, never $0.00', async () => {
    restore();
    const f = fakeFetch([
      ['GET', /^\/v1\/pools\/crew$/, () => POOL],
      ['GET', /^\/v1\/bossmode\/agents\/migrator\/today$/, () => ({ runs: 1, costUSD: 0.0042, decisions: 0 })],
    ]);
    restore = f.restore;
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelector('.today')).not.toBeNull());
    expect(el.querySelector('.today')!.textContent).toBe('1 rununder $0.010 decisions');
    expect([...el.querySelectorAll('.today b')].map((b) => b.textContent)).toEqual(['1', '$0.01', '0']);
  });

  it('reads no pool for an agent that no pool runs, so its profile asks nothing that answers 404', async () => {
    const el = mount(<Profile agent="reviewer" />);
    await vi.waitFor(() => expect(calls.some((c) => c.path.startsWith('/v1/bossmode/agents/reviewer/today'))).toBe(true));
    expect(calls.some((c) => c.path.startsWith('/v1/pools/'))).toBe(false);
    expect(el.querySelector('.keep-read, .keep input')).not.toBeNull();
  });

  it('reads no page of hearts that the list of the wiki does not hold, and shows no section for an agent with no heart', async () => {
    act(() => store.dispatch({ type: 'pages', pages: [{ path: 'index.md', title: 'Index', hash: 'h', by: 'alice', at: '', size: 1 }] }));
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelector('.workers')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.some((c) => c.path.startsWith('/v1/pages/agents/migrator/learned.md'))).toBe(false);
    expect(el.querySelector('[aria-labelledby="liked-migrator"]')).toBeNull();
    expect(el.textContent).not.toContain('What people liked');
  });

  it('reads no page of the wiki for a person who views every agent, as the wiki refuses them, and still shows the profile (F31)', async () => {
    act(() => store.dispatch({ type: 'me', me: { principal: { subject: 'erin@example.com', name: 'Erin' }, roles: { migrator: 'viewer', reviewer: 'viewer' }, admin: false, canCreate: false } }));
    try {
      const el = mount(<Profile agent="migrator" />);
      await vi.waitFor(() => expect(el.querySelector('.workers')).not.toBeNull());
      await new Promise((r) => setTimeout(r, 20));
      expect(calls.some((c) => c.path.startsWith('/v1/pages/'))).toBe(false);
      expect(el.textContent).not.toContain('What people liked');
      expect(el.querySelector('.prof-sec h3')!.textContent).toBe('What it can do');
    } finally {
      act(() => store.dispatch({ type: 'me', me: null }));
    }
  });

  it('words each worker from the phase of the stream, never from the read of the pool', async () => {
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(calls.some((c) => c.path === '/v1/pools/crew')).toBe(true));
    const words = () => [...el.querySelectorAll('.workers li .status-word')].map((x) => x.textContent);
    expect(words()).toEqual(['awake', 'awake']);
    act(() => store.dispatch({ type: 'stream', event: { id: '', kind: 'task', data: { kind: 'task', member: 'default/crew-0', phase: 'Suspended', time: '' } } }));
    expect(words()).toEqual(['asleep', 'awake']);
  });

  it('reads the pool and today once on open, again only on an event of the agent, and at most every few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const reads = (path: string) => calls.filter((c) => c.method === 'GET' && c.path === path).length;
      mount(<Profile agent="migrator" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect([reads('/v1/pools/crew'), reads('/v1/bossmode/agents/migrator/today')]).toEqual([1, 1]);
      // A minute with no event of the agent reads nothing.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect([reads('/v1/pools/crew'), reads('/v1/bossmode/agents/migrator/today')]).toEqual([1, 1]);
      // An event of another agent reads nothing, and a burst of events of the agent reads once.
      act(() => store.dispatch({ type: 'run', run: { id: 'run-other', agent: 'reviewer', state: 'running', seq: 1, createdAt: '', updatedAt: '' } }));
      for (let i = 0; i < 4; i++) {
        act(() => store.dispatch({ type: 'run', run: { id: 'run-burst-' + i, agent: 'migrator', state: 'running', seq: 1, createdAt: '', updatedAt: '' } }));
        act(() => store.dispatch({ type: 'stream', event: { id: '', kind: 'task', data: { kind: 'task', member: i % 2 ? 'default/crew-9' : 'default/crew-0', phase: i % 2 ? 'Suspended' : 'Running', time: '' } } }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      // The pool: one change of a phase, one read. Today: the first run of the burst reads at once, and the rest once, after the gap.
      expect([reads('/v1/pools/crew'), reads('/v1/bossmode/agents/migrator/today')]).toEqual([2, 3]);
      // A profile that opens again reads nothing new: the page keeps the answers.
      unmountAll();
      mount(<Profile agent="migrator" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect([reads('/v1/pools/crew'), reads('/v1/bossmode/agents/migrator/today')]).toEqual([2, 3]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps Delete agent in the More menu of the head, for an owner, and says what goes before it deletes the agent', async () => {
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.workers li').length).toBe(2));
    // The menu waits for the read of the workers, which says whether the page made them.
    await vi.waitFor(() => expect(el.querySelector('button[aria-label="More for migrator"]')).not.toBeNull());
    // No destructive key sits in plain sight on the profile, and no key says Remove workers.
    expect([...el.querySelectorAll('button')].some((b) => /Delete agent|Remove workers/.test(b.textContent || ''))).toBe(false);
    const more = el.querySelector('button[aria-label="More for migrator"]') as HTMLButtonElement;
    act(() => more.click());
    const item = el.querySelector('[role="menu"] button.danger') as HTMLButtonElement;
    expect(item.textContent).toBe('Delete agent');
    act(() => item.click());
    const dialog = document.querySelector('dialog.confirm')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Delete migrator?');
    expect(dialog.textContent).toContain('This deletes migrator, its workers, and the files on them. Its seats on bridges stop working.');
    expect(dialog.textContent).toContain('You cannot undo this. Your past conversations with it stay readable.');
    act(() => ([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete agent') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/v1/pools/crew')).toBe(true));
    await vi.waitFor(() => expect(location.hash).toBe('#fleet'));
    expect(currentSaid()).toBe('Deleted migrator. Its workers stop once they are idle.');
    // The page drops the agent at once, though a read of the fleet lists its workers until they are idle.
    expect(store.get().fleet!.pools!.find((p) => p.agent === 'migrator')!.deleting).toBe(true);
    expect(el.textContent).toContain('This agent no longer exists.');
    clearSaid();
    history.replaceState(null, '', location.pathname);
  });

  it('offers no Delete agent for an agent of the setup file, nor to a person who is not an owner', async () => {
    const g = fakeFetch([
      ['GET', /^\/v1\/pools\/crew$/, () => ({ ...POOL, source: 'config' })],
      ['GET', /^\/v1\/bossmode\/agents\/[^/]+\/today$/, () => ({ runs: 0, decisions: 0 })],
    ]);
    try {
      const el = mount(<Profile agent="migrator" />);
      await vi.waitFor(() => expect(el.querySelectorAll('.workers li').length).toBe(2));
      await new Promise((r) => setTimeout(r, 20));
      expect(el.querySelector('button[aria-label="More for migrator"]')).toBeNull();
    } finally {
      g.restore();
    }
    const other = mount(<Profile agent="reviewer" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(other.querySelector('button[aria-label="More for reviewer"]')).toBeNull();
  });

  it('says what an agent that a pool runs can do in plain words, with the raw names and the patterns in a tooltip', async () => {
    const g = fakeFetch([
      // The profile of the workers of a pool carries its tools and no abilities.
      ['GET', /^\/v1\/agents\/migrator$/, () => ({ name: 'migrator', role: 'owner', pool: 'crew', tools: ['bash', 'files', 'front.pages_*'], policy: { ask: ['bash: git push*'] } })],
    ]);
    try {
      const el = mount(<Profile agent="migrator" />);
      await vi.waitFor(() => expect(el.querySelectorAll('.abilities li').length).toBe(4));
      const lines = [...el.querySelectorAll('.abilities li')];
      expect(lines.map((c) => c.textContent)).toEqual(['Run shell commands', 'Read and change files in the workspace', 'Read and write the wiki', 'Asks before git push']);
      expect(lines.map((c) => c.getAttribute('title'))).toEqual(['bash', 'files', 'front.pages_*', 'bash: git push*']);
      expect(lines[3].classList.contains('ability-rule')).toBe(true);
    } finally {
      g.restore();
    }
  });

  it('names the tools from the start of a run of a seat when the front does not answer the profile', async () => {
    const g = fakeFetch([
      ['GET', /^\/v1\/runs\/run-migrator-1\/events\?from=1&limit=1$/, () => ({ events: [{ seq: 1, type: 'fw.run.queued', data: { agent: 'migrator', resolved: { tools: ['front.bridge_read', 'front.bridge_post'], policy: { ask: ['bash: git push*'] } } } }] })],
    ]);
    try {
      const el = mount(<Profile agent="migrator" />);
      await vi.waitFor(() => expect(el.querySelectorAll('.abilities li').length).toBe(2));
      expect([...el.querySelectorAll('.abilities li')].map((c) => c.textContent)).toEqual(['Read and post in teams', 'Asks before git push']);
    } finally {
      g.restore();
    }
  });

  it('never cuts the name of a worker, and puts the seat that it serves last', async () => {
    act(() => store.dispatch({ type: 'run', run: { id: 'run-migrator-1', agent: 'migrator', state: 'running', seq: 2, createdAt: '', updatedAt: '', member: 'default/crew-0' } }));
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.workers li').length).toBe(2));
    const row = el.querySelectorAll('.workers li')[0];
    expect(row.querySelector('.worker-name')!.classList.contains('clip')).toBe(false);
    expect([...row.children].map((c) => c.className.split(' ')[0])).toEqual(['worker-name', 'status', 'worker-who']);
  });

  it('offers Edit to an owner only, and makes the picture the key that changes it', () => {
    const owner = mount(<Profile agent="migrator" />);
    expect([...owner.querySelectorAll('button')].map((b) => b.textContent)).toContain('Edit');
    expect([...owner.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('New face');
    const key = owner.querySelector('.prof-ident button.prof-mark-key') as HTMLButtonElement;
    expect(key.getAttribute('aria-label')).toBe('Change the picture of migrator');
    expect(key.querySelector('.mark')).not.toBeNull();
    expect(key.querySelector('.prof-mark-pen')).not.toBeNull();
    // A click opens the picker of a file.
    const input = owner.querySelector('.prof-ident input[type="file"]') as HTMLInputElement;
    let opened = false;
    input.addEventListener('click', () => (opened = true));
    key.click();
    expect(opened).toBe(true);
    const other = mount(<Profile agent="reviewer" />);
    expect([...other.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Edit');
    expect(other.querySelector('.prof-mark-key')).toBeNull();
    expect(other.querySelector('.prof-ident .mark')).not.toBeNull();
  });

  it('links each skill of the agent to its own page', async () => {
    act(() => store.dispatch({ type: 'agent-skills', agent: 'migrator', skills: ['ansible-style', 'plan'] }));
    const el = mount(<Profile agent="migrator" />);
    const links = [...el.querySelectorAll('.prof-skill-list a')];
    expect(links.map((a) => a.textContent)).toEqual(['ansible-style', 'plan']);
    expect(links[0].getAttribute('href')).toBe('#skills/skill/ansible-style');
  });

  it('shows a sleeping worker without a time, since the page knows no moment when it fell asleep', async () => {
    // The seat of an earlier test ran on crew-0. Its run is over now.
    act(() => store.dispatch({ type: 'run', run: { id: 'run-migrator-1', agent: 'migrator', state: 'completed', seq: 99, createdAt: '', updatedAt: '' } }));
    act(() => store.dispatch({ type: 'fleet', fleet: { ...STREAM_FLEET, pools: STREAM_FLEET.pools!.map((p) => (p.name === 'crew' ? { ...p, tasks: [{ name: 'crew-0', phase: 'Suspended', current: true }] } : p)) } }));
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.workers li').length).toBe(1));
    const row = el.querySelector('.workers li')!;
    expect(row.querySelector('.status-word')!.textContent).toBe('asleep');
    expect(row.querySelector('.worker-who')).toBeNull();
  });

  it('opens Edit with the name and the tagline that the profile shows, in focus, and Escape gives the focus back to Edit', async () => {
    act(() => store.dispatch({ type: 'agents', agents: [{ name: 'migrator', role: 'owner', description: 'Moves Puppet modules.' }, { name: 'reviewer', role: 'operator' }, { name: 'manager', role: 'operator' }] }));
    forgetProfiles();
    const el = mount(<Profile agent="migrator" />);
    const edit = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Edit') as HTMLButtonElement;
    act(() => edit.click());
    const [name, tagline] = [...el.querySelectorAll('.prof-edit input')] as HTMLInputElement[];
    await vi.waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.value).toBe('migrator');
    expect(tagline.value).toBe('Moves Puppet modules.');
    act(() => {
      name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(el.querySelector('.prof-edit')).toBeNull();
    const again = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Edit') as HTMLButtonElement;
    await vi.waitFor(() => expect(document.activeElement).toBe(again));
  });

  it('saves a field that keeps the name or the description of the agent as empty, so the face follows the profile', async () => {
    act(() => store.dispatch({ type: 'agents', agents: [{ name: 'migrator', role: 'owner', description: 'Moves Puppet modules.' }, { name: 'reviewer', role: 'operator' }, { name: 'manager', role: 'operator' }] }));
    forgetProfiles();
    const f = fakeFetch([
      ['PATCH', /^\/v1\/faces\/migrator$/, () => ({ agent: 'migrator', displayName: 'Mig', tagline: '' })],
      ['GET', /^\/v1\/faces$/, () => ({ faces: [] })],
    ]);
    try {
      const el = mount(<Profile agent="migrator" />);
      act(() => ([...el.querySelectorAll('button')].find((b) => b.textContent === 'Edit') as HTMLButtonElement).click());
      const [name] = [...el.querySelectorAll('.prof-edit input')] as HTMLInputElement[];
      typeIn(name, 'Mig');
      act(() => (el.querySelector('.prof-edit button[type="submit"]') as HTMLButtonElement).click());
      await vi.waitFor(() => expect(f.calls.some((c) => c.method === 'PATCH')).toBe(true));
      expect(f.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ displayName: 'Mig', tagline: '' });
    } finally {
      f.restore();
    }
  });

  it('says that an agent that no list names no longer exists, with the way back to the fleet', () => {
    const el = mount(<Profile agent="walk-agent-1" />);
    expect(el.textContent).toContain('This agent no longer exists.');
    // Beside the main pane, the main pane holds the key, so the details hold the back link alone.
    expect(el.querySelector('.empty a[href="#fleet"]')).toBeNull();
    expect(el.querySelector('a[href="#fleet"]')).not.toBeNull();
  });

  it('names the tools of the workers of a profile that names none, and leaves out adding packages while they are off', async () => {
    const g = fakeFetch([
      ['GET', /^\/v1\/agents\/migrator$/, () => ({ name: 'migrator', role: 'owner', pool: 'crew', workerTools: ['bash', 'env'], workerPolicy: { ask: ['env: command=add'] }, workerPackages: { on: false, ask: false } })],
      ['GET', /^\/v1\/pools\/crew$/, () => POOL],
      ['GET', /^\/v1\/bossmode\/agents\/migrator\/today$/, () => ({ runs: 0, decisions: 0 })],
    ]);
    try {
      const el = mount(<Profile agent="migrator" />);
      await vi.waitFor(() => expect(el.querySelectorAll('.abilities li').length).toBe(1));
      expect([...el.querySelectorAll('.abilities li')].map((c) => c.textContent)).toEqual(['Run shell commands']);
      // The profile answers with the tools of the workers, so it reads no start of a run of a seat.
      expect(g.calls.some((c) => c.path.includes('/events'))).toBe(false);
    } finally {
      g.restore();
    }
  });

  it('shows an answer of several lines with its table, folded, and reads the hearts again when a heart changes the page', async () => {
    let text = LEARNED;
    const g = fakeFetch([
      ['GET', /^\/v1\/pages\/agents\/migrator\/learned\.md$/, () => ({ path: 'agents/migrator/learned.md', text })],
      ['GET', /^\/v1\/pools\/crew$/, () => POOL],
      ['GET', /^\/v1\/bossmode\/agents\/migrator\/today$/, () => ({ runs: 0, decisions: 0 })],
    ]);
    // The list of the wiki holds the page of the hearts.
    act(() => store.dispatch({ type: 'pages', pages: [{ path: 'agents/migrator/learned.md', title: '', hash: 'h-old', size: 1, by: 'bossmode', at: '' }] }));
    try {
      const el = mount(<Profile agent="migrator" />);
      await vi.waitFor(() => expect(el.querySelectorAll('.liked li').length).toBe(2));
      // A new heart writes the page, and the stream says so: the section reads it again.
      text = LEARNED.replace(
        '## 2026-10-22',
        ['## 2026-10-23, bridge "Migrate Puppet" (b1), migrator-1, run 01RUN3', '', '- What migrator did:', '', '  Checked the roles.', '', '  | Role | Result |', '  |---|---|', '  | cron | Pass |', '  | nginx | Pass |', '  | ssh | Pass |', '', '- The note of alice: Tidy.', '', '## 2026-10-22'].join('\n'),
      );
      act(() => store.dispatch({ type: 'stream', event: { id: '11', kind: 'page', data: { path: 'agents/migrator/learned.md', title: '', hash: 'h-new', size: text.length, by: 'bossmode', at: '' } } as never }));
      await vi.waitFor(() => expect(el.querySelectorAll('.liked li').length).toBe(3));
      const first = el.querySelectorAll('.liked li')[0];
      expect(first.querySelector('.liked-note')!.textContent).toBe('Liked because: Tidy.');
      expect(first.querySelectorAll('.liked-block table tr').length).toBe(4);
      expect(first.querySelector('.liked-block')!.classList.contains('folded')).toBe(true);
      act(() => (first.querySelector('button.liked-more') as HTMLButtonElement).click());
      expect(first.querySelector('.liked-block')!.classList.contains('folded')).toBe(false);
    } finally {
      g.restore();
    }
  });

  it('says that the worker of a new agent starts, and no gap of the server, while every worker starts', async () => {
    act(() => store.dispatch({ type: 'fleet', fleet: { ...STREAM_FLEET, pools: STREAM_FLEET.pools!.map((p) => (p.name === 'crew' ? { ...p, deleting: false, tasks: [{ name: 'crew-0', phase: 'Pending', current: true }] } : p)) } }));
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelector('.worker-starting')).not.toBeNull());
    expect(el.querySelector('.worker-starting')!.textContent).toBe('Its worker is starting.');
    expect(el.querySelector('.worker-gaps')).toBeNull();
  });
});

describe('how an agent knows it is done', () => {
  it('lists the checks of done, and warns of a check that only reads a file, which Results does not count (plan 4.4)', () => {
    const el = mount(
      <DoneSec
        agent="checker"
        done={{
          checks: [
            { name: 'the note exists', tool: 'files', input: '{"command":"view","path":"report.txt"}' },
            { name: 'the note says READY', tool: 'files', input: '{"command":"view","path":"report.txt"}', contains: ['READY'] },
          ],
        }}
      />,
    );
    const items = [...el.querySelectorAll('.prof-done li')];
    expect(items.map((li) => li.querySelector('span')!.textContent)).toEqual(['the note exists', 'the note says READY']);
    expect(items[0].querySelector('.prof-weak')!.textContent).toContain('a run that did nothing passes it');
    expect(items[1].querySelector('.prof-weak')).toBeNull();
    expect(el.querySelector('h3')!.textContent).toBe('How it knows it is done');
  });

  it('says what a check of the answer looks for, and warns of one that looks for nothing', () => {
    const el = mount(
      <DoneSec
        agent="checker"
        done={{
          checks: [
            { tool: 'answer', contains: ['READY'], lacks: ['TODO'] },
            { name: 'the answer is not empty', tool: 'answer' },
          ],
        }}
      />,
    );
    const items = [...el.querySelectorAll('.prof-done li')];
    expect(items.map((li) => li.querySelector('span')!.textContent)).toEqual(['The answer', 'the answer is not empty']);
    expect(items[0].querySelector('.prof-answer')!.textContent).toBe('Must hold \u201cREADY\u201d, and must not hold \u201cTODO\u201d.');
    // A check of the answer that names words is strong, also for a run that changed nothing.
    expect(items[0].querySelector('.prof-weak')).toBeNull();
    expect(items[1].querySelector('.prof-answer')).toBeNull();
    expect(items[1].querySelector('.prof-weak')!.textContent).toContain('every answer passes it');
  });

  it('shows nothing for a profile without checks', () => {
    const el = mount(<DoneSec agent="checker" done={{ checks: [] }} />);
    expect(el.querySelector('.prof-done')).toBeNull();
  });
});
