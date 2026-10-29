// The reads of the chat-first page that the store of the page does not hold:
// the board of the work and the notes of Know-how that wait. One read serves
// every view: the sidebar, its count, the title of the tab, and the panes.
// The board follows the stream of the page, at most once in two seconds,
// and every 30 seconds. The notes follow every minute.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../../api/routes';
import { knowhowApi, type WaitingChange } from '../../api/knowhow';
import type { State } from '../../state/reducer';
import type { WorkBoard } from '../../api/types';
import { store, useSelect } from '../../state/store';
import { useInboxRows, useWaiting as useOneCount } from '../../state/activity';
import { useDuties, loadDuties, loadInbox } from '../../state/duties';
import type { Entry } from '../../api/types';
import { dutyTitle } from '../../lib/duties';
import { titleOfName } from '../../lib/duties';
import { fromItems, needsOf, needsOfCount, needsOfItems, type NeedRow } from './needs';

/** A value that many views read, with the views that follow it. */
function shared<T>(init: T) {
  let value = init;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(v: T) {
      value = v;
      for (const f of [...subs]) f();
    },
    use(): T {
      const [, tick] = useState(0);
      useEffect(() => {
        const f = () => tick((n) => n + 1);
        subs.add(f);
        return () => {
          subs.delete(f);
        };
      }, []);
      return value;
    },
    subs,
  };
}

const board = shared<WorkBoard | null>(null);
const waiting = shared<WaitingChange[]>([]);
let followers = 0;
let stop: (() => void) | null = null;

/** reloadBoard reads the board again now, as after an action that moves a task, and the one count of the inbox with it. */
export function reloadBoard(): void {
  api.work().then(
    (b) => board.set(b),
    () => {},
  );
  loadInbox().catch(() => {});
}

/* ---------- what the person answered on this page ---------- */

/**
 * An answer that the person gave on this page: a verdict, a decision, or a
 * dismissal. Its row leaves Needs you at once, and every count drops, until
 * the reads of the server agree. The place where the person answered keeps
 * a line that says so, such as You marked this right at 9:49 AM.
 */
export interface Answer {
  kind: 'verdict' | 'decision' | 'dismiss';
  run?: string;
  bridge?: string;
  approval?: string;
  card?: string;
  /** The waiting change of a note that the person kept or refused. */
  note?: string;
  /** The line that stays, such as You marked this right. The time follows it. */
  words: string;
  at: string;
}

const answered = shared<Answer[]>([]);

/** markAnswered takes a row off Needs you at once and reads the board and the count again. */
export function markAnswered(a: Omit<Answer, 'at'>): void {
  answered.set([...answered.get(), { ...a, at: new Date().toISOString() }]);
  reloadBoard();
}

/** useAnswered lists the answers that the person gave on this page. */
export function useAnswered(): Answer[] {
  return answered.use();
}

/** answers reports whether an answer of the person takes a row off Needs you. */
export function answers(a: Answer, r: Pick<NeedRow, 'kind' | 'run' | 'bridge' | 'approval' | 'card' | 'note'> & { key?: string }): boolean {
  if (a.card && r.card === a.card) return true;
  // Keep or Not now on a note takes off the row of that note, whichever list holds it.
  if (a.note) return r.note === a.note || r.key === 'k:' + a.note || r.key === 'n:' + a.note;
  // The answer of a question of a channel takes off the question of that channel, which names no approval.
  if (a.kind === 'decision' && !a.approval) return !!a.bridge && r.kind === 'question' && r.bridge === a.bridge && !r.approval;
  if (a.kind === 'decision') return !!a.approval && r.approval === a.approval && (!a.run || !r.run || r.run === a.run);
  if (a.kind === 'verdict') return r.kind === 'check' && ((!!a.run && r.run === a.run) || (!!a.bridge && !a.run && r.bridge === a.bridge));
  return false;
}

/** answerFor finds the answer that the person gave here about a run, a channel, or a task, for the line that stays. */
export function answerFor(list: Answer[], q: { run?: string; bridge?: string; card?: string }): Answer | undefined {
  for (let k = list.length - 1; k >= 0; k--) {
    const a = list[k];
    if ((q.card && a.card === q.card) || (q.run && a.run === q.run) || (q.bridge && !a.run && a.bridge === q.bridge)) return a;
  }
  return undefined;
}

/** forgetAnswers drops the answers, for the tests. */
export function forgetAnswers(): void {
  answered.set([]);
}

// A decision on any card of the page, also in a channel, takes its row off at once.
if (typeof window !== 'undefined')
  window.addEventListener('fw-decided', (e) => {
    const d = (e as CustomEvent<{ run?: string; approval?: string; bridge?: string; decision: string }>).detail;
    if (d && d.approval) markAnswered({ kind: 'decision', run: d.run, approval: d.approval, words: d.decision === 'deny' ? 'You denied this' : 'You answered this' });
    else if (d && d.bridge) markAnswered({ kind: 'decision', bridge: d.bridge, words: 'You answered this' });
  });

/** reloadWaiting reads the notes that wait again. */
export function reloadWaiting(): void {
  knowhowApi.waiting().then(
    (w) => waiting.set(w || []),
    () => {},
  );
}

