// A new agent, at #new-agent. The name and what it handles come first,
// then how many can work at once, with 2 as the default, and the template
// of its workers when the settings offer more than one. Then the skills.
// Advanced holds the model, the effort, the budget, the point of the
// context compaction, the rules, and the time zone. Create agent sends PUT
// /v1/agents/{name} with the profile and workers, and the answer shows the
// workers that the front made. Preview sends the same with ?dryRun=true
// and saves nothing. The face is the mark that the page draws from the
// name. The manager can draw another one later, and a person can upload
// an SVG on the profile.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { AgentSaved, NewProfile, Template, WorkersAsk } from '../api/types';
import { templatesOf } from '../lib/workers';
import { store, useSelect } from '../state/store';
import { loadAgents, loadFaces, loadFleet } from '../state/actions';
import { selectAgents } from '../state/agents';
import { forgetProfiles } from '../state/profiles';
import { phaseOf } from '../lib/presence';
import { go, hrefOf } from '../lib/route';
import { useCatalog } from './Skills';
import { SkillPicker } from './SkillPicker';
import { attempt, showSaid } from './notice';
import { Advanced, Button, Chip, Field, Input, Led, Mark, PaneHeader, TextArea } from './primitives';
import { Abilities } from './Abilities';
import { abilitiesOf, rulesWords } from '../lib/tools';
import { policyRules } from '../state/people';
import { useToolCatalog } from '../state/tools';

/** The default number of workers of a new agent, as fleet.DefaultWorkers of the backend. */
export const DEFAULT_WORKERS = 2;
/** The most workers that the screen asks for. */
export const MAX_WORKERS = 32;
/** The default point of the context compaction, in estimated tokens, as the kernel sets it. */
export const DEFAULT_COMPACTION = 262144;
/** The efforts that the kernel takes. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** The time zone of the browser, which the placeholder of the field names. */
const BROWSER_ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
  } catch {
    return 'Europe/Berlin';
  }
})();
/** The rule of the name of a profile, as the kernel checks it. */
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;

/** The fields of the form, as text, the way the person typed them. */
export interface AgentForm {
  name: string;
  what: string;
  workers: string;
  template: string;
  skills: string[];
  model: string;
  effort: string;
  turns: string;
  tokens: string;
  cost: string;
  compactAt: string;
  compactModel: string;
  ask: string;
  deny: string;
  timeZone: string;
}

/** defaultTemplate is the template that the settings mark as the default, or the first one. */
export function defaultTemplate(templates: Template[]): string {
  const d = templates.find((t) => t.default) || templates[0];
  return d ? d.name : '';
}

export function emptyForm(templates: Template[]): AgentForm {
  return {
    name: '',
    what: '',
    workers: String(DEFAULT_WORKERS),
    template: defaultTemplate(templates),
    skills: [],
    model: '',
    effort: '',
    turns: '',
    tokens: '',
    cost: '',
    compactAt: String(DEFAULT_COMPACTION),
    compactModel: '',
    ask: '',
    deny: '',
    timeZone: '',
  };
}

const listOf = (s: string): string[] =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** formErrors says what is wrong with each field, or nothing. taken holds the names of the agents that exist. */
export function formErrors(f: AgentForm, taken: string[]): Partial<Record<keyof AgentForm, string>> {
  const out: Partial<Record<keyof AgentForm, string>> = {};
  const name = f.name.trim();
  if (!name) out.name = 'Write the name of the agent.';
  else if (!NAME.test(name)) out.name = 'A name holds letters, digits, dots, dashes, or underscores, at most 64.';
  else if (taken.includes(name)) out.name = `An agent named ${name} exists. Pick another name.`;
  const n = Number(f.workers);
  if (!Number.isInteger(n) || n < 1 || n > MAX_WORKERS) out.workers = `Pick a number from 1 to ${MAX_WORKERS}.`;
  const whole = (v: string) => v.trim() === '' || (Number.isInteger(Number(v)) && Number(v) > 0);
  if (!whole(f.turns)) out.turns = 'Write a whole number.';
  if (!whole(f.tokens)) out.tokens = 'Write a whole number.';
  if (f.cost.trim() !== '' && !(Number(f.cost) > 0)) out.cost = 'Write an amount in dollars, such as 2.50.';
  if (f.compactAt.trim() === '' || !Number.isInteger(Number(f.compactAt)) || Number(f.compactAt) < 1024) out.compactAt = 'Write a whole number of tokens, at least 1024.';
  return out;
}

