// Make this a job turns the work of a channel into a repeating job. The
// person says how often, in words. The server reads the words back as a plan
// (POST /v1/work/plan), and the dialog shows the readback: when, who, what it
// tells you, and what runs of the agent cost. Make the job saves it with the
// most one run can cost, which the person types: the page fills no amount.

import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from '../../api/client';
import { api } from '../../api/routes';
import type { TaskPlan } from '../../api/types';
import { useSelect } from '../../state/store';
import { membersOf } from '../../state/reducer';
import { costOf, startPlan } from '../Door';
import { showError, showSaid } from '../notice';
import { Confirm } from '../common';
import { Field, Input } from '../primitives';
import { reloadBoard } from './data';
import { chatHref } from './route';

export function MakeJob({ bridge, onClose }: { bridge: string; onClose: () => void }) {
  const b = useSelect((s) => s.bridges.byId[bridge]);
  const agent = useSelect((s) => {
    const m = membersOf(s.rosters[bridge]).find((x) => x && !x.fired);
    return m ? m.agent : '';
  });
  const [when, setWhen] = useState('');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => box.current && box.current.focus(), 0);
  }, []);
  const goal = b ? b.goal || b.title : '';
  const readBack = async () => {
    if (!when.trim()) {
      setError('Say how often, such as every Monday at 9:00.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const p = await api.planTask(goal.replace(/[.\s]+$/, '') + '. ' + when.trim(), agent || undefined);
      if (p.kind !== 'repeat') setError('That reads as work that runs once. Say how often, such as every Monday at 9:00.');
      else setPlan(p);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError(e.message);
      else showError(e);
    }
    setBusy(false);
  };
  const save = async () => {
    if (!plan) return;
    const n = costOf(cost);
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
    <Confirm title="Make this a job" confirm={plan ? 'Make the job' : 'Read it back'} busy={busy} onCancel={onClose} onConfirm={plan ? save : readBack} class="cf-makejob">
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
            <dt>Who</dt>
            <dd>{plan.who.map((w) => w.name || w.agent).join(', ')}</dd>
            {plan.asks.length > 0 && (
              <>
                <dt>Asks first</dt>
                <dd>{plan.asks.join('. ')}</dd>
              </>
            )}
            <dt>You get</dt>
            <dd>{plan.result}</dd>
          </dl>
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
          {plan.cost.basis && <p class="t-meta">{plan.cost.basis}</p>}
        </>
      )}
    </Confirm>
  );
}
