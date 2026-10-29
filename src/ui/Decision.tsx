// The cards of a decision. A card that waits has the only hard black edge
// in the channel, the only light that breathes, and the only orange key:
// the title Needs your decision, the sentence of the action, the plan of
// the call in plain form, the rule, Details, the Note field, and the keys
// Deny, Always allow, and the verb of the action, such as Run command or
// Open bridge. The plan says what a click does before Details, which
// holds the tool and the raw input. A card of the tool env says the
// package in plain words and what Allow does, with Deny and Allow only. A question shows the form of its schema,
// because an answer is not a thumb. A decided card turns quiet. A card in
// the state unknown shows its note and no key, and it can change in place.
// A card that the person may not decide shows no key either: it says who
// decides, so the page never offers an action that the front refuses.

import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Decision, Entry, Run } from '../api/types';
import { formOf, type Field as SchemaField } from '../lib/schema';
import { PLAN_TEXT_LINES, alwaysByRule, planOf, verbOf, type PlanFiles, type PlanText } from '../lib/decision';
import { commandOf, decisionTitle, editOf, envCallOf, envEffect, rawInput, toolName, whyWords } from '../lib/words';
import { whoName } from '../lib/lines';
import { useSelect } from '../state/store';
import { alwaysAllow, answerQuestion, decide, settleQuestion } from '../state/actions';
import { attempt, showSaid } from './notice';
import { Markdown, When } from './common';
import { Button, Card, Command, Field, Input, LineLed, TextArea } from './primitives';
import { Glyph } from './icons';


/**
 * DecisionTitle is the title of a card that waits. The chat-first page
 * (src/ui/chat) says Asks first, the word of its sidebar.
 */
export const DecisionTitle = createContext('Needs your decision');

/**
 * QuestionTitle is the title of a question that waits for the person. The
 * chat-first page says Asks you, beside Asks first.
 */
export const QuestionTitle = createContext('Needs your answer');

/** canAlways reports whether a card offers Always allow: as the front says, else by the rule of the front (alwaysByRule). */
export function canAlways(d: Decision): boolean {
  // A person approves each package, so a card of env never offers Always allow, whatever the front says.
  if (envCallOf(d.tool, d.input)) return false;
  if (d.always !== undefined) return d.always;
  return alwaysByRule(d);
}

/** RuleWords shows the rule of a card. The pattern of a command rule shows as code, as a person types it. */
function RuleWords({ reason }: { reason?: string }) {
  const why = whyWords(reason);
  if (!why) return null;
  const pattern = /^rule: ask [a-z0-9_.-]+: (.+)$/i.test(reason || '') && why.startsWith('Rule: ask before ') ? why.slice('Rule: ask before '.length) : '';
  return <span class="rule">{pattern ? <>Rule: ask before <code>{pattern}</code></> : why}</span>;
}

/**
 * Details shows the tool and the raw input of a call behind a key. The
 * rule line of the card already words the reason, so Details never shows
 * the rule id of the backend.
 */
function Details({ d, id }: { d: Decision; id: string }) {
  const [open, setOpen] = useState(false);
  const raw = rawInput(d.input);
  if (!d.tool && !raw) return null;
  return (
    <>
      <Button kind="quiet" size="s" class="details-key" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        Details
      </Button>
      {open && (
        <div class="details" id={id}>
          {d.tool && (
            <p>
              Tool: <code>{d.tool}</code>
            </p>
          )}
          {raw && <Command>{raw}</Command>}
        </div>
      )}
    </>
  );
}

/**
 * TextBlock shows a text of several lines of a call, such as a playbook,
 * as code: its first lines, and the whole text on Show all.
 */