/**
 * requestOf builds the profile and the workers that Create agent sends.
 * What the agent handles becomes its description and its first
 * instruction. A field left empty stays out, so the agent takes the value
 * of the configuration. A template goes out only when the settings offer
 * more than one.
 */
export function requestOf(f: AgentForm, templates: Template[]): { profile: NewProfile; workers: WorkersAsk } {
  const what = f.what.trim();
  const profile: NewProfile = { skills: [...f.skills] };
  if (what) {
    profile.description = what.split('\n')[0].trim().slice(0, 200);
    profile.instructions = [what];
  }
  if (f.model.trim()) profile.model = f.model.trim();
  if (f.effort) profile.effort = f.effort;
  if (f.timeZone.trim()) profile.timeZone = f.timeZone.trim();
  const ask = listOf(f.ask);
  const deny = listOf(f.deny);
  if (ask.length || deny.length) profile.policy = { ...(ask.length ? { ask } : {}), ...(deny.length ? { deny } : {}) };
  const budget: NewProfile['budget'] = {};
  if (f.turns.trim()) budget.maxTurns = Number(f.turns);
  if (f.tokens.trim()) budget.maxTokens = Number(f.tokens);
  if (f.cost.trim()) budget.maxCostUSD = Number(f.cost);
  if (Object.keys(budget).length) profile.budget = budget;
  const at = Number(f.compactAt);
  if (at !== DEFAULT_COMPACTION || f.compactModel.trim()) profile.compaction = { at, ...(f.compactModel.trim() ? { model: f.compactModel.trim() } : {}) };
  const workers: WorkersAsk = { replicas: Number(f.workers) };
  if (templates.length > 1 && f.template) workers.template = f.template;
  return { profile, workers };
}

/**
 * Can shows what the new agent can do, as the profile words it: the tools
 * that its workers give a profile that names none, and the rules that ask
 * first, those of the workers and those of the form. The answer of a
 * Preview carries the tools and the rules of the workers.
 */
function Can({ saved, ask }: { saved: AgentSaved; ask: string[] }) {
  const catalog = useToolCatalog();
  const tools = saved.workerTools || [];
  const abilities = useMemo(() => abilitiesOf(tools, catalog), [tools.join('\n'), catalog]);
  const rules = useMemo(() => rulesWords([...new Set([...policyRules(saved.workerPolicy), ...ask])].sort(), catalog), [saved.workerPolicy, ask.join('\n'), catalog]);
  if (abilities.length === 0 && rules.length === 0) return null;
  return (
    <section class="workers-out" aria-labelledby="can-out">
      <h2 class="sec-head t-sub" id="can-out">
        What it can do
      </h2>
      <Abilities abilities={abilities} rules={rules} label="Tools and rules" />
    </section>
  );
}

