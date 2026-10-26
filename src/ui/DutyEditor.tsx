// New duty and Edit, at #duties/new and #duties/<name>/edit. The form goes
// in the order of the design: Who, When, Check first, What, Limits, While
// you are away, and Tell me about. When is a sentence with choices,
// presets, a box for plain words, and two optional dates, or an event of
// the fleet in words. The front reads the start back: the page sends the
// form with PUT ?dryRun=true and shows the readback and the next five
// times, and Save duty shows them again before it saves. What asks the
// agent, posts in a bridge that stays open, opens a bridge from a
// playbook, or asks the manager. A message holds its placeholders as words
// in brackets, such as [Today's date], and nobody types a brace. Limits
// follow the action. A duty that asks the agent or the manager needs a
// budget, and the page never fills one. A post spends nothing of its own,
// so it shows no budget. An open asks only for the most turns of the
// bridge that it opens.
//
// GET /v1/duties/options names the events, the actions, the looks of a
// check, and the secrets that the front serves now, and the editor offers
// nothing else. A duty keeps a choice that it holds, so an edit never drops
// it. A problem of the front that names a field shows beside the field,
// and one with no field shows at the top. Make this a duty opens the form
// with the agent and the message of a chat or a bridge, from the address.
// Tell me about also offers the shared channels of the operator, from GET
// /v1/notifications, and keeps a shared channel that the duty names.
//
// The person writes the name of a duty in words, such as Walk duty 1, and
// the page makes its short name, walk-duty-1, and shows it. A change of the
// form stays as a draft in the tab until Save or Cancel, so a move to
// another screen loses nothing. Make this a duty reads the schedule and the
// cost that its message names, and Cancel goes back to the conversation.

import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError, browserZone } from '../api/client';
import type { Day, Duty, DutyDryRun } from '../api/types';
import { go, hrefOf, parseRoute, type DutySeed } from '../lib/route';
import { worksSeats } from '../lib/agents';
import {
  AT_TIMES,
  CATCH_UPS,
  DAYS,
  EVENT_FIELDS,
  EVERY_WEEKS,
  MONTH_DAYS,
  PLACEHOLDERS,
  POST_SPENDS,
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
  datesError,
  domOf,
  dutyProblems,
  eventLabel,
  eventOf,
  eventWords,
  firstLine,
  formErrors,
  formOf,
  hasCheck,
  limitWords,
  moneyIn,
  monthDayOf,
  nameOf,
  nameWordsReason,
  nextTime,
  nextWords,
  presetOf,
  recordOf,
  scheduleOf,
  scheduleWordsIn,
  seededForm,
  slugOf,
  sortDays,
  spanText,
  splitProblem,
  startWords,
  titleOfName,
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
  LOCKED_LINE,
  ORIGIN_LINE,
  TEMPLATE_LINE,
  TEMPLATE_REPLACE,
  importedOf,
  lockedOf,
  templatedOf,
} from '../lib/duties';
import { useSelect } from '../state/store';
import { membersOf } from '../state/reducer';
import { loadBridge } from '../state/actions';
import { FALLBACK, loadDuties, loadDutyOptions, loadDuty, loadSharedChannels, saveDuty, useDuties } from '../state/duties';
import { usePlaybooks } from '../state/playbooks';
import { showError } from './notice';
import { Confirm } from './common';
import { Picker } from './Picker';
import { CheckFirst } from './DutyCheck';
import { PlaybookPick, PlaybookShelf } from './Playbooks';
import { Button, Choices, Field, Help, IconButton, Input, Mark, PaneHeader, TextArea, buttonClass } from './primitives';

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

/** useAgentName is the name of an agent as its face names it, else its name with a capital, as the picker shows it. */
export function useAgentName(agent: string): string {
  return useSelect((s) => (agent && s.faces[agent] && s.faces[agent].displayName) || titleOfName(agent));
}

/** focusLost gives the focus to an element when the focus fell to the body, such as after a move to another screen or after a key that went away. */
export function focusLost(el: HTMLElement | null | undefined): void {
  const a = document.activeElement;
  if (el && (!a || a === document.body)) el.focus();
}

