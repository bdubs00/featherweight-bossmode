// The Activity place: the inbox of what needs you, across every open
// bridge. One row per decision, question, failed seat, stopped seat, and
// new message, in the order of attention: needs you first, the oldest wait
// first, then the errors, then the rest by the status of the sender. A row
// of a decision offers no key: a click shows its card, which says what the
// action does, with Deny and the verb of the action. j and k move, Enter
// opens, a allows, d denies, r replies, and s seats a stopped seat again.
// The main pane shows the row that has the focus: a decision as its card.
// Where the main pane shows beside the list and no row is picked, it shows
// the row that needs you and waits longest. The address names a picked
// row, #activity/<key>, so a narrow window opens it and a link reaches it.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Member } from '../api/types';
import { go, hrefOf, parseRoute } from '../lib/route';
import { decisionTitle, excerpt, personName, plainText, senderName, since } from '../lib/words';
import { briefOf, planOf } from '../lib/decision';
import { decide, sendMessage } from '../state/actions';
import { ensureChannels, ensureResults, ensureRosters, ensureRuns, useResults } from '../state/fetchers';
import { inboxRows, keyAction, selectAttention, sortInbox, type InboxRow } from '../state/inbox';
import { newestRun } from '../state/people';
import { useSelect } from '../state/store';
import { selectFacts } from '../state/reducer';
import { awakeFor, seatPresence } from '../lib/status';
import { DecisionCard } from './Decision';
import { useRoving } from './keys';
import { attempt } from './notice';
import { Markdown, When } from './common';
import { Composer } from './Composer';
import { Msg } from './Thread';
import { SeatAgainKey, seatAgain } from './SeatAgain';
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

/* ---------- the rows ---------- */

