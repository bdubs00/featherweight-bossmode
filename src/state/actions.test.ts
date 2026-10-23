import { afterEach, describe, expect, it, vi } from 'vitest';
import { setFetch, type FetchLike } from '../api/client';
import type { Bridge, Entry, Member, StreamEvent } from '../api/types';
import { MISSED_WAITS, completeEvent, forgetMissed, loadAllCards, loadChannel, missedCard, readMissed } from './actions';
import { store } from './store';

const card = (partial: boolean): Entry => ({
  seq: 37,
  at: '2026-10-21T20:13:00Z',
  from: { kind: 'system' },
  text: 'migrator-2 wants to run a command.',
  event: 'needs-you',
  decision: partial
    ? { run: 'r1', id: 'ap1', label: 'Run command', state: 'pending' }
    : { run: 'r1', id: 'ap1', label: 'Run command', state: 'pending', input: { command: 'git push' } },
  ...(partial ? { partial: true } : {}),
});

const event = (message: Entry): StreamEvent => ({ id: '9', kind: 'bridge.message', data: { bridge: 'br-1', message } });

let old: FetchLike | null = null;
afterEach(() => {
  if (old) setFetch(old);
  old = null;
});

function answer(body: unknown, status = 200, seen: string[] = []): void {
  old = setFetch(async (input) => {
    seen.push(String(input));
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('completeEvent', () => {
  it('passes a whole entry and other kinds as they are', async () => {
    const e = event(card(false));
    expect(await completeEvent(e)).toBe(e);
    const r: StreamEvent = { id: '1', kind: 'run', data: { id: 'r1' } };
    expect(await completeEvent(r)).toBe(r);
  });

  it('reads a partial entry again with from and limit 1', async () => {
    const seen: string[] = [];
    answer({ bridge: 'br-1', messages: [card(false)], next: 0, prev: 36 }, 200, seen);
    const out = await completeEvent(event(card(true)));
    expect(seen).toEqual(['/v1/bridges/br-1/messages?from=37&limit=1']);
    expect(out && (out.data as { message: Entry }).message.decision!.input).toEqual({ command: 'git push' });
    expect(out!.id).toBe('9');
  });

  it('reads an entry again when the front marks the event partial beside the entry, as it sends a large card', async () => {
    const seen: string[] = [];
    answer({ bridge: 'br-1', messages: [card(false)], next: 0, prev: 36 }, 200, seen);
    const e: StreamEvent = { id: '9', kind: 'bridge.message', data: { bridge: 'br-1', message: card(false), partial: true } };
    (e.data as { message: Entry }).message.decision!.input = undefined;
    const out = await completeEvent(e);
    expect(seen).toEqual(['/v1/bridges/br-1/messages?from=37&limit=1']);
    expect(out && (out.data as { message: Entry }).message.decision!.input).toEqual({ command: 'git push' });
  });

  it('drops the event when the read fails or answers another entry', async () => {
    answer({ title: 'Not Found', status: 404 }, 404);
    expect(await completeEvent(event(card(true)))).toBeNull();
    setFetch(old!);
    answer({ bridge: 'br-1', messages: [{ ...card(false), seq: 38 }], next: 0, prev: 0 });
    expect(await completeEvent(event(card(true)))).toBeNull();
  });
});

/* ---------- a card that the stream did not bring ---------- */

let B = 'br-miss';
const bridgeRec = (over: Partial<Bridge> = {}): Bridge => ({
  id: B,
  title: 'Harden the lab hosts',
  goal: '',
  operator: 'token',
  state: 'open',
  placement: 'queue',
  createdAt: '2026-10-23T04:00:00Z',
  closedAt: null,
  delegation: { approve: false, budget: false, members: false, report: true },
  caps: { maxMessages: 2000, maxFanoutPerMinute: 30, maxPairMessages: 6 },
  lastSeq: 38,
  read: 38,
  unread: 0,
  ...over,
});
const msg = (seq: number, over: Partial<Entry> = {}): Entry => ({ seq, at: '2026-10-23T04:24:00Z', from: { kind: 'agent', handle: 'reviewer' }, text: 'message ' + seq, ...over });
const seatOf = (handle: string, over: Partial<Member> = {}): Member => ({ handle, agent: handle, task: 't', runs: ['run-' + handle], fired: false, muted: false, presence: 'working', ...over });
const card39 = msg(39, { from: { kind: 'system' }, event: 'needs-you', text: 'net-auditor wants to use ansible.adhoc', decision: { run: 'run-net-auditor', id: 'ap-39', tool: 'ansible.adhoc', label: 'Allow', state: 'pending', input: { pattern: 'lab', check: false } } });

/** open puts a new bridge with its roster and the channel up to seq 38 into the store. */
let opened = 0;
function openBridge(): void {
  B = 'br-miss-' + ++opened;
  store.dispatch({ type: 'bridges', bridges: [bridgeRec()] });
  store.dispatch({ type: 'bridge', bridge: { ...bridgeRec(), members: [seatOf('net-auditor'), seatOf('reviewer')] } });
  store.dispatch({ type: 'channel', bridge: B, page: { bridge: B, messages: [msg(37), msg(38)], next: 0, prev: 0 }, mode: 'latest' });
}

/** serve answers the reads of the channel from the entries, and records the paths. */
function serveChannel(entries: Entry[], seen: string[]): void {
  old = setFetch(async (input) => {
    const path = String(input);
    seen.push(path);
    const from = /from=(\d+)/.exec(path);
    const list = from ? entries.filter((e) => e.seq >= Number(from[1])) : entries.slice(-50);
    return new Response(JSON.stringify({ bridge: B, messages: list, next: 0, prev: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('a card that the stream did not bring', () => {
  afterEach(() => {
    forgetMissed();
    vi.useRealTimers();
  });

  it('is missed when a seat waits for a decision or names a question that the loaded channel lacks, or an entry comes after a gap', () => {
    openBridge();
    const runEvent: StreamEvent = { id: '1', kind: 'run', data: { id: 'run-net-auditor', agent: 'net-auditor', state: 'input-required', seq: 9, createdAt: '', updatedAt: '', member: 'default/crew-0', pending: { id: 'ap-39', tool: 'ansible.adhoc' } } };
    expect(missedCard(store.get(), runEvent)).toBe(B);
    const question: StreamEvent = { id: '2', kind: 'bridge.member', data: { bridge: B, member: seatOf('reviewer', { presence: 'needs-you', question: 39 }) } };
    expect(missedCard(store.get(), question)).toBe(B);
    const gap: StreamEvent = { id: '3', kind: 'bridge.message', data: { bridge: B, message: msg(40) } };
    expect(missedCard(store.get(), gap)).toBe(B);
    expect(missedCard(store.get(), { id: '4', kind: 'bridge.message', data: { bridge: B, message: msg(39) } })).toBe('');
    // Once the channel holds the card, nothing is missed.
    store.dispatch({ type: 'entry', bridge: B, entry: card39 });
    expect(missedCard(store.get(), runEvent)).toBe('');
    expect(missedCard(store.get(), question)).toBe('');
    // A run of no seat of a loaded channel is no business of a channel.
    expect(missedCard(store.get(), { id: '5', kind: 'run', data: { id: 'run-other', state: 'input-required', pending: { id: 'x' } } })).toBe('');
  });

  it('is read from the channel a moment later, and again after a longer pause while it still lacks', async () => {
    vi.useFakeTimers();
    openBridge();
    const seen: string[] = [];
    const entries = [msg(37), msg(38)];
    serveChannel(entries, seen);
    const lacks = () => !store.get().channels[B].bySeq[39];
    readMissed(B, lacks);
    readMissed(B, lacks); // a burst reads once
    await vi.advanceTimersByTimeAsync(MISSED_WAITS[0] - 1);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual(['/v1/bridges/' + B + '/messages?from=39&limit=200']);
    // The front writes the card a moment later: the next read brings it.
    entries.push(card39);
    await vi.advanceTimersByTimeAsync(MISSED_WAITS[1]);
    expect(seen).toHaveLength(2);
    expect(store.get().channels[B].bySeq[39]).toEqual(card39);
    // The card is there: no third read.
    await vi.advanceTimersByTimeAsync(MISSED_WAITS[2]);
    expect(seen).toHaveLength(2);
  });

  it('reads on after the first read of a channel, when the record knows a newer entry than the read answered', async () => {
    store.dispatch({ type: 'bridges', bridges: [bridgeRec({ id: 'br-race', lastSeq: 39 })] });
    const seen: string[] = [];
    let first = true;
    old = setFetch(async (input) => {
      const path = String(input);
      seen.push(path);
      // The first read answered before the card landed.
      const messages = first ? [msg(38)] : [card39];
      first = false;
      return new Response(JSON.stringify({ bridge: 'br-race', messages, next: 0, prev: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    await loadChannel('br-race');
    expect(seen).toEqual(['/v1/bridges/br-race/messages?limit=50', '/v1/bridges/br-race/messages?from=39&limit=200']);
    expect(store.get().channels['br-race'].seqs).toEqual([38, 39]);
  });

  it('shows in the tab Decisions, which reads forward past the newest loaded entry before it says that nothing needs you', async () => {
    openBridge();
    const seen: string[] = [];
    serveChannel([msg(37), msg(38), card39], seen);
    await loadAllCards(B);
    expect(seen[0]).toBe('/v1/bridges/' + B + '/messages?from=39&limit=200');
    expect(store.get().channels[B].bySeq[39]).toEqual(card39);
  });
});
