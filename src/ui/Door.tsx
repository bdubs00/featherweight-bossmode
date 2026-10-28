// The door of the Work place: one field for what a person needs done. The
// person says the task in words, or starts from a template in words. Read
// it back asks the server for a plan (POST /v1/work/plan), and the page
// shows it before anything starts: who does it, when, what it asks you,
// what it never bothers you with, when you hear of it, where the result
// lands, what it cannot do, and last, beside Start, what it can cost. The
// plan never names a cost, so Start refuses until the person types the most
// that a run can cost.
//
// Start sends the record of the plan to a route that exists already: a
// duty for a task that repeats, a bridge for a team, and a run for a task
// that runs once. The person never picks among duty, bridge, run, or chat.
// The board under the door (Work.tsx) then shows the new task, and a quiet
// card in place of the readback says what Start made and takes the focus.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import type { TaskPlan, TaskTell } from '../api/types';
import { hrefOf } from '../lib/route';
import { nextWords } from '../lib/duties';
import { list } from '../lib/words';
import { loadDuties } from '../state/duties';
import { loadBridges } from '../state/actions';
import { showError } from './notice';
import { Button, Card, Choices, Field, Input, LineLed, Mark, TextArea } from './primitives';

/** A template: a label that names the work, and words that the person changes before Read it back. */
export interface TaskTemplate {
  label: string;
  words: string;
}

/** The templates of the door, in plain words. A deployment could name its own. */
export const TEMPLATES: TaskTemplate[] = [
  { label: 'A weekly summary of competitors', words: 'Every Monday at 9am, sum up what our competitors Acme and Globex shipped last week.' },
  { label: 'A draft, reviewed before it goes out', words: 'Write the launch email for our new pricing, have it reviewed, and show me before it goes out.' },
  { label: 'A nightly check of hosts', words: 'Every night, check the web hosts for drift from their Ansible roles. Tell me only when something drifted.' },
  { label: 'A big job, split across agents', words: 'Split the migration of the remaining Puppet modules to Ansible across 3 agents, with a review and a test of each part.' },
  { label: 'New tickets, sorted each morning', words: 'Every weekday at 8am, sort the new helpdesk tickets and hand each one to its team.' },
  { label: 'A question, answered now', words: 'What changed in our release notes since 2.3?' },
];

/** The choices of when the person hears of a result. */
const TELLS: { id: TaskTell; label: string }[] = [
  { id: 'each', label: 'Each result' },
  { id: 'found', label: 'Only when it finds something' },
  { id: 'failures', label: 'Only when it fails' },
];