function TextBlock({ t }: { t: PlanText }) {
  const [all, setAll] = useState(false);
  const lines = t.text.split('\n');
  const long = lines.length > PLAN_TEXT_LINES;
  return (
    <div class="plan-block">
      <div class="plan-block-head">
        <span class="plan-key">{t.key}</span>
        {long && (
          <Button kind="quiet" size="s" class="plan-toggle" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? 'Show less' : 'Show all'}
          </Button>
        )}
      </div>
      <Command class="plan-text">{all || !long ? t.text : lines.slice(0, PLAN_TEXT_LINES).join('\n') + '\n…'}</Command>
    </div>
  );
}

/** FilesBlock lists the files of a call by their names, and a name opens its text. */
function FilesBlock({ f }: { f: PlanFiles }) {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (name: string) => setOpen((o) => (o.includes(name) ? o.filter((x) => x !== name) : [...o, name]));
  return (
    <div class="plan-block">
      <span class="plan-key">{f.key}</span>
      <ul class="plan-files" aria-label={f.key}>
        {f.files.map((x) => {
          const on = open.includes(x.name);
          return (
            <li>
              <button type="button" class="plan-file" aria-expanded={on} onClick={() => toggle(x.name)}>
                <Glyph name="back" size={14} class={on ? 'turn-down' : 'turn-right'} />
                <code>{x.name}</code>
              </button>
              {on && <Command class="plan-text">{x.text}</Command>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * What says in plain form what a click on the primary key does: the command
 * of a shell call; the title, the goal, and the seats of a bridge; the path
 * and the first lines of a page; the task of a hand-off; or the top-level
 * fields of any other call, each cut to one line. JSON shows only in
 * Details.
 */
export function What({ d }: { d: Pick<Decision, 'tool' | 'input'> }) {
  const plan = planOf(d);
  switch (plan.kind) {
    case 'command':
      return <Command>{plan.command}</Command>;
    case 'bridge':
      return (
        <div class="plan">
          {plan.title && <p class="plan-title">{plan.title}</p>}
          {plan.goal && <Markdown text={plan.goal} class="plan-goal" refs headings={4} />}
          {plan.spawn && <p class="plan-meta">Fresh sandbox per seat</p>}
          {plan.seats.length > 0 && (
            <ul class="plan-seats" aria-label="Seats">
              {plan.seats.map((s) => (
                <li>
                  <b class="plan-handle">{s.handle}</b>
                  {s.agent && <span class="plan-agent">{s.agent}</span>}
                  {s.task && (
                    <span class="plan-task" title={s.task}>
                      {s.task}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'page':
      return (
        <div class="plan">
          <p class="plan-path">
            <code>{plan.path}</code>
          </p>
          {plan.summary && <p class="plan-goal">{plan.summary}</p>}
          {plan.lines.length > 0 && <Command class="plan-text">{plan.lines.join('\n') + (plan.more ? '\n…' : '')}</Command>}
        </div>
      );
    case 'handoff':
      return plan.task ? <Markdown text={plan.task} class="plan-goal plan-handoff" refs headings={4} /> : null;
    case 'fields':
      return (
        <div class="plan">
          {plan.fields.length > 0 && (
            <dl class="plan-fields">
              {plan.fields.map((f) => (
                <div class="plan-field">
                  <dt>{f.key}</dt>
                  <dd title={f.value}>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {plan.more > 0 && <p class="plan-meta">{plan.more === 1 ? '1 more field' : plan.more + ' more fields'}</p>}
          {plan.texts.map((t) => (
            <TextBlock key={t.key} t={t} />
          ))}
          {plan.files.map((f) => (
            <FilesBlock key={f.key} f={f} />
          ))}
        </div>
      );
  }
  return null;
}

/** effectLine is the effect of the backend when it adds to the plan: it does not repeat the command or the path of the call. */
function effectLine(d: Decision): string {
  if (!d.effect) return '';
  const cmd = commandOf(d.input);
  const edit = editOf(d.input);
  if ((cmd && d.effect.includes(cmd)) || (edit && d.effect.includes(edit.path))) return '';
  return d.effect;
}

/**
 * DecidedLine says who decided and how, with the note on a line of its own.
 * A card whose run stopped waiting without a decision has state deny, no
 * decider, and a note that says why.
 */
export function DecidedLine({ d }: { d: Decision }) {
  const me = useSelect((s) => (s.me ? s.me.principal : null));
  if (d.state === 'unknown') {
    return d.note ? <p class="decided">{d.note}</p> : null;
  }
  if (!d.decidedBy && d.state === 'deny') {
    return (
      <div class="decided">
        <LineLed tone="grey" />
        <p>
          No decision: {d.note || ''}
          {d.decidedAt && (
            <>
              {' '}
              <When at={d.decidedAt} />
            </>
          )}
        </p>
      </div>
    );
  }
  const who = whoName(d.decidedBy, me);
  const q = !!d.question;
  const words = q ? (d.state === 'allow' ? `${who} answered: ${d.answer || ''}` : `${who} declined the question`) : d.state === 'allow' ? `${who} allowed this` : `${who} denied this`;
  return (
    <div class="decided">
      <LineLed tone={d.state === 'allow' ? 'green' : 'red'} />
      <p>
        {words}
        {d.decidedAt && (
          <>
            {' '}
            <When at={d.decidedAt} />
          </>
        )}
      </p>
      {d.note && !q && <p class="note">{d.note}</p>}
    </div>
  );
}

let ids = 0;

export function ApprovalCard({ d, who, onDecide, settle }: { d: Decision; who: string; onDecide?: () => void; settle?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [id] = useState(() => 'details-' + ++ids);
  const pending = d.state === 'pending';
  // A card of env says the package in its sentence and what Allow does under it. It shows no rule and no raw input.
  const env = envCallOf(d.tool, d.input);
  const effect = env ? (pending ? envEffect(env) : '') : effectLine(d);
  const go = async (kind: 'allow' | 'deny' | 'always') => {
    setBusy(true);
    const ok = await attempt(() => (kind === 'always' ? alwaysAllow(d.run, d.id, note || undefined) : decide(d.run, d.id, kind, note || undefined)));
    setBusy(false);
    if (ok && onDecide) onDecide();
  };
  const title = decisionTitle(who, d as Decision);
  const head = useContext(DecisionTitle);
  return (
    <Card
      class={'decide' + (pending ? '' : ' done')}
      title={pending ? head : title}
      tone={pending ? 'amber' : undefined}
      quiet={!pending}
      settle={pending && settle}
      label={(pending ? head + ': ' : '') + title}
      actions={
        pending ? (
          <>
            <Button disabled={busy} onClick={() => go('deny')}>
              Deny
            </Button>
            {canAlways(d) && (
              <Button disabled={busy} onClick={() => go('always')} title={`Allow ${toolName(d.tool)} for ${who} from now on`}>
                Always allow
              </Button>
            )}
            <Button kind="primary" disabled={busy} onClick={() => go('allow')}>
              {verbOf(d)}
            </Button>
          </>
        ) : undefined
      }
    >
      {pending && <p>{title}.</p>}
      <What d={d} />
      {effect && <p class="effect">{effect}</p>}
      {!env && (
        <div class="rule-row">
          <RuleWords reason={d.reason} />
          <Details d={d} id={id} />
        </div>
      )}
      {pending ? (
        <Field label="Note">
          <Input value={note} maxLength={1024} placeholder="Optional" onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
        </Field>
      ) : (
        <DecidedLine d={d} />
      )}
    </Card>
  );
}

function valueOf(el: HTMLInputElement | HTMLSelectElement, f: SchemaField): unknown {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked;
  if (el.value.trim() === '') return undefined;
  if (el instanceof HTMLSelectElement) return JSON.parse(el.value);
  return f.type === 'number' || f.type === 'integer' ? Number(el.value) : el.value;
}

export function QuestionCard({ d, who, onDecide, settle }: { d: Decision; who: string; onDecide?: () => void; settle?: boolean }) {
  const [busy, setBusy] = useState(false);
  const form = formOf(d.schema);
  const pending = d.state === 'pending';
  const answer = async (content: unknown, note?: string) => {
    setBusy(true);
    const ok = await attempt(() => decide(d.run, d.id, 'allow', note, content));
    setBusy(false);
    if (ok && onDecide) onDecide();
  };
  const decline = async () => {
    setBusy(true);
    const ok = await attempt(() => decide(d.run, d.id, 'deny'));
    setBusy(false);
    if (ok && onDecide) onDecide();
  };
  const submit = (e: Event) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    if (form.kind === 'text') {
      const t = (f.elements.namedItem('answer') as HTMLTextAreaElement).value.trim();
      if (!t) return;
      // A free answer goes as the note, as /ui sends it.
      answer(undefined, t);
      return;
    }
    if (form.kind === 'fields') {
      const content: Record<string, unknown> = {};
      for (const fld of form.fields) {
        const el = f.elements.namedItem(fld.key) as HTMLInputElement | HTMLSelectElement | null;
        if (!el) continue;
        const v = valueOf(el, fld);
        if (v !== undefined) content[fld.key] = v;
      }
      answer(content);
    }
  };
  const question = d.reason || 'A question for you';
  const head = useContext(QuestionTitle);
  return (
    <Card
      class={'decide question' + (pending ? '' : ' done')}
      title={pending ? head : question}
      tone={pending ? 'amber' : undefined}
      quiet={!pending}
      settle={pending && settle}
      label={'Question from ' + who + ': ' + question}
    >
      {pending && (
        <p>
          {who} asks: <b>{question}</b>
        </p>
      )}
      {!pending ? (
        <DecidedLine d={d} />
      ) : form.kind === 'choices' ? (
        <>
          <div class={'pick' + (form.field.choices!.length === 2 ? ' two' : '')} role="group" aria-label={form.field.title}>
            {form.field.choices!.map((c, i) => (
              <Button disabled={busy} onClick={() => answer({ [form.field.key]: c })}>
                {form.field.labels[i]}
              </Button>
            ))}
          </div>
          <div class="card-actions">
            <Button kind="quiet" size="s" disabled={busy} onClick={decline}>
              Decline
            </Button>
          </div>
        </>
      ) : (
        <form class="answer" onSubmit={submit}>
          {form.kind === 'text' ? (
            <TextArea name="answer" aria-label="Your answer" placeholder="Your answer" required />
          ) : (
            form.fields.map((f) =>
              f.type === 'boolean' ? (
                <label class="check">
                  <input type="checkbox" name={f.key} />
                  <span>{f.title}</span>
                </label>
              ) : (
                <Field label={f.title}>
                  {f.choices ? (
                    <select class="recess" name={f.key} required={f.required}>
                      {!f.required && <option value="">None</option>}
                      {f.choices.map((c, i) => (
                        <option value={JSON.stringify(c)}>{f.labels[i]}</option>
                      ))}
                    </select>
                  ) : (
                    <Input name={f.key} type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'} step={f.type === 'integer' ? '1' : 'any'} required={f.required} />
                  )}
                </Field>
              ),
            )
          )}
          <div class="card-actions">
            <Button disabled={busy} onClick={decline}>
              Decline
            </Button>
            <Button type="submit" kind="primary" disabled={busy}>
              {d.label || 'Answer'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/**
 * AskCard is the card of a question that a seat asks you in its bridge: the
 * words of the seat, one key per choice, and a field for an answer in
 * words. It is the card of a question of the kernel (QuestionCard) for a
 * message: Needs your answer with the amber light, the choices as keys,
 * Your answer, and Answer. A key or Answer sends your answer to the seat,
 * in reply to its question, and the front gives it to the seat, which
 * starts its next turn. body draws the words of the seat, as the message
 * draws them. No answer needed ends the question without an answer: the
 * seat does not wake, and the card becomes the message that it is.
 */
export function AskCard({ bridge, e, who, body, settle }: { bridge: string; e: Entry; who: string; body: ComponentChildren; settle?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const choices = (e.ask && e.ask.choices) || [];
  const handle = (e.from.kind === 'agent' && e.from.handle) || who;
  const answer = async (words: string) => {
    const t = words.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await attempt(() => answerQuestion(bridge, handle, e.seq, t));
    setBusy(false);
    if (ok) setText('');
  };
  const noAnswer = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await attempt(() => settleQuestion(bridge, handle, e.seq));
    setBusy(false);
    if (ok) showSaid('The question of ' + handle + ' ended without an answer.');
  };
  const head = useContext(QuestionTitle);
  return (
    <Card class="decide question ask" title={head} tone="amber" settle={settle} label={'Question from ' + who}>
      <div class="ask-text">{body}</div>
      {choices.length > 0 && (
        <div class={'pick' + (choices.length === 2 ? ' two' : '')} role="group" aria-label={'Answers for ' + who}>
          {choices.map((c) => (
            <Button disabled={busy} onClick={() => answer(c)}>
              {c}
            </Button>
          ))}
        </div>
      )}
      <form
        class="answer"
        onSubmit={(ev) => {
          ev.preventDefault();
          answer(text);
        }}
      >
        <TextArea name="answer" aria-label="Your answer" placeholder="Your answer" value={text} onInput={(ev) => setText((ev.target as HTMLTextAreaElement).value)} />
        <div class="card-actions">
          <Button kind="quiet" disabled={busy} onClick={noAnswer}>
            No answer needed
          </Button>
          <Button type="submit" kind="primary" disabled={busy || !text.trim()}>
            Answer
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** mayDecide reports whether the person may decide a card of a run: yes, unless the front says that the person cannot operate the run. */
export function mayDecide(run: Pick<Run, 'can'> | undefined): boolean {
  return !(run && run.can && run.can.operate === false);
}

/**
 * WatchCard is a card that waits for a decision that the person may not
 * make. It is quiet: the light holds, the edge is a line, and no key
 * shows. It says who decides.
 */
function WatchCard({ d, who, agent }: { d: Decision; who: string; agent: string }) {
  const title = d.question ? d.reason || 'A question' : decisionTitle(who, d as Decision);
  return (
    <Card class="decide watch" title="Waits for a decision" tone="amber" quiet label={'Waits for a decision: ' + title}>
      <p>{title}.</p>
      {!d.question && <What d={d} />}
      <p class="note">{'An operator of ' + (agent || 'this agent') + ' decides it.'}</p>
    </Card>
  );
}

/** UnknownCard is a card whose decision the page cannot confirm: no key, and the note of the backend. */
function UnknownCard({ d, who }: { d: Decision; who: string }) {
  const title = d.question ? d.reason || 'A question for you' : decisionTitle(who, d as Decision);
  return (
    <Card class="decide done unknown" title={title} quiet label={title}>
      {!d.question && <What d={d} />}
      <DecidedLine d={d} />
    </Card>
  );
}

/**
 * DecisionCard picks the card of a decision. settle is true for a card that
 * arrives on the stream after the channel loaded: it settles once.
 */
export function DecisionCard({ d, who, onDecide, settle }: { d: Decision; who: string; onDecide?: () => void; settle?: boolean }) {
  const run = useSelect((s) => s.runs[d.run]);
  if (d.state === 'unknown') return <UnknownCard d={d} who={who} />;
  if (d.state === 'pending' && !mayDecide(run)) return <WatchCard d={d} who={who} agent={run ? run.agent : ''} />;
  return d.question || d.schema ? <QuestionCard d={d} who={who} onDecide={onDecide} settle={settle} /> : <ApprovalCard d={d} who={who} onDecide={onDecide} settle={settle} />;
}
