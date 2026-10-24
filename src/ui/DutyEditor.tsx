// New duty and Edit, at #duties/new and #duties/<name>/edit. The form goes
// in the order of the design: Who, When, Check first, What, Limits, While
// you are away, and Tell me about. When is a sentence with choices,
// presets, a box for plain words, and two optional dates, or an event of
// the fleet in words. The front reads the start back: the page sends the
// form with PUT ?dryRun=true and shows the readback and the next five
// times, and Save duty shows them again before it saves. What asks the
// agent, posts in a bridge that stays open, opens a bridge from a
// playbook, or asks the manager. A message holds its placeholders as words
// in brackets, such as [Today's date], and nobody types a brace. A duty
// needs a budget: the page never fills one.
//
// GET /v1/duties/options names the events, the actions, the looks of a
// check, and the secrets that the front serves now, and the editor offers
// nothing else. A duty keeps a choice that it holds, so an edit never drops
// it. A problem of the front that names a field shows beside the field,
// and one with no field shows at the top. Make this a duty opens the form
// with the agent and the message of a chat or a bridge, from the address.
// Tell me about also offers the shared channels of the operator, from GET
// /v1/notifications, and keeps a shared channel that the duty names.

import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError, browserZone } from '../api/client';
import type { Day, Duty, DutyDryRun } from '../api/types';
import { go, hrefOf, type DutySeed } from '../lib/route';
import {
  AT_TIMES,
  CATCH_UPS,
  DAYS,
  EVENT_FIELDS,
  EVERY_WEEKS,
  MONTH_DAYS,
  PLACEHOLDERS,
  PRESETS,
  REPEATS,
  SPANS,
  TIMEOUTS,
  WAITS,
  actOf,
  applyPreset,
  checkOf,
  channelWords,
  channelsIn,
  checkWords,
  chipText,
  domOf,
  dutyProblems,
  eventLabel,
  eventOf,
  eventWords,
  formErrors,
  formOf,
  hasCheck,
  limitWords,
  monthDayOf,
  nameOf,
  nameReason,
  nextWords,
  presetOf,
  recordOf,
  scheduleOf,
  seededForm,
  sortDays,
  spanText,
  splitProblem,
  startWords,
  whenError,
  whenFormOf,
  withChoice,
  zoneWords,
  zonesOf,
  type Act,
  type DutyForm,
  type DutySlot,
  type EventForm,
  type FormErrors,
  type Placeholder,
  type WhenForm,
} from '../lib/duties';
import { useSelect } from '../state/store';
import { membersOf } from '../state/reducer';
import { loadBridge } from '../state/actions';
import { FALLBACK, loadDuties, loadDutyOptions, loadDuty, loadSharedChannels, saveDuty, useDuties } from '../state/duties';
import { showError } from './notice';
import { Confirm } from './common';
import { Picker } from './Picker';
import { CheckFirst } from './DutyCheck';
import { PlaybookPick, PlaybookShelf } from './Playbooks';
import { Button, Choices, Field, IconButton, Input, Mark, PaneHeader, TextArea, buttonClass } from './primitives';

/** The wait after a change of When before the page asks the front to read it back. A test sets it to 0. */
export const timing = { preview: 400 };

/**
 * The name of a draft: a new duty that has no name yet, or a name that
 * cannot name a duty. Its dry run goes to PUT /v1/duties/new?dryRun=true,
 * and the front skips the problem of the name there. Write the check for
 * me of a duty that is not saved yet goes to /v1/duties/new/write-check.
 */
const DRAFT = 'new';

/** The words of each action, as the choice of What says them. */
const ACT_WORDS: Record<Act, string> = {
  ask: 'Ask the agent',
  post: 'Post in a bridge',
  open: 'Open a bridge from a playbook',
  manager: 'Ask the manager',
};

/** useAgentName is the name of an agent as its face names it. */
export function useAgentName(agent: string): string {
  return useSelect((s) => (agent && s.faces[agent] && s.faces[agent].displayName) || agent);
}

/** messageOf is the sentence of a failed call. */
const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'The action failed. Try it again.');

