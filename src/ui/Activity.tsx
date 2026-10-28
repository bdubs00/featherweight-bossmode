// The Activity place: the inbox of what needs you, across every open
// bridge. One row per decision, question, failed seat, stopped seat, and
// new message, in the order of attention: needs you first, the oldest wait
// first, then the errors, then the rest by the status of the sender. A row
// of a decision offers no key: a click shows its card, which says what the
// action does, with Deny and the verb of the action. j and k move, Enter
// opens, a allows, d denies, r replies, and s seats a stopped seat again.
// c continues a seat at its limit, and e is Done on a message, which clears
// it for you through the read mark of its bridge. On a result to check, a
// goes to Looks right and d to Needs work in its card. A decision of a or d
// waits HOLD_MS before it goes out: the notice says Allowed. or Denied.
// with Undo, the row and its card say what it holds, the focus stays on the
// row, and u on the row takes the decision back too. On a question of a
// seat, a opens the answer, and d holds the choice that says no, such as
// Decline; a question without such a choice says to answer it with a.
// After a decision or an answer, the main pane and the focus move together
// to the next item that needs you, so a key never acts on a row that the
// person does not see; when none needs you, the main pane shows the
// decided card settled.
// The main pane shows the row that has the focus: a decision as its card.
// Where the main pane shows beside the list and no row is picked, it shows
// the row that needs you and waits longest. The address names a picked
// row, #activity/<key>, so a narrow window opens it and a link reaches it.
// A run of a duty shows the name of its duty as a chip that opens the
// duty. GET /v1/inbox adds the failed runs and the paused duties, and the
// questions of the runs of duties that sit on no bridge.

import { useEffect, useRef, useState } from 'preact/hooks';
import { go, hrefOf, parseRoute } from '../lib/route';
import { decisionTitle, excerpt, personName, plainText, senderName, since } from '../lib/words';
import { briefOf, planOf } from '../lib/decision';
import { answerQuestion, decide } from '../state/actions';
import { useInboxRows, type InboxView } from '../state/activity';
import { ensureChannels, ensureEntries, ensureResults, ensureRuns } from '../state/fetchers';
import { cardOf, keyAction, type InboxRow } from '../state/inbox';
import { store, useSelect } from '../state/store';
import { selectFacts } from '../state/reducer';
import { awakeFor } from '../lib/status';
import { AskCard, DecisionCard } from './Decision';
import { useRoving } from './keys';
import { attempt, dropUndo, showSaid, showUndo } from './notice';
import { Empty, Markdown, When } from './common';
import { SeatAgainKey, continueSeat, seatAgain } from './SeatAgain';
import { markDone, madeOf, settledOf, useMade } from '../state/done';
import { loadInbox, useDutyLabel } from '../state/duties';
import { dutyLabel } from '../lib/duties';
import { EmptyPane } from './Shell';
import { Avatar, Button, Card, Led, Mark, PaneHeader } from './primitives';
import { ResultKeys } from './ResultKeys';

const TWO_PANES = '(min-width: 800px)';

