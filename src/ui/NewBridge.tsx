// Open a bridge. The first view holds the one question, what is the job,
// and the seats, which the person picks, or which the manager splits from
// the goal. Advanced holds the rest: the title, filled from the goal, the
// handles, the placement, the caps, and what the manager can do. The
// placement is a choice of the deployer more than of a person: keep warm
// workers, the default, or a fresh sandbox per seat, which needs a manager.
// The record goes to POST /v1/bridges, and the key says Open bridge. A job
// for the manager goes to the conversation of the manager, where the plan
// of the seats will appear, and the key says Ask the manager. A person with
// playbooks can start from one: it fills the goal, the seats, the
// placement, the caps, and what the manager can do.
//
// The form keeps a draft in sessionStorage, as a composer does, so a move to
// another screen, Escape, or a reload keeps the half-filled job and its
// seats. Open bridge and Ask the manager end the draft, and Cancel asks
// before it throws a filled form away.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Caps, Delegation, Placement, Playbook } from '../api/types';
import type { NewBridge as NewBridgeBody } from '../api/routes';
import { useSelect } from '../state/store';
import { askManager, loadAgents, openNewBridge } from '../state/actions';
import { api } from '../api/routes';
import { store } from '../state/store';
import { handleReason, nextHandle } from '../lib/handles';
import { taskOfGoal } from './seats';
import { Picker } from './Picker';
import { go } from '../lib/route';
import { attempt } from './notice';
import { loadPlaybooks, readPlaybook, seatsOf, usePlaybooks } from '../state/playbooks';
import { PlaybookPick } from './Playbooks';
import { Confirm } from './common';
import { Advanced, Button, Choices, Field, Help, IconButton, Input, Mark, PaneHeader, TextArea } from './primitives';

/** One seat of the form. task follows the goal until the person changes it. */
export interface SeatRow {
  key: number;
  agent: string;
  handle: string;
  task: string;
  own: boolean;
}

export type SeatMode = 'pick' | 'manager';

export const PLACEMENTS: { id: Placement; label: string; meta: string }[] = [
  { id: 'queue', label: 'Keep warm workers', meta: 'Each seat starts at once on a worker that its agent keeps.' },
  { id: 'spawn', label: 'Fresh sandbox per seat', meta: 'The manager starts a new worker for each seat, so a seat starts later.' },
];

/** The words of what the manager can do, as the channel of screen A names them. */
export const DELEGATION: [keyof Delegation, string][] = [
  ['approve', 'Decide for members'],
  ['budget', 'Change the budgets of members'],
  ['members', 'Add and remove members'],
  ['report', 'Write a report on close'],
];

export const CAPS: [keyof Caps, string][] = [
  ['maxMessages', 'Most messages'],
  ['maxTurns', 'Most turns'],
  ['maxFanoutPerMinute', 'Most messages a minute'],
  ['maxPairMessages', 'Most messages between two members'],
];

/** titleOf fills the title of a bridge from its goal: the first line, at most 80 characters, cut at a word. */
export function titleOf(goal: string): string {
  const line = goal.trim().split('\n')[0].trim();
  const sentence = line.replace(/([.!?])\s.*$/, '$1').replace(/[.!?]$/, '');
  if (sentence.length <= 80) return sentence;
  const cut = sentence.slice(0, 80);
  const space = cut.lastIndexOf(' ');
  return (space > 40 ? cut.slice(0, space) : cut).replace(/[,;:]$/, '');
}

export interface BridgeForm {
  goal: string;
  mode: SeatMode;
  seats: SeatRow[];
  placement: Placement;
  title: string;
  caps: Partial<Record<keyof Caps, string>>;
  delegation: Delegation;
}

/** The field of a seat that an error names: the handle, the agent, or the task. */
export type SeatField = 'handle' | 'agent' | 'task';

export interface BridgeErrors {
  goal?: string;
  seats?: string;
  placement?: string;
  /** The reason of each seat that cannot go out, by its key. */
  seat: Record<number, string>;
  /** The field of each such seat that the reason names, so only that field shows red. */
  seatField: Record<number, SeatField>;
  caps: Partial<Record<keyof Caps, string>>;
}

