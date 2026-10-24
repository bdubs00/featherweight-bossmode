// The Activity place: the inbox of what needs you, across every open
// bridge. One row per decision, question, failed seat, stopped seat, and
// new message, in the order of attention: needs you first, the oldest wait
// first, then the errors, then the rest by the status of the sender. A row
// of a decision offers no key: a click shows its card, which says what the
// action does, with Deny and the verb of the action. j and k move, Enter
// opens, a allows, d denies, r replies, and s seats a stopped seat again.
// c continues a seat at its limit, and e is Done on a message, which clears
// it for you through the read mark of its bridge. After a decision the main
// pane opens the next item that needs you, else it shows the decided card
// settled.
// The main pane shows the row that has the focus: a decision as its card.
// Where the main pane shows beside the list and no row is picked, it shows
// the row that needs you and waits longest. The address names a picked
// row, #activity/<key>, so a narrow window opens it and a link reaches it.
// A run of a duty shows the name of its duty as a chip that opens the
// duty. GET /v1/inbox adds the failed runs and the paused duties, and the
// questions of the runs of duties that sit on no bridge.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Member } from '../api/types';
import { go, hrefOf, parseRoute } from '../lib/route';
import { decisionTitle, excerpt, personName, plainText, senderName, since } from '../lib/words';
import { briefOf, planOf } from '../lib/decision';
import { decide } from '../state/actions';
import { ensureChannels, ensureEntries, ensureResults, ensureRosters, ensureRuns, useEntries, useResults } from '../state/fetchers';
import { cardOf, inboxRows, keyAction, sortInbox, type InboxRow } from '../state/inbox';
import { newestRun } from '../state/people';
import { useSelect } from '../state/store';
import { selectFacts } from '../state/reducer';
import { awakeFor, seatPresence } from '../lib/status';
import { AskCard, DecisionCard } from './Decision';
import { useRoving } from './keys';
import { attempt } from './notice';
import { Empty, Markdown, When } from './common';
import { SeatAgainKey, continueSeat, seatAgain } from './SeatAgain';
import { markDone, madeOf, settledOf, useMade } from '../state/done';
import { loadInbox, useDuties } from '../state/duties';
import { titleOfName } from '../lib/duties';
import { EmptyPane } from './Shell';
import { Avatar, Button, Led, Mark, PaneHeader } from './primitives';

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
  const next = rows.find((x) => x.key !== r.key && x.status === 'needs-you' && !(x.decision && madeOf(x.decision.run, x.decision.id)));
  if (next) {
    settledRow = null;
    pick(next.key);
    return;
  }
  settledRow = r;
  if (pickedKey !== r.key) pick(r.key);
  else for (const f of [...pickListeners]) f();
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

