// The conversation of a run, from GET /v1/runs/{id}/transcript, as /ui
// shows it: the messages as bubbles, the tool calls folded into "Took 3
// steps" with a plain phrase each, and the decision that waits as a card.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Decision, Item, Result, Run } from '../api/types';
import { store, useSelect } from '../state/store';
import { commandOf, personName } from '../lib/words';
import { showError } from './notice';
import { Avatar, Face, Markdown, When } from './common';
import { DecisionCard } from './Decision';
import { Icon } from './icons';

/** phraseOf words one tool call as /ui does, without a tool name where it can. */
export function phraseOf(it: Item): string {
  const cmd = commandOf(it.input);
  if (cmd) return `Ran "${cmd.length > 80 ? cmd.slice(0, 79) + '…' : cmd}"`;
  if (it.kind === 'file') return (it.text === 'created' ? 'Created ' : it.text === 'deleted' ? 'Removed ' : 'Edited ') + (it.path || 'a file');
  const tool = (it.tool || 'a tool').replace(/^front\./, '');
  return 'Used ' + tool;
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
    setLoading(true);
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

  // A newer run on the stream brings the items after the last one.
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

type Block = { kind: 'item'; it: Item } | { kind: 'steps'; items: Item[] };

/** blocksOf folds the tool calls between two messages into one block of steps. */
function blocksOf(items: Item[]): Block[] {
  const out: Block[] = [];
  for (const it of items) {
    if (it.kind === 'tools') continue;
    if (it.kind === 'tool' || it.kind === 'result' || it.kind === 'file') {
      const lastB = out[out.length - 1];
      if (lastB && lastB.kind === 'steps') lastB.items.push(it);
      else out.push({ kind: 'steps', items: [it] });
      continue;
    }
    out.push({ kind: 'item', it });
  }
  return out;
}

function Steps({ items }: { items: Item[] }) {
  const calls = items.filter((x) => x.kind === 'tool');
  const results = new Map(items.filter((x) => x.kind === 'result').map((x) => [x.callId, x]));
  const files = items.filter((x) => x.kind === 'file');
  const n = calls.length;
  if (n === 0 && files.length === 0) return null;
  return (
    <details class="steps">
      <summary>
        <Icon name="chev" />
        {n === 1 ? 'Took 1 step' : `Took ${n} steps`}
      </summary>
      <ol>
        {calls.map((c) => {
          const r = results.get(c.callId);
          const file = files.find((f) => f.callId === c.callId);
          return (
            <li class={r && r.isError ? 'err' : ''}>
              <span>{file ? phraseOf(file) : phraseOf(c)}</span>
              <small>{r ? (r.isError ? 'Error' : 'Done') : 'No result'}</small>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

export function Conversation(props: { run: Run | undefined; result?: Result | null; t: TranscriptState; agentLabel: string; onDecide?: () => void }) {
  const { run, t } = props;
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const pending = run ? decisionOfRun(run, props.result) : null;
  const blocks = blocksOf(t.items);
  return (
    <div class="chat">
      {t.prev > 0 && (
        <div class="earlier">
          <button type="button" class="btn small" onClick={t.earlier}>
            Load earlier messages
          </button>
        </div>
      )}
      {t.loading && <p class="empty">Loading the conversation.</p>}
      {blocks.map((b) => {
        if (b.kind === 'steps') return <Steps items={b.items} />;
        const it = b.it;
        switch (it.kind) {
          case 'user': {
            const mine = !it.who || it.who === me;
            return mine ? (
              <div class="bubble mine">{it.text}</div>
            ) : (
              <div class="from">
                <Avatar subject={it.who || ''} size={24} />
                <div class="bubble">
                  <span class="who">{personName(it.who)}</span>
                  {it.text}
                </div>
              </div>
            );
          }
          case 'assistant':
            return (
              <div class="from">
                <Face agent={run ? run.agent : ''} size={24} />
                <div class="bubble say">
                  <Markdown text={it.text || ''} />
                </div>
              </div>
            );
          case 'ask':
            if (pending && pending.id === it.id) return <DecisionCard d={pending} who={props.agentLabel} onDecide={props.onDecide} />;
            return (
              <p class="cap">
                <Icon name="hand" /> {it.schema ? 'Asked you a question' : 'Asked for permission'}
              </p>
            );
          case 'decided':
            return (
              <p class="cap">
                <Icon name={it.text === 'allow' ? 'check' : 'cross'} /> {personName(it.who)} {it.text === 'allow' ? 'allowed' : 'denied'} it
                {it.detail ? ': ' + it.detail : ''}
              </p>
            );
          case 'note':
            return <p class={'cap' + (it.isError ? ' err' : '')}>{it.text}</p>;
          case 'end':
            return (
              <p class={'cap end' + (it.isError ? ' err' : '')}>
                <Icon name={it.isError ? 'cross' : 'check'} />
                {it.isError ? 'The turn failed' : 'The turn ended'} <When at={it.time} />
              </p>
            );
        }
        return null;
      })}
      {pending && !t.items.some((x) => x.kind === 'ask' && x.id === pending.id) && <DecisionCard d={pending} who={props.agentLabel} onDecide={props.onDecide} />}
    </div>
  );
}
