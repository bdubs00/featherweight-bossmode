import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { WorkBoard, WorkCard } from '../api/types';
import { parseRoute, hrefOf, columnOf, parentOf } from '../lib/route';
import { store } from '../state/store';
import { Work, hrefOfCard, fromWords, labelOfCard, cardOfMade, DONE_SHOWN } from './Work';
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

/** wait lets the timers and the effects that wait for a paint run too. */
const wait = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 20)));
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
    expect(lane('needs-you').textContent).toContain('Your move');
    expect(lane('needs-you').textContent).toContain('2 agents');
    expect(lane('stopped').textContent).toContain('Lost');
    expect(lane('working').textContent).not.toContain('Your move');
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
    // A decision or a result whose next move is the person's opens its card in Activity, which ends it.
    expect(hrefOfCard(card('n', 'needs-you', { kind: 'duty', next: 'you', links: { duty: 'restore', run: 'run-n', approval: 'ap-1' } }))).toBe('#activity/d%3Arun-n/ap-1');
    expect(hrefOfCard(BOARD.cards[5])).toBe('#activity/v%3Arun-r');
    expect(parseRoute(hrefOfCard(BOARD.cards[5]))).toEqual({ place: 'activity', item: 'v:run-r' });
    // The result of another person opens its duty, and a question of a bridge opens the bridge.
    expect(hrefOfCard({ ...BOARD.cards[5], next: 'person' })).toBe('#duties/notes/run/run-r');
    expect(hrefOfCard({ ...BOARD.cards[1], links: { bridge: 'br-1', run: 'run-x', approval: 'ap-2' } })).toBe('#bridge/br-1');
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

  it('names the person who reads the board You, and never repeats the title in the meta', async () => {
    expect(fromWords(card('y', 'working'), 'alice@example.com')).toBe('You');
    expect(fromWords(card('y', 'working', { from: { kind: 'person', name: 'alice', via: 'manager' } }), 'alice@example.com')).toBe('Manager for you');
    expect(fromWords(card('y', 'working'), 'bob@example.com')).toBe('alice');
    // A bridge names the person by the name of the sign-in, a run by the subject.
    expect(fromWords(card('y', 'working', { from: { kind: 'person', name: 'alice@quillwork.example', via: 'bridge' } }), ['alice', 'alice@quillwork.example'])).toBe('You');
    expect(fromWords(card('y', 'working', { from: { kind: 'person', name: 'alice', via: 'page' } }), ['alice', 'alice@quillwork.example'])).toBe('You');
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com' }, roles: {}, admin: false, canCreate: true } as never });
    const titled = card('t', 'waiting', { kind: 'duty', title: 'nightly', from: { kind: 'duty', name: 'nightly', via: 'schedule' }, agents: ['backup-keeper'], links: { duty: 'nightly' } });
    const f = fakeFetch([['GET', /^\/v1\/work/, () => ({ ...BOARD, cards: [...BOARD.cards, titled] })], ['GET', /^\/v1\/duties$/, () => ({ duties: [] })]]);
    try {
      const el = mount(<Work />);
      await settle();
      const meta = (stage: string) => [...el.querySelectorAll('.lane-' + stage + ' .work-meta .clip')].map((m) => m.textContent);
      expect(meta('working')).toEqual(['You']);
      expect(meta('waiting')).toEqual(['Backup keeper']);
    } finally {
      f.restore();
      store.dispatch({ type: 'me', me: null });
    }
  });

  it('names a card for a screen reader with its stage, whose move it is, and lost', () => {
    expect(labelOfCard(BOARD.cards[2])).toBe('Title of l, Stopped, your move, lost, Its worker was replaced before it ended, so it cannot go on.');
    expect(labelOfCard(BOARD.cards[3])).toBe('Title of d, checked');
    expect(labelOfCard(card('c', 'working', { title: 'Write the email, have it reviewed,' }))).toBe('Write the email, have it reviewed, Working');
  });

  it('says on top what waits for the person, and a part takes the focus to its lane', async () => {
    const el = mount(<Work />);
    await settle();
    const glance = el.querySelector('.work-glance') as HTMLElement;
    const parts = [...glance.querySelectorAll('button')].map((b) => b.textContent);
    expect(parts).toEqual(['1 task needs you', '1 result to check', '1 stopped', '1 working']);
    // The line sits above the door.
    expect(glance.compareDocumentPosition(el.querySelector('#door-words')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => (glance.querySelectorAll('button')[1] as HTMLButtonElement).click());
    expect(document.activeElement && document.activeElement.textContent).toBe('Title of r');
  });

  it('says that nothing waits when no lane holds a move of the person', async () => {
    const quiet: WorkBoard = { ...BOARD, lanes: BOARD.lanes.map((l) => ({ ...l, yours: 0 })) };
    const f = fakeFetch([['GET', /^\/v1\/work/, () => quiet]]);
    try {
      const el = mount(<Work />);
      await settle();
      expect(el.querySelector('.work-glance')!.textContent).toBe('Nothing waits for you.1 working');
    } finally {
      f.restore();
    }
  });

  it('makes each lane one stop of the Tab key, and the arrows move between its cards', async () => {
    const two: WorkBoard = { ...BOARD, cards: [...BOARD.cards, card('w2', 'working', { next: 'agent' })] };
    const f = fakeFetch([['GET', /^\/v1\/work/, () => two]]);
    try {
      const el = mount(<Work />);
      await wait();
      const links = [...el.querySelectorAll<HTMLAnchorElement>('.lane-working .work-title')];
      expect(links.map((a) => a.getAttribute('tabindex'))).toEqual(['0', '-1']);
      links[0].focus();
      await act(async () => {
        links[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      });
      expect(document.activeElement).toBe(links[1]);
      // ArrowRight goes to the next lane with cards, and ArrowLeft comes back.
      await act(async () => {
        links[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      });
      expect(document.activeElement && document.activeElement.textContent).toBe('Title of b');
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      });
      expect(document.activeElement).toBe(links[1]);
      // Every lane with cards holds exactly one stop.
      for (const lane of el.querySelectorAll('.work-cards')) {
        const stops = lane.querySelectorAll('.work-title[tabindex="0"]').length;
        expect(stops).toBe(lane.querySelector('.work-title') ? 1 : 0);
      }
    } finally {
      f.restore();
    }
  });

  it('shows the newest done cards, and Show all shows every one', async () => {
    const many = Array.from({ length: DONE_SHOWN + 3 }, (_, i) => card('x' + i, 'done', { verdict: 'unchecked' }));
    const f = fakeFetch([['GET', /^\/v1\/work/, () => ({ ...BOARD, cards: [...BOARD.cards.filter((c) => c.stage !== 'done'), ...many] })]]);
    try {
      const el = mount(<Work />);
      await settle();
      const done = el.querySelector('.lane-done') as HTMLElement;
      expect(done.querySelectorAll('.work-card').length).toBe(DONE_SHOWN);
      const key = done.querySelector('.work-all') as HTMLButtonElement;
      expect(key.textContent).toBe('Show all ' + many.length);
      expect(key.getAttribute('aria-expanded')).toBe('false');
      await act(async () => key.click());
      expect(done.querySelectorAll('.work-card').length).toBe(many.length);
      expect(key.textContent).toBe('Show fewer');
    } finally {
      f.restore();
    }
  });

  it('offers Try again when the board did not load', async () => {
    let fail = true;
    const f = fakeFetch([['GET', /^\/v1\/work/, () => (fail ? new Response(JSON.stringify({ status: 500, detail: 'down' }), { status: 500, headers: { 'Content-Type': 'application/problem+json' } }) : BOARD)]]);
    try {
      const el = mount(<Work />);
      await wait();
      expect(el.textContent).toContain('The board did not load.');
      fail = false;
      const again = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
      await act(async () => again.click());
      await wait();
      expect(el.querySelectorAll('.work-lane').length).toBe(6);
    } finally {
      f.restore();
    }
  });

  it('closes the note of Needs work with Escape, and gives the focus back to Needs work', async () => {
    const el = mount(<Work />);
    await settle();
    const lane = el.querySelector('.lane-review') as HTMLElement;
    const key = (t: string) => [...lane.querySelectorAll('button')].find((b) => b.textContent === t)!;
    await act(async () => key('Needs work').click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const note = lane.querySelector('textarea') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(note);
    await act(async () => {
      note.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(lane.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(key('Needs work'));
  });

  it('gives an empty lane a still grey light, and a board with no task the key to the door', async () => {
    const empty: WorkBoard = { sentence: 'No work in the last 7 days.', days: 7, lanes: BOARD.lanes.map((l) => ({ stage: l.stage, count: 0, yours: 0 })), cards: [] };
    const f = fakeFetch([['GET', /^\/v1\/work/, () => empty]]);
    try {
      const el = mount(<Work />);
      await settle();
      expect(el.querySelectorAll('.work-lane-head .led-grey').length).toBe(6);
      expect(el.querySelector('.work-lane-head .breathe')).toBeNull();
      expect(el.querySelector('.work-none')!.textContent).toContain('You have no task in the last 7 days.');
      await act(async () => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Say what you need done')!.click());
      expect(document.activeElement).toBe(el.querySelector('#door-words'));
    } finally {
      f.restore();
    }
  });

  it('says why the board of the person is empty, and shows the tasks of everyone on a key', async () => {
    const empty: WorkBoard = { sentence: 'No work in the last 7 days.', days: 7, lanes: BOARD.lanes.map((l) => ({ stage: l.stage, count: 0, yours: 0 })), cards: [] };
    const f = fakeFetch([['GET', /^\/v1\/work/, (_b) => empty]]);
    try {
      const el = mount(<Work />);
      await settle();
      const key = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Show the tasks of everyone')!;
      await act(async () => key.click());
      await settle();
      expect(f.calls.some((c) => c.path === '/v1/work?all=true')).toBe(true);
      expect([...el.querySelectorAll('button')].find((b) => b.textContent === 'Everyone')!.getAttribute('aria-pressed')).toBe('true');
    } finally {
      f.restore();
    }
  });

  it('gives a person who can start no task no door, and opens the board on everyone', async () => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'erin' }, roles: { writer: 'viewer', ops: 'viewer' }, admin: false, canCreate: false } as never });
    try {
      const el = mount(<Work />);
      await settle();
      expect(el.querySelector('#door-words')).toBeNull();
      expect(el.textContent).toContain('Only an owner or an operator of an agent can start a task.');
      expect(calls[0].path).toBe('/v1/work?all=true');
      expect([...el.querySelectorAll('button')].find((b) => b.textContent === 'Everyone')!.getAttribute('aria-pressed')).toBe('true');
    } finally {
      store.dispatch({ type: 'me', me: null });
    }
  });

  it('offers Looks right and Needs work only on a result whose check is the move of the person', async () => {
    const other = card('o', 'review', { next: 'person', from: { kind: 'person', name: 'bob', via: 'page' }, links: { run: 'run-o' } });
    const team = card('t', 'review', { kind: 'bridge', next: 'you', reason: 'The seats ended their turns.', links: { bridge: 'br-2', run: 'run-seat' }, parts: { review: 2, total: 2 } });
    const f = fakeFetch([['GET', /^\/v1\/work/, () => ({ ...BOARD, cards: [...BOARD.cards, other, team] })]]);
    try {
      const el = mount(<Work />);
      await settle();
      const cards = [...el.querySelectorAll('.lane-review .work-card')];
      expect(cards.map((c) => !!c.querySelector('.result-keys'))).toEqual([true, false, false]);
    } finally {
      f.restore();
    }
  });

  it('finds the card of what Start made: its run, its bridge, or the open card of its duty', () => {
    const b: WorkBoard = { ...BOARD, cards: [...BOARD.cards, card('n', 'waiting', { kind: 'duty', links: { duty: 'notes' } })] };
    expect(cardOfMade(b, { run: 'run-w' })!.id).toBe('w');
    expect(cardOfMade(b, { bridge: 'br-1' })!.id).toBe('b');
    expect(cardOfMade(b, { duty: 'notes' })!.id).toBe('r');
    expect(cardOfMade(b, { run: 'nothing' })).toBeUndefined();
    expect(cardOfMade(null, { run: 'run-w' })).toBeUndefined();
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
