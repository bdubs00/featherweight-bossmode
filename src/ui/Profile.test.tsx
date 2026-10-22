import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { KeepField, Profile } from './Profile';
import { fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';
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

// The fleet names crew as the pool of migrator, so the profile reads that pool.
const POOL = { name: 'crew', wanted: 1, actual: 1, ready: 1, tasks: [{ name: 'crew-0', phase: 'Running' }, { name: 'crew-9', phase: 'Running', current: false }] };

beforeEach(() => {
  forgetProfiles();
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
    expect(heads).toEqual(['What people liked', 'Workers', 'Today']);
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
    expect(el.querySelector('.today')!.textContent).toBe('7 runs$1.902 decisions');
    expect(el.textContent!.toLowerCase()).not.toContain('pool');
    expect(calls.some((c) => c.path === '/v1/pools/crew')).toBe(true);
  });

  it('keeps Remove workers in the More menu of the workers, for an owner, and removes them after Confirm', async () => {
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.workers li').length).toBe(2));
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

  it('shows the tools of a profile that a pool runs as chips, a glob as written, beside the rules', async () => {
    const g = fakeFetch([
      // The profile of the workers of a pool carries its tools and no abilities.
      ['GET', /^\/v1\/agents\/migrator$/, () => ({ name: 'migrator', role: 'owner', pool: 'crew', tools: ['bash', 'files', 'front.pages_*'], policy: { ask: ['bash: git push*'] } })],
    ]);
    try {
      const el = mount(<Profile agent="migrator" />);
      await vi.waitFor(() => expect(el.querySelectorAll('.prof-chips .prof-tool').length).toBe(3));
      expect([...el.querySelectorAll('.prof-chips .chip')].map((c) => c.textContent)).toEqual(['bash', 'files', 'front.pages_*', 'asks before git push']);
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
      await vi.waitFor(() => expect(el.querySelectorAll('.prof-chips .prof-tool').length).toBe(2));
      expect([...el.querySelectorAll('.prof-chips .chip')].map((c) => c.textContent)).toEqual(['front.bridge_read', 'front.bridge_post', 'asks before git push']);
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