/** useFocusLost gives the focus to a heading once it shows, when the focus fell to the body. */
export function useFocusLost(ref: RefObject<HTMLElement>, deps: unknown[]): void {
  useEffect(() => {
    const t = setTimeout(() => focusLost(ref.current), 0);
    return () => clearTimeout(t);
  }, deps);
}

/* ---------- the draft and the way back ---------- */

/** The draft of a duty in the storage of the tab: the form, the words of the box, the way back, and the revision that the draft began from. */
interface DutyDraft {
  form: DutyForm;
  words: string;
  /** The words of Write the check for me. */
  checkWords?: string;
  from?: string;
  revision?: number;
  datesOwn?: boolean;
}

/** draftKey names the draft of New duty, of New duty from one seed, or of the edit of one duty. */
const draftKey = (name?: string, seed?: DutySeed) => 'fw.bossmode.duty.' + (name ? 'edit/' + name : 'new' + (seed ? '?' + JSON.stringify(seed) : ''));

function readDraft(key: string): DutyDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    const d = raw ? (JSON.parse(raw) as DutyDraft) : null;
    return d && d.form && typeof d.form === 'object' ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, d: DutyDraft | null): void {
  try {
    if (d) sessionStorage.setItem(key, JSON.stringify(d));
    else sessionStorage.removeItem(key);
  } catch {
    // No storage: the draft lives in the form only.
  }
}

/** The address before the newest move of the tab. Make this a duty goes back there. */
let before = '';
if (typeof window !== 'undefined')
  window.addEventListener('hashchange', (e) => {
    try {
      if (e.oldURL) before = new URL(e.oldURL).hash;
    } catch {
      // An address that does not read keeps the one before.
    }
  });

/** cameFrom is the address that Make this a duty came from, or "" for a move inside Duties or none. */
function cameFrom(): string {
  if (!before || before === '#') return '';
  return parseRoute(before).place === 'duties' ? '' : before;
}

/** backTo names the screen of an address, for the link back to it. */
function backTo(hash: string): string {
  switch (parseRoute(hash).place) {
    case 'chat':
      return 'the chat';
    case 'manager':
      return 'the manager';
    case 'bridge':
      return 'the bridge';
    case 'fleet':
    case 'member':
      return 'the conversation';
    case 'activity':
      return 'Activity';
  }
  return 'the last screen';
}

/** WHO_HELP says what the agent of a duty does for an action that another does, behind the question mark of Who. */
const WHO_HELP: Partial<Record<Act, string>> = {
  post: 'The duty belongs to this agent: it shows on the profile of the agent, and Check first uses its tools. The post comes from the duty itself.',
  open: 'The duty belongs to this agent: it shows on the profile of the agent, and Check first uses its tools. The seats of the playbook do the work.',
  manager: 'The duty belongs to this agent: it shows on the profile of the agent, and Check first uses its tools. The manager does the work.',
};

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

