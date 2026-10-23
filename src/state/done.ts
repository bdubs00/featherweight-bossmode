// What the person finished in Activity. Done clears a message for this
// person through the read mark of its bridge (PUT /v1/bridges/{id}/read):
// the mark moves to the message, so the message and every earlier entry
// of the bridge count as read. The decisions that the person made here
// stay in memory for the visit, so the main pane shows a decided card
// settled at once, before the stream brings the card written again.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Decision } from '../api/types';
import { store } from './store';

/** markDone moves the read mark of the person in a bridge to an entry, here and at the workbench. */
export async function markDone(bridge: string, seq: number): Promise<void> {
  store.dispatch({ type: 'read', bridge, seq });
  await api.markRead(bridge, seq);
}

/** A decision that the person made on this page. */
export interface Made {
  decision: 'allow' | 'deny';
  note?: string;
  content?: unknown;
  at: string;
}

const made = new Map<string, Made>();
const listeners = new Set<() => void>();
const keyOf = (run: string, approval: string) => run + '/' + approval;

/** noteDecided records a decision that went out, so a card shows it settled before the stream says so. */
export function noteDecided(run: string, approval: string, decision: 'allow' | 'deny', note?: string, content?: unknown): void {
  made.set(keyOf(run, approval), { decision, note, content, at: new Date().toISOString() });
  for (const f of [...listeners]) f();
}

/** madeOf returns the decision that the person made on a card on this page, or undefined. */
export function madeOf(run: string, approval: string): Made | undefined {
  return made.get(keyOf(run, approval));
}

/** useMade follows the decision that the person made on a card. */
export function useMade(run: string, approval: string): Made | undefined {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return run && approval ? madeOf(run, approval) : undefined;
}

/** answerWords words the answer of a question as the workbench does: the value of a form with one field, Yes or No, the fields of a larger form, or the note. */
function answerWords(content: unknown, note?: string): string {
  const words = (x: unknown): string => (typeof x === 'boolean' ? (x ? 'Yes' : 'No') : typeof x === 'string' ? x : JSON.stringify(x));
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const keys = Object.keys(content as Record<string, unknown>).sort();
    const v = content as Record<string, unknown>;
    if (keys.length === 1) return words(v[keys[0]]);
    return keys.map((k) => k + ': ' + words(v[k])).join(', ');
  }
  if (content !== undefined && content !== null) return words(content);
  return note || '';
}

/**
 * settledOf is a decided card as the person left it: the card as the
 * stream wrote it again, once it says so, else the decision that the
 * person made here, with the person as the decider.
 */
export function settledOf(d: Decision, card: Decision | undefined, m: Made | undefined, me: string): Decision {
  if (card && card.state !== 'pending') return card;
  if (!m) return d;
  const q = !!(d.question || d.schema);
  return { ...d, state: m.decision, decidedBy: me, decidedAt: m.at, note: q ? undefined : m.note, answer: q && m.decision === 'allow' ? answerWords(m.content, m.note) : undefined };
}