/** useTwoPanes reports whether the window shows the main pane beside the list, and follows a change of its width. */
function useTwoPanes(): boolean {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(TWO_PANES) : null;
  const [wide, setWide] = useState(() => !!q && q.matches);
  useEffect(() => {
    if (!q) return;
    const f = () => setWide(q.matches);
    f();
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, []);
  return wide;
}

/**
 * firstNeed is the row that the main pane shows when nothing is picked: the
 * row that needs you and waits longest, the first row of the order of
 * attention. It answers "" when no row needs you.
 */
export function firstNeed(rows: InboxRow[]): string {
  return rows.length && rows[0].status === 'needs-you' ? rows[0].key : '';
}

/**
 * useShown names the row that the main pane shows: the row of the address
 * or the one that the person picked. Else, where the main pane shows beside
 * the list, the row that needs you and waits longest. A narrow window shows
 * one pane, so there the list stays, and the route and the focus stay too.
 */
function useShown(item: string | undefined, rows: InboxRow[]): string {
  const chosen = usePicked();
  const wide = useTwoPanes();
  return item || chosen || (wide ? firstNeed(rows) : '');
}

/* ---------- the row that the main pane shows ---------- */

let pickedKey = '';
const pickListeners = new Set<() => void>();

/** pick shows a row of the inbox in the main pane, and names it in the address. */
export function pick(key: string): void {
  if (settledRow && settledRow.key !== key) settledRow = null;
  if (key === pickedKey) return;
  pickedKey = key;
  for (const f of [...pickListeners]) f();
  // A move of the focus replaces the address, so j and k add no history.
  const r = parseRoute(location.hash);
  if (key && r.place === 'activity' && r.item !== key) go({ place: 'activity', item: key }, true);
}

function usePicked(): string {
  const [k, setK] = useState(pickedKey);
  useEffect(() => {
    const f = () => setK(pickedKey);
    pickListeners.add(f);
    return () => {
      pickListeners.delete(f);
    };
  }, []);
  return k;
}

/* ---------- a decision made, and a message done ---------- */

/** The row whose decision the person made here when no other row needed them: the main pane keeps it, its card settled. */
let settledRow: InboxRow | null = null;

/**
 * afterDecision moves the main pane on after a decision on its card: to the
 * next row that needs the person, or, when none is left, it keeps the row,
 * whose card shows the decision settled.
 */
function afterDecision(r: InboxRow, rows: InboxRow[]): void {
  const next = nextNeed(rows, r.key);
  if (next) {
    settledRow = null;
    pick(next.key);
    focusRow(next.key);
    return;
  }
  settledRow = r;
  if (pickedKey !== r.key) pick(r.key);
  else for (const f of [...pickListeners]) f();
}

/* ---------- a decision of a key, held a moment ---------- */

/** HOLD_MS is how long a decision of the keys a and d waits before it goes out, so Undo can take it back. */
export const HOLD_MS = 5000;

let holdMs = HOLD_MS;

/** holdFor sets how long a decision of a key waits, for the tests. */
export function holdFor(ms: number = HOLD_MS): void {
  holdMs = ms;
}

/** What a row holds: a decision of a card, or a choice that answers a question of a seat. */
export type HeldAct = 'allow' | 'deny' | 'answer';

interface Held {
  key: string;
  bridge: string;
  act: HeldAct;
  /** The run and the approval of a decision. */
  run: string;
  id: string;
  /** The seat, the entry of its question, and the choice of an answer. */
  handle: string;
  seq: number;
  text: string;
  /** When it goes out, by the clock of the page, for the card that counts down. */
  until: number;
  timer: ReturnType<typeof setTimeout>;
  undo: () => void;
  /** The decision that the page knew made on the card when the key held this one, so a decision on the card in the meantime shows. */
  made: unknown;
}

/** The decisions and answers that wait to go out, by the key of their row. */
const held = new Map<string, Held>();
const heldListeners = new Set<() => void>();
const tellHeld = () => {
  for (const f of [...heldListeners]) f();
};

/** useHeld gives what a row holds, or undefined. */
function useHeld(key: string): Held | undefined {
  const [v, setV] = useState<Held | undefined>(() => held.get(key));
  useEffect(() => {
    const f = () => setV(held.get(key));
    heldListeners.add(f);
    f();
    return () => {
      heldListeners.delete(f);
    };
  }, [key]);
  return v;
}

/** heldWord is the word of what a row holds: Allowed, Denied, or Answered and the choice. */
export const heldWord = (h: Pick<Held, 'act' | 'text'>): string => (h.act === 'allow' ? 'Allowed' : h.act === 'deny' ? 'Denied' : 'Answered ' + h.text);

/** rowEl finds the row of a key in the list. */
const rowEl = (key: string): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('.inbox-row[data-key]')].find((x) => x.getAttribute('data-key') === key);

/** hold keeps what a key did on a row for holdMs, with the notice and Undo, then sends it with go, unless it no longer waits. */
function hold(r: InboxRow, h: Omit<Held, 'key' | 'bridge' | 'until' | 'timer' | 'undo'>, go: (h: Held) => Promise<unknown>): void {
  const was = held.get(r.key);
  if (was && was.act === h.act && was.text === h.text) return;
  if (was) clearTimeout(was.timer);
  const undo = () => undoHold(r.key);
  const one: Held = {
    ...h,
    key: r.key,
    bridge: r.bridge,
    until: Date.now() + holdMs,
    undo,
    timer: setTimeout(() => {
      held.delete(r.key);
      tellHeld();
      dropUndo(undo);
      if (!stillWaits(one)) return;
      attempt(() => go(one));
    }, holdMs),
  };
  held.set(r.key, one);
  tellHeld();
  showUndo(heldWord(one) + '.', undo, holdMs);
}

