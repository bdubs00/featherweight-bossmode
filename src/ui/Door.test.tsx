import { afterEach, describe, expect, it } from 'vitest';
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import type { TaskPlan } from '../api/types';
import { fakeFetch } from './testkit-b';
import { morePlaces, placesOf } from './Shell';
import { Door, costOf, monthWords, startPlan } from './Door';

let box: HTMLElement | null = null;
let restore: (() => void) | null = null;

afterEach(() => {
  if (restore) restore();
  restore = null;
  if (!box) return;
  const b = box;
  act(() => render(null, b));
  b.remove();
  box = null;
});

function mount(node: ComponentChildren): HTMLElement {
  const b = document.createElement('div');
  box = b;
  document.body.appendChild(b);
  act(() => render(node, b));
  return b;
}

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

const plan = (extra: Partial<TaskPlan> = {}): TaskPlan => ({
  words: 'Every Monday at 9am, sum up what Acme shipped.',
  kind: 'repeat',
  title: 'Sum up what Acme shipped',
  who: [{ agent: 'writer', name: 'Writer', does: 'does it' }],
  others: [{ agent: 'scribe', name: 'Scribe' }],
  when: { said: 'every monday at 9am', readback: 'Every Monday at 9:00 AM, New York time.', next: ['2026-11-02T14:00:00Z'] },
  cost: { basis: 'Runs of Writer cost $0.04 to $0.22 in the last 30 days.', per: 'run', runsPerMonth: 4 },
  asks: ['When it is not sure what you mean. The question waits for you'],
  quiet: ['While it works'],
  tell: 'each',
  result: 'A page in the wiki for each run, and a card in Done',
  gaps: [],
  problems: [],
  start: { duty: { name: 'sum-up-what-acme-shipped', agent: 'writer', when: { schedule: { repeat: 'weekly', days: ['mon'], times: ['09:00'], timeZone: 'America/New_York' } }, do: { ask: { message: 'Sum up.' } }, limits: { budget: {}, overlap: 'skip' } } },
  open: '#duties/sum-up-what-acme-shipped',
  ...extra,
});

describe('the words of the door', () => {
  it('reads a cost only as a positive number of dollars', () => {
    expect(costOf('0.50')).toBe(0.5);
    expect(costOf('$2')).toBe(2);
    expect(costOf('')).toBeNull();
    expect(costOf('0')).toBeNull();
    expect(costOf('free')).toBeNull();
    expect(costOf('1.005')).toBeNull();
  });
  it('says the most a task that repeats can cost in a month, and nothing for a task that runs once', () => {
    expect(monthWords(plan(), 0.5)).toBe('At most $2.00 a month: about 4 runs at most $0.50 each.');
    expect(monthWords(plan(), null)).toBe('');
    expect(monthWords(plan({ kind: 'once' }), 0.5)).toBe('');
  });
});

describe('placesOf with work', () => {
  const base = { manager: null, placement: 'queue' as const, maxMembers: 16 };
  const ids = (...a: Parameters<typeof placesOf>) => placesOf(...a).map((p) => p.id);
  it('shows neither Work nor Results without work, and every place of before', () => {
    expect(ids(base)).not.toContain('work');
    expect(ids(base)).not.toContain('results');
    expect(ids(base, false)).toHaveLength(9);
    expect(morePlaces(base)).toEqual([]);
  });
  it('shows five places and More to a person who has not asked for every place, and the place of the screen', () => {
    expect(ids({ ...base, work: true }, false)).toEqual(['work', 'results', 'activity', 'chat', 'wiki']);
    expect(ids({ ...base, work: true }, false, 'duties')).toEqual(['work', 'results', 'activity', 'chat', 'wiki', 'duties']);
    expect(ids({ ...base, work: true }, true)).toHaveLength(11);
    expect(morePlaces({ ...base, work: true }).map((p) => p.id)).toEqual(['bridges', 'fleet', 'duties', 'skills', 'routines', 'manager']);
    expect(morePlaces({ ...base, work: true }, 'duties').map((p) => p.id)).toEqual(['bridges', 'fleet', 'skills', 'routines', 'manager']);
  });
});

describe('Start', () => {
  it('sends a duty with the cost that the person typed, and never a cost of its own', async () => {
    const f = fakeFetch([['PUT', /\/v1\/duties\/sum-up-what-acme-shipped$/, (b) => ({ ...(b as object), readback: 'Every Monday at 9:00 AM, New York time.' })], ['GET', /\/v1\/duties$/, () => ({ duties: [] })]]);
    restore = f.restore;
    const s = await startPlan(plan(), 0.5);
    const put = f.calls.find((c) => c.method === 'PUT')!;
    expect((put.body as { limits: { budget: { maxCostUSD: number } } }).limits.budget.maxCostUSD).toBe(0.5);
    expect(s.href).toBe('#duties/sum-up-what-acme-shipped');
  });
  it('opens a team with the cost as the cap of the whole team', async () => {
    const f = fakeFetch([['POST', /\/v1\/bridges$/, () => ({ id: 'br-1' })], ['GET', /\/v1\/bridges$/, () => ({ bridges: [] })]]);
    restore = f.restore;
    const s = await startPlan(plan({ kind: 'team', start: { bridge: { title: 'T', goal: 'G', members: [{ handle: 'writer', agent: 'writer', task: 'W' }] } } }), 5);
    const post = f.calls.find((c) => c.method === 'POST')!;
    expect((post.body as { caps: { maxCostUSD: number } }).caps.maxCostUSD).toBe(5);
    expect(s.href).toBe('#bridge/br-1');
  });
});

describe('Door', () => {
  it('asks for words before it reads them back, then refuses Start until the person types a cost', async () => {
    const f = fakeFetch([
      ['POST', /\/v1\/work\/plan$/, () => plan()],
    ]);
    restore = f.restore;
    const el = mount(<Door />);
    await settle();
    const read = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Read it back')!;
    act(() => read.click());
    expect(el.textContent).toContain('Say what you need done.');
    const pick = [...el.querySelectorAll('button')].find((b) => b.textContent === 'A weekly summary of competitors')!;
    act(() => pick.click());
    expect((el.querySelector('#door-words') as HTMLTextAreaElement).value).toContain('Every Monday at 9am');
    act(() => read.click());
    await settle();
    expect(el.textContent).toContain('Every Monday at 9:00 AM, New York time.');
    expect(el.textContent).toContain('Runs of Writer cost');
    const start = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Start')!;
    act(() => start.click());
    await settle();
    expect(el.textContent).toContain('Say the most that one run can cost');
    expect(f.calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});
