import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { KeepField, Profile, forgetProfileReads } from './Profile';
import { FLEET, fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';
import { forgetProfiles } from '../state/profiles';
import { store } from '../state/store';
import { forgetQueued } from '../state/queued';

let calls: Call[] = [];
let restore = () => {};

// What people liked, as the front writes it: the newest entry first.
const LEARNED = [
  '# What people liked from migrator',
  '',
  '## 2026-10-22, bridge "Migrate Puppet" (b1), migrator-1, run 01RUN1',
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
    ['DELETE', /^\/v1\/pools\/crew$/, () => null],
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
    // Each heart: what the agent did, what was asked as a muted line, the note, and Open the run.
    const first = el.querySelectorAll('.liked li')[0];
    expect([...first.querySelectorAll('.liked-body > *')].map((x) => x.className + ' ' + x.textContent)).toEqual(['liked-did Ran the lint.', 'liked-asked Migrate the cron module.', 'liked-note Clean.', 'prof-link Open the run']);
    expect(first.querySelector('a.prof-link')!.getAttribute('href')).toBe('#bridge/b1/run/01RUN1/migrator-1');
    expect(el.querySelectorAll('.liked li')[1].querySelector('.liked-note')).toBeNull();
    expect([...el.querySelectorAll('.prof-link')].map((a) => a.getAttribute('href'))).toContain('#pages/agents/migrator/learned.md');
    expect(el.querySelector('.help-key')!.getAttribute('aria-label')).toBe('What is a worker');
    expect((el.querySelector('.keep input') as HTMLInputElement).value).toBe('1');
    const row = el.querySelectorAll('.workers li')[0];
    expect(row.querySelector('.worker-name')!.textContent).toBe('crew-0');
    expect(row.querySelector('.status-word')!.textContent).toBe('awake');
    expect(el.querySelectorAll('.workers li')[1].textContent).toContain('old setup');
    expect(el.querySelector('.worker-gaps')!.textContent).toBe('crew-9 runs an older configuration.');
    expect(el.querySelector('.today')!.textContent).toBe('7 runs$1.902 decisions');
    expect(el.querySelector('.prof-skills')!.textContent).toMatch(/^\d+ skills?$/);
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

  it('reads no page of hearts that the list of the wiki does not hold', async () => {
    act(() => store.dispatch({ type: 'pages', pages: [{ path: 'index.md', title: 'Index', hash: 'h', by: 'alice', at: '', size: 1 }] }));
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelector('.liked-sec, [aria-labelledby="liked-migrator"]')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.some((c) => c.path.startsWith('/v1/pages/agents/migrator/learned.md'))).toBe(false);
    expect(el.querySelector('[aria-labelledby="liked-migrator"] .chip')!.textContent).toContain('0');
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

  it('keeps Remove workers in the More menu of the workers, for an owner, and removes them after Confirm', async () => {
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.workers li').length).toBe(2));
    // The menu waits for the read of the workers, which says whether any exist.
    await vi.waitFor(() => expect(el.querySelector('button[aria-label="More for workers"]')).not.toBeNull());
    // No destructive key sits in plain sight on the profile.
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'Remove workers')).toBe(false);
    expect(el.querySelector('.key-danger')).toBeNull();
    const more = el.querySelector('button[aria-label="More for workers"]') as HTMLButtonElement;
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    act(() => more.click());
    const item = el.querySelector('[role="menu"] button.danger') as HTMLButtonElement;
    expect(item.textContent).toBe('Remove workers');
    act(() => item.click());
    expect(document.querySelector('dialog.confirm h2')!.textContent).toBe('Remove the workers of migrator?');
    act(() => ([...document.querySelectorAll('dialog.confirm button')].find((b) => b.textContent === 'Remove workers') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/v1/pools/crew')).toBe(true));
  });

  it('gives the workers no More menu for a person who is not an owner', async () => {
    const el = mount(<Profile agent="reviewer" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(el.querySelector('button[aria-label="More for workers"]')).toBeNull();
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
      expect([...el.querySelectorAll('.abilities li')].map((c) => c.textContent)).toEqual(['Read and post in bridges', 'Asks before git push']);
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

  it('offers Edit and New face to an owner only', () => {
    const owner = mount(<Profile agent="migrator" />);
    expect([...owner.querySelectorAll('button')].map((b) => b.textContent)).toEqual(expect.arrayContaining(['Edit', 'New face']));
    const other = mount(<Profile agent="reviewer" />);
    expect([...other.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Edit');
    expect([...other.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('New face');
  });
});
