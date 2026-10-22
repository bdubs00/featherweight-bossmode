// The cards of a decision. A card that waits has the only hard black edge
// in the channel, the only light that breathes, and the only orange key:
// the title Needs your decision, the sentence of the action, the command,
// the rule, Details, the Note field, and the keys Deny, Always allow, and
// the label of the decision. A question shows the form of its schema,
// because an answer is not a thumb. A decided card turns quiet. A card in
// the state unknown shows its note and no key, and it can change in place.

import { useState } from 'preact/hooks';
import type { Decision } from '../api/types';
import { formOf, type Field as SchemaField } from '../lib/schema';
import { commandOf, decisionTitle, personName, rawInput, whyWords } from '../lib/words';
import { alwaysAllow, decide } from '../state/actions';
import type { DecisionA } from '../state/bridges-a';
import { attempt } from './notice';
import { When } from './common';
import type { Tone } from '../lib/presence';
import { Button, Card, Command, Field, Input, TextArea } from './primitives';

/** Light is the bare light beside a sentence that is its word, as the title light of a card. */
export function Light({ tone }: { tone: Tone }) {
  return <span class={'led led-' + tone} aria-hidden="true" />;
}

/** A decision of the shared type, or one with the state unknown of the backend. */
export type AnyDecision = Decision | DecisionA;

/** canAlways reports whether a card offers Always allow, with the rule of /ui. */
export function canAlways(d: AnyDecision): boolean {
  if (d.always !== undefined) return d.always;
  const r = d.reason || '';
  return !!d.tool && (r === 'default' || /^rule: ask /.test(r)) && !/^rule: ask (readonly|read-only|idempotent|destructive|parallel|parallelsafe)$/i.test(r);
}

/** RuleWords shows the rule of a card. The pattern of a command rule shows as code, as a person types it. */
function RuleWords({ reason }: { reason?: string }) {
  const why = whyWords(reason);
  if (!why) return null;
  const pattern = /^rule: ask [a-z0-9_.-]+: (.+)$/i.test(reason || '') && why.startsWith('Rule: ask before ') ? why.slice('Rule: ask before '.length) : '';
  return <span class="rule">{pattern ? <>Rule: ask before <code>{pattern}</code></> : why}</span>;
}

/** Details shows the tool, the reason, and the raw input of a call behind a key. */
function Details({ d, id }: { d: AnyDecision; id: string }) {
  const [open, setOpen] = useState(false);
  const raw = rawInput(d.input);
  if (!d.tool && !d.reason && !raw) return null;
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
          {d.reason && <p>Reason: {d.reason}</p>}
          {raw && <Command>{raw}</Command>}
        </div>
      )}
    </>
  );
}

/**
 * DecidedLine says who decided and how, with the note on a line of its own.
 * A card whose run stopped waiting without a decision has state deny, no
 * decider, and a note that says why.
 */
export function DecidedLine({ d }: { d: AnyDecision }) {
  if (d.state === 'unknown') {
    return d.note ? <p class="decided">{d.note}</p> : null;
  }
  if (!d.decidedBy && d.state === 'deny') {
    return (
      <div class="decided">
        <Light tone="grey" />
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
  const who = personName(d.decidedBy);
  const q = !!d.question;
  const words = q ? (d.state === 'allow' ? `${who} answered: ${d.answer || ''}` : `${who} declined the question`) : d.state === 'allow' ? `${who} allowed this` : `${who} denied this`;
  return (
    <div class="decided">
      <Light tone={d.state === 'allow' ? 'green' : 'red'} />
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

export function ApprovalCard({ d, who, onDecide, settle }: { d: AnyDecision; who: string; onDecide?: () => void; settle?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [id] = useState(() => 'details-' + ++ids);
  const pending = d.state === 'pending';
  const cmd = commandOf(d.input);
  const effect = d.effect && !(cmd && d.effect.includes(cmd)) ? d.effect : '';
  const go = async (kind: 'allow' | 'deny' | 'always') => {
    setBusy(true);
    const ok = await attempt(() => (kind === 'always' ? alwaysAllow(d.run, d.id, note || undefined) : decide(d.run, d.id, kind, note || undefined)));
    setBusy(false);
    if (ok && onDecide) onDecide();
  };
  const title = decisionTitle(who, d as Decision);
  return (
    <Card
      class={'decide' + (pending ? '' : ' done')}
      title={pending ? 'Needs your decision' : title}
      tone={pending ? 'amber' : undefined}
      quiet={!pending}
      settle={pending && settle}
      label={(pending ? 'Needs your decision: ' : '') + title}
      actions={
        pending ? (
          <>
            <Button disabled={busy} onClick={() => go('deny')}>
              Deny
            </Button>
            {canAlways(d) && (
              <Button disabled={busy} onClick={() => go('always')} title={`Allow ${d.tool} for ${who} from now on`}>
                Always allow
              </Button>
            )}
            <Button kind="primary" disabled={busy} onClick={() => go('allow')}>
              {d.label || 'Allow'}
            </Button>
          </>
        ) : undefined
      }
    >
      {pending && <p>{title}.</p>}
      {cmd && <Command>{cmd}</Command>}
      {effect && <p class="effect">{effect}</p>}
      <div class="rule-row">
        <RuleWords reason={d.reason} />
        <Details d={d} id={id} />
      </div>
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

export function QuestionCard({ d, who, onDecide, settle }: { d: AnyDecision; who: string; onDecide?: () => void; settle?: boolean }) {
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
  return (
    <Card
      class={'decide question' + (pending ? '' : ' done')}
      title={pending ? 'Needs your answer' : question}
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

/** UnknownCard is a card whose decision the page cannot confirm: no key, and the note of the backend. */
function UnknownCard({ d, who }: { d: AnyDecision; who: string }) {
  const title = d.question ? d.reason || 'A question for you' : decisionTitle(who, d as Decision);
  const cmd = commandOf(d.input);
  return (
    <Card class="decide done unknown" title={title} quiet label={title}>
      {cmd && <Command>{cmd}</Command>}
      <DecidedLine d={d} />
    </Card>
  );
}

/**
 * DecisionCard picks the card of a decision. settle is true for a card that
 * arrives on the stream after the channel loaded: it settles once.
 */
export function DecisionCard({ d, who, onDecide, settle }: { d: AnyDecision; who: string; onDecide?: () => void; settle?: boolean }) {
  if (d.state === 'unknown') return <UnknownCard d={d} who={who} />;
  return d.question || d.schema ? <QuestionCard d={d} who={who} onDecide={onDecide} settle={settle} /> : <ApprovalCard d={d} who={who} onDecide={onDecide} settle={settle} />;
}
