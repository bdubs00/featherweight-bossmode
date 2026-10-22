// The thread of the conversation with the manager, in the look of the channel:
// each message with the mark or the initials of its sender, the name, and
// the clock time; the tool calls between two messages folded into one line;
// and a centered line for what happened, with its light. The thread is
// data first: threadOf builds the entries from the items of a transcript,
// and appendDelta adds a piece of text to the last message of the agent,
// so a live stream can write an answer as it arrives.

import type { ComponentChildren } from 'preact';
import type { Decision, Item, Result, Run } from '../api/types';
import type { Tone } from '../lib/presence';
import { commandOf, personName } from '../lib/words';
import { Avatar, Markdown, When } from './common';
import { Glyph } from './icons';
import { Led, Mark } from './primitives';

export interface Step {
  phrase: string;
  error: boolean;
  done: boolean;
}

export type Entry =
  | { kind: 'msg'; key: string; from: 'person' | 'agent'; who: string; at: string; text: string }
  | { kind: 'steps'; key: string; steps: Step[] }
  | { kind: 'line'; key: string; tone: Tone; text: string; at?: string }
  | { kind: 'ask'; key: string; id: string; question: boolean };

/** decisionOf builds the card of the decision that a run waits for, with the label of its result when the page read it. */
export function decisionOf(run: Run, res?: Result | null): Decision | null {
  const p = res && res.pending ? res.pending : null;
  if (p) return { run: run.id, id: p.id, tool: p.tool, label: p.label, question: p.question, reason: p.reason, effect: p.effect, input: p.input, schema: p.schema, state: 'pending' };
  const q = run.pending;
  if (!q) return null;
  return { run: run.id, id: q.id, tool: q.tool, label: q.schema ? 'Answer' : 'Allow', question: !!q.schema, reason: q.reason, input: q.input, schema: q.schema, state: 'pending' };
}

/** phraseOf words one tool call in plain words, without the name of the tool where it can. */
export function phraseOf(it: Item): string {
  const cmd = commandOf(it.input);
  if (cmd) return `Ran "${cmd.length > 80 ? cmd.slice(0, 79) + '…' : cmd}"`;
  if (it.kind === 'file') return (it.text === 'created' ? 'Created ' : it.text === 'deleted' ? 'Removed ' : 'Edited ') + (it.path || 'a file');
  return 'Used ' + (it.tool || 'a tool').replace(/^front\./, '');
}

/** threadOf builds the entries of a thread from the items of a transcript. */
export function threadOf(items: Item[], agent: string): Entry[] {
  const out: Entry[] = [];
  const results = new Map(items.filter((x) => x.kind === 'result').map((x) => [x.callId, x]));
  for (const it of items) {
    const key = String(it.seq);
    switch (it.kind) {
      case 'user':
        out.push({ kind: 'msg', key, from: 'person', who: it.who || '', at: it.time, text: it.text || '' });
        break;
      case 'assistant':
        out.push({ kind: 'msg', key, from: 'agent', who: agent, at: it.time, text: it.text || '' });
        break;
      case 'tool':
      case 'file': {
        const r = it.kind === 'tool' ? results.get(it.callId) : undefined;
        const step: Step = { phrase: phraseOf(it), error: !!(r && r.isError), done: it.kind === 'file' || !!r };
        const last = out[out.length - 1];
        if (last && last.kind === 'steps') last.steps.push(step);
        else out.push({ kind: 'steps', key, steps: [step] });
        break;
      }
      case 'ask':
        out.push({ kind: 'ask', key, id: it.id || '', question: !!it.schema });
        break;
      case 'decided':
        out.push({ kind: 'line', key, tone: it.text === 'allow' ? 'green' : 'grey', text: personName(it.who) + (it.text === 'allow' ? ' allowed it' : ' denied it') + (it.detail ? ': ' + it.detail : ''), at: it.time });
        break;
      case 'note':
        out.push({ kind: 'line', key, tone: it.isError ? 'red' : 'grey', text: it.text || '', at: it.time });
        break;
      case 'end':
        // The end of a turn says nothing that the answer above it does not,
        // unless the turn failed.
        if (it.isError) out.push({ kind: 'line', key, tone: 'red', text: 'The turn failed', at: it.time });
        break;
    }
  }
  return out;
}

/**
 * appendDelta adds a piece of an answer to the last message of the agent.
 * When the last entry is not a message of the agent, the piece starts a
 * new one. The entries stay as they were, and only the last one is new.
 */
export function appendDelta(entries: Entry[], piece: string, agent: string, at: string): Entry[] {
  const last = entries[entries.length - 1];
  if (last && last.kind === 'msg' && last.from === 'agent') return [...entries.slice(0, -1), { ...last, text: last.text + piece }];
  return [...entries, { kind: 'msg', key: 'live-' + entries.length, from: 'agent', who: agent, at, text: piece }];
}

function Steps({ steps }: { steps: Step[] }) {
  const failed = steps.some((s) => s.error);
  return (
    <details class="msteps">
      <summary>
        <Led tone={failed ? 'red' : 'grey'} word={steps.length === 1 ? 'Took 1 step' : `Took ${steps.length} steps`} />
      </summary>
      <ol>
        {steps.map((s) => (
          <li>
            {s.phrase}
            {s.error ? ', failed' : ''}
          </li>
        ))}
      </ol>
    </details>
  );
}

export interface ThreadProps {
  entries: Entry[];
  /** The agent of the conversation, for its mark. */
  agent: string;
  /** The subject of the person, so a message of the person shows the initials. */
  me: string;
  /** The card of a decision that waits, in place of its ask entry. */
  card?: (id: string) => ComponentChildren;
  /** What follows the last entry, such as the status of an answer that is on its way. */
  tail?: ComponentChildren;
}

export function Thread({ entries, agent, me, card, tail }: ThreadProps) {
  return (
    <div class="mthread" role="log" aria-label={'Conversation with the ' + agent}>
      {entries.map((e) => {
        switch (e.kind) {
          case 'msg':
            return (
              <article class="mmsg" key={e.key}>
                {e.from === 'agent' ? <Mark agent={e.who} size={32} /> : <Avatar subject={e.who || me} size={32} />}
                <div>
                  <header class="mmsg-who">
                    <b class="t-sub">{e.from === 'agent' ? e.who : personName(e.who || me)}</b>
                    <When at={e.at} />
                  </header>
                  {e.from === 'agent' ? <Markdown text={e.text} /> : <p class="plain">{e.text}</p>}
                </div>
              </article>
            );
          case 'steps':
            return <Steps steps={e.steps} key={e.key} />;
          case 'line':
            return (
              <p class="mline" key={e.key}>
                <Led tone={e.tone} word={e.text} />
                {e.at && <When at={e.at} />}
              </p>
            );
          case 'ask': {
            const c = card ? card(e.id) : null;
            if (c) return <div key={e.key}>{c}</div>;
            return (
              <p class="mline" key={e.key}>
                <Glyph name="question" size={16} />
                {e.question ? 'Asked you' : 'Asked for a decision'}
              </p>
            );
          }
        }
        return null;
      })}
      {tail}
    </div>
  );
}