/** costOf reads the cost that the person typed: a positive number of dollars, or null. */
export function costOf(text: string): number | null {
  const t = text.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** money says dollars with two decimals. */
const money = (n: number) => '$' + n.toFixed(2);

/** monthWords says the most a task can cost in a month, from the cost of one run and the runs of a month. */
export function monthWords(plan: Pick<TaskPlan, 'kind' | 'cost'>, cost: number | null): string {
  if (cost === null || plan.kind !== 'repeat') return '';
  const n = plan.cost.runsPerMonth;
  return 'At most ' + money(cost * n) + ' a month: about ' + n + (n === 1 ? ' run' : ' runs') + ' at most ' + money(cost) + ' each.';
}

/** What Start made, for the quiet card that follows it. */
interface Started {
  title: string;
  said: string;
  href: string;
}

/** start sends the record of a plan, with the cost of the person, to the route that makes it. It answers what it made. */
export async function startPlan(plan: TaskPlan, cost: number): Promise<Started> {
  const s = plan.start;
  if (s.duty) {
    const d = s.duty;
    const saved = await api.putDuty(d.name, { ...d, limits: { ...d.limits, budget: { ...(d.limits && d.limits.budget), maxCostUSD: cost } } });
    loadDuties().catch(() => {});
    return { title: plan.title, said: 'Set. ' + (saved.readback || plan.when.readback), href: hrefOf({ place: 'duties', name: saved.name || d.name }) };
  }
  if (s.bridge) {
    const b = await api.openBridge({ ...s.bridge, caps: { ...(s.bridge.caps || {}), maxCostUSD: cost } } as Parameters<typeof api.openBridge>[0]);
    loadBridges().catch(() => {});
    return { title: plan.title, said: 'Started. ' + list(plan.who.map((w) => w.name)) + ' work on it now.', href: hrefOf({ place: 'bridge', id: b.id, pane: 'none' }) };
  }
  if (s.run) {
    const r = await api.start(s.run.member, { ...s.run.body, budget: { maxCostUSD: cost } } as Parameters<typeof api.start>[1]);
    const chat = s.run.body.metadata && s.run.body.metadata['fw.view'] === 'quickchat';
    return { title: plan.title, said: 'Started. ' + (plan.who[0] ? plan.who[0].name : 'The agent') + ' works on it now.', href: chat ? hrefOf({ place: 'chat', run: r.id }) : hrefOf({ place: 'fleet', agent: s.run.body.agent }) };
  }
  throw new Error('The plan names nothing to start.');
}

/** problemOf finds the problem of a field of a plan, such as agent, without its path. */
const problemOf = (plan: TaskPlan, field: string) => {
  const p = plan.problems.find((x) => x.startsWith(field + ': '));
  return p ? p.slice(field.length + 2) : '';
};

/** Readback is the plan of the words, before anything starts, with Start as its one primary key. */
function Readback({ plan, onPlan, onStarted, busy }: { plan: TaskPlan; onPlan: (agent?: string, tell?: TaskTell) => void; onStarted: (s: Started) => void; busy: boolean }) {
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  const [going, setGoing] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setError('');
  }, [plan]);
  const n = costOf(cost);
  const team = plan.kind === 'team';
  const agentProblem = problemOf(plan, 'agent');
  const first = plan.who[0];
  const start = async () => {
    if (going || busy) return;
    if (agentProblem) return;
    if (n === null) {
      setError(team ? 'Say the most that the whole team can spend, such as 5.00.' : 'Say the most that one run can cost, such as 0.50.');
      if (field.current) field.current.focus();
      return;
    }
    setGoing(true);
    try {
      onStarted(await startPlan(plan, n));
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError(e.message);
      else showError(e);
    }
    setGoing(false);
  };
  const change = plan.start.duty
    ? hrefOf({ place: 'duties', fresh: true, seed: { agent: plan.start.duty.agent, act: 'ask', message: plan.words } })
    : plan.start.bridge
      ? hrefOf({ place: 'new' })
      : hrefOf({ place: 'chat', fresh: true });
  return (
    <Card
      title={plan.title}
      class="readback"
      label="What happens when you start"
      actions={
        <>
          <Button href={change} kind="quiet">
            Change the details
          </Button>
          <Button kind="primary" onClick={start} aria-disabled={going || busy || !!agentProblem || undefined}>
            Start
          </Button>
        </>
      }
    >
      <dl class="rb">
        <div class="rb-row">
          <dt>Who</dt>
          <dd>
            <ul class="rb-who">
              {plan.who.map((w) => (
                <li>
                  <Mark agent={w.agent} size={20} />
                  <span>
                    <strong>{w.name}</strong> {w.count && w.count > 1 ? '(' + w.count + ') ' : ''}
                    {w.does}
                  </span>
                </li>
              ))}
            </ul>
            {(!team || agentProblem) && plan.others.length > 0 && (
              <label class="rb-other">
                <span class="t-meta">{first ? 'Someone else' : 'Pick an agent'}</span>
                <select class="recess" value="" onChange={(e) => onPlan((e.target as HTMLSelectElement).value || undefined)} disabled={busy}>
                  <option value="">{first ? 'Keep ' + first.name : 'Pick one'}</option>
                  {plan.others
                    .filter((o) => !first || o.agent !== first.agent)
                    .map((o) => (
                      <option value={o.agent}>{o.name}</option>
                    ))}
                </select>
              </label>
            )}
            {agentProblem && (
              <p class="field-error" role="alert">
                {agentProblem}
              </p>
            )}
          </dd>
        </div>
        <div class="rb-row">
          <dt>When</dt>
          <dd>
            <p>{plan.when.readback}</p>
            {plan.when.next.length > 0 && <p class="t-meta">Next: {plan.when.next.map((t) => nextWords(t)).join('; ')}</p>}
          </dd>
        </div>
        <div class="rb-row">
          <dt>It asks you</dt>
          <dd>
            <ul class="rb-list">
              {plan.asks.map((a) => (
                <li>{a}.</li>
              ))}
            </ul>
          </dd>
        </div>
        <div class="rb-row">
          <dt>It stays quiet</dt>
          <dd>
            <ul class="rb-list">
              {plan.quiet.map((a) => (
                <li>{a}.</li>
              ))}
            </ul>
          </dd>
        </div>
        {plan.kind === 'repeat' && (
          <div class="rb-row">
            <dt>You hear of it</dt>
            <dd>
              <Choices name="rb-tell" label="When you hear of a result" value={plan.tell} options={TELLS} onChange={(t) => onPlan(undefined, t)} />
            </dd>
          </div>
        )}
        <div class="rb-row">
          <dt>The result</dt>
          <dd>
            <p>{plan.result}.</p>
          </dd>
        </div>
        {plan.gaps.length > 0 && (
          <div class="rb-row">
            <dt>It cannot</dt>
            <dd>
              {plan.gaps.map((g) => (
                <p class="rb-gap">
                  <LineLed tone="grey" /> {g}
                </p>
              ))}
            </dd>
          </div>
        )}
        {/* The cost comes last, beside Start: the field that Start needs sits next to it, after every row that the person reads first. */}
        <div class="rb-row">
          <dt>What it can cost</dt>
          <dd>
            <Field label={team ? 'The most the whole team can spend' : 'The most one run can cost'} error={error} id="rb-cost">
              <span class="rb-money">
                <span aria-hidden="true">$</span>
                <Input
                  ref={field}
                  inputMode="decimal"
                  value={cost}
                  invalid={!!error}
                  aria-describedby={error ? 'rb-cost-error' : undefined}
                  onInput={(e) => {
                    setCost((e.target as HTMLInputElement).value);
                    setError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      start();
                    }
                  }}
                />
              </span>
            </Field>
            {plan.cost.basis && <p class="t-meta">{plan.cost.basis}</p>}
            {monthWords(plan, n) && <p class="t-meta">{monthWords(plan, n)}</p>}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

