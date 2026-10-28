import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { WorkBoard, WorkCard } from '../api/types';
import { parseRoute, hrefOf, columnOf, parentOf } from '../lib/route';
import { Work, hrefOfCard, fromWords } from './Work';
import { at, fakeFetch, mount, unmountAll, type Call } from './testkit-b';

const card = (id: string, stage: WorkCard['stage'], extra: Partial<WorkCard> = {}): WorkCard => ({
  id,
  kind: 'conversation',
  title: 'Title of ' + id,
  from: { kind: 'person', name: 'alice@example.com', via: 'page' },
  stage,
  next: '',
  reason: '',
  opened: at(1),
  since: at(2),
  agents: ['helper'],
  parts: { total: 1 },
  links: { run: 'run-' + id },
  costUSD: 0,
  ...extra,
});

const BOARD: WorkBoard = {
  sentence: '3 tasks are open.',
  days: 7,
  lanes: [
    { stage: 'waiting', count: 0, yours: 0 },
    { stage: 'working', count: 1, yours: 0, oldest: at(3) },
    { stage: 'needs-you', count: 1, yours: 1, oldest: at(2) },
    { stage: 'stopped', count: 1, yours: 1, oldest: at(1) },
    { stage: 'review', count: 1, yours: 1, oldest: at(3) },
    { stage: 'done', count: 2, yours: 0, oldest: at(4) },
  ],
  cards: [
    card('w', 'working', { next: 'agent' }),
    card('b', 'needs-you', { kind: 'bridge', next: 'you', reason: 'scribe asks: Who reads it?', links: { bridge: 'br-1', run: 'run-x', approval: '' }, parts: { needsYou: 1, review: 1, total: 2 } }),
    card('l', 'stopped', { next: 'you', lost: true, reason: 'Its worker was replaced before it ended, so it cannot go on.' }),
    card('d', 'done', { kind: 'duty', from: { kind: 'duty', name: 'nightly', via: 'schedule' }, links: { duty: 'nightly', run: 'run-d' }, verdict: 'checked' }),
    card('a', 'done', { verdict: 'sent-back' }),
    card('r', 'review', { kind: 'duty', next: 'you', from: { kind: 'duty', name: 'notes', via: 'schedule' }, links: { duty: 'notes', run: 'run-r' } }),
  ],
};

let calls: Call[] = [];
let restore = () => {};

beforeEach(() => {
  const f = fakeFetch([
    ['GET', /^\/v1\/work/, () => BOARD],
    ['POST', /^\/v1\/runs\/run-r\/reactions$/, () => ({ id: 'run-r', state: 'completed' })],
  ]);
  calls = f.calls;
  restore = f.restore;
});

afterEach(() => {
  unmountAll();
  restore();
});

const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};

describe('the board of the work', () => {
  it('shows six lanes in the order of the flow, with their counts and their cards', async () => {
    const el = mount(<Work />);
    await settle();
    const heads = [...el.querySelectorAll('.work-lane-head h3')].map((h) => h.textContent);
    expect(heads).toEqual(['Coming up', 'Working', 'Needs you', 'Stopped', 'To check', 'Done']);
    const lane = (stage: string) => el.querySelector('.lane-' + stage) as HTMLElement;
    expect(lane('needs-you').querySelectorAll('.work-card').length).toBe(1);
    expect(lane('needs-you').querySelector('.work-card')!.classList.contains('need')).toBe(true);
    expect(lane('needs-you').textContent).toContain('Yours');
    expect(lane('needs-you').textContent).toContain('2 agents');
    expect(lane('stopped').textContent).toContain('Lost');
    expect(lane('working').textContent).not.toContain('Yours');
    // A done card says its verdict.
    expect(lane('done').textContent).toContain('checked');
    expect(lane('done').textContent).toContain('sent back');
    // The header counts the open cards, not the done ones.
    expect(el.querySelector('.pane-head .chip [aria-hidden]')!.textContent).toBe('4');
    // The door sits above the board.
    expect(el.querySelector('#door-words')).not.toBeNull();
    expect(calls[0].path).toBe('/v1/work');
  });

  it('asks for every card with Everyone', async () => {
    const el = mount(<Work />);
    await settle();
    const all = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Everyone')!;
    await act(async () => all.click());
    await settle();
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(calls.some((c) => c.path === '/v1/work?all=true')).toBe(true);
  });

  it('opens the place of a card', () => {
    expect(hrefOfCard(BOARD.cards[1])).toBe('#bridge/br-1');
    expect(hrefOfCard(BOARD.cards[3])).toBe('#duties/nightly/run/run-d');
    expect(hrefOfCard(BOARD.cards[0])).toBe('#chat/run-w');
    expect(hrefOfCard(card('q', 'needs-you'))).toBe('#activity');
    expect(fromWords(card('m', 'working', { from: { kind: 'person', name: 'alice', via: 'manager' } }))).toBe('Manager for alice');
  });

  it('checks a result with Looks right, and asks for a note before Needs work sends it back', async () => {
    const el = mount(<Work />);
    await settle();
    const lane = el.querySelector('.lane-review') as HTMLElement;
    const key = (t: string) => [...lane.querySelectorAll('button')].find((b) => b.textContent === t)!;
    await act(async () => key('Needs work').click());
    await act(async () => key('Send back').click());
    expect(lane.textContent).toContain('Say what must change.');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await act(async () => key('Cancel').click());
    await act(async () => key('Looks right').click());
    await settle();
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/v1/runs/run-r/reactions');
    expect(post.body).toEqual({ seq: 0, reaction: 'up' });
  });

  it('offers no result keys on a bridge to check, whose operator closes it or gives a new task', async () => {
    restore();
    const bridge = card('t', 'review', { kind: 'bridge', reason: 'The seats ended their turns.', links: { bridge: 'br-2', run: 'run-seat' }, parts: { review: 2, total: 2 } });
    const f = fakeFetch([['GET', /^\/v1\/work/, () => ({ ...BOARD, cards: [bridge] })]]);
    calls = f.calls;
    restore = f.restore;
    const el = mount(<Work />);
    await settle();
    const lane = el.querySelector('.lane-review') as HTMLElement;
    expect(lane.textContent).toContain('The seats ended their turns.');
    const words = [...lane.querySelectorAll('button')].map((b) => b.textContent);
    expect(words).not.toContain('Looks right');
    expect(words).not.toContain('Needs work');
  });

  it('lives at #work, a place of its own, and #tasks opens it too', () => {
    const r = parseRoute('#work');
    expect(r).toEqual({ place: 'work' });
    expect(parseRoute('#tasks')).toEqual({ place: 'work' });
    expect(hrefOf(r)).toBe('#work');
    expect(columnOf(r)).toBe('main');
    expect(parentOf(r)).toEqual({ place: 'home' });
  });
});
