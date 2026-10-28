import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { Value } from '../api/value';
import { Results, hours, pct, span } from './Results';
import { fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';

const flush = async () => {
  for (let i = 0; i < 6; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
};

function value(days: number, over: Partial<Value> = {}): Value {
  return {
    days, since: '2026-09-27T12:00:00Z', until: '2026-10-27T12:00:00Z', sentence: 'In the last ' + days + ' days, the agents finished 12 pieces of work.',
    work: { pieces: 14, done: 12, failed: 1, stopped: 0, open: 1 },
    checks: { accepted: 3, sentBack: 1, unchecked: 8 },
    people: { actions: 5, noPerson: 9, reworked: 1, waitSeconds: 7200, waitingNow: 1, handled: 0 },
    lead: { measured: 12, medianSeconds: 600, waitShare: 0.25 },
    spend: { usd: 1.5, perDone: 0.125, failedUSD: 0.1, coordinationUSD: 0.2, unpriced: 2, atLeast: true },
    periods: [{ start: '2026-10-20T12:00:00Z', end: '2026-10-27T12:00:00Z', done: 12, accepted: 3, sentBack: 1, unchecked: 8, failed: 1, usd: 1.3 }],
    lines: [
      { key: 'agent:migrator', kind: 'agent', name: 'migrator', agent: 'migrator', work: { pieces: 8, done: 7, failed: 1, stopped: 0, open: 0 }, checks: { accepted: 3, sentBack: 1, unchecked: 3 }, actions: 5, noPerson: 4, medianLeadSeconds: 900, usd: 1.1, perDone: 0.157, unpriced: 2 },
      { key: 'duty:nightly', kind: 'duty', name: 'nightly', agent: 'reviewer', work: { pieces: 6, done: 5, failed: 0, stopped: 0, open: 1 }, checks: { accepted: 0, sentBack: 0, unchecked: 5 }, actions: 0, noPerson: 5, medianLeadSeconds: 120, usd: 0.2, perDone: 0.04, unpriced: 0 },
    ],
    partial: false,
    ...over,
  };
}

describe('the words of the figures', () => {
  it('says a span, hours, and a share', () => {
    expect(span(40)).toBe('40 s');
    expect(span(720)).toBe('12 min');
    expect(span(11400)).toBe('3 h 10 min');
    expect(span(2 * 86400 + 4 * 3600)).toBe('2 d 4 h');
    expect(hours(45)).toBe('45 min');
    expect(hours(4525)).toBe('75 h');
    expect(pct(0.676)).toBe('68%');
  });
});

describe('Results', () => {
  let calls: Call[] = [];
  let restore = () => {};
  let estimate: { minutes: number; by: string; at: string } | undefined;
  beforeEach(() => {
    estimate = undefined;
    try {
      localStorage.clear();
    } catch {
      // No storage in this run.
    }
    const f = fakeFetch([
      ['GET', /^\/v1\/value\?days=(7|30|90)$/, () => {
        const days = Number(/days=(\d+)/.exec(calls[calls.length - 1].path)![1]);
        const v = value(days);
        if (estimate) {
          v.lines[0] = { ...v.lines[0], estimate, estimatedMinutes: estimate.minutes * 6 };
          v.estimated = { minutes: estimate.minutes * 6, lines: 1, pieces: 6 };
        }
        return v;
      }],
      ['PUT', /^\/v1\/value\/estimates$/, (b) => {
        estimate = { minutes: (b as { minutes: number }).minutes, by: 'alice@example.com', at: '2026-10-27T12:00:00Z' };
        return value(90).lines[0];
      }],
    ]);
    calls = f.calls;
    restore = f.restore;
    seedFleet();
  });
  afterEach(() => {
    unmountAll();
    restore();
  });

  it('shows the figures of the window and says what it cannot measure', async () => {
    const box = mount(<Results />);
    await flush();
    expect(calls[0].path).toBe('/v1/value?days=30');
    const text = box.textContent || '';
    expect(text).toContain('Done12');
    expect(text).toContain('4 of 12');
    expect(text).toContain('8 unchecked');
    expect(text).toContain('at least $1.50');
    expect(text).toContain('2 runs without a price');
    expect(text).toContain('1 waiting for you');
    expect(text).toContain('Not set');
    expect(box.querySelector('#results-sentence')!.textContent).toContain('the agents finished 12 pieces');
    // The hatch of sent back and the three verdicts have words beside their colors.
    expect(box.querySelector('.rs-verdicts .rs-bar')!.getAttribute('aria-label')).toBe('3 accepted, 1 sent back, 8 unchecked');
  });

  it('keeps the window that the person picks', async () => {
    const box = mount(<Results />);
    await flush();
    const tab = [...box.querySelectorAll('[role="tab"]')].find((t) => t.textContent === '7 days') as HTMLElement;
    act(() => tab.click());
    await flush();
    expect(calls[calls.length - 1].path).toBe('/v1/value?days=7');
    expect(localStorage.getItem('fw.bossmode.results.days')).toBe('7');
    expect(box.textContent).toContain('Done by day');
  });

  it('lets the owner of an agent set the minutes of a piece, and nobody else', async () => {
    const box = mount(<Results />);
    await flush();
    const rows = [...box.querySelectorAll('tbody tr')];
    expect(rows[0].textContent).toContain('migrator');
    // seedFleet makes alice the owner of the migrator and an operator of the reviewer.
    const set = [...rows[0].querySelectorAll('button')].find((b) => b.textContent === 'Set') as HTMLButtonElement;
    expect(set).toBeTruthy();
    expect([...rows[1].querySelectorAll('button')].some((b) => b.textContent === 'Set')).toBe(false);
    act(() => set.click());
    const input = rows[0].querySelector('input') as HTMLInputElement;
    act(() => {
      input.value = '9999';
      input.dispatchEvent(new Event('input'));
    });
    act(() => (rows[0].querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(rows[0].textContent).toContain('From 0 to 2400 minutes');
    act(() => {
      input.value = '90';
      input.dispatchEvent(new Event('input'));
    });
    act(() => (rows[0].querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ line: 'agent:migrator', minutes: 90 });
    expect(box.textContent).toContain('90 min alice');
    expect(box.textContent).toContain('9 h');
  });
});