/** Times are the times of the day of a schedule, with Add a time, up to 12. A new time comes an hour after the last one, so it never repeats a time. */
function Times({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  const added = nextTime(times);
  return (
    <span class="duty-times">
      {times.map((t, i) => (
        <span class="duty-time">
          <Input type="time" step={60} value={t} aria-label={times.length > 1 ? 'Time ' + (i + 1) : 'Time'} onInput={(e) => onChange(times.map((x, j) => (j === i ? (e.target as HTMLInputElement).value : x)))} />
          {times.length > 1 && <IconButton icon="close" label={'Remove time ' + (i + 1)} onClick={() => onChange(times.filter((_, j) => j !== i))} />}
        </span>
      ))}
      {times.length < 12 && added && (
        <Button size="s" kind="quiet" icon="plus" onClick={() => onChange([...times, added])}>
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

/**
 * Dates are the first and the last day of a schedule, behind one switch. A
 * duty with no dates runs from now on. The switch shows on whenever the
 * sentence holds a date, so no date hides. onOwn says that the person set
 * the dates by hand.
 */
function Dates({ f, onChange, error, onOwn }: { f: WhenForm; onChange: (f: WhenForm) => void; error?: string; onOwn: () => void }) {
  const [on, setOn] = useState(() => !!(f.start || f.end));
  const shown = on || !!(f.start || f.end);
  const turn = (v: boolean) => {
    setOn(v);
    onOwn();
    if (!v) onChange({ ...f, start: undefined, end: undefined });
  };
  const set = (p: Partial<WhenForm>) => {
    onOwn();
    onChange({ ...f, ...p });
  };
  return (
    <div class="duty-dates">
      <label class="check">
        <input type="checkbox" checked={shown} onChange={(e) => turn((e.target as HTMLInputElement).checked)} />
        <span>Only between two dates</span>
      </label>
      {shown && (
        <div class="field-row">
          <Field label="First day">
            <Input type="date" value={f.start || ''} invalid={!!error} onInput={(e) => set({ start: (e.target as HTMLInputElement).value || undefined })} />
          </Field>
          <Field label="Last day" error={error}>
            <Input type="date" value={f.end || ''} invalid={!!error} onInput={(e) => set({ end: (e.target as HTMLInputElement).value || undefined })} />
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
  const fleet = useSelect((s) => s.fleet);
  const fields = EVENT_FIELDS[e.kind] || [];
  // The agents that workers run, as the picker of a seat offers them. A profile that no worker runs, such as default, does nothing to watch.
  const names = (agents || []).filter((a) => worksSeats(fleet, a.name)).map((a) => a.name);
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
              <option value={n}>{(faces[n] && faces[n].displayName) || titleOfName(n)}</option>
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
 * The problems of the front that name When show in their place. While the
 * words of the box hold a problem, the readback hides, so the schedule
 * that stays never reads as the answer to those words.
 */
function Readback({ p, zone, fallback, said, hidden }: { p: Preview; zone: string; fallback?: string; said?: string[]; hidden?: boolean }) {
  if (hidden) return null;
  const a = p.answer;
  const readback = (a && a.readback) || '';
  // The problems of a save come first. Else those of the last read back.
  const problems = said && said.length ? said : a ? dutyProblems(a.problems).when || [] : [];
  const next = ((a && a.next) || []).slice(0, 5);
  const words = readback || fallback || '';
  // A box with nothing to say, such as while the dates hold a problem, does not show.
  if (!p.error && !problems.length && !a && !fallback && !p.busy) return null;
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
  // Every duty opens in the editor, except a duty that the setup of the server locks.
  const title = useRef<HTMLHeadingElement>(null);
  useFocusLost(title, [name]);
  if (!fresh && (!base || lockedOf(base))) {
    return (
      <section class="screen duty-edit" aria-labelledby="duty-edit-title">
        <PaneHeader id="duty-edit-title" title={heading} size="title" level={1} back={back} headingRef={title} focusable />
        <div class="empty center">
          <p>{base ? LOCKED_LINE : gone ? 'This duty is not here. It was removed, or you cannot see it.' : failed || 'Loading the duty.'}</p>
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

function EditorForm({ name, seed, base: read, heading, back: home }: FormProps) {
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
  // A draft of this form that the person left without Save or Cancel comes back.
  const key = draftKey(name, seed);
  const [kept] = useState(() => readDraft(key));
  const [initial] = useState<DutyForm>(() => (base ? formOf(base, zone) : seededForm(seed, zone)));
  const [f, setF] = useState<DutyForm>(() => (kept ? { ...initial, ...kept.form } : initial));
  const [keptLine, setKeptLine] = useState(!!kept);
  const keptStale = !!(kept && base && typeof kept.revision === 'number' && typeof base.revision === 'number' && kept.revision !== base.revision);
  // Make this a duty goes back to the conversation that it came from.
  const [from] = useState(() => (kept && kept.from) || (seed ? cameFrom() : ''));
  const back: FormProps['back'] = from ? { href: from, label: backTo(from), to: 'here' } : home;
  // True once the person set the dates by hand. Words that the server reads back then keep them.
  const datesOwn = useRef(kept ? !!kept.datesOwn : !!(base && base.when && base.when.schedule && (base.when.schedule.start || base.when.schedule.end)));
  const title = useRef<HTMLHeadingElement>(null);
  useFocusLost(title, []);
  const playbooks = usePlaybooks((s) => s.list);
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [problems, setProblems] = useState<Problems>({});
  const [review, setReview] = useState<DutyDryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [checkOpen, setCheckOpen] = useState(() => !!(base && base.checkFirst));
  const [words, setWords] = useState(() => (kept ? kept.words || '' : ''));
  const [checkSaid, setCheckSaid] = useState(() => (kept ? kept.checkWords || '' : ''));
  const [wordsBusy, setWordsBusy] = useState(false);
  const [wordsProblems, setWordsProblems] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview>({ answer: null, busy: false, error: '' });
  // A reading of words that the person did not ask for, and that failed, asks for the readback of the sentence again.
  const [nudge, setNudge] = useState(0);
  const pickKey = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const agentName = useAgentName(f.agent);
  const faces = useSelect((s) => s.faces);
  const tagline = useSelect((s) => (f.agent && s.faces[f.agent] ? s.faces[f.agent].tagline : ''));
  const keepsWhen = !!(base && base.when && base.when.webhook);
  // The message of a duty from the setup of the server never shows. An empty field keeps it, and a message replaces it.
  const templated = templatedOf(base);
  // The name in words, as the person wrote it or as the page makes it from what the duty does, and its short name.
  const shownName = f.nameOwn ? f.name : titleOfName(nameOf(f.act === 'open' ? f.goal || f.playbook : f.message));
  const slug = slugOf(shownName);
  // The reason of a name that cannot name a duty, shown as the person types, before a save.
  const nameWhy = fresh && shownName.trim() ? nameWordsReason(shownName, []) : '';
  const pathName = name || (slug && !nameWhy ? slug : DRAFT);
  const record = () => recordOf(f, base, pathName);
  const nameOfAgent = (a: string) => (faces[a] && faces[a].displayName) || titleOfName(a);

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
  // A change of the sentence drops the words that the front read back without a schedule, and a problem of the words.
  const setWhen = (when: WhenForm) => {
    patch({ when, say: '' });
    if (wordsProblems.length) setWordsProblems([]);
  };

  // Each change goes to the draft of the tab. A form as it opened keeps no draft.
  useEffect(() => {
    const dirty = JSON.stringify(f) !== JSON.stringify(initial) || !!words.trim() || !!checkSaid.trim();
    writeDraft(key, dirty ? { form: f, words, checkWords: checkSaid, from, revision: base && typeof base.revision === 'number' ? base.revision : undefined, datesOwn: datesOwn.current } : null);
  }, [f, words, checkSaid]);

  /** discard drops the draft and gives the form back as it opened. */
  const discard = () => {
    writeDraft(key, null);
    setKeptLine(false);
    setF(initial);
    setWords('');
    setCheckSaid('');
    setWordsProblems([]);
    setErrors(null);
    setProblems({});
  };

  // The front reads the start back a moment after each change of When.
  const whenKey = f.start === 'event' ? 'event\n' + JSON.stringify(eventOf(f.event)) : JSON.stringify(scheduleOf(f.when)) + '\n' + f.say;
  const asked = useRef('');
  const seq = useRef(0);
  useEffect(() => {
    if (keepsWhen) return;
    const n = ++seq.current;
    if (f.start === 'event' ? !f.event.kind : !f.say && (whenError(f.when) || datesError(f.when))) {
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
  }, [whenKey, keepsWhen, nudge]);

  /**
   * readWords sends the words of the box. A schedule in the answer fills
   * the sentence, and the readback shows. quiet is a reading that the
   * person did not ask for, such as the words of Make this a duty: a
   * problem then shows nothing, and the words wait in the box.
   */
  const readWords = async (text = words, quiet = false) => {
    const said = text.trim();
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
        // The dates of the words win. The dates of the form stay only when the person set them by hand.
        const keep = datesOwn.current;
        const when = whenFormOf({ ...sched, start: sched.start || (keep ? f.when.start : undefined), end: sched.end || (keep ? f.when.end : undefined) }, zone);
        asked.current = JSON.stringify(scheduleOf(when)) + '\n';
        setF((x) => ({ ...x, when, say: '' }));
        setPreview({ answer: a, busy: false, error: '' });
      } else if (a.readback) {
        asked.current = JSON.stringify(scheduleOf(f.when)) + '\n' + said;
        setF((x) => ({ ...x, say: said }));
        setPreview({ answer: a, busy: false, error: '' });
      } else {
        const ps = dutyProblems(a.problems);
        if (!quiet) setWordsProblems(ps.when || (a.problems || []).map((x) => splitProblem(x).text).filter(Boolean));
        if (n === seq.current) setPreview((p) => ({ ...p, busy: false }));
        if (quiet) setNudge((x) => x + 1);
      }
    } catch (e) {
      if (!quiet) setWordsProblems([messageOf(e)]);
      else setNudge((x) => x + 1);
    }
    setWordsBusy(false);
  };

  // Make this a duty brings a message that can name when and what a run may cost, such as every Monday at 8am and at most $0.05. The page reads both into the form once.
  useEffect(() => {
    if (!fresh || !seed || !seed.message || kept) return;
    const cost = moneyIn(seed.message);
    if (cost && (f.act === 'ask' || f.act === 'manager') && !f.cost) setF((x) => ({ ...x, cost }));
    const said = scheduleWordsIn(seed.message);
    if (said) {
      setWords(said);
      readWords(said, true);
    }
  }, []);

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

  /**
   * showFirst brings the first error or problem of the form into sight, and
   * the focus to its control: the control itself, else the first control of
   * its field or section, else the box of the problems of the whole form.
   */
  const showFirst = () =>
    setTimeout(() => {
      const bad = formRef.current && (formRef.current.querySelector('[aria-invalid="true"], .field-error, .duty-problems') as HTMLElement | null);
      if (!bad) return;
      if (typeof bad.scrollIntoView === 'function') bad.scrollIntoView({ block: 'center' });
      const box = bad.closest('.duty-problems-box') as HTMLElement | null;
      const near = bad.closest('.field, fieldset, .duty-sec, .duty-check');
      const control = bad.matches('input, textarea, select, button') ? bad : box ? box : near ? (near.querySelector('input, textarea, select, button') as HTMLElement | null) : null;
      if (control) control.focus();
    }, 0);

  /** takeProblems shows the problems of the front beside their fields, and opens Check first for one of its own. */
  const takeProblems = (ps: unknown[] | null | undefined): boolean => {
    const by = dutyProblems(ps, f.act);
    setProblems(by);
    if (by.check) setCheckOpen(true);
    const any = Object.keys(by).length > 0;
    if (any) showFirst();
    return any;
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const errs = formErrors(f, { fresh, name: shownName, taken: fresh && list ? list.map((d) => d.name) : [], keepsWhen, templated });
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
      writeDraft(key, null);
      setReview(null);
      setBusy(false);
      go({ place: 'duties', name: pathName });
      return;
    } catch (err) {
      setReview(null);
      if (err instanceof ApiError && err.status === 409) {
        // A duty that the setup of the server locked since the person opened it answers 409 with its own two sentences.
        const detail = err.problem && typeof err.problem.detail === 'string' ? err.problem.detail.trim() : '';
        setProblems({ top: [/\blocked\b/i.test(err.message) ? detail || err.message : 'This duty changed since you opened it. Open it again, then make your change.'] });
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
  // The dates show their problem as soon as both are set, before the server reads them.
  const datesWhy = err.dates || (f.start === 'schedule' && !f.say ? datesError(f.when) : '');
  // The goal of a duty that opens a bridge replaces the goal of its playbook. An empty field keeps that goal, so the field shows it.
  const book = f.act === 'open' && f.playbook && playbooks ? playbooks.find((p) => p.name === f.playbook) : undefined;
  const bookGoal = book && book.goal ? firstLine(book.goal) : '';
  return (
    <section class="screen duty-edit" aria-labelledby="duty-edit-title">
      <PaneHeader id="duty-edit-title" title={heading} size="title" level={1} back={back} headingRef={title} focusable />
      <form class="scroll pad" ref={formRef} onSubmit={submit} noValidate>
        <div class="make duty-form">
          {keptLine && (
            <p class="duty-said duty-kept" role="status">
              <span>{keptStale ? 'Your unsaved changes are back. The duty changed since you made them, and Save puts yours in its place.' : 'Your unsaved changes are back.'}</span>
              <Button size="s" kind="quiet" onClick={discard}>
                Discard them
              </Button>
            </p>
          )}
          {importedOf(base) && <p class="duty-said duty-origin">{ORIGIN_LINE}</p>}
          {pr.top && pr.top.length > 0 && (
            <div class="duty-problems-box" role="alert" tabIndex={-1}>
              <p>The duty cannot save yet.</p>
              <ul class="duty-problems">
                {pr.top.map((x) => (
                  <li>{x}</li>
                ))}
              </ul>
            </div>
          )}

          <section class="duty-sec" aria-labelledby="duty-who-head">
            <div class="duty-sec-top">
              <h2 class="t-sub duty-sec-head" id="duty-who-head">
                Who
              </h2>
              {WHO_HELP[f.act] && <Help label="What the agent does here">{WHO_HELP[f.act]}</Help>}
            </div>
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
              <p class="duty-readback">{startWords(base!)}. You cannot change this start here.</p>
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
                    <Dates f={f.when} onChange={setWhen} error={datesWhy || undefined} onOwn={() => (datesOwn.current = true)} />
                    <div class="duty-say">
                      <Field label="Say it in your own words" error={wordsProblems.length === 1 ? wordsProblems[0] : undefined}>
                        <Input
                          value={words}
                          placeholder="every other Tuesday at 3pm"
                          invalid={wordsProblems.length > 0}
                          onInput={(e) => {
                            setWords((e.target as HTMLInputElement).value);
                            if (wordsProblems.length) setWordsProblems([]);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              readWords();
                            }
                          }}
                        />
                      </Field>
                      <Button size="s" disabled={wordsBusy} onClick={() => readWords()}>
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
                <Readback p={preview} zone={zone} fallback={eventSaid} said={pr.when} hidden={f.start === 'schedule' && wordsProblems.length > 0} />
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
              words={checkSaid}
              onWords={setCheckSaid}
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
                  <TextArea ref={box} rows={3} value={f.goal} placeholder={bookGoal || 'The goal of the playbook'} onInput={(e) => patch({ goal: (e.target as HTMLTextAreaElement).value })} aria-describedby={bookGoal && !f.goal.trim() ? 'duty-goal-keeps' : undefined} />
                </Field>
                {bookGoal && !f.goal.trim() && (
                  <p class="t-meta" id="duty-goal-keeps">
                    An empty goal keeps the goal of the playbook.
                  </p>
                )}
              </>
            ) : (
              <Field label={messageLabel} error={joinError(err.message, pr.message)}>
                <TextArea
                  ref={box}
                  rows={4}
                  value={f.message}
                  invalid={!!(err.message || pr.message)}
                  placeholder={templated && f.act === 'ask' ? '' : f.act === 'post' ? 'Review what changed since [The last run].' : f.act === 'manager' ? "Check the backups of [Today's date] and tell me what failed." : "Write the report of [Today's date] to the wiki."}
                  onInput={(e) => patch({ message: (e.target as HTMLTextAreaElement).value })}
                  aria-describedby={templated && f.act === 'ask' && !f.message.trim() ? 'duty-template-line' : undefined}
                />
              </Field>
            )}
            {templated && f.act === 'ask' && !f.message.trim() && (
              <p class="duty-template" id="duty-template-line">
                {TEMPLATE_LINE} {TEMPLATE_REPLACE}
              </p>
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
            {/* The budget follows the action, so the fields change as soon as the action does. */}
            {f.act === 'post' ? (
              <p class="duty-spends">{POST_SPENDS}</p>
            ) : f.act === 'open' ? (
              <Field label="The most turns of the bridge" error={joinError(err.turns, pr.turns)} class="duty-narrow">
                <Input type="number" min={1} inputMode="numeric" value={f.bridgeTurns} invalid={!!(err.turns || pr.turns)} placeholder="Required, such as 40" onInput={(e) => patch({ bridgeTurns: (e.target as HTMLInputElement).value })} />
              </Field>
            ) : (
              <div class="field-row">
                <Field label="The most a run can cost" error={joinError(err.cost, pr.cost)} class="duty-cost">
                  <span class="duty-money">
                    <span aria-hidden="true">$</span>
                    <Input inputMode="decimal" value={f.cost} invalid={!!(err.cost || pr.cost)} placeholder="Required, such as 0.50" onInput={(e) => patch({ cost: (e.target as HTMLInputElement).value })} />
                  </span>
                </Field>
                <Field
                  label={
                    <>
                      Most turns <Help label="What a turn is">A turn is one step of the agent: it thinks once, then uses its tools. The run stops after this many turns.</Help>
                    </>
                  }
                  error={joinError(err.turns, pr.turns)}
                >
                  <Input type="number" min={1} inputMode="numeric" value={f.turns} invalid={!!(err.turns || pr.turns)} placeholder="Optional" onInput={(e) => patch({ turns: (e.target as HTMLInputElement).value })} />
                </Field>
                <Field label="The most per day" error={joinError(err.perDay, pr.perDay)}>
                  <span class="duty-money">
                    <span aria-hidden="true">$</span>
                    <Input inputMode="decimal" value={f.perDay} invalid={!!(err.perDay || pr.perDay)} placeholder="Optional" onInput={(e) => patch({ perDay: (e.target as HTMLInputElement).value })} />
                  </span>
                </Field>
              </div>
            )}
            <Choices
              name="duty-overlap"
              legend={
                <>
                  If the last run still works{' '}
                  <Help label="When this happens">{f.start === 'schedule' && !keepsWhen ? 'The next time can come before the run of the last time finishes.' : 'The duty can start again before its last run finishes.'} Skip the new start, run it after the last run, or run both at once.</Help>
                </>
              }
              value={f.overlap}
              options={[
                { id: 'skip', label: 'Skip it' },
                { id: 'queue', label: 'Run after it' },
                { id: 'allow', label: 'Run anyway' },
              ]}
              onChange={(overlap) => patch({ overlap })}
            />
            {/* Only a schedule has times that a front can miss. An event and another app start a run when they come. */}
            {f.start === 'schedule' && !keepsWhen && (
              <Field
                label={
                  <>
                    Catch up a missed time <Help label="What a missed time is">The server can miss a time, such as while it restarts. A missed time runs once when the server is back within this span. Later, the duty waits for its next time.</Help>
                  </>
                }
                class="duty-narrow"
              >
                <select class="recess" value={f.catchUp} onChange={(e) => patch({ catchUp: (e.target as HTMLSelectElement).value })}>
                  {withChoice(CATCH_UPS, f.catchUp, (v) => 'Within ' + spanText(v)).map(([v, w]) => (
                    <option value={v}>{w}</option>
                  ))}
                </select>
              </Field>
            )}
            <Said list={pr.limits} />
          </section>

          <section class="duty-sec" aria-labelledby="duty-away-head">
            <div class="duty-sec-top">
              <h2 class="t-sub duty-sec-head" id="duty-away-head">
                While you are away
              </h2>
              <Help label="What away means">A run can stop at a question, such as a tool that asks first. Away means that you have not answered it yet. Then the manager can decide for you, or the question waits. After the wait, the answer below holds.</Help>
            </div>
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
            <div class="duty-sec-top">
              <h2 class="t-sub duty-sec-head" id="duty-tell-head">
                Tell me about
              </h2>
              <Help label="Where you hear of it">Activity always shows a failure and a question. Where to reach me, in the menu of your account, also sends them to your phone or your chat.</Help>
            </div>
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
              <Input
                value={shownName}
                maxLength={80}
                invalid={!!(err.name || nameWhy || pr.name)}
                placeholder="Daily report"
                aria-describedby={slug && !(err.name || nameWhy || pr.name) ? 'duty-slug' : undefined}
                onInput={(e) => patch({ name: (e.target as HTMLInputElement).value, nameOwn: true })}
              />
              {slug && !(err.name || nameWhy || pr.name) && (
                <span class="t-meta duty-slug" id="duty-slug">
                  It saves as {slug}.
                </span>
              )}
            </Field>
          )}

          <div class="form-end">
            <Button href={back.href} onClick={() => writeDraft(key, null)}>
              Cancel
            </Button>
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
          <p>{limitWords(record().limits, true, f.act)[0]}</p>
        </Confirm>
      )}
    </section>
  );
}