/**
 * holdDecision holds the decision of a key on a row for holdMs, with the
 * notice Allowed. or Denied. and Undo. The other key on the same row
 * changes the decision that it holds. After the wait, the decision goes
 * out, unless the card was decided in the meantime, such as on its card.
 */
export function holdDecision(r: InboxRow, decision: 'allow' | 'deny'): void {
  const d = r.decision;
  if (!d) return;
  // A question of a duty on no bridge leaves the inbox of the duties, so the inbox reads again.
  hold(r, { act: decision, run: d.run, id: d.id, handle: '', seq: 0, text: '', made: madeOf(d.run, d.id) }, (h) => decide(h.run, h.id, h.act as 'allow' | 'deny').then(() => (h.bridge ? undefined : loadInbox())));
}

/** holdAnswer holds a choice that answers the question of a seat, as d does with the choice that says no, with Answered <choice>. and Undo. */
export function holdAnswer(r: InboxRow, text: string): void {
  if (!r.handle || !r.entry) return;
  hold(r, { act: 'answer', run: '', id: '', handle: r.handle, seq: r.entry.seq, text, made: undefined }, (h) => answerQuestion(h.bridge, h.handle, h.seq, h.text));
}

/** NO_WORDS are the first words of a choice that says no, such as No, Decline, or Not now. */
const NO_WORDS = /^(no|nope|decline|deny|reject|refuse|cancel|stop|skip|abort|don't|do not|not now|later)\b/i;

/** negativeChoice finds the choice of a question that says no, or "" when none does. */
export function negativeChoice(choices: string[] | undefined): string {
  return (choices || []).find((c) => NO_WORDS.test(c.trim())) || '';
}

/** undoHold takes back what a row holds, so nothing goes out, and gives the focus back to the row. */
export function undoHold(key: string): void {
  const h = held.get(key);
  if (!h) return;
  clearTimeout(h.timer);
  held.delete(key);
  tellHeld();
  dropUndo(h.undo);
  showSaid('Undone. Nothing went out.');
  const el = rowEl(key);
  if (el) el.focus();
}

/** stillWaits reports whether what a row holds still waits: a card that the channel shows decided, a question that ended, or a decision made on its card in the meantime needs nothing more. */
function stillWaits(h: Held): boolean {
  const s = store.get();
  if (h.act === 'answer') {
    const r = s.rosters[h.bridge];
    const m = r ? r.byHandle[h.handle] : undefined;
    return !m || m.question === h.seq;
  }
  if (madeOf(h.run, h.id) !== h.made) return false;
  const card = h.bridge ? cardOf(s.channels[h.bridge], h.run, h.id) : undefined;
  if (card && card.decision && card.decision.state !== 'pending') return false;
  // A run that waits for no decision, or for another one, took this decision already.
  const run = s.runs[h.run];
  return !(run && (run.pending === null || (run.pending && run.pending.id !== h.id)));
}

/** HeldCard takes the place of the card of a row whose decision or answer waits to go out: what it holds, the seconds left, and Undo. */
function HeldCard({ h, title }: { h: Held; title: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(1, Math.ceil((h.until - now) / 1000));
  return (
    <Card class="decide held" title={title} tone="grey" quiet label={heldWord(h) + ', ' + title}>
      <p class="held-line">
        {heldWord(h)}. It goes out in {left === 1 ? '1 second' : left + ' seconds'}.
      </p>
      <div class="card-actions">
        <Button kind="primary" onClick={() => undoHold(h.key)}>
          Undo
        </Button>
      </div>
    </Card>
  );
}

/**
 * nextNeed is the row that needs the person after the row gone leaves: the
 * first one in the order of attention that waits, and that no key holds and
 * no card decided.
 */
export function nextNeed(rows: InboxRow[], gone: string): InboxRow | undefined {
  return rows.find((x) => x.key !== gone && x.status === 'needs-you' && !held.has(x.key) && !(x.decision && madeOf(x.decision.run, x.decision.id)));
}

/**
 * focusRow gives the focus to the row of a key once it is drawn, where the
 * list shows beside the main pane, so the row that the main pane shows and
 * the row that the keys act on stay one.
 */
function focusRow(key: string): void {
  if (!window.matchMedia(TWO_PANES).matches) return;
  setTimeout(() => {
    const el = rowEl(key);
    if (el && document.activeElement !== el) el.focus();
  }, 0);
}

/** doneOf is the entry that Done clears for a row: a message. A decision and a message that asks you leave when you answer them. */
const doneOf = (r: InboxRow) => (r.kind === 'message' && r.entry ? r.entry : undefined);

/** done clears a message for the person: the read mark of its bridge moves to it. From the main pane, the next row takes its place. */
async function done(r: InboxRow, rows: InboxRow[], fromMain: boolean): Promise<void> {
  const e = doneOf(r);
  if (!e) return;
  const ok = await attempt(() => markDone(r.bridge, e.seq));
  if (!ok || !fromMain) return;
  const i = rows.findIndex((x) => x.key === r.key);
  const next = rows.filter((x) => x.key !== r.key)[Math.max(0, i)] || rows.filter((x) => x.key !== r.key).slice(-1)[0];
  if (next) pick(next.key);
  else go({ place: 'activity' });
}

/** DoneKey clears a message for the person. */
function DoneKey({ r, rows, fromMain, label }: { r: InboxRow; rows: InboxRow[]; fromMain?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="s"
      aria-label={label}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await done(r, rows, !!fromMain);
        setBusy(false);
      }}
    >
      Done
    </Button>
  );
}