/** hasErrors reports whether the errors of the form hold any reason. */
export function hasErrors(e: BridgeErrors): boolean {
  return !!(e.goal || e.seats || e.placement || Object.keys(e.seat).length || Object.keys(e.caps).length);
}

/**
 * bridgeErrors says what is wrong with the form, by field. hasManager says
 * whether the settings name a manager. A job for the manager has no seats
 * and no caps of the form, because the manager picks them.
 */
export function bridgeErrors(f: BridgeForm, hasManager: boolean): BridgeErrors {
  const out: BridgeErrors = { seat: {}, seatField: {}, caps: {} };
  if (!f.goal.trim()) out.goal = 'Write the goal of the bridge.';
  if (f.placement === 'spawn' && !hasManager) out.placement = 'A fresh sandbox per seat needs a manager. Pick keep warm workers, or set up a manager.';
  if (f.mode === 'pick') {
    if (f.seats.length === 0) out.seats = 'Member 1 needs an agent.';
    f.seats.forEach((s, i) => {
      const others = f.seats.filter((x) => x.key !== s.key).map((x) => x.handle);
      const why = handleReason(s.handle, others);
      const bad = (field: SeatField, reason: string) => {
        out.seat[s.key] = reason;
        out.seatField[s.key] = field;
      };
      if (why) bad('handle', why);
      else if (!s.agent) bad('agent', `Member ${i + 1} needs an agent.`);
      else if (!s.task.trim()) bad('task', `Member ${i + 1} needs a task.`);
    });
  }
  if (f.mode === 'manager') return out;
  for (const [k] of CAPS) {
    const v = (f.caps[k] || '').trim();
    if (v && !(Number.isInteger(Number(v)) && Number(v) > 0)) out.caps[k] = 'Write a whole number.';
  }
  return out;
}

/** bodyOf builds the record of POST /v1/bridges. The caps go out only where the person set them. */
export function bodyOf(f: BridgeForm): NewBridgeBody {
  const caps: Partial<Caps> = {};
  for (const [k] of CAPS) if ((f.caps[k] || '').trim()) caps[k] = Number(f.caps[k]);
  const body: NewBridgeBody = {
    title: f.title.trim() || titleOf(f.goal),
    goal: f.goal.trim(),
    placement: f.placement,
    members: f.seats.map((s) => ({ handle: s.handle, agent: s.agent, task: s.task.trim() })),
    delegation: f.delegation,
  };
  if (Object.keys(caps).length) body.caps = caps;
  return body;
}

/**
 * askOf is the message that hands the job to the manager, to split into
 * seats. It shows in the conversation of the manager as the words of the
 * person, so it reads as a person writes: the job first, then one short
 * ask. It names the placement only when the person picked another one
 * than the default of the deployment, and the title only when the person
 * gave one, because the manager needs both to open the bridge as asked.
 */
export function askOf(f: BridgeForm, defaultPlacement: Placement = 'queue'): string {
  const ask = ['Please open a bridge for this and pick the seats.'];
  if (f.placement !== defaultPlacement) ask.push(f.placement === 'spawn' ? 'Give each seat a fresh sandbox (spawn).' : 'Use the warm workers (queue).');
  if (f.title.trim()) ask.push('Call it "' + f.title.trim() + '".');
  return f.goal.trim() + '\n\n' + ask.join(' ');
}

let seatKey = 0;

/** The key of the draft of the form in sessionStorage. */
export const DRAFT_KEY = 'fw.bossmode.newbridge';

/** A draft of the form: its fields, the playbook it started from, and whether Advanced is open. */
interface Draft {
  f: BridgeForm;
  from: string;
  adv: boolean;
}

/** readDraft reads the draft of the form, or null for none or for one that this page cannot read. */
function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || !d.f || typeof d.f.goal !== 'string' || !Array.isArray(d.f.seats) || !d.f.delegation || !d.f.caps) return null;
    // The keys of the seats of a new row never meet the keys of the draft.
    for (const x of d.f.seats) if (typeof x.key === 'number' && x.key > seatKey) seatKey = x.key;
    return { f: d.f, from: typeof d.from === 'string' ? d.from : '', adv: !!d.adv };
  } catch {
    return null;
  }
}

