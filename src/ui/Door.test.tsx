import { afterEach, describe, expect, it } from 'vitest';
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import type { TaskPlan } from '../api/types';
import { fakeFetch } from './testkit-b';
import { morePlaces, placesOf } from './Shell';
import { Door, costOf, dutyOfPlan, lowWords, monthWords, startPlan } from './Door';
import { doorDuty } from '../state/doorplan';

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

describe('the cost of a plan', () => {
  it('warns of a cost below the cheapest run of the task, up to the next cent, and says nothing above it', () => {
    const p = plan({ cost: { basis: '', per: 'run', runsPerMonth: 4, low: 0.14, high: 1.8 } });
    expect(lowWords(p, 0.1)).toBe('One run can cost $0.14. The task stops at your limit.');
    expect(lowWords(p, 0.14)).toBe('');
    expect(lowWords(p, null)).toBe('');
    expect(lowWords(plan({ cost: { basis: '', per: 'run', runsPerMonth: 4, low: 0.141 } }), 0.14)).toBe('One run can cost $0.15. The task stops at your limit.');
    expect(lowWords(plan({ kind: 'team', cost: { basis: '', per: 'bridge', runsPerMonth: 1, low: 0.5 } }), 0.1)).toBe('The whole team can cost $0.50. The task stops at your limit.');
    // No run with a price: no low, and no warning.
    expect(lowWords(plan(), 0.01)).toBe('');
  });
  it('hands the editor the whole duty of a plan, with the cost that the person typed', () => {
    const d = dutyOfPlan(plan(), 0.3)!;
    expect(d.limits.budget!.maxCostUSD).toBe(0.3);
    expect(d.when).toEqual(plan().start.duty!.when);
    expect(dutyOfPlan(plan(), null)!.limits.budget!.maxCostUSD).toBeUndefined();
    expect(dutyOfPlan(plan({ start: { bridge: { title: 'T', goal: 'G', members: [] } } }), 1)).toBeNull();
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
    // The note stays true after the team ends: it says when it started and with whom, not that it works now.
    expect(s.said).toMatch(/^Started with Writer at \d{1,2}:\d{2}/);
    expect(s.made).toEqual({ bridge: 'br-1' });
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

  it('lets the person pick another agent for a team, and names an agent with a capital', async () => {
    const team = plan({
      kind: 'team',
      who: [{ agent: 'reviewer', name: 'reviewer', does: 'takes a share', count: 3 }],
      others: [{ agent: 'ops', name: 'ops' }, { agent: 'writer', name: 'Writer' }],
      when: { readback: 'Now, once.', next: [] },
      start: { bridge: { title: 'T', goal: 'G', members: [] } },
    });
    const f = fakeFetch([['POST', /\/v1\/work\/plan$/, () => team]]);
    restore = f.restore;
    const el = mount(<Door />);
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'A big job, split across agents')!.click());
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Read it back')!.click());
    await settle();
    expect(el.querySelector('.rb-who strong')!.textContent).toBe('Reviewer');
    const pick = el.querySelector('.rb-other select') as HTMLSelectElement;
    expect([...pick.options].map((o) => o.textContent)).toEqual(['Keep Reviewer', 'Ops', 'Writer']);
    act(() => {
      pick.value = 'ops';
      pick.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    const again = f.calls.filter((c) => c.method === 'POST').pop()!;
    expect((again.body as { agent: string }).agent).toBe('ops');
  });

  it('says under the cost that a run can cost more than the typed limit, as the person types', async () => {
    const f = fakeFetch([['POST', /\/v1\/work\/plan$/, () => plan({ cost: { basis: 'Runs of Writer cost $0.14 to $0.22 in the last 30 days.', per: 'run', runsPerMonth: 4, low: 0.14, high: 0.22 } })]]);
    restore = f.restore;
    const el = mount(<Door />);
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'A weekly summary of competitors')!.click());
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Read it back')!.click());
    await settle();
    const cost = el.querySelector('.rb-money input') as HTMLInputElement;
    const type = (v: string) =>
      act(() => {
        cost.value = v;
        cost.dispatchEvent(new Event('input', { bubbles: true }));
      });
    type('0.10');
    expect(el.querySelector('.rb-low')!.textContent).toBe(' One run can cost $0.14. The task stops at your limit.');
    expect(el.querySelector('.rb-low')!.getAttribute('role')).toBe('status');
    type('0.50');
    expect(el.querySelector('.rb-low')!.textContent).toBe('');
  });

  it('offers Open it beside Start for a duty of the person that does the same work', async () => {
    const f = fakeFetch([['POST', /\/v1\/work\/plan$/, () => plan({ same: { duty: 'weekly-competitor-summary', title: 'Weekly competitor summary' } })]]);
    restore = f.restore;
    const el = mount(<Door />);
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'A weekly summary of competitors')!.click());
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Read it back')!.click());
    await settle();
    expect(el.querySelector('.rb-same')!.textContent).toContain('Your duty Weekly competitor summary does this already.');
    const keys = [...el.querySelectorAll('.card-actions a, .card-actions button')].map((k) => k.textContent);
    expect(keys).toEqual(['Change the details', 'Open it', 'Start']);
    const open = [...el.querySelectorAll('.card-actions a')].find((a) => a.textContent === 'Open it')!;
    expect(open.getAttribute('href')).toBe('#duties/weekly-competitor-summary');
    expect(open.getAttribute('aria-label')).toBe('Open it: Weekly competitor summary');
  });

  it('opens the editor from Change the details with the whole plan and the typed cost', async () => {
    const f = fakeFetch([['POST', /\/v1\/work\/plan$/, () => plan()]]);
    restore = f.restore;
    const el = mount(<Door />);
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'A weekly summary of competitors')!.click());
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Read it back')!.click());
    await settle();
    const cost = el.querySelector('.rb-money input') as HTMLInputElement;
    act(() => {
      cost.value = '0.25';
      cost.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const change = [...el.querySelectorAll('a')].find((a) => a.textContent === 'Change the details')!;
    expect(change.getAttribute('href')).toMatch(/^#duties\/new\?agent=writer&do=ask&from=door&message=/);
    change.addEventListener('click', (e) => e.preventDefault());
    act(() => change.click());
    const kept = doorDuty()!;
    expect(kept.when).toEqual(plan().start.duty!.when);
    expect(kept.limits.budget!.maxCostUSD).toBe(0.25);
  });

  it('puts the cost last, beside Start, and says the next starts apart', async () => {
    const f = fakeFetch([['POST', /\/v1\/work\/plan$/, () => plan({ when: { said: 'every monday', readback: 'Every Monday at 9:00 AM, New York time.', next: ['2026-11-02T14:00:00Z', '2026-11-09T14:00:00Z'] }, gaps: ['No agent here can send email.'] })]]);
    restore = f.restore;
    const el = mount(<Door />);
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'A weekly summary of competitors')!.click());
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Read it back')!.click());
    await settle();
    const rows = [...el.querySelectorAll('.rb dt')].map((d) => d.textContent);
    expect(rows).toEqual(['Who', 'When', 'It asks you', 'It stays quiet', 'You hear of it', 'The result', 'It cannot', 'What it can cost']);
    const next = [...el.querySelectorAll('.rb p.t-meta')].find((p) => (p.textContent || '').startsWith('Next:'))!;
    expect(next.textContent!.split('; ')).toHaveLength(2);
  });

  it('after Start, says what it made in place of the readback and gives it the focus, with no second notice', async () => {
    const f = fakeFetch([
      ['POST', /\/v1\/work\/plan$/, () => plan()],
      ['PUT', /\/v1\/duties\/sum-up-what-acme-shipped$/, (b) => ({ ...(b as object), readback: 'Every Monday at 9:00 AM, New York time.' })],
      ['GET', /\/v1\/duties$/, () => ({ duties: [] })],
    ]);
    restore = f.restore;
    let started = 0;
    const el = mount(<Door onStarted={() => started++} />);
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'A weekly summary of competitors')!.click());
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Read it back')!.click());
    await settle();
    const cost = el.querySelector('.rb-money input') as HTMLInputElement;
    act(() => {
      cost.value = '0.10';
      cost.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Start')!.click());
    await settle();
    await settle();
    expect(started).toBe(1);
    const done = el.querySelector('.door-started') as HTMLElement;
    expect(done.textContent).toContain('Set. Every Monday at 9:00 AM, New York time.');
    expect(document.activeElement).toBe(done);
    // The card stands above the templates, where the readback stood.
    expect(done.compareDocumentPosition(el.querySelector('.door-templates')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('.notice')).toBeNull();
  });
});
