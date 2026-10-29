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
import type { Fleet, Item, NewRun, Result, Run } from '../api/types';
import { store, useSelect } from '../state/store';
import { notesThatWait, stepOf, waitsWords, type Step } from '../state/thread';
import { decisionOf } from '../lib/decision';
import { atLimit } from '../lib/presence';
import { plainError } from '../lib/runerror';
import { whoName } from '../lib/lines';
import { showError } from './notice';
import { Markdown } from './common';
import { AttachedFiles } from './AttachedFiles';
import { DecisionCard } from './Decision';
import { Avatar, Button, Mark } from './primitives';
import { Msg, Quiet, StepText, StepsFold } from './Thread';
import { CONTINUES_KEY, chatTitle } from '../lib/chat';
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
      setItems((old) => [...t.items.filter((x) => !old.some((o) => sameItem(o, x))), ...old]);
      setPrev(t.prev);
    } catch (e) {
      showError(e);
    }
  };
  return { items, prev, loading, gone, problem, earlier };
}

/**
 * startRun starts a run on a member. continues names an archived
 * conversation that the new run takes up: the server puts a summary of it
 * in front of the message. A server that does not know continues refuses
 * the field, and the run then starts without it, so no message is lost.
 */
export async function startRun(member: string, body: NewRun, continues = ''): Promise<Run> {
  if (!continues) return api.start(member, body);
  try {
    return await api.start(member, { ...body, continues });
  } catch (e) {
    const detail = e instanceof ApiError && e.problem && typeof e.problem.detail === 'string' ? e.problem.detail : '';
    if (e instanceof ApiError && e.status === 400 && /\bcontinues\b/.test(detail) && /unknown field/i.test(detail)) return api.start(member, body);
    throw e;
  }
}

/** takeUpOf names the conversation that a new run takes up: the run of the view when the server keeps it in its archive, else "". */
export function takeUpOf(runId: string): string {
  const r = runId ? store.get().runs[runId] : undefined;
  return r && r.archived ? runId : '';
}

/** focusComposer puts the focus in the message box once the screen draws it, as after New conversation. */
export function focusComposer(): void {
  requestAnimationFrame(() => {
    const box = document.getElementById('composer') as HTMLTextAreaElement | null;
    if (box && !box.disabled) box.focus();
  });
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
  // An archived run never changes again, so the page reads it once.
  const archived = useSelect((s) => !!runId && !!s.runs[runId] && !!s.runs[runId].archived);
  const active = !!runId && !lost && !streamed && !archived && (also || state === 'queued' || state === 'running');
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
 * stepsAt words each tool call of a transcript and names the item where
 * its line goes. A call goes at its own item. A call that asked for a
 * decision goes at its result, after the decision, and makes no line while
 * it waits. The map takes the item itself as its key, not its seq: two
 * calls of one turn share a seq, and each keeps its own line.
 */
export function stepsAt(items: Item[]): Map<Item, Step> {
  const waits = notesThatWait(items);
  const results = new Map<string, Item>();
  const files = new Map<string, Item>();
  const asked = new Set<string>();
  for (const x of items) {
    if (!x.callId) continue;
    if (x.kind === 'result') results.set(x.callId, x);
    else if (x.kind === 'file') files.set(x.callId, x);
    else if (x.kind === 'ask') asked.add(x.callId);
  }
  const out = new Map<Item, Step>();
  for (const c of items) {
    if (c.kind !== 'tool') continue;
    const r = c.callId ? results.get(c.callId) : undefined;
    const f = c.callId ? files.get(c.callId) : undefined;
    let at: Item = c;
    if (c.callId && asked.has(c.callId)) {
      const after = [r, f].filter((x): x is Item => !!x).sort((a, b) => a.seq - b.seq)[0];
      if (!after) continue;
      at = after;
    }
    out.set(at, { ...waitsWords(stepOf(c, f, r), c.callId, waits), key: 'step-' + (c.callId || c.seq), at: at.time });
  }
  return out;
}

/**
 * blocksOf folds the step lines between two messages into one block of
 * steps. A step goes where stepsAt puts it: a call that asked for a
 * decision shows after the decision, at its result, and not at all while
 * it waits.
 */
export function blocksOf(items: Item[]): Block[] {
  const placed = stepsAt(items);
  const out: Block[] = [];
  let steps: Step[] = [];
  const flush = () => {
    if (steps.length) out.push({ kind: 'steps', steps });
    steps = [];
  };
  for (const it of items) {
    // A change of a note words the line of its call, and makes no line of its own.
    if (it.kind === 'tools' || it.kind === 'memory') continue;
    if (it.kind === 'tool' || it.kind === 'result' || it.kind === 'file') {
      const s = placed.get(it);
      if (s) steps.push(s);
      continue;
    }
    flush();
    out.push({ kind: 'item', it });
  }
  flush();
  return out;
}

/** sameItem reports whether two items of a transcript are one: a seq holds several items, such as the calls of one turn. */
const sameItem = (a: Item, b: Item) => a.seq === b.seq && a.kind === b.kind && (a.callId || '') === (b.callId || '') && (a.id || '') === (b.id || '');

/** within5 reports whether two items of one sender are close enough to share a header. */
const within5 = (a: Item, b: Item) => {
  const d = new Date(b.time).getTime() - new Date(a.time).getTime();
  return d >= 0 && d < 5 * 60_000;
};

/** The first line of the summary of an earlier conversation that an older server put in front of the first message of a continued run. */
export const SUMMARY_HEAD = 'Earlier in this conversation:';

/**
 * splitSummary parts the first message of a continued run that an older
 * server wrote: the summary of the earlier conversation, its lines in the
 * words of the page (the person is You, and the agent has its name), and
 * the words of the person after it. A message without a summary gives
 * none.
 */
export function splitSummary(text: string, agent: string): { summary: string[]; rest: string } {
  if (!text.startsWith(SUMMARY_HEAD)) return { summary: [], rest: text };
  const end = text.indexOf('\n\n');
  const head = end >= 0 ? text.slice(0, end) : text;
  const rest = end >= 0 ? text.slice(end + 2) : '';
  const summary = head
    .slice(SUMMARY_HEAD.length)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('The person: ') ? 'You: ' + l.slice(12) : l.startsWith('You: ') ? agent + ': ' + l.slice(5) : l));
  return { summary, rest };
}

