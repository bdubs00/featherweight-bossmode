import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import type { Entry } from '../api/types';
import { EntryRow, arrived, markLoaded, toneOfEvent } from './Message';
import { bridgeOf, entryOf, fakeFetch, memberOf, mount, settle, unmountAll } from './testkit-a';

const B = 'b-msg';
const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';

const entries: Entry[] = [
  entryOf(1, { text: 'The role passes the lint.', reactions: { up: [BOB], down: [], heart: [ALICE] } }),
  entryOf(2, { from: { kind: 'system' }, event: 'started', text: 'tester woke up.' }),
  entryOf(3, { from: { kind: 'system' }, event: 'failed', text: 'writer failed: The run reached its limit of 40 turns.' }),
  entryOf(4, { from: { kind: 'system' }, event: 'finished', text: 'reviewer finished.' }),
  entryOf(5, { from: { kind: 'system' }, event: 'changed', text: 'migrator-1 changed the plan.', page: 'bridges/b-msg/plan.md' } as Partial<Entry>),
  entryOf(6, {
    from: { kind: 'system' },
    event: 'needs-you',
    text: 'migrator-2 wants to run a command.',
    mirrors: { run: 'run-migrator-2', seq: 3, type: 'fw.approval.requested' },
    reactions: { up: [BOB], down: [], heart: [] },
    decision: { run: 'run-migrator-2', id: 'ap-1', tool: 'bash', label: 'Run command', input: { command: 'git push' }, state: 'pending', always: true },
  }),
  entryOf(7, { from: { kind: 'person', name: ALICE, display: 'Alice' }, to: ['reviewer', 'tester'], text: 'Check it, please.' }),
  entryOf(8, { text: 'A long answer.', cut: true }),
  entryOf(9, { from: { kind: 'agent', handle: 'manager' }, text: 'I opened the bridge.' }),
  entryOf(10, { from: { kind: 'agent', handle: 'reviewer', run: 'run-reviewer' }, text: 'Will do.', replyTo: 7 }),
  entryOf(11, { from: { kind: 'agent', handle: 'reviewer', run: 'run-reviewer' }, text: 'About that.', replyTo: 1000 }),
  entryOf(12, { from: { kind: 'person', name: ALICE, display: 'Alice' }, text: 'Keep the template names.', pinned: true }),
];

beforeAll(() => {
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: ALICE, name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'bridge', bridge: { ...bridgeOf(B), members: [memberOf('migrator-1'), memberOf('migrator-2'), memberOf('reviewer'), memberOf('tester')] } });
    store.dispatch({ type: 'channel', bridge: B, page: { bridge: B, messages: entries, next: 0, prev: 0 }, mode: 'latest' });
  });
});
afterEach(unmountAll);

const row = (seq: number, prevSeq = 0) => mount(<EntryRow bridge={B} seq={seq} prevSeq={prevSeq} onReply={() => {}} />);

