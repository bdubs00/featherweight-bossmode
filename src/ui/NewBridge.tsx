// Open a bridge. The one question first: what is the job. Then the seats,
// which the person picks, or which the manager splits from the goal. Then
// the placement, a visible choice of two: keep warm workers, the default,
// or a fresh sandbox per seat, which needs a manager. Advanced holds the
// title, filled from the goal, the handles, the caps, and what the manager
// can do. The record goes to POST /v1/bridges. A job for the manager goes to
// the conversation of the manager, which opens the bridge with its tools.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Caps, Delegation, Placement } from '../api/types';
import type { NewBridge as NewBridgeBody } from '../api/routes';
import { useSelect } from '../state/store';
import { loadAgents, openNewBridge } from '../state/actions';
import { askManager } from '../state/manager';
import { handleReason, nextHandle } from '../lib/handles';
import { go } from '../lib/route';
import { attempt } from './notice';
import { Glyph } from './icons';
import { Button, Field, IconButton, Input, Mark, PaneHeader, TextArea } from './primitives';

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

/** askOf is the message that hands the job to the manager, to split into seats. */
export function askOf(f: BridgeForm): string {
  const place = f.placement === 'spawn' ? 'fresh sandbox per seat (spawn)' : 'keep warm workers (queue)';
  const lines = ['Open a bridge for this job. Split it into seats, pick an agent for each seat, and seat them.', '', 'Job: ' + f.goal.trim(), 'Placement: ' + place];
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
    placement: (config && config.placement) || 'queue',
    title: '',
    caps: {},
    delegation: { approve: false, budget: false, members: false, report: true },
  }));
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof bridgeErrors> | null>(null);
  const first = useRef<HTMLTextAreaElement>(null);
  const usable = useMemo(() => (agents || []).filter((a) => a.role === 'owner' || a.role === 'operator'), [agents]);
  const max = (config && config.maxMembers) || 16;

  useEffect(() => {
    if (!agents) attempt(loadAgents);
    if (first.current) first.current.focus();
  }, []);

  const patch = (p: Partial<BridgeForm>) => {
    setF((x) => ({ ...x, ...p }));
    if (errors) setErrors(null);
  };
  const setGoal = (goal: string) => setF((x) => ({ ...x, goal, seats: x.seats.map((s) => (s.own ? s : { ...s, task: goal.trim().split('\n')[0] })) }));
  const addSeat = (agent: string) =>
    setF((x) => ({ ...x, seats: [...x.seats, { key: ++seatKey, agent, handle: nextHandle(agent, x.seats.map((s) => s.handle)), task: x.goal.trim().split('\n')[0], own: false }] }));
  const setSeat = (key: number, p: Partial<SeatRow>) => setF((x) => ({ ...x, seats: x.seats.map((s) => (s.key === key ? { ...s, ...p } : s)) }));

  const submit = async (e: Event) => {
    e.preventDefault();
    const errs = bridgeErrors(f, hasManager);
    const bad = !!(errs.goal || errs.seats || errs.placement || Object.keys(errs.seat).length || Object.keys(errs.caps).length);
    setErrors(bad ? errs : null);
    if (bad) {
      if (Object.keys(errs.caps).length || (Object.keys(errs.seat).length && !adv)) setAdv(true);
      return;
    }
    setBusy(true);
    let to = '';
    await attempt(async () => {
      if (f.mode === 'manager') {
        await askManager(askOf(f));
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
            <fieldset>
              <legend>Seats</legend>
              <div class="choices" role="radiogroup">
                <label class={'choice' + (f.mode === 'pick' ? ' on' : '')}>
                  <input type="radio" name="mode" checked={f.mode === 'pick'} onChange={() => patch({ mode: 'pick' })} />
                  <span class="t-sub">Pick the seats</span>
                </label>
                <label class={'choice' + (f.mode === 'manager' ? ' on' : '')}>
                  <input type="radio" name="mode" checked={f.mode === 'manager'} onChange={() => patch({ mode: 'manager' })} />
                  <span class="t-sub">Let the manager split it</span>
                </label>
              </div>
            </fieldset>
          )}

          {f.mode === 'pick' && (
            <section class="seats" aria-labelledby="seats-head">
              <h2 class="field-label" id="seats-head">
                {hasManager ? 'Add a seat' : 'Seats'}
              </h2>
              <div class="agent-keys">
                {usable.map((a) => (
                  <Button size="s" disabled={f.seats.length >= max} onClick={() => addSeat(a.name)} title={a.description}>
                    <Mark agent={a.name} size={20} />
                    {a.name}
                  </Button>
                ))}
                {agents && usable.length === 0 && <p class="t-meta">No agent yet.</p>}
              </div>
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
              {err.seats && (
                <span class="field-error" role="alert">
                  {err.seats}
                </span>
              )}
            </section>
          )}

          <fieldset>
            <legend>Placement</legend>
            <div class="choices" role="radiogroup">
              {PLACEMENTS.map((p) => (
                <label class={'choice' + (f.placement === p.id ? ' on' : '')}>
                  <input type="radio" name="placement" value={p.id} checked={f.placement === p.id} onChange={() => patch({ placement: p.id })} />
                  <span class="t-sub">{p.label}</span>
                </label>
              ))}
            </div>
            {err.placement && (
              <span class="field-error" role="alert">
                {err.placement}
              </span>
            )}
          </fieldset>

          <details class="advanced" open={adv} onToggle={(e) => setAdv((e.target as HTMLDetailsElement).open)}>
            <summary>
              <Glyph name="back" size={16} />
              Advanced
            </summary>
            <div class="advanced-body">
              <Field label="Title">
                <Input value={f.title} maxLength={120} placeholder={titleOf(f.goal)} onInput={(e) => patch({ title: (e.target as HTMLInputElement).value })} />
              </Field>
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
            </div>
          </details>

          <div class="form-end">
            <Button href="#">Cancel</Button>
            <Button type="submit" kind="primary" disabled={busy}>
              Open bridge
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