/** Workers shows the workers of the answer, never the word pool. named shows the template, when the settings offer a choice. */
function Workers({ saved, dry, named }: { saved: AgentSaved; dry: boolean; named: boolean }) {
  const pool = saved.pool;
  if (!pool) return null;
  const tasks = pool.tasks || [];
  return (
    <section class="workers-out" aria-labelledby="workers-out">
      <h2 class="sec-head t-sub" id="workers-out">
        Workers <Chip>{pool.wanted}</Chip>
        {named && pool.template && <span class="t-meta">{pool.template}</span>}
      </h2>
      {dry || tasks.length === 0 ? (
        <p class="t-meta">{pool.wanted === 1 ? '1 worker starts when you create the agent.' : pool.wanted + ' workers start when you create the agent.'}</p>
      ) : (
        <ul class="worker-rows">
          {tasks.map((t) => {
            const l = phaseOf(t.phase);
            return (
              <li>
                <span class="wname">{t.name}</span>
                <Led tone={l.tone} word={l.word} label={l.label} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function NewAgent() {
  const config = useSelect((s) => s.config);
  const agents = useSelect((s) => s.agents);
  const known = useSelect(selectAgents);
  const fleet = useSelect((s) => s.fleet);
  const cat = useCatalog();
  const templates = useMemo(() => templatesOf(config), [config]);
  const [f, setF] = useState<AgentForm>(() => emptyForm(templates));
  const [errors, setErrors] = useState<Partial<Record<keyof AgentForm, string>>>({});
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ saved: AgentSaved; dry: boolean } | null>(null);
  const first = useRef<HTMLInputElement>(null);
  // A name of the front or of the fleet is taken.
  const taken = [...new Set([...(agents || []), ...(known || [])].map((a) => a.name))];

  useEffect(() => {
    if (!agents) attempt(loadAgents);
    if (first.current) first.current.focus();
  }, []);
  // The templates arrive with the settings, after a first draw.
  useEffect(() => {
    if (!f.template && templates.length) setF((x) => ({ ...x, template: defaultTemplate(templates) }));
  }, [templates]);

  // The pool of a saved agent follows the fleet: its workers start.
  const live = out && !out.dry && out.saved.pool && fleet && fleet.pools ? fleet.pools.find((p) => p.agent === out.saved.name) : undefined;
  const shown = out ? { ...out, saved: live ? { ...out.saved, pool: live } : out.saved } : null;

  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
    if (out) setOut(null);
  };
  const text = (k: keyof AgentForm) => (e: Event) => set(k, (e.target as HTMLInputElement).value as never);

  const send = async (dry: boolean) => {
    const errs = formErrors(f, taken);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      if (errs.compactAt || errs.turns || errs.tokens || errs.cost) {
        const adv = document.getElementById('agent-advanced') as HTMLDetailsElement | null;
        if (adv) adv.open = true;
      }
      // The first field with an error comes into view and takes the focus, so the key never seems to do nothing.
      requestAnimationFrame(() => {
        const bad = document.querySelector('.new-agent [aria-invalid="true"]') as HTMLElement | null;
        if (!bad) return;
        if ('scrollIntoView' in bad) bad.scrollIntoView({ block: 'center' });
        bad.focus();
      });
      return;
    }
    const { profile, workers } = requestOf(f, templates);
    let made = '';
    setBusy(true);
    await attempt(async () => {
      const saved = await api.putAgent(f.name.trim(), profile, workers, dry);
      setOut({ saved: { ...saved, name: saved.name || f.name.trim() }, dry });
      // The answer shows below the form, so it comes into view.
      requestAnimationFrame(() => {
        const el = document.querySelector('.new-agent .form-end');
        if (el && 'scrollIntoView' in el) el.scrollIntoView({ block: 'nearest' });
      });
      if (!dry) {
        forgetProfiles();
        await Promise.allSettled([loadAgents(), loadFaces(), loadFleet()]);
        made = saved.name || f.name.trim();
        // A read of the fleet that began before the save lacks the workers of the new agent, so the answer of the save stands in until the next read.
        const fleet = store.get().fleet;
        if (saved.pool && fleet && !(fleet.pools || []).some((p) => p.agent === made)) store.dispatch({ type: 'fleet', fleet: { ...fleet, pools: [...(fleet.pools || []), { ...saved.pool, agent: saved.pool.agent || made }] } });
      }
    });
    setBusy(false);
    // The new agent opens, and its conversation says when its worker can take a message.
    if (made) {
      showSaid('Made the agent ' + made + '. Its workers start now.');
      go({ place: 'fleet', agent: made });
    }
  };

  const name = f.name.trim();
  const saved = !!out && !out.dry;
  return (
    <section class="screen new-agent" aria-labelledby="new-agent-title">
      <PaneHeader id="new-agent-title" title="New agent" size="title" level={1} back={{ href: '#fleet', label: 'Fleet', to: 'list' }} />
      <form
        class="scroll pad"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send(false);
        }}
      >
        <div class="make">
          <div class="who-row">
            {/* The face that the agent will have, drawn from the name as the person types it, and an empty well before. */}
            {name ? <Mark agent={name} size={72} label={name} /> : <span class="mark s72 mark-empty" aria-hidden="true" />}
            <div class="who-fields">
              <Field label="Name" error={errors.name}>
                <Input ref={first} value={f.name} maxLength={64} invalid={!!errors.name} placeholder="linter" autoComplete="off" spellcheck={false} onInput={text('name')} />
              </Field>
              <Field label="What it handles">
                <TextArea rows={3} value={f.what} placeholder="Lints each Ansible role and fixes the warnings." onInput={text('what')} />
              </Field>
            </div>
          </div>
          <div class="field-row">
            <Field label="How many can work at once?" error={errors.workers} class="narrow">
              <Input type="number" min={1} max={MAX_WORKERS} step={1} inputMode="numeric" value={f.workers} invalid={!!errors.workers} onInput={text('workers')} />
            </Field>
            {templates.length > 1 && (
              <Field label="Template">
                <select class="recess" value={f.template} onChange={(e) => set('template', (e.target as HTMLSelectElement).value)}>
                  {templates.map((t) => (
                    <option value={t.name}>{t.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <section aria-labelledby="agent-skills">
            <h2 class="sec-head t-sub" id="agent-skills">
              Skills <Chip>{f.skills.length}</Chip>
            </h2>
            {cat ? <SkillPicker skills={cat.skills} value={f.skills} onChange={(v) => set('skills', v)} /> : <p class="t-meta">Loading the skills.</p>}
          </section>
          <Advanced id="agent-advanced">
            <div class="field-row">
              <Field label="Model">
                <Input value={f.model} spellcheck={false} placeholder="The default model" onInput={text('model')} />
              </Field>
              <Field label="Effort">
                <select class="recess" value={f.effort} onChange={(e) => set('effort', (e.target as HTMLSelectElement).value)}>
                  <option value="">Default</option>
                  {EFFORTS.map((x) => (
                    <option value={x}>{x}</option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset>
              <legend>Budget of a run</legend>
              <div class="field-row">
                <Field label="Turns" error={errors.turns}>
                  <Input type="number" min={1} inputMode="numeric" value={f.turns} invalid={!!errors.turns} onInput={text('turns')} />
                </Field>
                <Field label="Tokens" error={errors.tokens}>
                  <Input type="number" min={1} inputMode="numeric" value={f.tokens} invalid={!!errors.tokens} onInput={text('tokens')} />
                </Field>
                <Field label="Cost in dollars" error={errors.cost}>
                  <Input type="number" min={0} step="0.01" inputMode="decimal" value={f.cost} invalid={!!errors.cost} onInput={text('cost')} />
                </Field>
              </div>
            </fieldset>
            <fieldset>
              <legend>Context compaction</legend>
              <div class="field-row">
                <Field label="Compact at, in tokens" error={errors.compactAt}>
                  <Input type="number" min={1024} step={1024} inputMode="numeric" value={f.compactAt} invalid={!!errors.compactAt} onInput={text('compactAt')} />
                </Field>
                <Field label="Compaction model">
                  <Input value={f.compactModel} spellcheck={false} onInput={text('compactModel')} />
                </Field>
              </div>
            </fieldset>
            <fieldset>
              <legend>Rules</legend>
              <div class="field-row">
                <Field label="Ask before">
                  <Input value={f.ask} class="code-area" spellcheck={false} placeholder="bash: git push*" onInput={text('ask')} />
                </Field>
                <Field label="Never run">
                  <Input value={f.deny} class="code-area" spellcheck={false} placeholder="bash: rm -rf*" onInput={text('deny')} />
                </Field>
              </div>
            </fieldset>
            <Field label="Time zone" class="half">
              <Input value={f.timeZone} spellcheck={false} placeholder={BROWSER_ZONE} onInput={text('timeZone')} />
            </Field>
          </Advanced>
          {shown && shown.saved.exists && (
            <p class="alert" role="alert">
              An agent named {shown.saved.name} exists. Pick another name.
            </p>
          )}
          {saved && (
            <p class="note-line" role="status">
              <Led tone="green" word="saved" />
              <a href={hrefOf({ place: 'fleet', agent: out!.saved.name })}>Open {out!.saved.name}</a>
            </p>
          )}
          {shown && shown.dry && <Can saved={shown.saved} ask={listOf(f.ask)} />}
          {shown && <Workers saved={shown.saved} dry={shown.dry} named={templates.length > 1} />}
          <div class="form-end">
            <Button href="#fleet">Cancel</Button>
            <Button disabled={busy || saved} onClick={() => send(true)}>
              Preview
            </Button>
            <Button type="submit" kind="primary" disabled={busy || saved}>
              Create agent
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
