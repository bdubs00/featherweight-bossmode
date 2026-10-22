// The cards of a decision: an approval names the action, the target, and
// the effect, with Details, a thumb up that allows, a thumb down that
// denies, and Always allow. A question shows the form of its schema,
// because an answer is not a thumb.

import { useState } from 'preact/hooks';
import type { Decision } from '../api/types';
import { formOf, type Field } from '../lib/schema';
import { commandOf, decisionTitle, editOf, personName, rawInput, whyWords } from '../lib/words';
import { alwaysAllow, decide } from '../state/actions';
import { attempt } from './notice';
import { Icon } from './icons';
import { When } from './common';

/** canAlways reports whether a card offers Always allow, with the rule of /ui. */
export function canAlways(d: Decision): boolean {
  if (d.always !== undefined) return d.always;
  const r = d.reason || '';
  return !!d.tool && (r === 'default' || /^rule: ask /.test(r)) && !/^rule: ask (readonly|read-only|idempotent|destructive|parallel|parallelsafe)$/i.test(r);
}

/** DecidedLine says who decided and how. */
function DecidedLine({ d }: { d: Decision }) {
  const who = personName(d.decidedBy);
  const q = !!d.question;
  const words = q ? (d.state === 'allow' ? `${who} answered: ${d.answer || 'an answer'}` : `${who} declined the question`) : d.state === 'allow' ? `${who} allowed this` : `${who} denied this`;
  return (
    <p class={'decided ' + (d.state === 'allow' ? 'ok' : 'bad')}>
      <Icon name={d.state === 'allow' ? 'check' : 'cross'} />
      <span>
        {words}
        {d.decidedAt && (
          <>
            {', '}
            <When at={d.decidedAt} />
          </>
        )}
        {d.note && !q ? '. Note: ' + d.note : ''}
      </span>
    </p>
  );
}

export function ApprovalCard({ d, who, onDecide }: { d: Decision; who: string; onDecide?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const pending = d.state === 'pending';
  const cmd = commandOf(d.input);
  const edit = editOf(d.input);
  const effect = d.effect && !(cmd && d.effect.includes(cmd)) ? d.effect : '';
  const why = whyWords(d.reason);
  const raw = rawInput(d.input);
  const go = async (kind: 'allow' | 'deny' | 'always') => {
    setBusy(true);
    const ok = await attempt(() => (kind === 'always' ? alwaysAllow(d.run, d.id, note || undefined) : decide(d.run, d.id, kind, note || undefined)));
    setBusy(false);
    if (ok && onDecide) onDecide();
  };
  return (
    <div class={'decide' + (pending ? '' : ' done')}>
      <p class="kick">Permission</p>
      <h3>{decisionTitle(who, d)}</h3>
      {edit && <p class="target">{edit.path}</p>}
      {cmd && <pre class="code">{cmd}</pre>}
      {effect && <p class="effect">{effect}</p>}
      {why && <p class="why">{why}</p>}
      <details class="more">
        <summary>Details</summary>
        {d.tool && (
          <p>
            Tool: <code>{d.tool}</code>
          </p>
        )}
        {d.reason && <p>Reason: {d.reason}</p>}
        {raw && <pre class="code">{raw}</pre>}
      </details>
      {pending ? (
        <>
          <label class="note-field">
            <span>Note for {who}, if you want</span>
            <input type="text" value={note} maxLength={1024} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
          </label>
          <div class="do three">
            <button type="button" class="btn" disabled={busy} onClick={() => go('deny')} aria-label={'Deny: thumb down for ' + who}>
              <Icon name="down" /> Deny
            </button>
            {canAlways(d) && (
              <button type="button" class="btn" disabled={busy} onClick={() => go('always')} title={`Allow this call, and let ${who} use ${d.tool} from now on without asking`}>
                Always allow
              </button>
            )}
            <button type="button" class="btn primary" disabled={busy} onClick={() => go('allow')} aria-label={(d.label || 'Allow') + ': thumb up for ' + who}>
              <Icon name="up" /> {d.label || 'Allow'}
            </button>
          </div>
        </>
      ) : (
        <DecidedLine d={d} />
      )}
    </div>
  );
}

function valueOf(el: HTMLInputElement | HTMLSelectElement, f: Field): unknown {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked;
  if (el.value.trim() === '') return undefined;
  if (el instanceof HTMLSelectElement) return JSON.parse(el.value);
  return f.type === 'number' || f.type === 'integer' ? Number(el.value) : el.value;
}

export function QuestionCard({ d, who, onDecide }: { d: Decision; who: string; onDecide?: () => void }) {
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
  return (
    <div class={'decide question' + (pending ? '' : ' done')}>
      <p class="kick">Question from {who}</p>
      <h3>{d.reason || 'A question for you'}</h3>
      {!pending ? (
        <DecidedLine d={d} />
      ) : form.kind === 'choices' ? (
        <>
          <div class={'pick' + (form.field.choices!.length === 2 ? ' two' : '')} role="group" aria-label={form.field.title}>
            {form.field.choices!.map((c, i) => (
              <button type="button" class="btn" disabled={busy} onClick={() => answer({ [form.field.key]: c })}>
                {form.field.labels[i]}
              </button>
            ))}
          </div>
          <button type="button" class="btn plain small decline" disabled={busy} onClick={decline}>
            Decline
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          {form.kind === 'text' ? (
            <textarea name="answer" aria-label="Your answer" placeholder="Your answer" required />
          ) : (
            form.fields.map((f) => (
              <label class={'fld' + (f.type === 'boolean' ? ' bool' : '')}>
                <span>{f.title}</span>
                {f.type === 'boolean' ? (
                  <input type="checkbox" name={f.key} />
                ) : f.choices ? (
                  <select name={f.key} required={f.required}>
                    {!f.required && <option value="">None</option>}
                    {f.choices.map((c, i) => (
                      <option value={JSON.stringify(c)}>{f.labels[i]}</option>
                    ))}
                  </select>
                ) : (
                  <input name={f.key} type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'} step={f.type === 'integer' ? '1' : 'any'} required={f.required} />
                )}
              </label>
            ))
          )}
          <div class="do">
            <button type="button" class="btn" disabled={busy} onClick={decline}>
              Decline
            </button>
            <button type="submit" class="btn primary" disabled={busy}>
              {d.label || 'Answer'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** DecisionCard picks the card of a decision. */
export function DecisionCard({ d, who, onDecide }: { d: Decision; who: string; onDecide?: () => void }) {
  return d.question || d.schema ? <QuestionCard d={d} who={who} onDecide={onDecide} /> : <ApprovalCard d={d} who={who} onDecide={onDecide} />;
}