/** writeDraft keeps the draft of the form, or forgets it for null. */
function writeDraft(d: Draft | null): void {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // No storage: the draft lives as long as the screen.
  }
}

/** blankForm is the form before the person types: keep warm workers, unless the deployment picked a fresh sandbox per seat and has the manager that it needs. */
function blankForm(config: { placement?: Placement; manager?: unknown } | null): BridgeForm {
  return {
    goal: '',
    mode: 'pick',
    seats: [],
    placement: config && config.placement === 'spawn' && config.manager ? 'spawn' : 'queue',
    title: '',
    caps: {},
    delegation: { approve: false, budget: false, members: false, report: true },
  };
}

/** filled reports whether the person put something in the form that a draft keeps. */
export function filled(f: BridgeForm, blank: BridgeForm): boolean {
  return JSON.stringify(f) !== JSON.stringify(blank);
}

/** bridgeFormOf fills the form from a playbook: its goal, its seats, its placement, its caps, and what the manager can do. The title stays. */
export function bridgeFormOf(p: Playbook, f: BridgeForm): BridgeForm {
  const caps: BridgeForm['caps'] = {};
  for (const [k] of CAPS) if (p.caps && typeof p.caps[k] === 'number' && p.caps[k]! > 0) caps[k] = String(p.caps[k]);
  return {
    ...f,
    goal: p.goal || '',
    mode: 'pick',
    seats: seatsOf(p).map((x) => ({ key: ++seatKey, agent: x.agent, handle: x.handle, task: x.task, own: true })),
    placement: p.placement === 'spawn' || p.placement === 'queue' ? p.placement : f.placement,
    caps,
    delegation: { ...f.delegation, ...(p.delegation || {}) },
  };
}

