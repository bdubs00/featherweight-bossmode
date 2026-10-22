import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { KeepField, Profile } from './Profile';
import { fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

// The fleet names crew as the pool of migrator, so the profile reads that pool.
const POOL = { name: 'crew', wanted: 1, actual: 1, ready: 1, tasks: [{ name: 'crew-0', phase: 'Running' }, { name: 'crew-9', phase: 'Running', current: false }] };

beforeEach(() => {
  const f = fakeFetch([
    ['PATCH', /^\/v1\/pools\/crew$/, (b) => ({ ...POOL, wanted: (b as { replicas: number }).replicas })],
    ['GET', /^\/v1\/pools\/crew$/, () => POOL],
    ['DELETE', /^\/v1\/pools\/crew$/, () => null],
    ['GET', /^\/v1\/bossmode\/agents\/migrator\/today$/, () => ({ runs: 7, costUSD: 1.9, decisions: 2 })],
    ['GET', /^\/v1\/pages\/agents\/migrator\/learned\.md$/, () => ({ path: 'agents/migrator/learned.md', text: '# Liked\n\n## a\n\nAlice hearted: Kept the names.\n\n## b\n\nBob hearted: Ran the lint.\n' })],
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
    expect([...el.querySelectorAll('.liked li')].map((x) => x.textContent)).toEqual(['Ran the lint.', 'Kept the names.']);
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

  it('offers Edit and New face to an owner only', () => {
    const owner = mount(<Profile agent="migrator" />);
    expect([...owner.querySelectorAll('button')].map((b) => b.textContent)).toEqual(expect.arrayContaining(['Edit', 'New face']));
    const other = mount(<Profile agent="reviewer" />);
    expect([...other.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Edit');
    expect([...other.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('New face');
  });
});
