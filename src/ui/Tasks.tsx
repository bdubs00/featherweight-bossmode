// The Tasks place: one door for what a person needs done, and the board of
// the tasks of the person. The person says the task in words, or starts
// from a template in words. Read it back asks the server for a plan, and
// the page shows it before anything starts: who does it, when, what it can
// cost, what it asks you, what it never bothers you with, when you hear of
// it, and where the result lands. The plan never names a cost, so Start
// refuses until the person types the most that a run can cost.
//
// Start sends the record of the plan to a route that exists already: a
// duty for a task that repeats, a bridge for a team, and a run for a task
// that runs once. The person never picks among duty, bridge, run, or chat.
// The board shows the same tasks in four columns, as a kanban board does:
// Needs you, Working, Coming up, and Done. A card opens the place that
// holds the work.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import type { TaskCard, TaskPlan, TaskTell } from '../api/types';
import { hrefOf } from '../lib/route';
import { nextShort, nextWords } from '../lib/duties';
import { since } from '../lib/words';
import type { Tone } from '../lib/presence';
import { loadDuties } from '../state/duties';
import { loadBridges } from '../state/actions';
import { showError, showSaid } from './notice';
import { Button, Card, Chip, Choices, Field, Input, Led, LineLed, Mark, PaneHeader, TextArea } from './primitives';

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

/** The columns of the board, in the order of attention. */
export const COLUMNS: { id: TaskCard['column']; label: string; empty: string }[] = [
  { id: 'needs', label: 'Needs you', empty: 'Nothing waits for you.' },
  { id: 'working', label: 'Working', empty: 'Nothing works now.' },
  { id: 'next', label: 'Coming up', empty: 'Nothing is planned.' },
  { id: 'done', label: 'Done', empty: 'Nothing done this week.' },
];

/** toneOf is the light of a status word of the board. */
export function toneOf(status: string): Tone {
  if (status === 'needs you') return 'amber';
  if (status === 'failed') return 'red';
  if (status === 'working') return 'green';
  return 'grey';
}

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
    return { title: plan.title, said: 'Started. ' + plan.who.map((w) => w.name).join(' and ') + ' work on it now.', href: hrefOf({ place: 'bridge', id: b.id, pane: 'none' }) };
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
            {plan.when.next.length > 0 && <p class="t-meta">Next: {plan.when.next.map((t) => nextWords(t)).join(', ')}</p>}
          </dd>
        </div>
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
      </dl>
    </Card>
  );
}

/** Board is the kanban board of the tasks of the person: four columns in the order of attention. */
export function Board({ cards }: { cards: TaskCard[] | null }) {
  return (
    <section class="board" aria-labelledby="board-title">
      <h2 class="t-heading" id="board-title">
        Your tasks
      </h2>
      <div class="board-cols">
        {COLUMNS.map((col) => {
          const mine = (cards || []).filter((c) => c.column === col.id);
          return (
            <section class={'board-col board-' + col.id} aria-labelledby={'col-' + col.id}>
              <h3 class="t-sub board-head" id={'col-' + col.id}>
                {col.label}
                <Chip tone={col.id === 'needs' && mine.length ? 'amber' : 'plain'} label={mine.length + (mine.length === 1 ? ' task' : ' tasks')}>
                  {mine.length}
                </Chip>
              </h3>
              {cards === null ? (
                <p class="t-meta board-empty">Loading.</p>
              ) : mine.length === 0 ? (
                <p class="t-meta board-empty">{col.empty}</p>
              ) : (
                <ul class="board-cards">
                  {mine.slice(0, 8).map((c) => (
                    <li>
                      <a class={'task-card' + (c.column === 'needs' ? ' need' : '')} href={c.open}>
                        <Mark agent={c.agents[0] || 'chat'} size={20} />
                        <span class="task-main">
                          <span class="task-title">{c.title}</span>
                          <span class="task-meta">
                            <Led tone={toneOf(c.status)} word={c.status} still={c.column !== 'needs'} />
                            <span title={new Date(c.at).toLocaleString()}>{c.column === 'next' ? nextShort(c.at) : since(c.at)}</span>
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                  {mine.length > 8 && <li class="t-meta board-more">{mine.length - 8} more</li>}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

/** TasksMain is the main pane of the Tasks place: the door, the readback or the templates, and the board. */
export function TasksMain() {
  const [words, setWords] = useState('');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  // The words that the plan reads back, as the person sent them.
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState<Started | null>(null);
  const [cards, setCards] = useState<TaskCard[] | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const loadBoard = () =>
    api
      .tasks()
      .then(setCards)
      .catch((e) => {
        setCards([]);
        showError(e);
      });
  useEffect(() => {
    loadBoard();
    const t = setInterval(loadBoard, 60_000);
    return () => clearInterval(t);
  }, []);
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
    <section class="screen tasks" aria-labelledby="tasks-title">
      <PaneHeader id="tasks-title" title="Tasks" size="title" level={1} focusable />
      <div class="scroll pad tasks-body">
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
        {plan && !stale ? (
          <Readback
            plan={plan}
            busy={busy}
            onPlan={(agent, tell) => read(agent, tell)}
            onStarted={(s) => {
              setStarted(s);
              setPlan(null);
              setWords('');
              showSaid(s.said, { href: s.href, label: 'Open it' });
              loadBoard();
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
        {started && (
          <Card quiet title={started.title} class="readback-done">
            <p>{started.said}</p>
            <p>
              <a href={started.href}>Open it</a>
            </p>
          </Card>
        )}
        <Board cards={cards} />
      </div>
    </section>
  );
}
