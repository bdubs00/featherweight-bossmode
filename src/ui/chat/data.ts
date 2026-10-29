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
import { useInboxRows } from '../../state/activity';
import { useDuties, loadDuties } from '../../state/duties';
import { dutyTitle } from '../../lib/duties';
import { titleOfName } from '../../lib/duties';
import { needsOf, type NeedRow } from './needs';

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

/** reloadBoard reads the board again now, as after an action that moves a task. */
export function reloadBoard(): void {
  api.work().then(
    (b) => board.set(b),
    () => {},
  );
}

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

/** useNeeds is the one list of Needs you, newest first. */
export function useNeeds(): NeedRow[] {
  const cards = useBoard();
  const notes = useWaiting();
  const { rows } = useInboxRows();
  const faces = useSelect((s) => s.faces);
  const bridges = useSelect((s) => s.bridges);
  const list = useDuties((s) => s.list);
  return useMemo(
    () =>
      needsOf({
        cards: cards ? cards.cards : null,
        rows,
        waiting: notes,
        agentName: (a) => agentNameOf({ faces }, a),
        channelTitle: (id) => (bridges.byId[id] ? bridges.byId[id].title : 'a channel'),
        jobTitle: (name) => {
          const d = (list || []).find((x) => x.name === name);
          return d ? dutyTitle(d) : name;
        },
      }),
    [cards, notes, rows, faces, bridges, list],
  );
}