describe('the reaction chips', () => {
  it('sit at the top right of an entry with their counts, and mark the reaction of the person', () => {
    const el = row(1);
    const chips = el.querySelectorAll('.rx .rchip');
    expect(chips.length).toBe(2);
    expect(chips[0].querySelector('.sr')!.textContent).toBe('1 thumb up');
    expect(chips[1].classList.contains('mine')).toBe(true);
    expect(chips[1].querySelector('.sr')!.textContent).toBe('1 heart, yours among them');
    expect(el.querySelector('.msg')!.classList.contains('has-rx')).toBe(true);
  });

  it('adds the same reaction on a click of a chip that is not yours, and never removes one', async () => {
    const f = fakeFetch([['POST', /\/reactions$/, () => entries[0]]]);
    try {
      const el = row(1);
      const up = el.querySelector('button.rchip') as HTMLButtonElement;
      expect(el.querySelectorAll('button.rchip').length).toBe(1);
      act(() => up.click());
      await settle();
      expect(f.seen[0]).toEqual({ method: 'POST', path: '/v1/bridges/b-msg/messages/1/reactions', body: { reaction: 'up' } });
    } finally {
      f.restore();
    }
  });

  it('asks for the optional note of a heart, with the keys Cancel and Heart', () => {
    const el = row(1);
    act(() => (el.querySelector('button[aria-label="Heart"]') as HTMLButtonElement).click());
    const form = el.querySelector('form.heart-note')!;
    expect(form.querySelector('.field-label')!.textContent).toBe('What made this useful?');
    expect(form.querySelector('textarea')!.getAttribute('placeholder')).toBe('Optional');
    expect([...form.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Heart']);
  });

  it('decides with the thumbs of a card that waits, and its thumb chip only counts', async () => {
    const f = fakeFetch([['POST', /\/approvals\//, () => ({})]]);
    try {
      const el = row(6);
      expect(el.querySelector('button[aria-label="Thumb up: Run command"]')).not.toBeNull();
      expect(el.querySelector('button[aria-label="Thumb down: Deny"]')).not.toBeNull();
      expect(el.querySelector('button.rchip')).toBeNull();
      act(() => (el.querySelector('button[aria-label="Thumb up: Run command"]') as HTMLButtonElement).click());
      await settle();
      expect(f.seen[0]).toEqual({ method: 'POST', path: '/v1/runs/run-migrator-2/approvals/ap-1', body: { decision: 'allow' } });
    } finally {
      f.restore();
    }
  });
});

describe('the system lines', () => {
  it('take the light of their event', () => {
    expect(toneOfEvent('started')).toBe('green');
    expect(toneOfEvent('needs-you')).toBe('amber');
    expect(toneOfEvent('asked')).toBe('amber');
    expect(toneOfEvent('failed')).toBe('red');
    expect(toneOfEvent('finished')).toBe('grey');
    expect(toneOfEvent(undefined)).toBe('grey');
    expect(row(2).querySelector('.sys .led-green')).not.toBeNull();
    expect(row(3).querySelector('.sys .led-red')).not.toBeNull();
    expect(row(4).querySelector('.sys .led-grey')).not.toBeNull();
    expect(row(2).querySelector('.sys .breathe')).toBeNull();
  });

  it('link the page of the wiki that a line is about', () => {
    const a = row(5).querySelector('a.sys-page')!;
    expect(a.textContent).toBe('bridges/b-msg/plan.md');
    expect(a.getAttribute('href')).toBe('#pages/bridges/b-msg/plan.md');
  });

  it('say the words of the page for their event, with the sentence of the backend in the tooltip', () => {
    const text = (seq: number) => row(seq).querySelector('.sys-text')!;
    expect(text(2).firstChild!.textContent).toBe('tester woke up');
    expect(text(2).getAttribute('title')).toBeNull();
    expect(text(3).firstChild!.textContent).toBe('writer failed');
    expect(text(3).getAttribute('title')).toBe('Stopped at 40 turns.');
    expect(text(5).firstChild!.textContent).toBe('migrator-1 changed a page');
  });
});

describe('the messages', () => {
  it('name the addressees in words', () => {
    expect(row(7).querySelector('.to')!.textContent).toBe('to reviewer and tester');
  });

  it('name the person who reads the page You on a message of their own', () => {
    expect(row(7).querySelector('header b')!.textContent).toBe('You');
    expect(row(10).querySelector('header b')!.textContent).toBe('reviewer');
  });

  it('mark a pinned message with a quiet chip, and keep its header after a message of the same sender', () => {
    const el = row(12, 7);
    expect(el.querySelector('header .chip-plain')!.textContent).toBe('pinned');
    expect(row(7).querySelector('header .chip')).toBeNull();
  });

  it('say that the channel cut a long text, and link the whole text', () => {
    const cut = row(8).querySelector('.cut')!;
    expect(cut.textContent).toBe('Cut at 4 KB. Whole text');
    expect(cut.querySelector('a')!.getAttribute('href')).toBe('#member/b-msg/migrator-1');
  });

  it('draw the mark of the manager in ink', () => {
    expect(row(9).querySelector('.mark svg.hue-ink')).not.toBeNull();
  });

  it('name the entry that a reply answers, or an earlier message', () => {
    const chip = row(10).querySelector('.reply-chip')!;
    expect(chip.querySelector('.reply-who')!.textContent).toBe('Alice');
    expect(chip.getAttribute('title')).toBe('Go to the message');
    const gone = row(11).querySelector('.reply-chip')!;
    expect(gone.textContent).toBe('An earlier message');
    expect(gone.getAttribute('title')).toBe('Earlier messages hold it');
  });

  it('show a card that arrives after the load once settling, and a card on load still', () => {
    markLoaded(B, 5);
    expect(arrived(B, 6)).toBe(true);
    expect(arrived(B, 5)).toBe(false);
    expect(row(6).querySelector('.card.settle')).not.toBeNull();
    markLoaded(B, 11);
    expect(row(6).querySelector('.card.settle')).toBeNull();
  });
});
