// New duty and Edit, at #duties/new and #duties/<name>/edit. The form goes
// in the order of the design: Who, When, Check first, What, Limits, While
// you are away, and Tell me about. When is a sentence with choices,
// presets, and a box for plain words. The front reads the schedule back:
// the page sends the form with PUT ?dryRun=true and shows the readback and
// the next five times, and Save duty shows them again before it saves. A
// message holds its placeholders as words in brackets, such as [Today's
// date], and nobody types a brace. A duty needs a budget: the page never
// fills one.
//
// The sections hold one action, Ask the agent, and the starts of a
// schedule. A duty of another action or start keeps it, so the actions and
// the starts of a later phase slot in as more choices.

import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError, browserZone } from '../api/client';
import type { CheckFound, Day, Duty, DutyDryRun } from '../api/types';
import { go, hrefOf } from '../lib/route';
import {
  AT_TIMES,
  CATCH_UPS,
  DAYS,
  EVERY_WEEKS,
  MONTH_DAYS,
  PLACEHOLDERS,
  PRESETS,
  REPEATS,
  SPANS,
  TIMEOUTS,
  applyPreset,
  checkFormOf,
  checkOf,
  checkWords,
  chipText,
  domOf,
  emptyCheck,
  emptyForm,
  formErrors,
  formOf,
  foundWords,
  hasCheck,
  itemWords,
  limitWords,
  monthDayOf,
  nameOf,
  nextWords,
  presetOf,
  problemText,
  recordOf,
  scheduleOf,
  sortDays,
  spanText,
  startWords,
  whenError,
  whenFormOf,
  whenProblems,
  whereWords,
  withChoice,
  zoneWords,
  zonesOf,
  type CheckForm,
  type DutyForm,
  type FormErrors,
  type Placeholder,
  type WhenForm,
} from '../lib/duties';
import { useSelect } from '../state/store';
import { useProfile } from '../state/profiles';
import { loadDuties, loadDuty, saveDuty, useDuties } from '../state/duties';
import { showError } from './notice';
import { Confirm } from './common';
import { Glyph } from './icons';
import { Picker } from './Picker';
import { Button, Choices, Field, Help, IconButton, Input, Mark, PaneHeader, TextArea, buttonClass } from './primitives';

/** The wait after a change of When before the page asks the front to read it back. A test sets it to 0. */
export const timing = { preview: 400 };

/** The name of the route of a dry run for a new duty that has no name yet. A dry run saves nothing. */
const DRAFT = 'new-duty';

/** useAgentName is the name of an agent as its face names it. */
export function useAgentName(agent: string): string {
  return useSelect((s) => (agent && s.faces[agent] && s.faces[agent].displayName) || agent);
}

/** messageOf is the sentence of a failed call. */
const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'The action failed. Try it again.');

/* ---------- When ---------- */

/** DayToggles is a key per day of the week, pressed for a day of the schedule. */
function DayToggles({ days, label, onChange }: { days: Day[]; label: string; onChange: (d: Day[]) => void }) {
  return (
    <span class="duty-days" role="group" aria-label={label}>
      {DAYS.map((d) => {
        const on = days.includes(d.id);
        return (
          <button type="button" class={buttonClass('secondary', 's', 'duty-day')} aria-pressed={on} aria-label={d.long} title={d.long} onClick={() => onChange(on ? days.filter((x) => x !== d.id) : sortDays([...days, d.id]))}>
            {d.short}
          </button>
        );
      })}
    </span>
  );
}

/** Times are the times of the day of a schedule, with Add a time, up to 12. */
function Times({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  return (
    <span class="duty-times">
      {times.map((t, i) => (
        <span class="duty-time">
          <Input type="time" step={60} value={t} aria-label={times.length > 1 ? 'Time ' + (i + 1) : 'Time'} onInput={(e) => onChange(times.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)))} />
          {times.length > 1 && <IconButton icon="close" label={'Remove time ' + (i + 1)} onClick={() => onChange(times.filter((_, j) => j !== i))} />}
        </span>
      ))}
      {times.length < 12 && (
        <Button size="s" kind="quiet" icon="plus" onClick={() => onChange([...times, times[times.length - 1] || '09:00'])}>
          Add a time
        </Button>
      )}
    </span>
  );
}