export function NewBridge() {
  const agents = useSelect((s) => s.agents);
  const config = useSelect((s) => s.config);
  const hasManager = !!(config && config.manager);
  const [draft] = useState(readDraft);
  const [f, setF] = useState<BridgeForm>(() => (draft ? draft.f : blankForm(config)));
  const [adv, setAdv] = useState(() => !!(draft && draft.adv));
  const [picking, setPicking] = useState(false);
  const addKey = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  // After a failed submit, the errors follow the form, so a fixed field loses its error as the person types.
  const [tried, setTried] = useState(false);
  const [shown, setShown] = useState(0);
  const [discard, setDiscard] = useState(false);
  const first = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLFormElement>(null);
  const done = useRef(false);
  const max = (config && config.maxMembers) || 16;
  const books = usePlaybooks((s) => s.list);
  const [from, setFrom] = useState(() => (draft ? draft.from : ''));
  // The blank form of the moment the screen opened, so settings that load later do not make an untouched form look filled.
  const [blank] = useState(() => blankForm(config));
  const errors = tried ? bridgeErrors(f, hasManager) : null;

  useEffect(() => {
    if (!agents) attempt(loadAgents);
    loadPlaybooks().catch(() => {});
    if (first.current) first.current.focus();
  }, []);

  // The draft follows the form. A form with nothing in it keeps no draft.
  useEffect(() => {
    if (done.current) return;
    writeDraft(filled(f, blank) || from ? { f, from, adv } : null);
  }, [f, from, adv]);

  // After a failed submit, the first field with an error takes the focus, so a phone shows it.
  useEffect(() => {
    if (!shown || !box.current) return;
    const bad = box.current.querySelector('[aria-invalid="true"], .field-error');
    if (!bad) return;
    let to = bad.matches('[aria-invalid="true"]') ? (bad as HTMLElement) : null;
    if (!to) {
      // An error of a group, such as the seats or the placement, gives the focus to its first control.
      const group = bad.closest('fieldset, .seats');
      to = group ? (group.querySelector('input:checked, input, button') as HTMLElement | null) : null;
    }
    if (!to) return;
    to.focus();
    if (typeof to.scrollIntoView === 'function') to.scrollIntoView({ block: 'nearest' });
  }, [shown]);

  /** startFrom fills the form from a playbook that the person picked. */
  const startFrom = async (name: string) => {
    setFrom(name);
    if (!name) return;
    await attempt(async () => {
      const p = await readPlaybook(name);
      setF((x) => bridgeFormOf(p, x));
      setTried(false);
    });
  };

  const patch = (p: Partial<BridgeForm>) => setF((x) => ({ ...x, ...p }));
  // A seat takes its task from the first sentence of the goal, as a seat of the members pane does, until the person changes it.
  const setGoal = (goal: string) => setF((x) => ({ ...x, goal, seats: x.seats.map((s) => (s.own ? s : { ...s, task: taskOfGoal(goal) })) }));
  const addSeat = (agent: string) =>
    setF((x) => (x.seats.length >= max ? x : { ...x, seats: [...x.seats, { key: ++seatKey, agent, handle: nextHandle(agent, x.seats.map((s) => s.handle)), task: taskOfGoal(x.goal), own: false }] }));
  const setSeat = (key: number, p: Partial<SeatRow>) => setF((x) => ({ ...x, seats: x.seats.map((s) => (s.key === key ? { ...s, ...p } : s)) }));

  /** forget ends the draft: the bridge opened, the manager has the job, or the person threw the form away. */
  const forget = () => {
    done.current = true;
    writeDraft(null);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const errs = bridgeErrors(f, hasManager);
    const bad = hasErrors(errs);
    setTried(bad);
    if (bad) {
      // A handle shows as a field only under Advanced, so a wrong handle opens it. A missing task does not.
      if (errs.placement || Object.keys(errs.caps).length || Object.values(errs.seatField).includes('handle')) setAdv(true);
      setShown((n) => n + 1);
      return;
    }
    setBusy(true);
    let to = '';
    await attempt(async () => {
      if (f.mode === 'manager') {
        // The manager plans the seats in its conversation, so the person lands there with the job that they typed.
        const id = await askManager(askOf(f, (config && config.placement) || 'queue'));
        try {
          store.dispatch({ type: 'run', run: await api.run(id) });
        } catch {
          // The conversation reads the run on its own.
        }
        to = '#manager';
      } else {
        const id = await openNewBridge(bodyOf(f));
        to = '#bridge/' + encodeURIComponent(id);
      }
    });
    if (to) forget();
    setBusy(false);
    if (to) go(to);
  };

  /** cancel leaves the form. A filled form asks first, because Cancel throws its draft away. */
  const cancel = () => {
    if (filled(f, blank) || from) {
      setDiscard(true);
      return;
    }
    forget();
    go('#');
  };

  const err: BridgeErrors = errors || { seat: {}, seatField: {}, caps: {} };
  const manager = f.mode === 'manager';
  return (
    <section class="screen newbridge" aria-labelledby="new-title">
      <PaneHeader id="new-title" title="Open a bridge" size="title" level={1} back={{ href: '#', label: 'Bridges', to: 'list' }} />
      <form class="scroll pad" ref={box} onSubmit={submit} noValidate>
        <div class="make">
          {books && books.length > 0 && <PlaybookPick value={from} onChange={startFrom} label="Start from a playbook" empty="No playbook" />}
          <Field label="What is the job?" error={err.goal}>
            <TextArea ref={first} rows={3} value={f.goal} invalid={!!err.goal} placeholder="Migrate the logrotate module to an Ansible role, and review it." onInput={(e) => setGoal((e.target as HTMLTextAreaElement).value)} />
          </Field>

          {hasManager && (
            <Choices
              name="mode"
              legend="Seats"
              value={f.mode}
              options={[
                { id: 'pick', label: 'Pick the seats' },
                { id: 'manager', label: 'Let the manager split it' },
              ]}
              onChange={(mode) => patch({ mode })}
            />
          )}

          {f.mode === 'pick' && (
            <section class="seats" aria-labelledby={hasManager ? undefined : 'seats-head'} aria-label={hasManager ? 'Seats' : undefined}>
              {!hasManager && (
                <h2 class="field-label" id="seats-head">
                  Seats
                </h2>
              )}

              {f.seats.map((s) => (
                <div class="seat">
                  <Mark agent={s.agent} size={32} />
                  <div class="seat-main">
                    <div class="seat-handle">
                      {adv ? (
                        <Input aria-label={'Handle of ' + s.handle} value={s.handle} maxLength={32} invalid={err.seatField[s.key] === 'handle'} spellcheck={false} onInput={(e) => setSeat(s.key, { handle: (e.target as HTMLInputElement).value.toLowerCase() })} />
                      ) : (
                        <span class="t-sub">{s.handle}</span>
                      )}
                      {s.agent !== s.handle && <span class="t-meta">{s.agent}</span>}
                    </div>
                    <Input aria-label={'Task of ' + s.handle} placeholder={'What ' + s.handle + ' does on this bridge'} value={s.task} invalid={err.seatField[s.key] === 'task'} onInput={(e) => setSeat(s.key, { task: (e.target as HTMLInputElement).value, own: true })} />
                    {err.seat[s.key] && (
                      <span class="field-error" role="alert">
                        {err.seat[s.key]}
                      </span>
                    )}
                  </div>
                  <IconButton icon="close" label={'Remove ' + s.handle} onClick={() => setF((x) => ({ ...x, seats: x.seats.filter((y) => y.key !== s.key) }))} />
                </div>
              ))}
              <span class="pick-anchor">
                <Button ref={addKey} size="s" icon="plus" aria-haspopup="dialog" aria-expanded={picking} disabled={f.seats.length >= max} onClick={() => setPicking(!picking)}>
                  Add a seat
                </Button>
                {picking && <Picker bridge="" drafts={f.seats.map((s) => s.agent)} draftHandles={f.seats.map((s) => s.handle)} onPick={addSeat} onClose={() => setPicking(false)} anchor={addKey} place="key" />}
              </span>
              {err.seats && (
                <span class="field-error" role="alert">
                  {err.seats}
                </span>
              )}
            </section>
          )}

          <Advanced open={adv} onToggle={setAdv}>
            <Field label="Title">
              <Input value={f.title} maxLength={120} placeholder={titleOf(f.goal)} onInput={(e) => patch({ title: (e.target as HTMLInputElement).value })} />
            </Field>
            <Choices name="placement" legend="Placement" value={f.placement} options={PLACEMENTS} onChange={(placement) => patch({ placement })} error={err.placement} />
            {/* The manager picks the caps and what it can do when it opens the bridge, so a job for the manager asks neither. */}
            {!manager && (
              <>
                <fieldset>
                  <legend>
                    Caps <Help label="What the caps are">Each cap counts the whole bridge. The bridge stops at a cap until you raise it. An empty field keeps the usual cap of the server.</Help>
                  </legend>
                  <div class="field-row">
                    {CAPS.map(([k, label]) => (
                      <Field label={label} error={err.caps[k]}>
                        <Input type="number" min={1} inputMode="numeric" placeholder="Usual" value={f.caps[k] || ''} invalid={!!err.caps[k]} onInput={(e) => patch({ caps: { ...f.caps, [k]: (e.target as HTMLInputElement).value } })} />
                      </Field>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>What the manager can do here</legend>
                  {DELEGATION.map(([k, label]) => (
                    <label class="check">
                      <input type="checkbox" checked={f.delegation[k]} onChange={(e) => patch({ delegation: { ...f.delegation, [k]: (e.target as HTMLInputElement).checked } })} />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              </>
            )}
          </Advanced>

          <div class="form-end">
            <Button onClick={cancel}>Cancel</Button>
            <Button type="submit" kind="primary" disabled={busy}>
              {manager ? 'Ask the manager' : 'Open bridge'}
            </Button>
          </div>
        </div>
      </form>
      {discard && (
        <Confirm
          title="Throw away this bridge?"
          confirm="Throw away"
          danger
          onCancel={() => setDiscard(false)}
          onConfirm={() => {
            forget();
            setDiscard(false);
            go('#');
          }}
        >
          <p>The job and the seats that you wrote go. No bridge opens.</p>
        </Confirm>
      )}
    </section>
  );
}
