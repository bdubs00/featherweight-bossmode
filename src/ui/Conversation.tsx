// The conversation of a run, from GET /v1/runs/{id}/transcript, in the look
// of the channel: a message of a person or of the agent with its face, its
// name, and its clock time, a quiet step line for each tool call, a fold of
// many steps, and the decision that waits as a card. The manager, the run
// pane of a seat, and an agent that sits on no bridge talk in this one
// conversation. A one-on-one view adds the pending answer of the live
// stream at the end, and only such a view: the run pane of a bridge shows
// none.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import { api } from '../api/routes';
import type { Fleet, Item, Result, Run } from '../api/types';
import { store, useSelect } from '../state/store';
import { placedSteps, type Step } from '../state/thread';
import { decisionOf } from '../lib/decision';
import { whoName } from '../lib/lines';
import { showError } from './notice';
import { Markdown } from './common';
import { DecisionCard } from './Decision';
import { Avatar, Button, Mark } from './primitives';
import { Msg, Quiet, StepText, StepsFold } from './Thread';
import { LiveLines, type LiveAnswer } from './Live';

export interface TranscriptState {
  items: Item[];
  prev: number;
  loading: boolean;
  /** True when the fleet holds no run of this id, as after a worker that held it was replaced. */
  gone: boolean;
  /** The sentence of a first read that failed for another reason. */
  problem: string;
  earlier: () => Promise<void>;
}

/** The transcripts that the page read, by run. A view that must not read a worker that sleeps shows what the page has. */
const read = new Map<string, { items: Item[]; prev: number }>();

/** forgetTranscripts drops the transcripts that the page read, for the tests. */
export function forgetTranscripts(): void {
  read.clear();
}

/**
 * useTranscript reads the conversation of a run and follows the run on the
 * stream. With load false, it reads nothing, because a read goes to the
 * worker of the run and wakes it, and it shows the items that the page
 * read before. A view passes false for a run of a sleeping worker that the
 * person did not ask for.
 */
