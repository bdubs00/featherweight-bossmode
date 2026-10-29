// Make this a job turns the work of a channel into a repeating job. The
// person says how often, in words. The server reads the words back as a plan
// of the channel (POST /v1/work/plan with the bridge), and the dialog shows
// the readback: when, which agent of the channel runs it, what it tells you,
// and where the result lands. The person picks the agent among the agents of
// the channel. Each run posts in the channel to that agent, whose answer is
// the result, a post in the channel. Such a job spends nothing of its own:
// the agent spends from its budget in the channel, so the dialog asks for no
// amount. A front that answers no agents of the channel makes a job that
// asks the first agent, and the dialog asks for the most one run can cost:
// the page fills no amount.

import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from '../../api/client';
import { api } from '../../api/routes';
import type { TaskPlan } from '../../api/types';
import { useSelect } from '../../state/store';
import { membersOf } from '../../state/reducer';
import { costOf, startPlan } from '../Door';
import { showError, showSaid } from '../notice';
import { Confirm } from '../common';
import { Choices, Field, Input } from '../primitives';
import { reloadBoard } from './data';
import { chatHref } from './route';

export function MakeJob({ bridge, onClose }: { bridge: string; onClose: () => void }) {
  const b = useSelect((s) => s.bridges.byId[bridge]);
  const agent = useSelect((s) => {
    const m = membersOf(s.rosters[bridge]).find((x) => x && !x.fired);
    return m ? m.agent : '';
  });
  const [when, setWhen] = useState('');
  const [handle, setHandle] = useState('');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => box.current && box.current.focus(), 0);
  }, []);
  const goal = b ? b.goal || b.title : '';
  // A plan of the channel names its agents, and the job spends nothing of its own.
  const inChannel = !!plan && !!plan.members && plan.cost.per === 'channel';
  const readBack = async (pick = handle) => {
    if (!when.trim()) {
      setError('Say how often, such as every Monday at 9:00.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const p = await api.planTask(goal.replace(/[.\s]+$/, '') + '. ' + when.trim(), agent || undefined, undefined, { bridge, handle: pick || undefined });
      const problem = p.problems.find((x) => !x.startsWith('when: '));
      if (p.kind !== 'repeat') setError('That reads as work that runs once. Say how often, such as every Monday at 9:00.');
      else if (problem) setError(problem.replace(/^\w+: /, ''));
      else {
        setPlan(p);
        if (p.who[0] && p.who[0].handle) setHandle(p.who[0].handle);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError(e.message);
      else showError(e);
    }
    setBusy(false);
  };
  const save = async () => {
    if (!plan) return;
    const n = inChannel ? 0 : costOf(cost);
    if (n === null) {
      setError('Say the most that one run can cost, such as 0.50.');
      return;
    }
    setBusy(true);
    try {
      const made = await startPlan(plan, n);
      showSaid(made.said);
      reloadBoard();
      onClose();
      if (made.made.duty) location.hash = chatHref({ view: 'job', name: made.made.duty });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError(e.message);
      else showError(e);
    }
    setBusy(false);
  };
  return (
    <Confirm title="Make this a job" confirm={plan ? 'Make the job' : 'Read it back'} busy={busy} onCancel={onClose} onConfirm={plan ? save : () => readBack()} class="cf-makejob">
      {!plan ? (
        <>
          <p>The work of this channel runs again on a schedule: {goal}</p>
          <Field label="How often" error={error} id="cf-job-when">
            <Input
              ref={box}
              value={when}
              placeholder="Every Monday at 9:00"
              invalid={!!error}
              onInput={(e) => {
                setWhen((e.target as HTMLInputElement).value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void readBack();
                }
              }}
            />
          </Field>
        </>
      ) : (
        <>
          <dl class="cf-readback">
            <dt>Job</dt>
            <dd>{plan.title}</dd>
            <dt>When</dt>
            <dd>{plan.when.readback}</dd>
            {!inChannel && (
              <>
                <dt>Who</dt>
                <dd>{plan.who.map((w) => w.name || w.agent).join(', ')}</dd>
              </>
            )}
            {plan.asks.length > 0 && (
              <>
                <dt>Asks first</dt>
                <dd>{plan.asks.join('. ')}</dd>
              </>
            )}
            <dt>You get</dt>
            <dd>{plan.result}</dd>
          </dl>
          {inChannel ? (
            <Choices
              name="cf-job-who"
              legend="Who runs it"
              value={handle}
              error={error}
              options={(plan.members || []).map((m) => ({ id: m.handle, label: m.handle, meta: m.task || m.name }))}
              onChange={(h) => {
                setHandle(h);
                void readBack(h);
              }}
            />
          ) : (
            <Field label="The most one run can cost" error={error} id="cf-job-cost">
              <span class="rb-money">
                <span aria-hidden="true">$</span>
                <Input
                  inputMode="decimal"
                  value={cost}
                  invalid={!!error}
                  onInput={(e) => {
                    setCost((e.target as HTMLInputElement).value);
                    setError('');
                  }}
                />
              </span>
            </Field>
          )}
          {plan.cost.basis && <p class="t-meta">{plan.cost.basis}</p>}
        </>
      )}
    </Confirm>
  );
}