/** Sentence is the schedule as a sentence with choices: the repeat, then the days, the day of the month, the span, the times, or the hours. */
function Sentence({ f, onChange }: { f: WhenForm; onChange: (f: WhenForm) => void }) {
  const set = (p: Partial<WhenForm>) => onChange({ ...f, ...p });
  const md = monthDayOf(f.dayOfMonth);
  const spans = withChoice(
    SPANS.map((s) => [s, spanText(s)] as [string, string]),
    f.every,
    spanText,
  );
  const through = f.repeat === 'hourly' || f.repeat === 'every';
  return (
    <div class="duty-sentence">
      <select class="recess" aria-label="Repeat" value={f.repeat} onChange={(e) => set({ repeat: (e.target as HTMLSelectElement).value as WhenForm['repeat'] })}>
        {REPEATS.map((r) => (
          <option value={r.id}>{r.label}</option>
        ))}
      </select>
      {f.repeat === 'every' && (
        <select class="recess" aria-label="How often" value={f.every} onChange={(e) => set({ every: (e.target as HTMLSelectElement).value })}>
          {spans.map(([v, w]) => (
            <option value={v}>{w}</option>
          ))}
        </select>
      )}
      {f.repeat === 'weekly' && (
        <>
          <DayToggles days={f.days} label="Days" onChange={(days) => set({ days })} />
          <select class="recess" aria-label="Which weeks" value={String(f.everyWeeks)} onChange={(e) => set({ everyWeeks: Number((e.target as HTMLSelectElement).value) })}>
            {EVERY_WEEKS.map(([n, w]) => (
              <option value={String(n)}>{w}</option>
            ))}
          </select>
        </>
      )}
      {f.repeat === 'monthly' && (
        <>
          <select class="recess" aria-label="Day of the month" value={md.which} onChange={(e) => set({ dayOfMonth: domOf({ ...md, which: (e.target as HTMLSelectElement).value }) })}>
            {MONTH_DAYS.map(([v, w]) => (
              <option value={v}>{w}</option>
            ))}
          </select>
          {md.which.endsWith('-weekday') && (
            <select class="recess" aria-label="Weekday" value={md.weekday || 'mon'} onChange={(e) => set({ dayOfMonth: domOf({ ...md, weekday: (e.target as HTMLSelectElement).value as Day }) })}>
              {DAYS.map((d) => (
                <option value={d.id}>{d.long}</option>
              ))}
            </select>
          )}
        </>
      )}
      {AT_TIMES.includes(f.repeat) && (
        <>
          <span class="duty-word">at</span>
          <Times times={f.times} onChange={(times) => set({ times })} />
        </>
      )}
      {through && (
        <>
          <span class="duty-word">on</span>
          <DayToggles days={f.days} label="Days, none for every day" onChange={(days) => set({ days })} />
          <label class="check duty-between">
            <input type="checkbox" checked={!!f.between} onChange={(e) => set({ between: (e.target as HTMLInputElement).checked ? ['09:00', '17:00'] : null })} />
            <span>Only between</span>
          </label>
          {f.between && (
            <span class="duty-times">
              <span class="duty-time">
                <Input type="time" step={60} aria-label="From" value={f.between[0]} onInput={(e) => set({ between: [(e.target as HTMLInputElement).value, f.between![1]] })} />
              </span>
              <span class="duty-word">and</span>
              <span class="duty-time">
                <Input type="time" step={60} aria-label="To" value={f.between[1]} onInput={(e) => set({ between: [f.between![0], (e.target as HTMLInputElement).value] })} />
              </span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** What the front said of the schedule: the answer of a dry run, a call that runs, or a failed call. */
interface Preview {
  answer: DutyDryRun | null;
  busy: boolean;
  error: string;
}

/** Readback shows the schedule in words and the next five times, in the zone of the browser, or the problems of the schedule in words. */
function Readback({ p, zone }: { p: Preview; zone: string }) {
  const a = p.answer;
  const readback = (a && a.readback) || '';
  const problems = a ? whenProblems(a.problems, readback) : [];
  const next = ((a && a.next) || []).slice(0, 5);
  return (
    <div class="duty-readback-box" aria-live="polite">
      {p.error ? (
        <p class="field-error">{p.error}</p>
      ) : !a ? (
        <p class="t-meta">{p.busy ? 'Reading it back.' : ''}</p>
      ) : problems.length && !readback ? (
        <ul class="duty-problems" role="alert">
          {problems.map((x) => (
            <li>{x}</li>
          ))}
        </ul>
      ) : (
        <>
          <p class="duty-readback">{readback}</p>
          {next.length > 0 && (
            <>
              <p class="t-meta">Next, in your time ({zoneWords(zone)})</p>
              <ol class="duty-next">
                {next.map((t) => (
                  <li>
                    <time dateTime={t}>{nextWords(t)}</time>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Check first ---------- */

interface CheckProps {
  check: CheckForm;
  onChange: (c: CheckForm) => void;
  /** The agent of the duty, which writes the check and holds its tools. */
  agent: string;
  agentName: string;
  /** The name of the duty in the routes of a dry run and of Write the check. */
  pathName: string;
  /** The record of the whole form, for Try the check. */
  record: () => ReturnType<typeof recordOf>;
  /** The error of the count of items. */
  error?: string;
  open: boolean;
  onToggle: (open: boolean) => void;
}

/** The fields of a check by hand: what to look at, where the list is, what makes an item new, and when the agent wakes. */
function CheckFields({ check, onChange, agent, error }: Pick<CheckProps, 'check' | 'onChange' | 'agent' | 'error'>) {
  const set = (p: Partial<CheckForm>) => onChange({ ...check, ...p });
  const profile = useProfile(agent);
  const tools = useMemo(() => ((profile && profile.tools) || []).filter((t) => !t.includes('*')), [profile]);
  return (
    <>
      <Choices
        name="duty-look"
        legend="Look at"
        value={check.look}
        options={[
          { id: 'http', label: 'A website or API' },
          { id: 'tool', label: 'A tool of the agent' },
        ]}
        onChange={(look) => set({ look })}
      />
      {check.look === 'http' ? (
        <div class="field-row">
          <Field label="Address">
            <Input type="url" value={check.url} spellcheck={false} placeholder="https://example.com/api/queue" onInput={(e) => set({ url: (e.target as HTMLInputElement).value })} />
          </Field>
          <Field
            label={
              <>
                Secret{' '}
                <Help label="What the secret is">The name of a setting of the front that holds the token of the address. The page never sees the token.</Help>
              </>
            }
            class="narrow"
          >
            <Input value={check.secret} spellcheck={false} placeholder="Optional" onInput={(e) => set({ secret: (e.target as HTMLInputElement).value })} />
          </Field>
        </div>
      ) : (
        <>
          <Field label="Tool">
            <Input value={check.tool} list="duty-tools" spellcheck={false} placeholder="servicenow.query_incidents" onInput={(e) => set({ tool: (e.target as HTMLInputElement).value })} />
          </Field>
          <datalist id="duty-tools">
            {tools.map((t) => (
              <option value={t} />
            ))}
          </datalist>
          <div class="duty-input" role="group" aria-label="What the tool gets">
            {check.input.map((r, i) => (
              <div class="duty-input-row">
                <Input aria-label={'Name ' + (i + 1)} value={r.name} spellcheck={false} placeholder="query" onInput={(e) => set({ input: check.input.map((x, j) => (j === i ? { ...x, name: (e.target as HTMLInputElement).value } : x)) })} />
                <Input aria-label={'Value ' + (i + 1)} value={r.text} spellcheck={false} placeholder="priority<=2" onInput={(e) => set({ input: check.input.map((x, j) => (j === i ? { ...x, text: (e.target as HTMLInputElement).value } : x)) })} />
                <IconButton icon="close" label={'Remove value ' + (i + 1)} onClick={() => set({ input: check.input.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="s" kind="quiet" icon="plus" onClick={() => set({ input: [...check.input, { name: '', text: '' }] })}>
              Add a value
            </Button>
          </div>
        </>
      )}
      <div class="field-row">
        <Field label="Where the list is">
          <Input value={check.items} spellcheck={false} placeholder="result.records" onInput={(e) => set({ items: (e.target as HTMLInputElement).value })} />
        </Field>
        <Field label="What makes an item new">
          <Input value={check.key} spellcheck={false} placeholder="number" onInput={(e) => set({ key: (e.target as HTMLInputElement).value })} />
        </Field>
      </div>
      {check.where.length > 0 && (
        <p class="duty-where">
          <span>Keeps the items where {check.where.map(whereWords).join(', and ')}.</span>
          <Button size="s" kind="quiet" onClick={() => set({ where: [] })}>
            Remove the filters
          </Button>
        </p>
      )}
      <Choices
        name="duty-wake"
        legend="Wake the agent"
        value={check.wake}
        options={[
          { id: 'new', label: 'For new items' },
          { id: 'any', label: 'For any item' },
          { id: 'atLeast', label: 'At a count' },
        ]}
        onChange={(wake) => set({ wake })}
      />
      {check.wake === 'atLeast' && (
        <Field label="How many items" error={error} class="duty-narrow">
          <Input type="number" min={1} inputMode="numeric" value={check.count} invalid={!!error} onInput={(e) => set({ count: (e.target as HTMLInputElement).value })} />
        </Field>
      )}
    </>
  );
}

/** What Try the check found, or why it failed. */
type Tried = { found: CheckFound } | { error: string } | null;

/**
 * CheckFirst is the check before the duty wakes the agent, closed by
 * default. Write the check asks the agent for one from the words of the
 * person. Where the front has no such route, the key goes and the fields
 * by hand show. Try the check runs it once and says what it finds now.
 */
function CheckFirst(p: CheckProps) {
  const { check, onChange, agent, agentName, pathName, record, open, onToggle } = p;
  const [words, setWords] = useState('');
  const [writer, setWriter] = useState(true);
  const [writing, setWriting] = useState(false);
  const [wrote, setWrote] = useState('');
  const [writeError, setWriteError] = useState('');
  const [manual, setManual] = useState(() => hasCheck(check));
  const [tried, setTried] = useState<Tried>(null);
  const [trying, setTrying] = useState(false);
  const on = hasCheck(check);
  const write = async () => {
    if (!words.trim()) {
      setWriteError('Write what the agent waits for.');
      return;
    }
    if (!agent) {
      setWriteError('Pick the agent first. It writes the check.');
      return;
    }
    setWriting(true);
    setWriteError('');
    try {
      const w = await api.writeCheck(pathName, words.trim());
      onChange(checkFormOf(w.checkFirst));
      setWrote(w.readback || '');
      setTried(w.check ? { found: w.check } : null);
      setManual(true);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
        // The front has no route that writes a check: the fields by hand take its place.
        setWriter(false);
        setManual(true);
      } else setWriteError(messageOf(e));
    }
    setWriting(false);
  };
  const tryCheck = async () => {
    setTrying(true);
    try {
      const a = await api.dryRunDuty(pathName, record(), true);
      if (a.check) setTried({ found: a.check });
      else setTried({ error: ((a.problems || []).map(problemText).filter(Boolean)[0] as string) || 'The front ran no check.' });
    } catch (e) {
      setTried({ error: messageOf(e) });
    }
    setTrying(false);
  };
  const written = checkOf(check);
  // A change by hand makes the readback of the agent and the last try stale.
  const change = (c: CheckForm) => {
    setWrote('');
    setTried(null);
    onChange(c);
  };
  return (
    <details class="advanced duty-check" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary>
        <Glyph name="back" size={16} />
        Check first
      </summary>
      <div class="advanced-body">
        {writer && (
          <div class="duty-write">
            <Field label="Wake the agent only when" error={writeError}>
              <TextArea rows={2} value={words} invalid={!!writeError} placeholder="there is a new P1 or P2 in the Platform Ops queue" onInput={(e) => setWords((e.target as HTMLTextAreaElement).value)} />
            </Field>
            <div class="duty-actions">
              <Button size="s" disabled={writing} onClick={write}>
                {writing ? 'Writing the check' : 'Write the check'}
              </Button>
              {!manual && (
                <Button size="s" kind="quiet" onClick={() => setManual(true)}>
                  Set it up by hand
                </Button>
              )}
            </div>
          </div>
        )}
        {(manual || !writer) && <CheckFields check={check} onChange={change} agent={agent} error={p.error} />}
        {on && written && <p class="duty-readback">{wrote || checkWords(written, agentName)}</p>}
        {(manual || !writer) && (
          <div class="duty-actions">
            <Button size="s" disabled={!on || trying} onClick={tryCheck}>
              Try the check
            </Button>
            {on && (
              <Button
                size="s"
                kind="quiet"
                onClick={() => change(emptyCheck())}
              >
                Remove the check
              </Button>
            )}
          </div>
        )}
        {tried && 'found' in tried && (
          <div class="duty-found" role="status">
            <p>{foundWords(tried.found, agentName)}</p>
            {tried.found.found && tried.found.found.length > 0 && (
              <ul class="duty-items">
                {tried.found.found.slice(0, 20).map((it) => (
                  <li>{itemWords(it, check.key)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {tried && 'error' in tried && (
          <p class="field-error" role="alert">
            {tried.error}
          </p>
        )}
      </div>
    </details>
  );
}

/* ---------- the editor ---------- */

/** The words of an action of a later phase, which the editor keeps as it is. */
function doWords(d: Duty): string {
  if (d.do.post) return 'This duty posts in a bridge.';
  if (d.do.open) return 'This duty opens a bridge from the playbook ' + d.do.open.playbook + '.';
  if (d.do.manager) return 'This duty asks the manager.';
  return '';
}

/** DutyEditor is New duty, without a name, and Edit, with the name of the duty. */
export function DutyEditor({ name }: { name?: string }) {
  const fresh = !name;
  const base = useDuties((s) => (name ? s.byName[name] : undefined));
  const gone = useDuties((s) => (name ? !!s.gone[name] : false));
  const [failed, setFailed] = useState('');
  useEffect(() => {
    if (name) loadDuty(name).catch((e) => setFailed(messageOf(e)));
    else loadDuties().catch(() => {});
  }, [name]);
  const back = name ? { href: hrefOf({ place: 'duties', name }), label: 'the duty', to: 'here' as const } : { href: '#duties', label: 'Duties', to: 'list' as const };
  const heading = fresh ? 'New duty' : 'Edit duty';
  if (!fresh && (!base || base.source === 'file')) {
    return (
      <section class="screen duty-edit" aria-labelledby="duty-edit-title">
        <PaneHeader id="duty-edit-title" title={heading} size="title" level={1} back={back} />
        <div class="empty center">
          <p>{base ? 'This duty comes from the settings of the front. Change it there.' : gone ? 'This duty is not here. It was removed, or you cannot see it.' : failed || 'Loading the duty.'}</p>
        </div>
      </section>
    );
  }
  return <EditorForm key={name || ''} name={name} base={base || null} heading={heading} back={back} />;
}

interface FormProps {
  name?: string;
  base: Duty | null;
  heading: string;
  back: { href: string; label: string; to: 'list' | 'here' };
}

function EditorForm({ name, base: read, heading, back }: FormProps) {
  const fresh = !name;
  // The form keeps the duty that it opened with, so a later read of the duty
  // never changes the revision that a save names: a change in the meantime
  // answers 409.
  const [base] = useState(read);
  const zone = useMemo(browserZone, []);
  const list = useDuties((s) => s.list);
  const [f, setF] = useState<DutyForm>(() => (base ? formOf(base, zone) : emptyForm(zone)));
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [review, setReview] = useState<DutyDryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [checkOpen, setCheckOpen] = useState(() => !!(base && base.checkFirst));
  const [words, setWords] = useState('');
  const [wordsBusy, setWordsBusy] = useState(false);
  const [wordsProblems, setWordsProblems] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview>({ answer: null, busy: false, error: '' });
  const pickKey = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const agentName = useAgentName(f.agent);
  const tagline = useSelect((s) => (f.agent && s.faces[f.agent] ? s.faces[f.agent].tagline : ''));
  const keepsWhen = !!(base && base.when && (base.when.event || base.when.webhook));
  const keepsDo = !!(base && base.do && !base.do.ask && (base.do.post || base.do.open || base.do.manager));
  const shownName = f.nameOwn ? f.name : nameOf(f.message);
  const pathName = name || shownName.trim() || DRAFT;
  const record = () => recordOf(f, base, pathName);

  const patch = (p: Partial<DutyForm>) => {
    setF((x) => ({ ...x, ...p }));
    if (errors) setErrors(null);
    if (problems.length) setProblems([]);
  };
  // A change of the sentence drops the words that the front read back without a schedule.
  const setWhen = (when: WhenForm) => patch({ when, say: '' });

  // The front reads the schedule back a moment after each change of When.
  const whenKey = JSON.stringify(scheduleOf(f.when)) + '\n' + f.say;
  const asked = useRef('');
  const seq = useRef(0);
  useEffect(() => {
    if (keepsWhen) return;
    const n = ++seq.current;
    if (!f.say && whenError(f.when)) {
      setPreview({ answer: null, busy: false, error: '' });
      return;
    }
    // The words of the box filled the sentence with the schedule that the front read back, so the readback holds.
    if (asked.current === whenKey) {
      asked.current = '';
      return;
    }
    setPreview((p) => ({ ...p, busy: true }));
    const t = setTimeout(async () => {
      try {
        const a = await api.dryRunDuty(pathName, record());
        if (n !== seq.current) return;
        setPreview({ answer: a, busy: false, error: '' });
      } catch (e) {
        if (n === seq.current) setPreview({ answer: null, busy: false, error: messageOf(e) });
      }
    }, timing.preview);
    return () => clearTimeout(t);
  }, [whenKey, keepsWhen]);

  /** readWords sends the words of the box. A schedule in the answer fills the sentence, and the readback shows. */
  const readWords = async () => {
    const said = words.trim();
    if (!said) {
      setWordsProblems(['Write when, such as every weekday at 9am.']);
      return;
    }
    setWordsBusy(true);
    setWordsProblems([]);
    const n = ++seq.current;
    try {
      const a = await api.dryRunDuty(pathName, { ...record(), when: { say: said } });
      const sched = a.duty && a.duty.when && a.duty.when.schedule;
      if (sched) {
        const when = whenFormOf(sched, zone);
        asked.current = JSON.stringify(scheduleOf(when)) + '\n';
        setF((x) => ({ ...x, when, say: '' }));
        setPreview({ answer: a, busy: false, error: '' });
      } else if (a.readback) {
        asked.current = JSON.stringify(scheduleOf(f.when)) + '\n' + said;
        setF((x) => ({ ...x, say: said }));
        setPreview({ answer: a, busy: false, error: '' });
      } else {
        const ps = whenProblems(a.problems, '');
        setWordsProblems(ps.length ? ps : (a.problems || []).map(problemText).filter(Boolean));
        if (n === seq.current) setPreview((p) => ({ ...p, busy: false }));
      }
    } catch (e) {
      setWordsProblems([messageOf(e)]);
    }
    setWordsBusy(false);
  };

  /** insert puts the words of a placeholder at the caret of the message. */
  const insert = (p: Placeholder) => {
    const el = box.current;
    const text = chipText(p);
    const start = el ? el.selectionStart : f.message.length;
    const end = el ? el.selectionEnd : start;
    const message = f.message.slice(0, start) + text + f.message.slice(end);
    patch({ message });
    setTimeout(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const errs = formErrors(f, { fresh, name: pathName === DRAFT && !shownName ? '' : pathName, taken: fresh && list ? list.map((d) => d.name) : [], keepsWhen, keepsDo });
    if (Object.keys(errs).length) {
      setErrors(errs);
      if (errs.count) setCheckOpen(true);
      setTimeout(() => {
        const bad = formRef.current && (formRef.current.querySelector('[aria-invalid="true"], .field-error') as HTMLElement | null);
        if (bad && typeof bad.scrollIntoView === 'function') bad.scrollIntoView({ block: 'center' });
        if (bad && bad.matches('input, textarea')) bad.focus();
      }, 0);
      return;
    }
    setBusy(true);
    try {
      const a = await api.dryRunDuty(pathName, record());
      const ps = (a.problems || []).map(problemText).filter(Boolean);
      setProblems(ps);
      if (!ps.length) setReview(a);
    } catch (err) {
      showError(err);
    }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveDuty(pathName, record());
      setReview(null);
      setBusy(false);
      go({ place: 'duties', name: pathName });
      return;
    } catch (err) {
      setReview(null);
      if (err instanceof ApiError && err.status === 409) setProblems(['This duty changed since you opened it. Open it again, then make your change.']);
      else showError(err);
    }
    setBusy(false);
  };

  const err = errors || {};
  const chips = PLACEHOLDERS.filter((p) => p.chip && (p.key !== 'found' || hasCheck(f.check)));
  const reviewed = review ? (review.duty && review.duty.checkFirst) || checkOf(f.check) : null;
  return (
    <section class="screen duty-edit" aria-labelledby="duty-edit-title">
      <PaneHeader id="duty-edit-title" title={heading} size="title" level={1} back={back} />
      <form class="scroll pad" ref={formRef} onSubmit={submit} noValidate>
        <div class="make duty-form">
          <section class="duty-sec" aria-labelledby="duty-who-head">
            <h2 class="t-sub duty-sec-head" id="duty-who-head">
              Who
            </h2>
            {f.agent && (
              <p class="duty-who">
                <Mark agent={f.agent} size={32} />
                <span class="duty-who-text">
                  <span class="t-sub">{agentName}</span>
                  {tagline && <span class="t-meta">{tagline}</span>}
                </span>
              </p>
            )}
            <span class="pick-anchor">
              <Button ref={pickKey} size="s" icon={f.agent ? undefined : 'plus'} aria-haspopup="dialog" aria-expanded={picking} aria-invalid={err.agent ? true : undefined} onClick={() => setPicking(!picking)}>
                {f.agent ? 'Change the agent' : 'Pick an agent'}
              </Button>
              {picking && (
                <Picker
                  bridge=""
                  drafts={[]}
                  draftHandles={[]}
                  anchor={pickKey as RefObject<HTMLElement>}
                  place="key"
                  onClose={() => setPicking(false)}
                  onPick={(agent) => {
                    patch({ agent });
                    setPicking(false);
                    if (pickKey.current) pickKey.current.focus();
                  }}
                />
              )}
            </span>
            {err.agent && (
              <span class="field-error" role="alert">
                {err.agent}
              </span>
            )}
          </section>

          <section class="duty-sec" aria-labelledby="duty-when-head">
            <h2 class="t-sub duty-sec-head" id="duty-when-head">
              When
            </h2>
            {keepsWhen ? (
              <p class="duty-readback">{startWords(base!)}. The page keeps this start.</p>
            ) : (
              <>
                <div class="duty-presets" role="group" aria-label="Start from">
                  {PRESETS.map((p) => (
                    <Button size="s" aria-pressed={presetOf(f.when) === p.id && !f.say} onClick={() => setWhen(applyPreset(p, f.when))}>
                      {p.label}
                    </Button>
                  ))}
                </div>
                <Sentence f={f.when} onChange={setWhen} />
                {err.when && (
                  <span class="field-error" role="alert">
                    {err.when}
                  </span>
                )}
                <Field label="Time zone" class="duty-narrow">
                  <select class="recess" value={f.when.timeZone} onChange={(e) => setWhen({ ...f.when, timeZone: (e.target as HTMLSelectElement).value })}>
                    {zonesOf([zone, f.when.timeZone]).map((z) => (
                      <option value={z}>{zoneWords(z) + (z === zone ? ', your time' : '')}</option>
                    ))}
                  </select>
                </Field>
                <div class="duty-say">
                  <Field label="Say it in your own words" error={wordsProblems.length === 1 ? wordsProblems[0] : undefined}>
                    <Input
                      value={words}
                      placeholder="every other Tuesday at 3pm"
                      invalid={wordsProblems.length > 0}
                      onInput={(e) => setWords((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          readWords();
                        }
                      }}
                    />
                  </Field>
                  <Button size="s" disabled={wordsBusy} onClick={readWords}>
                    Read it back
                  </Button>
                </div>
                {wordsProblems.length > 1 && (
                  <ul class="duty-problems" role="alert">
                    {wordsProblems.map((x) => (
                      <li>{x}</li>
                    ))}
                  </ul>
                )}
                <Readback p={preview} zone={zone} />
              </>
            )}
          </section>

          <CheckFirst
            check={f.check}
            onChange={(check) => patch({ check })}
            agent={f.agent}
            agentName={agentName || 'the agent'}
            pathName={pathName}
            record={record}
            error={err.count}
            open={checkOpen}
            onToggle={setCheckOpen}
          />

          <section class="duty-sec" aria-labelledby="duty-what-head">
            <h2 class="t-sub duty-sec-head" id="duty-what-head">
              What
            </h2>
            {keepsDo ? (
              <p class="duty-readback">{doWords(base!)} The page keeps it.</p>
            ) : (
              <>
                <Field label={'Ask ' + (agentName || 'the agent')} error={err.message}>
                  <TextArea ref={box} rows={4} value={f.message} invalid={!!err.message} placeholder="Write the report of [Today's date] to the wiki." onInput={(e) => patch({ message: (e.target as HTMLTextAreaElement).value })} />
                </Field>
                <div class="duty-chips" role="group" aria-label="Words that change each run">
                  {chips.map((p) => (
                    <Button size="s" icon="plus" aria-label={'Insert ' + p.words} onClick={() => insert(p)}>
                      {p.words}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section class="duty-sec" aria-labelledby="duty-limits-head">
            <h2 class="t-sub duty-sec-head" id="duty-limits-head">
              Limits
            </h2>
            <div class="field-row">
              <Field label="The most a run can cost" error={err.cost}>
                <span class="duty-money">
                  <span aria-hidden="true">$</span>
                  <Input inputMode="decimal" value={f.cost} invalid={!!err.cost} placeholder="0.50" onInput={(e) => patch({ cost: (e.target as HTMLInputElement).value })} />
                </span>
              </Field>
              <Field label="Most turns" error={err.turns}>
                <Input type="number" min={1} inputMode="numeric" value={f.turns} invalid={!!err.turns} placeholder="Optional" onInput={(e) => patch({ turns: (e.target as HTMLInputElement).value })} />
              </Field>
              <Field label="The most per day" error={err.perDay}>
                <span class="duty-money">
                  <span aria-hidden="true">$</span>
                  <Input inputMode="decimal" value={f.perDay} invalid={!!err.perDay} placeholder="Optional" onInput={(e) => patch({ perDay: (e.target as HTMLInputElement).value })} />
                </span>
              </Field>
            </div>
            <Choices
              name="duty-overlap"
              legend="If the last run still works"
              value={f.overlap}
              options={[
                { id: 'skip', label: 'Skip it' },
                { id: 'queue', label: 'Run after it' },
                { id: 'allow', label: 'Run anyway' },
              ]}
              onChange={(overlap) => patch({ overlap })}
            />
            <Field label="Catch up a missed time" class="duty-narrow">
              <select class="recess" value={f.catchUp} onChange={(e) => patch({ catchUp: (e.target as HTMLSelectElement).value })}>
                {withChoice(CATCH_UPS, f.catchUp, (v) => 'Within ' + spanText(v)).map(([v, w]) => (
                  <option value={v}>{w}</option>
                ))}
              </select>
            </Field>
          </section>

          <section class="duty-sec" aria-labelledby="duty-away-head">
            <h2 class="t-sub duty-sec-head" id="duty-away-head">
              While you are away
            </h2>
            <Choices
              name="duty-decider"
              label="Who decides a question of a run"
              value={f.decider}
              options={[
                { id: 'manager', label: 'The manager decides' },
                { id: 'nobody', label: 'Nobody', meta: 'The question waits for you.' },
              ]}
              onChange={(decider) => patch({ decider })}
            />
            <p class="duty-sentence">
              <span class="duty-word">After</span>
              <select class="recess" aria-label="How long a question waits" value={f.timeout} onChange={(e) => patch({ timeout: (e.target as HTMLSelectElement).value })}>
                {withChoice(TIMEOUTS, f.timeout, spanText).map(([v, w]) => (
                  <option value={v}>{w}</option>
                ))}
              </select>
              <span class="duty-word">without an answer:</span>
              <select class="recess" aria-label="Then" value={f.then} onChange={(e) => patch({ then: (e.target as HTMLSelectElement).value as DutyForm['then'] })}>
                <option value="deny">Say no</option>
                <option value="cancel">Stop the run</option>
              </select>
            </p>
          </section>

          <section class="duty-sec" aria-labelledby="duty-tell-head">
            <h2 class="t-sub duty-sec-head" id="duty-tell-head">
              Tell me about
            </h2>
            <div role="group" aria-labelledby="duty-tell-head">
              <label class="check">
                <input type="checkbox" checked={f.failures} onChange={(e) => patch({ failures: (e.target as HTMLInputElement).checked })} />
                <span>Failures</span>
              </label>
              <label class="check">
                <input type="checkbox" checked={f.questions} onChange={(e) => patch({ questions: (e.target as HTMLInputElement).checked })} />
                <span>Questions</span>
              </label>
            </div>
          </section>

          {fresh && (
            <Field label="Name" error={err.name} class="duty-narrow">
              <Input value={shownName} maxLength={63} spellcheck={false} invalid={!!err.name} placeholder="daily-report" onInput={(e) => patch({ name: (e.target as HTMLInputElement).value.toLowerCase(), nameOwn: true })} />
            </Field>
          )}

          {problems.length > 0 && (
            <div class="duty-problems-box" role="alert">
              <p>The duty cannot save yet.</p>
              <ul class="duty-problems">
                {problems.map((x) => (
                  <li>{x}</li>
                ))}
              </ul>
            </div>
          )}

          <div class="form-end">
            <Button href={back.href}>Cancel</Button>
            <Button type="submit" kind="primary" disabled={busy}>
              Save duty
            </Button>
          </div>
        </div>
      </form>
      {review && (
        <Confirm title="Save this duty?" confirm="Save duty" busy={busy} onCancel={() => setReview(null)} onConfirm={save}>
          <p class="duty-readback">{review.readback || (base ? startWords(base) : '')}</p>
          {(review.next || []).length > 0 && (
            <>
              <p class="t-meta">Next, in your time</p>
              <ol class="duty-next">
                {(review.next || []).slice(0, 5).map((t) => (
                  <li>
                    <time dateTime={t}>{nextWords(t)}</time>
                  </li>
                ))}
              </ol>
            </>
          )}
          {reviewed && <p>{checkWords(reviewed, agentName || 'the agent')}</p>}
          <p>{limitWords(record().limits)[0]}</p>
        </Confirm>
      )}
    </section>
  );
}