/* ---------- the rows ---------- */

/**
 * useInbox gives the rows of the inbox, the same rows that the count on the
 * app bar reads, and reads what the rows show: the channels with new
 * entries, the entries of questions, and the results of runs that wait.
 */
export function useInbox(): InboxView {
  const inbox = useInboxRows();
  const { rows, open } = inbox;
  const runs = useSelect((s) => s.runs);
  const facts = useSelect(selectFacts);
  const unread = open
    .filter((b) => b.unread > 0)
    .map((b) => b.id)
    .join(',');
  useEffect(() => {
    if (unread) ensureChannels(unread.split(','));
  }, [unread]);
  // A question that waits and whose entry the page does not hold yet is read alone.
  const missing = rows
    .filter((r) => r.kind === 'asked' && !r.entry && r.seq)
    .map((r) => r.bridge + '/' + r.seq)
    .join(',');
  useEffect(() => {
    if (missing) ensureEntries(missing.split(','));
  }, [missing]);
  // A read of the result goes to the worker of the run, so the inbox never reads the result of a worker that sleeps.
  const waiting = rows
    .filter((r) => r.run && (r.status === 'needs-you' || r.status === 'error') && awakeFor(facts, runs[r.run]) !== false)
    .map((r) => r.run!)
    .join(',');
  useEffect(() => {
    if (waiting) ensureResults(waiting.split(','));
  }, [waiting, runs]);
  return inbox;
}

/** dutyHref is the address of the page of a duty. */
const dutyHref = (name: string) => hrefOf({ place: 'duties', name });

/** DutyChip names the duty of a run, by its title or its name as it is, and opens it. */
function DutyChip({ name }: { name: string }) {
  const label = useDutyLabel(name);
  return (
    <a class="chip chip-plain duty-chip" href={dutyHref(name)} title={'Open the duty ' + label}>
      {label}
    </a>
  );
}

/** openRow goes to the place of a row: the conversation of the seat, the channel of the bridge, or the duty of a row that sits on no bridge. */
function openRow(r: InboxRow, focusComposer = false): void {
  if (!r.bridge) {
    if (r.duty) go({ place: 'duties', name: r.duty });
    return;
  }
  if (r.handle && (r.kind !== 'message' || r.entry?.from.kind === 'agent')) go({ place: 'member', bridge: r.bridge, handle: r.handle, tab: 'chat' });
  else go({ place: 'bridge', id: r.bridge, pane: 'none' });
  if (focusComposer) {
    setTimeout(() => {
      const b = document.getElementById('composer') as HTMLTextAreaElement | null;
      if (b && !b.disabled) b.focus();
    }, 80);
  }
}

function RowFace({ r }: { r: InboxRow }) {
  if (r.kind === 'message' && r.entry && r.entry.from.kind === 'person') return <Avatar subject={r.entry.from.name || ''} display={r.entry.from.display} size={32} />;
  return <Mark agent={r.agent || (r.handle || '').replace(/-\d+$/, '')} size={32} />;
}