export function useTranscript(runId: string, load = true): TranscriptState {
  const known = runId ? read.get(runId) : undefined;
  const [items, setItems] = useState<Item[]>(known ? known.items : []);
  const [prev, setPrev] = useState(known ? known.prev : 0);
  const [loading, setLoading] = useState(!!runId && load && !known);
  const [gone, setGone] = useState(false);
  const [problem, setProblem] = useState('');
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const last = useRef(known && known.items.length ? known.items[known.items.length - 1].seq : 0);
  const busy = useRef(false);
  // The run whose items the state holds, so the page never keeps the items of one run for another.
  const owner = useRef(runId);

  // The page keeps what it read, for the next view of the run.
  useEffect(() => {
    if (runId && owner.current === runId && (items.length || prev)) read.set(runId, { items, prev });
  }, [runId, items, prev]);

  // The reads of the newer items follow the changes of the run, at most one every READ_GAP_MS: a run that works sends an event per step.
  const readAt = useRef(0);
  const planned = useRef<ReturnType<typeof setTimeout> | null>(null);
  const again = useRef(false);
  const plan = (id: string) => {
    if (planned.current) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    const wait = Math.max(0, readAt.current + READ_GAP_MS - Date.now());
    planned.current = setTimeout(() => {
      planned.current = null;
      newer(id);
    }, wait);
  };
  useEffect(
    () => () => {
      if (planned.current) clearTimeout(planned.current);
      planned.current = null;
    },
    [runId],
  );

  /** newer reads the items after the last one, for the run that the state still holds. */
  const newer = (id: string) => {
    if (busy.current) return;
    busy.current = true;
    readAt.current = Date.now();
    api
      .transcript(id, { from: last.current + 1, limit: 500 })
      .then((t) => {
        if (owner.current !== id) return;
        const more = t.items.filter((x) => x.seq > last.current);
        if (more.length) {
          last.current = more[more.length - 1].seq;
          setItems((old) => [...old, ...more]);
        }
      })
      .catch(() => {
        // The next change of the run reads again.
      })
      .finally(() => {
        busy.current = false;
        // A change of the run that came during the read reads once more, after the gap.
        if (again.current && owner.current === id) {
          again.current = false;
          plan(id);
        }
      });
  };

  useEffect(() => {
    let live = true;
    const had = runId ? read.get(runId) : undefined;
    owner.current = runId;
    setItems(had ? had.items : []);
    setPrev(had ? had.prev : 0);
    setGone(false);
    setProblem('');
    last.current = had && had.items.length ? had.items[had.items.length - 1].seq : 0;
    setLoading(!!runId && load && !had);
    if (!runId || !load) return;
    // A transcript that the page read before needs only its newer items.
    if (had) {
      newer(runId);
      return;
    }
    api
      .transcript(runId, { limit: 200 })
      .then((t) => {
        if (!live) return;
        setItems(t.items);
        setPrev(t.prev);
        last.current = t.items.length ? t.items[t.items.length - 1].seq : 0;
        store.dispatch({ type: 'run', run: t.run });
      })
      .catch((e) => {
        // A read that the page starts on its own never raises the notice of the page: the view says it in place.
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) {
          setGone(true);
          store.dispatch({ type: 'run-lost', id: runId });
        }
        else setProblem(e instanceof Error && e.message ? e.message : 'The conversation did not load.');
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [runId, load]);

  // A newer run on the stream, or from a poll, brings the items after the last one.
  const seq = run ? run.seq : 0;
  useEffect(() => {
    if (!runId || !load || loading || seq <= last.current) return;
    plan(runId);
  }, [runId, seq, loading, load]);

  const earlier = async () => {
    if (!prev) return;
    try {
      const t = await api.transcript(runId, { before: prev, limit: 200 });
      setItems((old) => [...t.items.filter((x) => !old.some((o) => o.seq === x.seq)), ...old]);
      setPrev(t.prev);
    } catch (e) {
      showError(e);
    }
  };
  return { items, prev, loading, gone, problem, earlier };
}

/** The time between two reads of a run that works. */
export const POLL_MS = 3000;

/** The least time between two reads of the newer items of a transcript. */
export const READ_GAP_MS = 3000;

/**
 * onStream reports whether the stream sends the run events of a run: a run
 * that a worker of the fleet holds, as its member names it. A run of the
 * front itself, and a run whose member the page does not know, send none.
 */
export function onStream(fleet: Fleet | null, run: Run | undefined): boolean {
  if (!fleet || !run || !run.member) return false;
  const m = run.member;
  return (fleet.members || []).some((x) => !x.self && (x.name === m || x.name.endsWith('/' + m)));
}

/**
 * usePoll reads a run again every POLL_MS while it works, and while also
 * is true, such as while an answer to a message is on its way. A run of the
 * front itself, such as a manager on the front, sends no run event on the
 * stream, so its conversation polls it while it is open. A run that a
 * worker of the fleet holds sends its events, so it gets no poll. A run that does
 * not work gets no poll, because a read of it can wake its worker. A run
 * that the fleet lost gets no poll either: its last state can still say
 * running, and a read of it answers 404, which marks it lost. A hidden tab
 * skips a read.
 */
export function usePoll(runId: string, also = false): void {
  const state = useSelect((s) => (runId && s.runs[runId] ? s.runs[runId].state : ''));
  const lost = useSelect((s) => !!runId && !!s.lost[runId]);
  // A run that a worker of the fleet holds comes on the stream with each change, so a poll would only read it twice.
  const streamed = useSelect((s) => onStream(s.fleet, runId ? s.runs[runId] : undefined));
  const active = !!runId && !lost && !streamed && (also || state === 'queued' || state === 'running');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      api
        .run(runId)
        .then((r) => store.dispatch({ type: 'run', run: r }))
        .catch((e) => {
          // A run that the fleet does not hold is lost, and the poll stops. Any other miss waits for the next read.
          if (e instanceof ApiError && e.status === 404) store.dispatch({ type: 'run-lost', id: runId });
        });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [runId, active]);
}

type Block = { kind: 'item'; it: Item } | { kind: 'steps'; steps: Step[] };

/**
 * blocksOf folds the step lines between two messages into one block of
 * steps. A step goes where placedSteps puts it: a call that asked for a
 * decision shows after the decision, at its result, and not at all while
 * it waits.
 */
export function blocksOf(items: Item[]): Block[] {
  const placed = placedSteps(items);
  const out: Block[] = [];
  let steps: Step[] = [];
  const flush = () => {
    if (steps.length) out.push({ kind: 'steps', steps });
    steps = [];
  };
  for (const it of items) {
    if (it.kind === 'tools') continue;
    if (it.kind === 'tool' || it.kind === 'result' || it.kind === 'file') {
      const s = placed.get(it.seq);
      if (s) steps.push(s);
      continue;
    }
    flush();
    out.push({ kind: 'item', it });
  }
  flush();
  return out;
}

/** within5 reports whether two items of one sender are close enough to share a header. */
const within5 = (a: Item, b: Item) => {
  const d = new Date(b.time).getTime() - new Date(a.time).getTime();
  return d >= 0 && d < 5 * 60_000;
};

export interface ConversationProps {
  run: Run | undefined;
  result?: Result | null;
  t: TranscriptState;
  agentLabel: string;
  onDecide?: () => void;
  /** What follows the last item, such as the message on its way and the status of its answer. */
  tail?: ComponentChildren;
  /** The answer that the model writes now, from the live stream of a one-on-one view. It follows the tail. */
  live?: LiveAnswer;
}

export function Conversation(props: ConversationProps) {
  const { run, t } = props;
  const principal = useSelect((s) => (s.me ? s.me.principal : null));
  const me = principal ? principal.subject : '';
  const meName = principal ? principal.name : undefined;
  const agent = run ? run.agent : '';
  const pending = run ? decisionOf(run, props.result) : null;
  const blocks = blocksOf(t.items);
  const live = props.live;
  const face = <Mark agent={agent} size={32} />;
  let prev: Item | null = null;
  return (
    <div class="thread">
      {t.prev > 0 && (
        <div class="tearlier">
          <Button size="s" onClick={t.earlier}>
            Earlier messages
          </Button>
        </div>
      )}
      {t.loading && <p class="tline">Loading the conversation.</p>}
      {t.gone && <p class="tline">This run is gone.</p>}
      {t.problem && <p class="tline">{t.problem}</p>}
      {blocks.map((b) => {
        if (b.kind === 'steps') {
          prev = null;
          if (b.steps.length >= 3) return <StepsFold steps={b.steps} />;
          return b.steps.map((s) => (
            <Quiet at={s.at} err={s.isError}>
              <StepText step={s} />
            </Quiet>
          ));
        }
        const it = b.it;
        const before: Item | null = prev;
        prev = it;
        const compact = !!before && before.kind === it.kind && (it.kind === 'assistant' || (it.kind === 'user' && before.who === it.who)) && within5(before, it);
        switch (it.kind) {
          case 'user': {
            const who = it.who || me;
            return (
              <Msg face={<Avatar subject={who} display={who === me ? meName : undefined} size={32} />} name={whoName(who, principal)} at={it.time} compact={compact}>
                <p class="tmsg-plain">{it.text}</p>
              </Msg>
            );
          }
          case 'assistant':
            return (
              <Msg face={face} name={props.agentLabel} at={it.time} compact={compact}>
                <Markdown text={it.text || ''} refs />
              </Msg>
            );
          case 'ask':
            prev = null;
            if (pending && pending.id === it.id)
              return (
                <Msg face={face} name={props.agentLabel} at={it.time}>
                  <DecisionCard d={pending} who={props.agentLabel} onDecide={props.onDecide} />
                </Msg>
              );
            return <Quiet at={it.time}>{it.schema ? 'Asked you' : 'Asked for a decision'}</Quiet>;
          case 'decided':
            prev = null;
            return (
              <Quiet tone={it.text === 'allow' ? 'green' : 'grey'} at={it.time}>
                {whoName(it.who, principal)} {it.text === 'allow' ? 'allowed' : 'denied'} it{it.detail ? ': ' + it.detail : ''}
              </Quiet>
            );
          case 'note':
            prev = null;
            return (
              <Quiet tone={it.isError ? 'red' : undefined} at={it.time} err={it.isError}>
                {it.text}
              </Quiet>
            );
          case 'end':
            // The end of a turn says nothing that the answer above it does not, unless the turn failed.
            if (!it.isError) return null;
            prev = null;
            return (
              <Quiet tone="red" at={it.time} err>
                The turn failed
              </Quiet>
            );
        }
        return null;
      })}
      {pending && !t.items.some((x) => x.kind === 'ask' && x.id === pending.id) && (
        <Msg face={face} name={props.agentLabel}>
          <DecisionCard d={pending} who={props.agentLabel} onDecide={props.onDecide} />
        </Msg>
      )}
      {props.tail}
      {live && live.text && (
        <Msg face={face} name={props.agentLabel} pending>
          <Markdown text={live.text} refs />
        </Msg>
      )}
      {live && <LiveLines live={live} />}
    </div>
  );
}
