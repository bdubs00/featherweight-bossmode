// Open a bridge. The first view holds the one question, what is the job,
// and the seats, which the person picks, or which the manager splits from
// the goal. Advanced holds the rest: the title, filled from the goal, the
// handles, the placement, the caps, and what the manager can do. The
// placement is a choice of the deployer more than of a person: keep warm
// workers, the default, or a fresh sandbox per seat, which needs a manager.
// The record goes to POST /v1/bridges, and the key says Open bridge. A job
// for the manager goes to the conversation of the manager, where the plan
// of the seats will appear, and the key says Ask the manager.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Caps, Delegation, Placement } from '../api/types';
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
import { Advanced, Button, Choices, Field, IconButton, Input, Mark, PaneHeader, TextArea } from './primitives';

/** One seat of the form. task follows the goal until the person changes it. */
export interface SeatRow {
  key: number;
  agent: string;
  handle: string;
  task: string;
  own: boolean;
}

export type SeatMode = 'pick' | 'manager';

export const PLACEMENTS: { id: Placement; label: string }[] = [
  { id: 'queue', label: 'Keep warm workers' },
  { id: 'spawn', label: 'Fresh sandbox per seat' },
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

/** bridgeErrors says what is wrong with the form, by field. hasManager says whether the settings name a manager. */
export function bridgeErrors(f: BridgeForm, hasManager: boolean): { goal?: string; seats?: string; placement?: string; seat: Record<number, string>; caps: Partial<Record<keyof Caps, string>> } {
  const out: ReturnType<typeof bridgeErrors> = { seat: {}, caps: {} };
  if (!f.goal.trim()) out.goal = 'Write the goal of the bridge.';
  if (f.placement === 'spawn' && !hasManager) out.placement = 'A fresh sandbox per seat needs a manager. Pick keep warm workers, or set up a manager.';
  if (f.mode === 'pick') {
    if (f.seats.length === 0) out.seats = 'Member 1 needs an agent.';
    f.seats.forEach((s, i) => {
      const others = f.seats.filter((x) => x.key !== s.key).map((x) => x.handle);
      const why = handleReason(s.handle, others);
      if (why) out.seat[s.key] = why;
      else if (!s.agent) out.seat[s.key] = `Member ${i + 1} needs an agent.`;
      else if (!s.task.trim()) out.seat[s.key] = `Member ${i + 1} needs a task.`;
    });
  }
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
 * seats. The person reads it in the conversation of the manager, so it
 * names the placement only when the person picked another one than the
 * default of the deployment.
 */
export function askOf(f: BridgeForm, defaultPlacement: Placement = 'queue'): string {
  const lines = ['Open a bridge for this job. Split it into seats, pick an agent for each seat, and seat them.', '', 'Job: ' + f.goal.trim()];
  if (f.placement !== defaultPlacement) lines.push('Placement: ' + (f.placement === 'spawn' ? 'a fresh sandbox per seat (spawn)' : 'keep warm workers (queue)'));
  if (f.title.trim()) lines.push('Title: ' + f.title.trim());
  return lines.join('\n');
}

let seatKey = 0;

export function NewBridge() {
  const agents = useSelect((s) => s.agents);
  const config = useSelect((s) => s.config);
  const hasManager = !!(config && config.manager);
  const [f, setF] = useState<BridgeForm>(() => ({
    goal: '',
    mode: 'pick',
    seats: [],
    // Keep warm workers, unless the deployment picked a fresh sandbox per seat and has the manager that it needs.
    placement: config && config.placement === 'spawn' && config.manager ? 'spawn' : 'queue',
    title: '',
    caps: {},
    delegation: { approve: false, budget: false, members: false, report: true },
  }));
  const [adv, setAdv] = useState(false);
  const [picking, setPicking] = useState(false);
  const addKey = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof bridgeErrors> | null>(null);
  const first = useRef<HTMLTextAreaElement>(null);
  const max = (config && config.maxMembers) || 16;

  useEffect(() => {
    if (!agents) attempt(loadAgents);
    if (first.current) first.current.focus();
  }, []);

  const patch = (p: Partial<BridgeForm>) => {
    setF((x) => ({ ...x, ...p }));
    if (errors) setErrors(null);
  };
  // A seat takes its task from the first sentence of the goal, as a seat of the members pane does, until the person changes it.
  const setGoal = (goal: string) => setF((x) => ({ ...x, goal, seats: x.seats.map((s) => (s.own ? s : { ...s, task: taskOfGoal(goal) })) }));
  const addSeat = (agent: string) =>
    setF((x) => (x.seats.length >= max ? x : { ...x, seats: [...x.seats, { key: ++seatKey, agent, handle: nextHandle(agent, x.seats.map((s) => s.handle)), task: taskOfGoal(x.goal), own: false }] }));
  const setSeat = (key: number, p: Partial<SeatRow>) => setF((x) => ({ ...x, seats: x.seats.map((s) => (s.key === key ? { ...s, ...p } : s)) }));

  const submit = async (e: Event) => {
    e.preventDefault();
    const errs = bridgeErrors(f, hasManager);
    const bad = !!(errs.goal || errs.seats || errs.placement || Object.keys(errs.seat).length || Object.keys(errs.caps).length);
    setErrors(bad ? errs : null);
    if (bad) {
      if (errs.placement || Object.keys(errs.caps).length || (Object.keys(errs.seat).length && !adv)) setAdv(true);
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
    setBusy(false);
    if (to) go(to);
  };

  const err = errors || { seat: {} as Record<number, string>, caps: {} as Partial<Record<keyof Caps, string>> };
  return (
    <section class="screen newbridge" aria-labelledby="new-title">
      <PaneHeader id="new-title" title="Open a bridge" size="title" level={1} back={{ href: '#', label: 'Bridges', to: 'list' }} />
      <form class="scroll pad" onSubmit={submit} noValidate>
        <div class="make">
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
                        <Input aria-label={'Handle of ' + s.handle} value={s.handle} maxLength={32} invalid={!!err.seat[s.key]} spellcheck={false} onInput={(e) => setSeat(s.key, { handle: (e.target as HTMLInputElement).value.toLowerCase() })} />
                      ) : (
                        <span class="t-sub">{s.handle}</span>
                      )}
                      {s.agent !== s.handle && <span class="t-meta">{s.agent}</span>}
                    </div>
                    <Input aria-label={'Task of ' + s.handle} value={s.task} invalid={!!err.seat[s.key]} onInput={(e) => setSeat(s.key, { task: (e.target as HTMLInputElement).value, own: true })} />
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
            <fieldset>
              <legend>Caps</legend>
              <div class="field-row">
                {CAPS.map(([k, label]) => (
                  <Field label={label} error={err.caps[k]}>
                    <Input type="number" min={1} inputMode="numeric" value={f.caps[k] || ''} invalid={!!err.caps[k]} onInput={(e) => patch({ caps: { ...f.caps, [k]: (e.target as HTMLInputElement).value } })} />
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
          </Advanced>

          <div class="form-end">
            <Button href="#">Cancel</Button>
            <Button type="submit" kind="primary" disabled={busy}>
              {f.mode === 'manager' ? 'Ask the manager' : 'Open bridge'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