/** Said lists the problems of the front for one place of the form. */
function Said({ list }: { list?: string[] }) {
  if (!list || list.length === 0) return null;
  return (
    <ul class="duty-problems" role="alert">
      {list.map((x) => (
        <li>{x}</li>
      ))}
    </ul>
  );
}

/** joinError is the error of a field: the error of the form, else the problems of the front, as one text. */
const joinError = (own: string | undefined, said: string[] | undefined) => own || (said && said.length ? said.join(' ') : undefined);

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

/** Dates are the first and the last day of a schedule, behind one switch. A duty with no dates runs from now on. */
function Dates({ f, onChange, error }: { f: WhenForm; onChange: (f: WhenForm) => void; error?: string }) {
  const [on, setOn] = useState(() => !!(f.start || f.end));
  const turn = (v: boolean) => {
    setOn(v);
    if (!v) onChange({ ...f, start: undefined, end: undefined });
  };
  return (
    <div class="duty-dates">
      <label class="check">
        <input type="checkbox" checked={on} onChange={(e) => turn((e.target as HTMLInputElement).checked)} />
        <span>Only between two dates</span>
      </label>
      {on && (
        <div class="field-row">
          <Field label="First day">
            <Input type="date" value={f.start || ''} invalid={!!error} onInput={(e) => onChange({ ...f, start: (e.target as HTMLInputElement).value || undefined })} />
          </Field>
          <Field label="Last day" error={error}>
            <Input type="date" value={f.end || ''} invalid={!!error} onInput={(e) => onChange({ ...f, end: (e.target as HTMLInputElement).value || undefined })} />
          </Field>
        </div>
      )}
    </div>
  );
}

/** EventFields are the event of the fleet that starts a duty, in words, with its agent, its wait, or its path. */
function EventFields({ e, kinds, onChange, error }: { e: EventForm; kinds: string[]; onChange: (e: EventForm) => void; error?: string }) {
  const agents = useSelect((s) => s.agents);
  const faces = useSelect((s) => s.faces);
  const fields = EVENT_FIELDS[e.kind] || [];
  const names = (agents || []).map((a) => a.name);
  if (e.agent && !names.includes(e.agent)) names.push(e.agent);
  return (
    <>
      <Field label="What happens" error={error} class="duty-narrow">
        <select class="recess" value={e.kind} aria-invalid={error ? true : undefined} onChange={(x) => onChange({ ...e, kind: (x.target as HTMLSelectElement).value })}>
          <option value="">Pick what happens</option>
          {kinds.map((k) => (
            <option value={k}>{eventLabel(k)}</option>
          ))}
        </select>
      </Field>
      {fields.includes('agent') && (
        <Field label="Of the agent" class="duty-narrow">
          <select class="recess" value={e.agent} onChange={(x) => onChange({ ...e, agent: (x.target as HTMLSelectElement).value })}>
            <option value="">Any agent</option>
            {names.map((n) => (
              <option value={n}>{(faces[n] && faces[n].displayName) || n}</option>
            ))}
          </select>
        </Field>
      )}
      {fields.includes('after') && (
        <Field label="Waits longer than" class="duty-narrow">
          <select class="recess" value={e.after || '1h'} onChange={(x) => onChange({ ...e, after: (x.target as HTMLSelectElement).value })}>
            {withChoice(WAITS, e.after, spanText).map(([v, w]) => (
              <option value={v}>{w}</option>
            ))}
          </select>
        </Field>
      )}
      {fields.includes('path') && (
        <Field label="Pages under" class="duty-narrow">
          <Input value={e.path} spellcheck={false} placeholder="Every page" onInput={(x) => onChange({ ...e, path: (x.target as HTMLInputElement).value })} />
        </Field>
      )}
    </>
  );
}

/** What the front said of the start: the answer of a dry run, a call that runs, or a failed call. */
interface Preview {
  answer: DutyDryRun | null;
  busy: boolean;
  error: string;
}

/**
 * Readback shows the start in words: the readback of the front, else the
 * words of an event, and the next five times, in the zone of the browser.
 * The problems of the front that name When show in their place.
 */