/**
 * ContinuedFrom is the quiet line at the top of a run that continues an
 * earlier conversation, as the server marks it in workbench.continues,
 * with a link to that conversation, or a key where the place has no
 * address of a conversation.
 */
export function ContinuedFrom({ run, href, onOpen }: { run: Run | undefined; href?: (id: string) => string; onOpen?: (id: string) => void }) {
  const id = run && run.metadata ? run.metadata[CONTINUES_KEY] || '' : '';
  const earlier = useSelect((s) => (id ? s.runs[id] : undefined));
  if (!id) return null;
  const title = earlier ? chatTitle(earlier) : 'an earlier conversation';
  return (
    <Quiet>
      Continued from{' '}
      {href ? (
        <a href={href(id)}>{title}</a>
      ) : (
        <button type="button" class="link-key" onClick={() => onOpen && onOpen(id)}>
          {title}
        </button>
      )}
    </Quiet>
  );
}

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
  /** What comes before the first item, such as the line of a deleted conversation and the link to the conversation that it continues. */
  head?: ComponentChildren;
}

export function Conversation(props: ConversationProps) {
  const { run, t } = props;
  const principal = useSelect((s) => (s.me ? s.me.principal : null));
  const me = principal ? principal.subject : '';
  const meName = principal ? principal.name : undefined;
  const agent = run ? run.agent : '';
  // An archived run waits for nothing: its worker is gone, so it takes no decision.
  const pending = run && !run.archived ? decisionOf(run, props.result) : null;
  const blocks = blocksOf(t.items);
  // The end of a run that stopped at a limit of its budget is no failure: the line of the limit below says what happened.
  const limitEnd = run && atLimit(run) ? [...t.items].reverse().find((x) => x.kind === 'end') : undefined;
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
      {props.head}
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
            // An older server put the summary of an earlier conversation in front of the first message: it folds, and the person's own words follow.
            const { summary, rest } = splitSummary(it.text || '', props.agentLabel);
            return (
              <Msg face={<Avatar subject={who} display={who === me ? meName : undefined} size={32} />} name={whoName(who, principal)} at={it.time} compact={compact}>
                {summary.length > 0 && (
                  <details class="summary-fold">
                    <summary>Earlier in this conversation</summary>
                    <ul>
                      {summary.map((l) => (
                        <li>{l}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {rest && <p class="tmsg-plain">{rest}</p>}
                <AttachedFiles files={it.files} />
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
            if (!it.isError || it === limitEnd) return null;
            prev = null;
            // A turn that stopped at a limit of its budget did nothing wrong, also after Continue gave it more room.
            if (/^budget exceeded\b/.test(it.detail || ''))
              return (
                <Quiet tone="grey" at={it.time}>
                  {plainError(it.detail)}
                </Quiet>
              );
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