/** follow starts the reads while one view or more follows them. */
function follow(): () => void {
  followers++;
  if (followers === 1) {
    let last = 0;
    let timer = 0;
    const load = () => {
      last = Date.now();
      reloadBoard();
    };
    load();
    reloadWaiting();
    loadDuties().catch(() => {});
    const every = window.setInterval(load, 30_000);
    const notes = window.setInterval(reloadWaiting, 60_000);
    const off = store.subscribe(() => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        if (Date.now() - last > 2000) load();
      }, 2000);
    });
    stop = () => {
      window.clearInterval(every);
      window.clearInterval(notes);
      if (timer) window.clearTimeout(timer);
      off();
    };
  }
  return () => {
    followers--;
    if (followers === 0 && stop) {
      stop();
      stop = null;
    }
  };
}

/** useBoard is the board of the work of the person, or null before the first read. */
export function useBoard(): WorkBoard | null {
  useEffect(follow, []);
  return board.use();
}

/** useWaiting lists the notes of Know-how that wait for a person. */
export function useWaiting(): WaitingChange[] {
  useEffect(follow, []);
  return waiting.use();
}

/** forgetChatData drops what the page read, for the tests. */
export function forgetChatData(): void {
  board.set(null);
  waiting.set([]);
}

/** setBoardForTest puts a board in place, for the tests. */
export function setBoardForTest(b: WorkBoard | null, w: WaitingChange[] = []): void {
  board.set(b);
  waiting.set(w);
}

/** agentNameOf names an agent as the page shows it: the name of its face, else its name with a capital. */
export function agentNameOf(s: Pick<State, 'faces'>, agent: string): string {
  const f = s.faces[agent];
  return (f && f.displayName) || titleOfName(agent);
}

/** useAgentName names one agent. */
export function useAgentName(agent: string): string {
  return useSelect((s) => agentNameOf(s, agent));
}

/**
 * useNeeds is the one list of Needs you, newest first: the rows of the one
 * count of the front (GET /v1/inbox, waiting), or, from an older front that
 * answers no count, the rows of the four reads of the page.
 */
export function useNeeds(): NeedRow[] {
  const cards = useBoard();
  const notes = useWaiting();
  const count = useOneCount();
  const items = useDuties((s) => s.inbox);
  const { rows } = useInboxRows();
  const faces = useSelect((s) => s.faces);
  const bridges = useSelect((s) => s.bridges);
  const runs = useSelect((s) => s.runs);
  const channels = useSelect((s) => s.channels);
  const list = useDuties((s) => s.list);
  const done = useAnswered();
  return useMemo(() => {
    const input = {
      cards: cards ? cards.cards : null,
      rows,
      waiting: notes,
      agentName: (a: string) => agentNameOf({ faces }, a),
      channelTitle: (id: string) => (bridges.byId[id] ? bridges.byId[id].title : 'a channel'),
      jobTitle: (name: string) => {
        const d = (list || []).find((x) => x.name === name);
        return d ? dutyTitle(d) : name;
      },
      answerOf: (run: string) => (runs[run] && runs[run].output) || '',
      lastPostOf: (bridge: string) => lastPost(channels[bridge]),
    };
    // A front that names the task and the ways out of each item gives the list as it is, so the rows equal its count.
    if (count && items && fromItems(items)) return needsOfItems(input, items);
    return (count ? needsOfCount : needsOf)(input);
  }, [cards, notes, count, items, rows, faces, bridges, list, runs, channels]).filter((r) => !done.some((a) => answers(a, r)));
}

/** lastPost is the text of the newest post of an agent in a channel that the page read, or "". */
export function lastPost(ch: { seqs: number[]; bySeq: Record<number, Entry> } | undefined, who: 'agent' | 'any' = 'agent'): string {
  if (!ch) return '';
  for (let k = ch.seqs.length - 1; k >= 0; k--) {
    const e = ch.bySeq[ch.seqs[k]];
    if (e && (e.from.kind === 'agent' || (who === 'any' && e.from.kind === 'person')) && e.text) return e.text;
  }
  return '';
}

/**
 * useNeedsCount is the count of Needs you: the one count of the front, the
 * same number as the badge of the older places (useAttention), or the rows
 * of the list from an older front.
 */
export function useNeedsCount(): number {
  const count = useOneCount();
  const rows = useNeeds();
  const done = useAnswered();
  const items = useDuties((s) => s.inbox);
  // The rows that the person answered here leave the count at once, until the next read of the server agrees.
  const gone = useHiddenCount(done);
  if (count && items && fromItems(items)) {
    // The rows are the counted items less those that the person answered here.
    const counted = items.filter((it) => !!it.card || it.kind === 'note').length;
    return Math.max(0, count.count - Math.max(0, counted - rows.length));
  }
  return count ? Math.max(0, count.count - gone) : rows.length;
}

/** useHiddenCount counts the rows of the count of the server that an answer of this page took off. */
function useHiddenCount(done: Answer[]): number {
  const cards = useBoard();
  if (!done.length || !cards) return 0;
  return cards.cards.filter((c) => c.next === 'you' && (c.stage === 'needs-you' || c.stage === 'review')).filter((c) => done.some((a) => answers(a, { kind: c.stage === 'review' ? 'check' : 'asks', run: c.links.run, bridge: c.links.bridge, approval: c.links.approval, card: c.id }))).length;
}
