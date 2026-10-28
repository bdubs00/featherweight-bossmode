// Continue with more room: the way on for a chat whose run stopped at a
// limit of its budget. A limit is no fault, so the chat keeps what it knows
// and goes on, as Continue does for a seat at its limit. The page gives the
// run the same room again through PATCH /v1/runs/{id}/budget, the route
// that changes the limits of a run, then sends one follow-up that asks it
// to go on. A run counts each limit over the whole run, so the same room
// again is twice what it used: 8 turns become 16. A limit of cost is money,
// so the page fills no amount there: the person types the most that the
// whole run can cost, and the page refuses an amount that it spent already.
// A limit that the page cannot measure, such as working time, offers no
// key, and the next message starts a new chat as before.

import { useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import type { Run, RunBudget } from '../api/types';
import { store } from '../state/store';
import { atLimit } from '../lib/presence';
import { plainError } from '../lib/runerror';
import { showError } from './notice';
import { Button, Field, Input } from './primitives';
import { Quiet } from './Thread';

/** The follow-up that asks the run to go on after it got more room. */
export const GO_ON = 'You stopped at a limit of your budget, and I gave you more room. Go on from where you stopped.';

/** What Continue with more room gives a run: the change of its budget and its words, or a cost that the person types. */
export interface Room {
  /** The change of the budget, for a limit that the page measures. */
  change?: RunBudget;
  /** The room in words, such as 8 more turns. */
  words?: string;
  /** True for a limit of cost: the person types the most that the run can cost in all. */
  cost?: boolean;
}

const count = (n: number, one: string, many: string) => (n === 1 ? '1 ' + one : n.toLocaleString('en-US') + ' ' + many);

/**
 * roomOf says what more room a run that stopped at a limit gets: the same
 * room again for turns, tool calls, and tokens, which the usage of the run
 * measures, and a typed cost for a limit of cost. It answers null for a run
 * at no limit and for a limit that the page cannot measure.
 */
export function roomOf(run: Pick<Run, 'state' | 'error' | 'usage'> | null | undefined): Room | null {
  if (!run || !atLimit(run)) return null;
  const m = /^budget exceeded:?\s*([A-Za-z]+)/.exec(run.error || '');
  const limit = m ? m[1] : '';
  const u = run.usage || {};
  switch (limit) {
    case 'maxTurns':
      return u.turns ? { change: { maxTurns: u.turns * 2 }, words: count(u.turns, 'more turn', 'more turns') } : null;
    case 'maxToolCalls':
      return u.toolCalls ? { change: { maxToolCalls: u.toolCalls * 2 }, words: count(u.toolCalls, 'more tool call', 'more tool calls') } : null;
    case 'maxTokens': {
      // The kernel counts the input and the output tokens.
      const used = (u.inputTokens || 0) + (u.outputTokens || 0);
      return used ? { change: { maxTokens: used * 2 }, words: 'about ' + count(used, 'more token', 'more tokens') } : null;
    }
    case 'maxCostUSD':
      return { cost: true };
  }
  return null;
}

/** costIn reads the cost that the person typed: a positive number of dollars with at most two decimals, or null. */
function costIn(text: string): number | null {
  const t = text.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** moreRoom gives a run the room of a change and asks it to go on, then reads it again. */
export async function moreRoom(id: string, change: RunBudget): Promise<void> {
  await api.changeBudget(id, change);
  await api.sendRun(id, GO_ON);
  store.dispatch({ type: 'run', run: await api.run(id) });
}

/**
 * MoreRoom is the end of a chat that stopped at a limit: the line of the
 * limit, and Continue with more room. next says what the next message does
 * instead, such as start a new chat.
 */
export function MoreRoom({ run, next }: { run: Run; next: string }) {
  const room = roomOf(run);
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  const spent = (run.usage && run.usage.costUSD) || 0;
  const go = async () => {
    if (busy || !room) return;
    let change = room.change;
    if (room.cost) {
      const n = costIn(cost);
      if (n === null) return setError('Say the most that it can cost in all, such as 0.50.');
      if (n <= spent) return setError('Say more than it spent so far: $' + spent.toFixed(2) + '.');
      change = { maxCostUSD: n };
    }
    if (!change) return;
    setBusy(true);
    try {
      await moreRoom(run.id, change);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError(e.message);
      else showError(e);
    }
    setBusy(false);
  };
  const line = (plainError(run.error) || 'Stopped at a limit') + '. ' + next;
  if (!room) return <Quiet tone="grey">{line}</Quiet>;
  return (
    <div class="more-room" role="group" aria-label="The limit of this chat">
      <Quiet tone="grey">{line}</Quiet>
      <div class="more-room-do">
        {room.cost && (
          <Field label="The most it can cost in all" error={error} id="room-cost">
            <span class="rb-money">
              <span aria-hidden="true">$</span>
              <Input
                inputMode="decimal"
                value={cost}
                invalid={!!error}
                aria-describedby={error ? 'room-cost-error' : undefined}
                onInput={(e) => {
                  setCost((e.target as HTMLInputElement).value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    go();
                  }
                }}
              />
            </span>
          </Field>
        )}
        <Button size="s" aria-disabled={busy || undefined} onClick={go}>
          Continue with more room
        </Button>
        {room.words && <span class="t-meta">It gets {room.words} and goes on where it stopped.</span>}
        {!room.cost && error && (
          <span class="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
