// The decision that a run waits for, as a card shows it. A channel can hold
// the card of the decision already. Else the page builds it from the
// pending call of the run, with the label and the effect of the result of
// the run when the page read it.

import type { Decision, Entry, Result, Run } from '../api/types';

/**
 * decisionOf builds the decision that a run waits for: the card of the
 * channel when the page holds it and it still waits, else the pending call
 * of the run with the label and the effect of its result. It answers null
 * for a run that waits for nothing.
 */
export function decisionOf(run: Run, res?: Result | null, card?: Entry): Decision | null {
  if (card && card.decision && card.decision.state === 'pending') return card.decision;
  const p = run.pending;
  if (!p) return null;
  const rp = res && res.pending && res.pending.id === p.id ? res.pending : null;
  const question = !!(p.schema || (rp && (rp.question || rp.schema)));
  return {
    run: run.id,
    id: p.id,
    tool: p.tool,
    label: (rp && rp.label) || (question ? 'Answer' : 'Allow'),
    question,
    reason: p.reason || (rp ? rp.reason : undefined),
    effect: rp ? rp.effect : undefined,
    input: p.input !== undefined ? p.input : rp ? rp.input : undefined,
    schema: p.schema !== undefined ? p.schema : rp ? rp.schema : undefined,
    state: 'pending',
  };
}
