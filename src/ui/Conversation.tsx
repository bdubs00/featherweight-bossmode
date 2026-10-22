// The conversation of a run, from GET /v1/runs/{id}/transcript, in the look
// of the channel: a message of a person or of the agent with its face, its
// name, and its clock time, a quiet step line for each tool call, a fold of
// many steps, and the decision that waits as a card. The manager and an
// agent that sits on no bridge talk in this conversation.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Decision, Item, Result, Run } from '../api/types';
import { store, useSelect } from '../state/store';
import { stepOf, stepsOf, type Step } from '../state/thread';
import { personName } from '../lib/words';
import { showError } from './notice';
import { Markdown } from './common';
import { DecisionCard } from './Decision';
import { Avatar, Button, Mark } from './primitives';
import { Msg, Quiet, StepText, StepsFold } from './Thread';

/** phraseOf words one tool call as /ui does, without a tool name where it can. */
export function phraseOf(it: Item): string {
  const s = stepOf(it);
  return s.cmd ? `${s.text} "${s.cmd}"` : s.text;
}

/** decisionOfRun builds the card of the decision that a run waits for. */
export function decisionOfRun(run: Run, res?: Result | null): Decision | null {
  const p = res && res.pending ? res.pending : null;
  if (p) return { run: run.id, id: p.id, tool: p.tool, label: p.label, question: p.question, reason: p.reason, effect: p.effect, input: p.input, schema: p.schema, state: 'pending' };
  const q = run.pending;
  if (!q) return null;
  return { run: run.id, id: q.id, tool: q.tool, label: q.schema ? 'Answer' : 'Allow', question: !!q.schema, reason: q.reason, input: q.input, schema: q.schema, state: 'pending' };
}

export interface TranscriptState {
  items: Item[];
  prev: number;
  loading: boolean;
  earlier: () => Promise<void>;
}

/** useTranscript reads the conversation of a run and follows the run on the stream. */
export function useTranscript(runId: string): TranscriptState {
  const [items, setItems] = useState<Item[]>([]);
  const [prev, setPrev] = useState(0);
  const [loading, setLoading] = useState(true);
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const last = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    setItems([]);
    setPrev(0);
    setLoading(!!runId);
    last.current = 0;
    if (!runId) return;
    api
      .transcript(runId, { limit: 200 })
      .then((t) => {
        if (!live) return;
        setItems(t.items);
        setPrev(t.prev);
        last.current = t.items.length ? t.items[t.items.length - 1].seq : 0;
        store.dispatch({ type: 'run', run: t.run });
      })
      .catch(showError)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [runId]);

  // A newer run on the stream, or from a poll, brings the items after the last one.
  const seq = run ? run.seq : 0;
  useEffect(() => {
    if (!runId || loading || busy.current || seq <= last.current) return;
    busy.current = true;
    api
      .transcript(runId, { from: last.current + 1, limit: 500 })
      .then((t) => {
        const fresh = t.items.filter((x) => x.seq > last.current);
        if (fresh.length) {
          last.current = fresh[fresh.length - 1].seq;
          setItems((old) => [...old, ...fresh]);
        }
      })
      .catch(showError)
      .finally(() => {
        busy.current = false;
      });
  }, [runId, seq, loading]);

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
  return { items, prev, loading, earlier };
}

/**
 * usePoll reads a run again every few seconds while it works. A run of the
 * front itself, such as a manager on the front, sends no run event on the
 * stream, so its conversation polls it while it is open.
 */
export function usePoll(runId: string, every = 3000): void {
  const state = useSelect((s) => (runId && s.runs[runId] ? s.runs[runId].state : ''));
  const active = !!runId && !['completed', 'failed', 'canceled', 'input-required'].includes(state);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      api
        .run(runId)
        .then((r) => store.dispatch({ type: 'run', run: r }))
        .catch(() => {
          // A missed poll waits for the next one.
        });
    }, every);
    return () => clearInterval(t);
  }, [runId, active, every]);
}

type Block = { kind: 'item'; it: Item } | { kind: 'steps'; steps: Step[] };

/** blocksOf folds the tool calls between two messages into one block of steps. */
export function blocksOf(items: Item[]): Block[] {
  const out: Block[] = [];
  let calls: Item[] = [];
  const flush = () => {
    if (calls.length) out.push({ kind: 'steps', steps: stepsOf(calls) });
    calls = [];
  };
  for (const it of items) {
    if (it.kind === 'tools') continue;
    if (it.kind === 'tool' || it.kind === 'result' || it.kind === 'file') {
      calls.push(it);
      continue;
    }
    flush();
    out.push({ kind: 'item', it });
  }
  flush();
  return out.filter((b) => b.kind === 'item' || b.steps.length > 0);
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
  /** Text that a live stream sends for the answer that is not finished. It grows the last answer, or starts one. */
  live?: string;
}

export function Conversation(props: ConversationProps) {
  const { run, t } = props;
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const meName = useSelect((s) => (s.me && s.me.principal ? s.me.principal.name : undefined));
  const agent = run ? run.agent : '';
  const pending = run ? decisionOfRun(run, props.result) : null;
  const blocks = blocksOf(t.items);
  const lastItem = [...blocks].reverse().find((b) => b.kind === 'item');
  const liveOnLast = !!props.live && !!lastItem && lastItem.kind === 'item' && lastItem.it.kind === 'assistant';
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
              <Msg face={<Avatar subject={who} display={who === me ? meName : undefined} size={32} />} name={personName(who, who === me ? meName : undefined)} at={it.time} compact={compact}>
                <p class="tmsg-plain">{it.text}</p>
              </Msg>
            );
          }
          case 'assistant': {
            const grow = liveOnLast && lastItem && lastItem.kind === 'item' && lastItem.it === it ? props.live : '';
            return (
              <Msg face={face} name={props.agentLabel} at={it.time} compact={compact}>
                <Markdown text={(it.text || '') + (grow || '')} />
              </Msg>
            );
          }
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
                {personName(it.who)} {it.text === 'allow' ? 'allowed' : 'denied'} it{it.detail ? ': ' + it.detail : ''}
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
            prev = null;
            return (
              <Quiet tone={it.isError ? 'red' : 'grey'} at={it.time} err={it.isError}>
                {it.isError ? 'The turn failed' : 'The turn ended'}
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
      {props.live && !liveOnLast && (
        <Msg face={face} name={props.agentLabel}>
          <Markdown text={props.live} />
        </Msg>
      )}
    </div>
  );
}