function Readback({ p, zone, fallback, said }: { p: Preview; zone: string; fallback?: string; said?: string[] }) {
  const a = p.answer;
  const readback = (a && a.readback) || '';
  // The problems of a save come first. Else those of the last read back.
  const problems = said && said.length ? said : a ? dutyProblems(a.problems).when || [] : [];
  const next = ((a && a.next) || []).slice(0, 5);
  const words = readback || fallback || '';
  return (
    <div class="duty-readback-box" aria-live="polite">
      {p.error ? (
        <p class="field-error">{p.error}</p>
      ) : problems.length ? (
        <ul class="duty-problems" role="alert">
          {problems.map((x) => (
            <li>{x}</li>
          ))}
        </ul>
      ) : !a && !fallback ? (
        <p class="t-meta">{p.busy ? 'Reading it back.' : ''}</p>
      ) : (
        <>
          {words && <p class="duty-readback">{words}</p>}
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

/* ---------- What ---------- */

/** BridgeFields are the bridge of the action post, among the open bridges, and the members that the message goes to. None is everyone. */
function BridgeFields({ bridge, to, onChange, error, toError }: { bridge: string; to: string[]; onChange: (p: { bridge?: string; to?: string[] }) => void; error?: string; toError?: string }) {
  const bridges = useSelect((s) => s.bridges);
  const roster = useSelect((s) => (bridge ? s.rosters[bridge] : undefined));
  const open = useMemo(() => bridges.order.map((id) => bridges.byId[id]).filter((b) => b && b.state === 'open'), [bridges]);
  useEffect(() => {
    if (bridge && !roster) loadBridge(bridge).catch(() => {});
  }, [bridge]);
  const members = membersOf(roster).filter((m) => m && !m.fired);
  const other = bridge && !open.some((b) => b.id === bridge) ? bridges.byId[bridge] : undefined;
  return (
    <>
      <Field label="Bridge" error={error} class="duty-narrow">
        <select class="recess" value={bridge} aria-invalid={error ? true : undefined} onChange={(e) => onChange({ bridge: (e.target as HTMLSelectElement).value, to: [] })}>
          <option value="">{open.length ? 'Pick a bridge' : 'No bridge is open'}</option>
          {open.map((b) => (
            <option value={b.id}>{b.title}</option>
          ))}
          {bridge && !open.some((b) => b.id === bridge) && <option value={bridge}>{other ? other.title + ', closed' : 'A bridge that you cannot see'}</option>}
        </select>
      </Field>
      {bridge && members.length > 0 && (
        <fieldset class="duty-to">
          <legend>Send to</legend>
          <div class="checks">
            {members.map((m) => (
              <label class="check">
                <input type="checkbox" checked={to.includes(m.handle)} onChange={(e) => onChange({ to: (e.target as HTMLInputElement).checked ? [...to, m.handle] : to.filter((h) => h !== m.handle) })} />
                <span>{m.handle}</span>
              </label>
            ))}
          </div>
          <p class="t-meta">{to.length ? (to.length === 1 ? '1 member reads it.' : to.length + ' members read it.') : 'Everyone on the bridge reads it.'}</p>
          {toError && (
            <span class="field-error" role="alert">
              {toError}
            </span>
          )}
        </fieldset>
      )}
    </>
  );
}

/* ---------- the editor ---------- */

/** DutyEditor is New duty, without a name, and Edit, with the name of the duty. A seed fills New duty from Make this a duty. */
export function DutyEditor({ name, seed }: { name?: string; seed?: DutySeed }) {
  const fresh = !name;
  const base = useDuties((s) => (name ? s.byName[name] : undefined));
  const gone = useDuties((s) => (name ? !!s.gone[name] : false));
  const [failed, setFailed] = useState('');
  useEffect(() => {
    loadDutyOptions().catch(() => {});
    loadSharedChannels().catch(() => {});
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
  return <EditorForm key={(name || '') + '\n' + JSON.stringify(seed || {})} name={name} seed={seed} base={base || null} heading={heading} back={back} />;
}

interface FormProps {
  name?: string;
  seed?: DutySeed;
  base: Duty | null;
  heading: string;
  back: { href: string; label: string; to: 'list' | 'here' };
}

/** The problems of the front by the place of the form that shows them. */
type Problems = Partial<Record<DutySlot | 'top', string[]>>;

function EditorForm({ name, seed, base: read, heading, back }: FormProps) {
  const fresh = !name;
  // The form keeps the duty that it opened with, so a later read of the duty
  // never changes the revision that a save names: a change in the meantime
  // answers 409.
  const [base] = useState(read);
  const zone = useMemo(browserZone, []);
  const list = useDuties((s) => s.list);
  const options = useDuties((s) => s.options) || FALLBACK;
  const loaded = useDuties((s) => !!s.options);
  const shared = useDuties((s) => s.shared);
  const [f, setF] = useState<DutyForm>(() => (base ? formOf(base, zone) : seededForm(seed, zone)));
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [problems, setProblems] = useState<Problems>({});
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
  const faces = useSelect((s) => s.faces);
  const tagline = useSelect((s) => (f.agent && s.faces[f.agent] ? s.faces[f.agent].tagline : ''));
  const keepsWhen = !!(base && base.when && base.when.webhook);
  const shownName = f.nameOwn ? f.name : nameOf(f.act === 'open' ? f.goal || f.playbook : f.message);
  // The reason of a name that cannot name a duty, shown as the person types, before a save.
  const nameWhy = fresh && shownName.trim() ? nameReason(shownName.trim(), []) : '';
  const pathName = name || (shownName.trim() && !nameWhy ? shownName.trim() : DRAFT);
  const record = () => recordOf(f, base, pathName);
  const nameOfAgent = (a: string) => (faces[a] && faces[a].displayName) || a;

  // The choices that the front serves, and the choice that the duty holds, so an edit keeps it.
  const baseEvent = base && base.when && base.when.event ? base.when.event.kind : '';
  const kinds = useMemo(() => [...options.events, ...(baseEvent && !options.events.includes(baseEvent) ? [baseEvent] : [])], [options, baseEvent]);
  const baseAct = base ? actOf(base.do) : '';
  const acts = useMemo(() => (['ask', 'post', 'open', 'manager'] as Act[]).filter((a) => options.actions.includes(a) || a === baseAct || a === 'ask'), [options, baseAct]);
  const lookOn = options.looks.length > 0 || hasCheck(f.check);
  // The shared channels of the operator, and each one that the duty names, so an edit keeps it.
  const tellTo = useMemo(() => {
    const out = (shared || []).map((c) => ({ name: c.name, words: channelWords(c.label || c.name) }));
    const held = base && base.notify ? [...channelsIn(base.notify.failure), ...channelsIn(base.notify.needsYou)] : [];
    for (const n of held) if (!out.some((c) => c.name === n)) out.push({ name: n, words: channelWords(n) });
    return out;
  }, [shared, base]);
  const toggle = (list: string[], name: string, on: boolean) => (on ? [...list.filter((x) => x !== name), name] : list.filter((x) => x !== name));

  // An action that Make this a duty brought and that the front does not serve becomes Ask the agent, with the same message.
  useEffect(() => {
    if (loaded && !acts.includes(f.act)) setF((x) => ({ ...x, act: 'ask' }));
  }, [loaded]);

  const patch = (p: Partial<DutyForm>) => {
    setF((x) => ({ ...x, ...p }));
    if (errors) setErrors(null);
    if (Object.keys(problems).length) setProblems({});
  };
  // A change of the sentence drops the words that the front read back without a schedule.
  const setWhen = (when: WhenForm) => patch({ when, say: '' });

  // The front reads the start back a moment after each change of When.
  const whenKey = f.start === 'event' ? 'event\n' + JSON.stringify(eventOf(f.event)) : JSON.stringify(scheduleOf(f.when)) + '\n' + f.say;
  const asked = useRef('');
  const seq = useRef(0);
  useEffect(() => {
    if (keepsWhen) return;
    const n = ++seq.current;
    if (f.start === 'event' ? !f.event.kind : !f.say && whenError(f.when)) {
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
        // The dates of the form stay when the words name none.
        const when = whenFormOf({ ...sched, start: sched.start || f.when.start, end: sched.end || f.when.end }, zone);
        asked.current = JSON.stringify(scheduleOf(when)) + '\n';
        setF((x) => ({ ...x, when, say: '' }));
        setPreview({ answer: a, busy: false, error: '' });
      } else if (a.readback) {
        asked.current = JSON.stringify(scheduleOf(f.when)) + '\n' + said;
        setF((x) => ({ ...x, say: said }));
        setPreview({ answer: a, busy: false, error: '' });
      } else {
        const ps = dutyProblems(a.problems);
        setWordsProblems(ps.when || (a.problems || []).map((x) => splitProblem(x).text).filter(Boolean));
        if (n === seq.current) setPreview((p) => ({ ...p, busy: false }));
      }
    } catch (e) {
      setWordsProblems([messageOf(e)]);
    }
    setWordsBusy(false);
  };

  /** insert puts the words of a placeholder at the caret of the message, or of the goal of a playbook. */
  const insert = (p: Placeholder) => {
    const el = box.current;
    const field = f.act === 'open' ? 'goal' : 'message';
    const now = f[field];
    const text = chipText(p);
    const start = el ? el.selectionStart : now.length;
    const end = el ? el.selectionEnd : start;
    patch({ [field]: now.slice(0, start) + text + now.slice(end) });
    setTimeout(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  /** showFirst brings the first error or problem of the form into sight, and the focus to its field. */
  const showFirst = () =>
    setTimeout(() => {
      const bad = formRef.current && (formRef.current.querySelector('[aria-invalid="true"], .field-error, .duty-problems') as HTMLElement | null);
      if (bad && typeof bad.scrollIntoView === 'function') bad.scrollIntoView({ block: 'center' });
      if (bad && bad.matches('input, textarea, select')) bad.focus();
    }, 0);

  /** takeProblems shows the problems of the front beside their fields, and opens Check first for one of its own. */
  const takeProblems = (ps: unknown[] | null | undefined): boolean => {
    const by = dutyProblems(ps);
    setProblems(by);
    if (by.check) setCheckOpen(true);
    const any = Object.keys(by).length > 0;
    if (any) showFirst();
    return any;
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const errs = formErrors(f, { fresh, name: shownName.trim(), taken: fresh && list ? list.map((d) => d.name) : [], keepsWhen });
    if (Object.keys(errs).length) {
      setErrors(errs);
      if (errs.count || errs.where) setCheckOpen(true);
      showFirst();
      return;
    }
    setBusy(true);
    try {
      const a = await api.dryRunDuty(pathName, record());
      if (!takeProblems(a.problems)) setReview(a);
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
      if (err instanceof ApiError && err.status === 409) {
        setProblems({ top: ['This duty changed since you opened it. Open it again, then make your change.'] });
        showFirst();
      } else if (err instanceof ApiError && err.status === 400 && err.problem && Array.isArray(err.problem.problems) && err.problem.problems.length) takeProblems(err.problem.problems as unknown[]);
      else showError(err);
    }
    setBusy(false);
  };

  const err = errors || {};
  const pr = problems;
  const chips = PLACEHOLDERS.filter((p) => p.chip && (p.key !== 'found' || hasCheck(f.check)) && (p.key !== 'event' || f.start === 'event'));
  const reviewed = review ? (review.duty && review.duty.checkFirst) || checkOf(f.check) : null;
  const eventSaid = f.start === 'event' && f.event.kind ? eventWords(eventOf(f.event), nameOfAgent) + '.' : '';
  const messageLabel = f.act === 'post' ? 'Message' : f.act === 'manager' ? 'Ask the manager' : 'Ask ' + (agentName || 'the agent');
  return (
    <section class="screen duty-edit" aria-labelledby="duty-edit-title">
      <PaneHeader id="duty-edit-title" title={heading} size="title" level={1} back={back} />
      <form class="scroll pad" ref={formRef} onSubmit={submit} noValidate>
        <div class="make duty-form">
          {pr.top && pr.top.length > 0 && (
            <div class="duty-problems-box" role="alert">
              <p>The duty cannot save yet.</p>
              <ul class="duty-problems">
                {pr.top.map((x) => (
                  <li>{x}</li>
                ))}
              </ul>
            </div>
          )}

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
              <Button ref={pickKey} size="s" icon={f.agent ? undefined : 'plus'} aria-haspopup="dialog" aria-expanded={picking} aria-invalid={err.agent || pr.agent ? true : undefined} onClick={() => setPicking(!picking)}>
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
            <Said list={pr.agent} />
          </section>

          <section class="duty-sec" aria-labelledby="duty-when-head">
            <h2 class="t-sub duty-sec-head" id="duty-when-head">
              When
            </h2>
            {keepsWhen ? (
              <p class="duty-readback">{startWords(base!)}. The page keeps this start.</p>
            ) : (
              <>
                {kinds.length > 0 && (
                  <Choices
                    name="duty-start"
                    label="What starts the duty"
                    value={f.start}
                    options={[
                      { id: 'schedule', label: 'On a schedule' },
                      { id: 'event', label: 'When something happens' },
                    ]}
                    onChange={(start) => patch({ start })}
                  />
                )}
                {f.start === 'event' ? (
                  <EventFields e={f.event} kinds={kinds} onChange={(event) => patch({ event })} error={err.when} />
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
                    <Dates f={f.when} onChange={setWhen} error={err.dates} />
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
                  </>
                )}
                <Readback p={preview} zone={zone} fallback={eventSaid} said={pr.when} />
              </>
            )}
          </section>

          {lookOn && (
            <CheckFirst
              check={f.check}
              onChange={(check) => patch({ check })}
              agent={f.agent}
              agentName={agentName || 'the agent'}
              pathName={pathName}
              writeName={name || DRAFT}
              record={record}
              options={options}
              error={err.count}
              whereError={err.where}
              problems={pr.check}
              onAgentProblems={(agent) => setProblems((x) => (agent.length ? { ...x, agent } : x.agent ? { ...x, agent: undefined } : x))}
              open={checkOpen}
              onToggle={setCheckOpen}
            />
          )}

          <section class="duty-sec" aria-labelledby="duty-what-head">
            <h2 class="t-sub duty-sec-head" id="duty-what-head">
              What
            </h2>
            {acts.length > 1 && <Choices name="duty-do" label="What the duty does" value={f.act} options={acts.map((a) => ({ id: a, label: ACT_WORDS[a] }))} onChange={(act) => patch({ act })} />}
            {f.act === 'post' && <BridgeFields bridge={f.bridge} to={f.to} onChange={(p) => patch(p)} error={joinError(err.bridge, pr.bridge)} toError={joinError(undefined, pr.to)} />}
            {f.act === 'open' ? (
              <>
                <PlaybookPick value={f.playbook} onChange={(playbook) => patch({ playbook })} error={joinError(err.playbook, pr.playbook)} />
                <PlaybookShelf />
                <Field label="Goal" error={joinError(undefined, pr.goal)}>
                  <TextArea ref={box} rows={3} value={f.goal} placeholder="The goal of the playbook" onInput={(e) => patch({ goal: (e.target as HTMLTextAreaElement).value })} />
                </Field>
              </>
            ) : (
              <Field label={messageLabel} error={joinError(err.message, pr.message)}>
                <TextArea
                  ref={box}
                  rows={4}
                  value={f.message}
                  invalid={!!(err.message || pr.message)}
                  placeholder={f.act === 'post' ? 'Review what changed since [The last run].' : f.act === 'manager' ? "Check the backups of [Today's date] and tell me what failed." : "Write the report of [Today's date] to the wiki."}
                  onInput={(e) => patch({ message: (e.target as HTMLTextAreaElement).value })}
                />
              </Field>
            )}
            <div class="duty-chips" role="group" aria-label="Words that change each run">
              {chips.map((p) => (
                <Button size="s" icon="plus" aria-label={'Insert ' + p.words} onClick={() => insert(p)}>
                  {p.words}
                </Button>
              ))}
            </div>
            <Said list={pr.what} />
          </section>

          <section class="duty-sec" aria-labelledby="duty-limits-head">
            <h2 class="t-sub duty-sec-head" id="duty-limits-head">
              Limits
            </h2>
            <div class="field-row">
              <Field label="The most a run can cost" error={joinError(err.cost, pr.cost)}>
                <span class="duty-money">
                  <span aria-hidden="true">$</span>
                  <Input inputMode="decimal" value={f.cost} invalid={!!(err.cost || pr.cost)} placeholder="0.50" onInput={(e) => patch({ cost: (e.target as HTMLInputElement).value })} />
                </span>
              </Field>
              <Field label="Most turns" error={joinError(err.turns, pr.turns)}>
                <Input type="number" min={1} inputMode="numeric" value={f.turns} invalid={!!(err.turns || pr.turns)} placeholder="Optional" onInput={(e) => patch({ turns: (e.target as HTMLInputElement).value })} />
              </Field>
              <Field label="The most per day" error={joinError(err.perDay, pr.perDay)}>
                <span class="duty-money">
                  <span aria-hidden="true">$</span>
                  <Input inputMode="decimal" value={f.perDay} invalid={!!(err.perDay || pr.perDay)} placeholder="Optional" onInput={(e) => patch({ perDay: (e.target as HTMLInputElement).value })} />
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
            <Said list={pr.limits} />
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
            <Said list={pr.away} />
          </section>

          <section class="duty-sec" aria-labelledby="duty-tell-head">
            <h2 class="t-sub duty-sec-head" id="duty-tell-head">
              Tell me about
            </h2>
            <div role="group" aria-labelledby={tellTo.length ? 'duty-tell-you' : 'duty-tell-head'}>
              {tellTo.length > 0 && (
                <p class="t-meta duty-tell-name" id="duty-tell-you">
                  You
                </p>
              )}
              <label class="check">
                <input type="checkbox" checked={f.failures} onChange={(e) => patch({ failures: (e.target as HTMLInputElement).checked })} />
                <span>Failures</span>
              </label>
              <label class="check">
                <input type="checkbox" checked={f.questions} onChange={(e) => patch({ questions: (e.target as HTMLInputElement).checked })} />
                <span>Questions</span>
              </label>
            </div>
            {tellTo.map((c, i) => (
              <div role="group" aria-labelledby={'duty-tell-' + i}>
                <p class="t-meta duty-tell-name" id={'duty-tell-' + i}>
                  {c.words}
                </p>
                <label class="check">
                  <input type="checkbox" checked={f.channelFailures.includes(c.name)} onChange={(e) => patch({ channelFailures: toggle(f.channelFailures, c.name, (e.target as HTMLInputElement).checked) })} />
                  <span>Failures</span>
                </label>
                <label class="check">
                  <input type="checkbox" checked={f.channelQuestions.includes(c.name)} onChange={(e) => patch({ channelQuestions: toggle(f.channelQuestions, c.name, (e.target as HTMLInputElement).checked) })} />
                  <span>Questions</span>
                </label>
              </div>
            ))}
            <Said list={pr.tell} />
          </section>

          {fresh && (
            <Field label="Name" error={joinError(err.name || nameWhy, pr.name)} class="duty-narrow">
              <Input value={shownName} maxLength={63} spellcheck={false} invalid={!!(err.name || nameWhy || pr.name)} placeholder="daily-report" onInput={(e) => patch({ name: (e.target as HTMLInputElement).value.toLowerCase(), nameOwn: true })} />
            </Field>
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
          <p class="duty-readback">{review.readback || startWords(record(), nameOfAgent) || (base ? startWords(base, nameOfAgent) : '')}</p>
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
          {/* The readback of the front holds the check already. Without it, the page says the check in its own words. */}
          {reviewed && !review.readback && <p>{checkWords(reviewed, agentName || 'the agent')}</p>}
          <p>{limitWords(record().limits)[0]}</p>
        </Confirm>
      )}
    </section>
  );
}