/** Door is the top of the Work place: the field, the templates or the readback, and what Start made. onStarted tells the board to read again. */
export function Door({ onStarted }: { onStarted?: () => void }) {
  const [words, setWords] = useState('');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  // The words that the plan reads back, as the person sent them.
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState<Started | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const done = useRef<HTMLDivElement>(null);
  // What Start made takes the focus, where the readback stood, so the keys go on from there.
  useEffect(() => {
    if (started && done.current) done.current.focus();
  }, [started]);
  const read = async (agent?: string, tell?: TaskTell) => {
    const w = words.trim();
    if (!w) {
      setError('Say what you need done.');
      if (box.current) box.current.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const same = !!plan && asked === w;
      setPlan(await api.planTask(w, agent || (same && plan!.who[0] ? plan!.who[0].agent : undefined), tell || (same ? plan!.tell : undefined)));
      setAsked(w);
      setStarted(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError(e.message);
      else showError(e);
    }
    setBusy(false);
  };
  const stale = !!plan && asked !== words.trim();
  return (
    <div class="door-top">
      <form
        class="door"
        onSubmit={(e) => {
          e.preventDefault();
          read();
        }}
      >
        <label class="t-heading door-ask" for="door-words">
          What do you need done?
        </label>
        <TextArea
          id="door-words"
          ref={box}
          rows={3}
          value={words}
          invalid={!!error}
          placeholder="Every Monday at 9am, sum up what our competitors shipped last week."
          onInput={(e) => {
            setWords((e.target as HTMLTextAreaElement).value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              read();
            }
          }}
        />
        {error && (
          <p class="field-error" role="alert">
            {error}
          </p>
        )}
        <div class="door-keys">
          <Button type="submit" kind={plan && !stale ? 'secondary' : 'primary'} aria-disabled={busy || undefined}>
            {plan && stale ? 'Read it back again' : 'Read it back'}
          </Button>
        </div>
      </form>
      {/* What Start made stands where the readback stood, above the templates. */}
      {started && (
        <div class="door-started" ref={done} tabIndex={-1} role="status">
          <Card quiet title={started.title} class="readback-done">
            <p>{started.said}</p>
            <p>
              <a href={started.href}>Open it</a>
            </p>
          </Card>
        </div>
      )}
      {plan && !stale ? (
        <Readback
          plan={plan}
          busy={busy}
          onPlan={(agent, tell) => read(agent, tell)}
          onStarted={(s) => {
            setStarted(s);
            setPlan(null);
            setWords('');
            if (onStarted) onStarted();
          }}
        />
      ) : (
        !plan && (
          <section class="door-templates" aria-labelledby="templates-title">
            <h2 class="t-sub" id="templates-title">
              Or start from
            </h2>
            <div class="door-picks">
              {TEMPLATES.map((t) => (
                <Button
                  kind="secondary"
                  size="s"
                  onClick={() => {
                    setWords(t.words);
                    setPlan(null);
                    setError('');
                    if (box.current) box.current.focus();
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
