// Open a bridge: a title, a goal, and the members, each with a handle, an
// agent, and a task. The workbench starts one run per member as the
// operator, and the channel says "Bridge opened".

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Delegation, Placement } from '../api/types';
import type { NewMember } from '../api/routes';
import { useSelect } from '../state/store';
import { loadAgents, openNewBridge } from '../state/actions';
import { go } from '../lib/route';
import { attempt } from './notice';
import { Back, Face } from './common';
import { Icon } from './icons';

const HANDLE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

export function NewBridge() {
  const agents = useSelect((s) => s.agents);
  const config = useSelect((s) => s.config);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [placement, setPlacement] = useState<Placement>((config && config.placement) || 'queue');
  const [rows, setRows] = useState<NewMember[]>([{ handle: '', agent: '', task: '' }]);
  const [delegation, setDelegation] = useState<Delegation>({ approve: false, budget: false, members: false, report: true });
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const first = useRef<HTMLInputElement>(null);
  const usable = (agents || []).filter((a) => a.role === 'owner' || a.role === 'operator');
  const max = (config && config.maxMembers) || 16;

  useEffect(() => {
    if (!agents) attempt(loadAgents);
    if (first.current) first.current.focus();
  }, []);

  const set = (i: number, patch: Partial<NewMember>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const check = (): string[] => {
    const out: string[] = [];
    if (!title.trim()) out.push('The bridge needs a title.');
    if (!goal.trim()) out.push('The bridge needs a goal.');
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const n = 'Member ' + (i + 1);
      if (!HANDLE.test(r.handle)) out.push(`${n} needs a handle of lower-case letters, digits, dots, dashes, or underscores.`);
      else if (seen.has(r.handle)) out.push(`The handle ${r.handle} is there twice.`);
      seen.add(r.handle);
      if (!r.agent) out.push(`${n} needs an agent.`);
      if (!r.task.trim()) out.push(`${n} needs a task.`);
    });
    if (placement === 'spawn' && !(config && config.manager)) out.push('A spawn bridge needs a manager, and this workbench has none.');
    return out;
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const p = check();
    setProblems(p);
    if (p.length) return;
    setBusy(true);
    let id = '';
    const ok = await attempt(async () => {
      id = await openNewBridge({ title: title.trim(), goal: goal.trim(), placement, members: rows.map((r) => ({ ...r, task: r.task.trim() })), delegation });
    });
    setBusy(false);
    if (ok && id) go({ place: 'bridge', id, pane: 'none' });
  };

  return (
    <section class="screen newbridge" aria-labelledby="new-title">
      <header class="bar">
        <Back narrow label="Bridges" href="#" />
        <div class="title">
          <h1 id="new-title">Open a bridge</h1>
          <p class="goal">One job, split into tasks, with one agent on each.</p>
        </div>
      </header>
      <form class="scroll pad form" onSubmit={submit} noValidate>
        {problems.length > 0 && (
          <div class="alert" role="alert">
            <ul>
              {problems.map((p) => (
                <li>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <label class="fld">
          <span>Title</span>
          <input ref={first} value={title} maxLength={120} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
        </label>
        <label class="fld">
          <span>Goal</span>
          <textarea value={goal} onInput={(e) => setGoal((e.target as HTMLTextAreaElement).value)} />
        </label>
        <fieldset class="members-form">
          <legend>Members</legend>
          {rows.map((r, i) => (
            <div class="mrow">
              {r.agent ? <Face agent={r.agent} size={32} /> : <span class="face s32 empty-face" aria-hidden="true" />}
              <label class="fld">
                <span>Handle</span>
                <input value={r.handle} maxLength={32} placeholder="reviewer" onInput={(e) => set(i, { handle: (e.target as HTMLInputElement).value.toLowerCase() })} />
              </label>
              <label class="fld">
                <span>Agent</span>
                <select value={r.agent} onChange={(e) => set(i, { agent: (e.target as HTMLSelectElement).value, handle: r.handle || (e.target as HTMLSelectElement).value })}>
                  <option value="">Pick an agent</option>
                  {usable.map((a) => (
                    <option value={a.name}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label class="fld wide">
                <span>Task</span>
                <input value={r.task} placeholder="Review each role against its manifest" onInput={(e) => set(i, { task: (e.target as HTMLInputElement).value })} />
              </label>
              <button type="button" class="icon-btn" aria-label={'Remove member ' + (i + 1)} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Icon name="close" />
              </button>
            </div>
          ))}
          <button type="button" class="btn small" disabled={rows.length >= max} onClick={() => setRows([...rows, { handle: '', agent: '', task: '' }])}>
            <Icon name="plus" /> Add a member
          </button>
        </fieldset>
        <fieldset>
          <legend>Placement</legend>
          <label class="check">
            <input type="radio" name="placement" checked={placement === 'queue'} onChange={() => setPlacement('queue')} />
            <span>
              <b>Queue.</b> Each member runs on a worker of the pool of its agent.
            </span>
          </label>
          <label class="check">
            <input type="radio" name="placement" checked={placement === 'spawn'} onChange={() => setPlacement('spawn')} />
            <span>
              <b>Spawn.</b> The manager seats each member in a child Task of its own, and its budget bounds the whole bridge.
            </span>
          </label>
        </fieldset>
        <fieldset>
          <legend>What the manager can do here</legend>
          {(
            [
              ['approve', 'Approve the calls of members'],
              ['budget', 'Change the budgets of members'],
              ['members', 'Add and remove members'],
              ['report', 'Write a report to the wiki when the bridge closes'],
            ] as [keyof Delegation, string][]
          ).map(([k, label]) => (
            <label class="check">
              <input type="checkbox" checked={delegation[k]} onChange={(e) => setDelegation({ ...delegation, [k]: (e.target as HTMLInputElement).checked })} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <p class="why">Each member starts a run as you. A bridge spends through the budgets of the pools of its members.</p>
        <div class="do end">
          <a class="btn" href="#">
            Cancel
          </a>
          <button type="submit" class="btn primary" disabled={busy}>
            Open the bridge
          </button>
        </div>
      </form>
    </section>
  );
}