/** useInbox builds the rows of the inbox from the store, and loads the runs, the results, and the channels that they need. */
export function useInbox(): { rows: InboxRow[]; loaded: boolean; settled: boolean } {
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const runs = useSelect((s) => s.runs);
  const channels = useSelect((s) => s.channels);
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const facts = useSelect(selectFacts);
  const results = useResults();
  const entries = useEntries();
  const items = useDuties((s) => s.inbox);
  const open = useMemo(() => bridges.order.map((id) => bridges.byId[id]).filter((b) => b.state === 'open'), [bridges]);
  useEffect(() => {
    if (bridges.loaded) ensureRosters();
  }, [bridges]);
  // The stream carries no event of a duty, so the inbox of the duties reads again each minute while Activity shows.
  useEffect(() => {
    loadInbox().catch(() => {});
    const t = setInterval(() => loadInbox().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, []);
  // The run of a question of a duty that sits on no bridge, so its card shows.
  const asking = (items || [])
    .filter((it) => (it.kind === 'approval' || it.kind === 'question') && !it.bridge && it.run)
    .map((it) => it.run!)
    .join(',');
  useEffect(() => {
    if (asking) ensureRuns(asking.split(','));
  }, [asking]);
  // The newest run of a seat that needs you, that failed, or that rests, so a stop shows.
  const want = open
    .flatMap((b) => {
      const r = rosters[b.id];
      return r
        ? r.order
            .map((h) => r.byHandle[h])
            .filter((m: Member) => {
              // A run that no worker holds answers 404, so the page does not ask for it.
              if (!m || m.fired || m.gone || !m.runs.length) return false;
              const p = seatPresence(facts, m);
              return p !== 'working' && p !== 'asleep';
            })
        : [];
    })
    .map((m) => newestRun(m))
    .join(',');
  useEffect(() => {
    if (want) ensureRuns(want.split(','));
  }, [want]);
  const unread = open
    .filter((b) => b.unread > 0)
    .map((b) => b.id)
    .join(',');
  useEffect(() => {
    if (unread) ensureChannels(unread.split(','));
  }, [unread]);
  const lost = useSelect((s) => s.lost);
  const rows = sortInbox(inboxRows({ bridges: open, rosters, runs, channels, results, me, facts, entries, items }));
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
  const loaded = bridges.loaded && open.every((b) => !!rosters[b.id]);
  // The rows have settled once the items of the duties and the runs of their questions are in too.
  const asked = asking ? asking.split(',').every((id) => !!runs[id] || !!lost[id]) : true;
  return { rows, loaded, settled: loaded && items !== null && asked };
}

/** dutyHref is the address of the page of a duty. */
const dutyHref = (name: string) => hrefOf({ place: 'duties', name });

/** DutyChip names the duty of a run, and opens it. */
function DutyChip({ name }: { name: string }) {
  return (
    <a class="chip chip-plain duty-chip" href={dutyHref(name)} title={'Open the duty ' + name}>
      {titleOfName(name)}
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

/** RowStatus is the light and the word of a row. */
function RowStatus({ r }: { r: InboxRow }) {
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
  if (r.decision) return decisionTitle(r.handle || '', r.decision);
  if (r.kind === 'asked' && r.entry) return excerpt((r.handle || '') + ' asks: ' + askedText(r.entry.text), 120);
  if (r.kind === 'asked') return (r.handle || '') + ' asks you';
  if (r.entry) return excerpt(plainText(r.entry.text), 90);
  return r.reason || '';
}

function rowName(r: InboxRow): string {
  if (r.kind === 'message' && r.entry) return senderName(r.entry.from);
  // A row of a duty names its agent, as a row of a seat does, and its chip names the duty.
  if (r.kind === 'duty-failed' || r.kind === 'duty-paused' || r.kind === 'duty-waits') return r.agent || (r.duty ? titleOfName(r.duty) : 'A duty');
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
    const next = rows[Math.min(lastIndex.current, rows.length - 1)];
    pick(next.key);
    const lost = !document.activeElement || document.activeElement === document.body;
    const el = list.current ? [...list.current.querySelectorAll<HTMLElement>('[data-key]')].find((x) => x.getAttribute('data-key') === next.key) : undefined;
    if (lost && el) el.focus();
  }, [keyList, picked, settled]);
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement;
    if (!el.hasAttribute || !el.hasAttribute('data-item')) return;
    const r = rows.find((x) => x.key === el.getAttribute('data-key'));
    if (!r || e.key === 'Enter') return;
    const act = keyAction(e.key, r);
    if (!act) return;
    e.preventDefault();
    const d = r.decision;
    if (act === 'allow' && d) attempt(() => decide(d.run, d.id, 'allow'));
    else if (act === 'deny' && d) attempt(() => decide(d.run, d.id, 'deny'));
    else if (act === 'answer') {
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
    <section class="screen activity" aria-labelledby="activity-title">
      {/* The chip counts what the list shows. What needs you shows by its lights and by the count on the app bar. */}
      <PaneHeader id="activity-title" title="Activity" count={loaded ? rows.length : undefined} countLabel={rows.length === 1 ? '1 item' : rows.length + ' items'} />
      <div class="scroll" ref={list} onKeyDown={onKey}>
        <div class="inbox" role="list" aria-label="Activity">
          {rows.map((r) => (
            <div role="listitem">
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
  const word = waits ? 'needs you' : r.kind === 'stopped' ? 'stopped' : r.kind === 'limit' ? 'at its limit' : r.kind === 'duty-paused' ? 'paused' : r.kind === 'duty-failed' ? 'failed' : r.status === 'error' ? 'error' : '';
  const convo = r.bridge && r.handle && (r.kind !== 'message' || (r.entry && r.entry.from.kind === 'agent')) ? hrefOf({ place: 'member', bridge: r.bridge, handle: r.handle, tab: 'chat' }) : '';
  const asked = r.kind === 'asked' && r.handle ? { entry: r.entry, handle: r.handle } : null;
  return (
    <section class="screen inbox-main-pane" aria-labelledby="inbox-title">
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
      {asked ? (
        // A question of a seat shows as its card in the channel does: its words, a key per choice, and Your answer.
        <div class="scroll pad">
          {asked.entry ? <AskCard key={r.key} bridge={r.bridge} e={asked.entry} who={asked.handle} body={<Markdown text={asked.entry.text} refs />} /> : <Empty>Loading the channel.</Empty>}
        </div>
      ) : (
        <div class="scroll pad">
          {decision && <DecisionCard d={decision} who={r.handle || name} onDecide={() => afterDecision(r, rows)} />}
          {isDutyRow(r) && (
            <div class="inbox-stop">
              <p class="inbox-stop-line">
                {word && <Led tone={tone || 'grey'} word={word} />}
                {r.reason && <span class="inbox-reason">{r.reason}</span>}
              </p>
              {r.run && (
                <p>
                  <a href={'/ui#run/' + encodeURIComponent(r.run)}>Open the run</a>
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