/** useInbox builds the rows of the inbox from the store, and loads the runs, the results, and the channels that they need. */
export function useInbox(): { rows: InboxRow[]; loaded: boolean } {
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const runs = useSelect((s) => s.runs);
  const channels = useSelect((s) => s.channels);
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const facts = useSelect(selectFacts);
  const results = useResults();
  const open = useMemo(() => bridges.order.map((id) => bridges.byId[id]).filter((b) => b.state === 'open'), [bridges]);
  useEffect(() => {
    if (bridges.loaded) ensureRosters();
  }, [bridges]);
  // The newest run of a seat that needs you, that failed, or that rests, so a stop shows.
  const want = open
    .flatMap((b) => {
      const r = rosters[b.id];
      return r
        ? r.order
            .map((h) => r.byHandle[h])
            .filter((m: Member) => {
              if (!m || m.fired || !m.runs.length) return false;
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
  const rows = sortInbox(inboxRows({ bridges: open, rosters, runs, channels, results, me, facts }));
  // A read of the result goes to the worker of the run, so the inbox never reads the result of a worker that sleeps.
  const waiting = rows
    .filter((r) => r.run && (r.status === 'needs-you' || r.status === 'error') && awakeFor(facts, runs[r.run]) !== false)
    .map((r) => r.run!)
    .join(',');
  useEffect(() => {
    if (waiting) ensureResults(waiting.split(','));
  }, [waiting, runs]);
  return { rows, loaded: bridges.loaded && open.every((b) => !!rosters[b.id]) };
}

/** openRow goes to the place of a row: the conversation of the seat, or the channel of the bridge. */
function openRow(r: InboxRow, focusComposer = false): void {
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
  if (r.kind === 'stopped') return <Led tone="grey" word="stopped" />;
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
  if (r.entry) return excerpt(plainText(r.entry.text), 90);
  return r.reason || '';
}

function rowName(r: InboxRow): string {
  if (r.kind === 'message' && r.entry) return senderName(r.entry.from);
  return r.handle || '';
}

/** InboxItem is one row of the inbox. */
function InboxItem({ r, on }: { r: InboxRow; on: boolean }) {
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
        <div class="inbox-where clip">{r.bridgeTitle}</div>
        {(r.kind === 'failed' || r.kind === 'stopped') && m && (
          <div class="inbox-do">
            <SeatAgainKey bridge={r.bridge} m={m} label={'Seat ' + m.handle + ' again'} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityList({ item }: { item?: string }) {
  const { rows, loaded } = useInbox();
  const chosen = usePicked();
  const picked = item || chosen;
  const shown = useShown(item, rows);
  const needs = useSelect(selectAttention);
  const bridgesLoaded = useSelect((s) => s.bridges.loaded);
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
    if (!picked || rows.length === 0) return;
    const next = rows[Math.min(lastIndex.current, rows.length - 1)];
    pick(next.key);
    const lost = !document.activeElement || document.activeElement === document.body;
    const el = list.current ? [...list.current.querySelectorAll<HTMLElement>('[data-key]')].find((x) => x.getAttribute('data-key') === next.key) : undefined;
    if (lost && el) el.focus();
  }, [keyList, picked]);
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
    }
  };
  return (
    <section class="screen activity" aria-labelledby="activity-title">
      <PaneHeader id="activity-title" title="Activity" count={bridgesLoaded ? needs : undefined} countLabel={needs === 1 ? '1 member needs you' : needs + ' members need you'} />
      <div class="scroll" ref={list} onKeyDown={onKey}>
        <div class="inbox" role="list" aria-label="Activity">
          {rows.map((r) => (
            <div role="listitem">
              <InboxItem r={r} on={r.key === shown} />
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
  const r = rows.find((x) => x.key === shown);
  const m = useSelect((s) => (r && r.handle && s.rosters[r.bridge] ? s.rosters[r.bridge].byHandle[r.handle] : undefined));
  if (!r) {
    return (
      <EmptyPane back={{ href: '#activity', label: 'Activity' }}>
        <p>Pick an item to decide or to read it.</p>
      </EmptyPane>
    );
  }
  const where = (
    <span class="meta clip member-where">
      in <a href={hrefOf({ place: 'bridge', id: r.bridge, pane: 'none' })}>{r.bridgeTitle}</a>
    </span>
  );
  const name = rowName(r);
  const tone = r.status === 'needs-you' ? 'amber' : r.kind === 'stopped' ? 'grey' : r.status === 'error' ? 'red' : undefined;
  const word = r.status === 'needs-you' ? 'needs you' : r.kind === 'stopped' ? 'stopped' : r.status === 'error' ? 'error' : '';
  const convo = r.handle && (r.kind !== 'message' || (r.entry && r.entry.from.kind === 'agent')) ? hrefOf({ place: 'member', bridge: r.bridge, handle: r.handle, tab: 'chat' }) : '';
  const asked = r.kind === 'asked' && r.entry && r.handle ? { entry: r.entry, handle: r.handle } : null;
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
          convo ? (
            <Button size="s" href={convo}>
              Open conversation
            </Button>
          ) : undefined
        }
      >
        {where}
      </PaneHeader>
      {asked ? (
        // A message that asks you reads as the end of a conversation: the message, and the composer that answers it in the bridge.
        <div class="scroll thread-scroll">
          <div class="thread" role="log" aria-label={'Messages with ' + asked.handle}>
            <Msg face={<Mark agent={r.agent || asked.handle} size={32} />} name={asked.handle} at={asked.entry.at}>
              <Markdown text={asked.entry.text} refs />
            </Msg>
          </div>
        </div>
      ) : (
        <div class="scroll pad">
          {r.decision && <DecisionCard d={r.decision} who={r.handle || name} />}
          {(r.kind === 'failed' || r.kind === 'stopped') && (
            <div class="inbox-stop">
              <p class="inbox-stop-line">
                <Led tone={r.kind === 'stopped' ? 'grey' : 'red'} word={r.kind === 'stopped' ? 'stopped' : 'error'} />
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
      {asked && (
        <Composer
          key={r.key}
          draft={'answer:' + r.bridge + '/' + asked.handle}
          label={'Message to ' + asked.handle}
          placeholder={'Message ' + asked.handle}
          onSend={(text) => attempt(() => sendMessage(r.bridge, { text, to: [asked.handle], replyTo: asked.entry.seq }))}
        />
      )}
    </section>
  );
}