/** RowStatus is the light and the word of a row. A row whose decision waits to go out says it. */
function RowStatus({ r }: { r: InboxRow }) {
  const h = useHeld(r.key);
  if (h) return <Led tone="grey" word={h.act === 'allow' ? 'allowed' : h.act === 'deny' ? 'denied' : 'answered'} label="It goes out in a few seconds. Undo takes it back." />;
  if (r.kind === 'result') return <Led tone="amber" word="to check" />;
  if (r.status === 'needs-you') return <Led tone="amber" word="needs you" />;
  if (r.kind === 'duty-paused') return <Led tone="grey" word="paused" />;
  if (r.kind === 'duty-failed') return <Led tone="red" word="failed" />;
  if (r.kind === 'stopped') return <Led tone="grey" word="stopped" />;
  if (r.kind === 'limit') return <Led tone="grey" word="at its limit" />;
  if (r.status === 'error') return <Led tone="red" word="error" />;
  return null;
}

/** askedText is the words of a message that asks you, without the @operator that opens it. */
const askedText = (text: string): string => {
  const t = plainText(text).replace(/^@operator\b[,:]?\s*/i, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};

function rowText(r: InboxRow): string {
  if (r.decision && r.kind === 'question') return (r.handle || '') + ' asks: ' + (r.decision.reason || 'A question for you');
  // A card from an item of the inbox knows no call: the words of the front say what it waits for.
  if (r.decision && !r.decision.tool && r.reason) return r.reason;
  if (r.decision) return decisionTitle(r.handle || '', r.decision);
  if (r.kind === 'asked' && r.entry) return excerpt((r.handle || '') + ' asks: ' + askedText(r.entry.text), 120);
  if (r.kind === 'asked') return (r.handle || '') + ' asks you';
  if (r.entry) return excerpt(plainText(r.entry.text), 90);
  return r.reason || '';
}

function rowName(r: InboxRow): string {
  if (r.kind === 'message' && r.entry) return senderName(r.entry.from);
  // A row of a duty names its agent, as a row of a seat does, and its chip names the duty.
  if (r.kind === 'duty-failed' || r.kind === 'duty-paused' || r.kind === 'duty-waits' || r.kind === 'result') return r.agent || (r.duty ? dutyLabel(r.duty) : 'A duty');
  return r.handle || '';
}

/** isDutyRow reports whether a row is an item of the inbox of the duties, with no seat behind it. */
const isDutyRow = (r: InboxRow) => r.kind === 'duty-failed' || r.kind === 'duty-paused' || r.kind === 'duty-waits';

/** InboxItem is one row of the inbox. */
function InboxItem({ r, on, rows }: { r: InboxRow; on: boolean; rows: InboxRow[] }) {
  const m = useSelect((s) => (r.handle && s.rosters[r.bridge] ? s.rosters[r.bridge].byHandle[r.handle] : undefined));
  const brief = r.decision && !r.decision.question ? briefOf(planOf(r.decision)) : null;
  return (
    <div
      class={'inbox-row' + (r.status === 'needs-you' ? ' need' : '') + (on ? ' sel' : '')}
      data-item
      data-key={r.key}
      tabIndex={-1}
      aria-label={rowName(r) + ', ' + rowText(r)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) pick(r.key);
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        pick(r.key);
        // A narrow window shows one pane: the item opens in the main pane.
        if (!window.matchMedia(TWO_PANES).matches) go({ place: 'activity', item: r.key });
      }}
    >
      <RowFace r={r} />
      <div class="inbox-main">
        <div class="inbox-top">
          <b class="clip">{rowName(r)}</b>
          <RowStatus r={r} />
          <span class="grow" />
          {r.at && (
            <time class="inbox-meta" dateTime={r.at} title={new Date(r.at).toLocaleString()}>
              {since(r.at)}
            </time>
          )}
        </div>
        <div class="inbox-text clip" title={r.said || undefined}>
          {rowText(r)}
        </div>
        {brief && (brief.code ? <code class="inbox-cmd clip">{brief.text}</code> : <div class="inbox-text clip">{brief.text}</div>)}
        {(r.bridgeTitle || r.duty) && (
          <div class="inbox-where">
            {r.bridgeTitle && <span class="clip">{r.bridgeTitle}</span>}
            {r.duty && <DutyChip name={r.duty} />}
          </div>
        )}
        {(r.kind === 'failed' || r.kind === 'stopped' || r.kind === 'limit') && m && (
          <div class="inbox-do">
            <SeatAgainKey bridge={r.bridge} m={m} label={'Seat ' + m.handle + ' again'} />
          </div>
        )}
        {doneOf(r) && (
          <div class="inbox-do">
            <DoneKey r={r} rows={rows} label={'Done with ' + rowName(r)} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ResultCard is the card of a result to check: what the run was asked, its
 * whole answer, a link to the run, and Looks right and Needs work. A person
 * judges a result against its task, and never on a part of it. After either
 * key, the main pane moves to the next item that needs you, as after a
 * decision.
 */
function ResultCard({ r, name, rows }: { r: InboxRow; name: string; rows: InboxRow[] }) {
  const run = useSelect((s) => (r.run ? s.runs[r.run] : undefined));
  useEffect(() => {
    if (r.run) ensureRuns([r.run]);
  }, [r.run]);
  const title = (run && run.title) || r.reason || 'The result';
  const open = r.duty && r.run ? hrefOf({ place: 'duties', name: r.duty, run: r.run }) : r.run ? hrefOf({ place: 'chat', run: r.run }) : '';
  return (
    <Card title={title} tone="amber" label={'A result of ' + name + ' to check'} actions={<ResultKeys run={r.run!} title={title} primary onDone={() => afterResult(r, rows)} />}>
      {run && run.input && sameWords(run.input, title) === false && (
        <p class="result-ask">
          <span class="result-ask-label">The task</span> {excerpt(plainText(run.input), 400)}
        </p>
      )}
      {run && run.output ? <Markdown text={run.output} refs /> : <p class="inbox-said">{run ? 'The run gave no text.' : 'Loading the result.'}</p>}
      {open && (
        <p>
          <a href={open}>Open the run</a>
        </p>
      )}
    </Card>
  );
}

/** sameWords reports whether the task of a run only repeats its title, with case, spaces, and an end mark aside. */
export function sameWords(input: string, title: string): boolean {
  const norm = (x: string) => plainText(x).toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?:]+$/, '');
  return norm(input) === norm(title);
}

/**
 * reachResult shows a result to check in the main pane and puts the focus on
 * one of its keys. A narrow window opens the result first.
 */
export function reachResult(r: InboxRow, key: 'Looks right' | 'Needs work'): void {
  pick(r.key);
  if (!window.matchMedia(TWO_PANES).matches) go({ place: 'activity', item: r.key });
  setTimeout(() => {
    const b = [...document.querySelectorAll<HTMLButtonElement>('.inbox-main-pane .card .result-keys button')].find((x) => x.textContent === key);
    if (b) b.focus();
  }, 60);
}

/** afterResult reads the inbox again and moves to the next item that needs you. */
function afterResult(r: InboxRow, rows: InboxRow[]): void {
  loadInbox().catch(() => {});
  const next = rows.find((x) => x.key !== r.key && x.status === 'needs-you');
  go(next ? { place: 'activity', item: next.key } : { place: 'activity' }, true);
}

export function ActivityList({ item }: { item?: string }) {
  const { rows, loaded, settled } = useInbox();
  const ready = useRef(settled);
  ready.current = settled;
  const chosen = usePicked();
  const picked = item || chosen;
  const shown = useShown(item, rows);
  const rosters = useSelect((s) => s.rosters);
  const list = useRoving<HTMLDivElement>({
    onEnter: (el) => {
      const r = rows.find((x) => x.key === el.getAttribute('data-key'));
      if (r) openRow(r);
    },
  });
  // A row that leaves, such as a decision that the person just made, hands
  // the main pane and the focus to the row that takes its place.
  const lastIndex = useRef(0);
  const keyList = rows.map((r) => r.key).join('\n');
  useEffect(() => {
    const i = rows.findIndex((r) => r.key === picked);
    if (i >= 0) {
      lastIndex.current = i;
      return;
    }
    // Until the inbox has loaded, a row of the address can still come, so the list keeps it.
    if (!picked || rows.length === 0 || !ready.current || (settledRow && settledRow.key === picked)) return;
    // The next row that needs the person takes the place, else the row at the same place in the list.
    const next = nextNeed(rows, picked) || rows[Math.min(lastIndex.current, rows.length - 1)];
    pick(next.key);
    // The focus follows the main pane, unless the person moved it out of Activity.
    const a = document.activeElement as HTMLElement | null;
    const ours = !a || a === document.body || !a.isConnected || (list.current && list.current.contains(a)) || !!a.closest('.inbox-main-pane');
    const el = rowEl(next.key);
    if (ours && el) el.focus();
  }, [keyList, picked, settled]);
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement;
    if (!el.hasAttribute || !el.hasAttribute('data-item')) return;
    const r = rows.find((x) => x.key === el.getAttribute('data-key'));
    if (!r || e.key === 'Enter') return;
    // u takes back the decision that the row holds.
    if (e.key === 'u' && held.has(r.key)) {
      e.preventDefault();
      undoHold(r.key);
      return;
    }
    // A result to check: a goes to Looks right and d to Needs work in its card, so a key never judges a result unseen.
    if (r.kind === 'result' && (e.key === 'a' || e.key === 'd')) {
      e.preventDefault();
      reachResult(r, e.key === 'a' ? 'Looks right' : 'Needs work');
      return;
    }
    const act = keyAction(e.key, r);
    if (!act) return;
    e.preventDefault();
    const d = r.decision;
    // A decision of a key waits a moment, with Undo, and the focus stays on its row.
    if ((act === 'allow' || act === 'deny') && d) holdDecision(r, act);
    else if (act === 'decline') {
      // d picks the choice that says no, held as a decision is. A question without one says to answer it.
      const no = negativeChoice(r.entry && r.entry.ask ? r.entry.ask.choices : undefined);
      if (no) holdAnswer(r, no);
      else showSaid('This question has no choice that says no. Press a to answer it.');
    } else if (act === 'answer') {
      pick(r.key);
      if (window.matchMedia(TWO_PANES).matches) {
        setTimeout(() => {
          const f = document.querySelector('.inbox-main-pane .card input, .inbox-main-pane .card textarea, .inbox-main-pane .card select, .inbox-main-pane .card button, .inbox-main-pane #composer') as HTMLElement | null;
          if (f) f.focus();
        }, 40);
      } else go({ place: 'activity', item: r.key });
    } else if (act === 'reply') openRow(r, true);
    else if (act === 'seat') {
      // s seats again at once with the same task, as the key of the row does.
      const m = r.handle && rosters[r.bridge] ? rosters[r.bridge].byHandle[r.handle] : undefined;
      if (m) seatAgain(r.bridge, m);
    } else if (act === 'continue' && r.handle) continueSeat(r.bridge, { handle: r.handle });
    else if (act === 'done') done(r, rows, false);
  };
  return (
    <section class="screen activity" aria-labelledby="activity-title" data-focus-own>
      {/* The chip counts what the list shows. What needs you shows by its lights and by the count on the app bar, which counts the same rows less the new messages. */}
      <PaneHeader id="activity-title" title="Activity" count={loaded ? rows.length : undefined} countLabel={rows.length === 1 ? '1 item' : rows.length + ' items'} />
      <div class="scroll" ref={list} onKeyDown={onKey}>
        <div class="inbox" role="list" aria-label="Activity">
          {/* Each row keeps its own element, so a row that leaves takes its focus with it, and a new row never inherits the focus of another. */}
          {rows.map((r) => (
            <div role="listitem" key={r.key}>
              <InboxItem r={r} on={r.key === shown} rows={rows} />
            </div>
          ))}
        </div>
        {loaded && rows.length === 0 && (
          <div class="empty">
            <p>Nothing needs you.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function ActivityMain({ item }: { item?: string }) {
  const { rows } = useInbox();
  const shown = useShown(item, rows);
  // A row whose decision the person made here stays, with its card settled, when no other row needs them.
  const r = settledRow && settledRow.key === shown ? settledRow : rows.find((x) => x.key === shown);
  const m = useSelect((s) => (r && r.handle && s.rosters[r.bridge] ? s.rosters[r.bridge].byHandle[r.handle] : undefined));
  const card = useSelect((s) => (r && r.decision ? cardOf(s.channels[r.bridge], r.decision.run, r.decision.id)?.decision || undefined : undefined));
  const made = useMade(r && r.decision ? r.decision.run : '', r && r.decision ? r.decision.id : '');
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const h = useHeld(r ? r.key : '');
  if (!r) {
    return (
      <EmptyPane back={{ href: '#activity', label: 'Activity' }}>
        <p>Pick an item to decide or to read it.</p>
      </EmptyPane>
    );
  }
  const where = (
    <>
      {r.bridge && (
        <span class="meta clip member-where">
          in <a href={hrefOf({ place: 'bridge', id: r.bridge, pane: 'none' })}>{r.bridgeTitle || 'a bridge'}</a>
        </span>
      )}
      {r.duty && <DutyChip name={r.duty} />}
    </>
  );
  const name = rowName(r);
  // The card shows the decision of the stream, and on the settled row the decision that the person just made.
  const decision = r.decision ? settledOf(r.decision, card, settledRow === r ? made : undefined, me) : undefined;
  // A decided card waits for nobody, so the head no longer says needs you.
  const waits = r.status === 'needs-you' && !(decision && decision.state !== 'pending');
  const tone = waits ? 'amber' : r.kind === 'stopped' || r.kind === 'limit' || r.kind === 'duty-paused' ? 'grey' : r.status === 'error' ? 'red' : undefined;
  const word = waits ? (r.kind === 'result' ? 'to check' : 'needs you') : r.kind === 'stopped' ? 'stopped' : r.kind === 'limit' ? 'at its limit' : r.kind === 'duty-paused' ? 'paused' : r.kind === 'duty-failed' ? 'failed' : r.status === 'error' ? 'error' : '';
  const convo = r.bridge && r.handle && (r.kind !== 'message' || (r.entry && r.entry.from.kind === 'agent')) ? hrefOf({ place: 'member', bridge: r.bridge, handle: r.handle, tab: 'chat' }) : '';
  const asked = r.kind === 'asked' && r.handle ? { entry: r.entry, handle: r.handle } : null;
  // A row whose decision or answer waits to go out shows what it holds in place of its card.
  const title = h ? (asked && asked.entry ? asked.handle + ' asks: ' + excerpt(plainText(asked.entry.text), 80) : rowText(r)) : '';
  return (
    <section class="screen inbox-main-pane" aria-labelledby="inbox-title" data-focus-own>
      <PaneHeader
        id="inbox-title"
        title={name}
        size="title"
        level={1}
        back={{ href: '#activity', label: 'Activity', to: 'list' }}
        lead={r.kind === 'message' && r.entry && r.entry.from.kind === 'person' ? <Avatar subject={r.entry.from.name || ''} display={r.entry.from.display} size={36} /> : <Mark agent={r.agent || name} size={36} label={name} halo={tone ? { tone, word } : undefined} />}
        actions={
          convo || doneOf(r) ? (
            <>
              {doneOf(r) && <DoneKey r={r} rows={rows} fromMain />}
              {convo && (
                <Button size="s" href={convo}>
                  Open conversation
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {where}
      </PaneHeader>
      {h ? (
        <div class="scroll pad">
          <HeldCard h={h} title={title} />
        </div>
      ) : asked ? (
        // A question of a seat shows as its card in the channel does: its words, a key per choice, and Your answer.
        <div class="scroll pad">
          {asked.entry ? <AskCard key={r.key} bridge={r.bridge} e={asked.entry} who={asked.handle} body={<Markdown text={asked.entry.text} refs />} /> : <Empty>Loading the channel.</Empty>}
        </div>
      ) : (
        <div class="scroll pad">
          {decision && !decision.tool && !decision.question && r.reason && <p class="inbox-said">{r.reason}</p>}
          {decision && (
            <DecisionCard
              d={decision}
              who={r.handle || name}
              onDecide={() => {
                afterDecision(r, rows);
                // A question of a duty on no bridge leaves the inbox of the duties, which the stream does not tell.
                if (!r.bridge) loadInbox().catch(() => {});
              }}
            />
          )}
          {r.kind === 'result' && r.run && <ResultCard r={r} name={name} rows={rows} />}
          {isDutyRow(r) && (
            <div class="inbox-stop">
              <p class="inbox-stop-line">
                {word && <Led tone={tone || 'grey'} word={word} />}
                {r.reason && <span class="inbox-reason">{r.reason}</span>}
              </p>
              {r.run && r.duty && (
                <p>
                  <a href={hrefOf({ place: 'duties', name: r.duty, run: r.run })}>Open the run</a>
                </p>
              )}
            </div>
          )}
          {(r.kind === 'failed' || r.kind === 'stopped' || r.kind === 'limit') && (
            <div class="inbox-stop">
              <p class="inbox-stop-line">
                <Led tone={r.kind === 'failed' ? 'red' : 'grey'} word={word} />
                {r.reason && <span class="inbox-reason">{r.reason}</span>}
              </p>
              {r.said && <p class="inbox-said">{r.said}</p>}
              {m && <p class="inbox-task">{m.task}</p>}
              {m && <SeatAgainKey bridge={r.bridge} m={m} primary />}
            </div>
          )}
          {r.kind === 'message' && r.entry && (
            <article class="inbox-msg">
              <p class="inbox-msg-head">
                <b>{r.entry.from.kind === 'person' ? personName(r.entry.from.name, r.entry.from.display) : name}</b>
                <When at={r.entry.at} />
              </p>
              <Markdown text={r.entry.text} refs />
              <Button size="s" onClick={() => openRow(r, true)}>
                Reply
              </Button>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
