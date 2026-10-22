// The Skills place. The list pane holds the skills grouped by origin
// (Imported, Local, and one group per server), then the tools (Built in,
// and one group per server). The main pane shows the text of the skill or
// the description of the tool that the person picked, and the agents that
// can load it. The details pane holds Add skill, which opens the chooser of
// AddSkill.tsx in the main pane, and the actions on the item: Copy of the
// slash command, and Remove for an imported skill. An admin alone adds and
// removes skills. The catalog names no agent, so while the place is open
// the page reads the skills of each agent of the fleet, and forgets them
// when the place closes.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Tool } from '../api/types';
import { store, useSelect } from '../state/store';
import { forgetAgentSkills, loadAgentSkills, loadAgents, loadSkills } from '../state/actions';
import { catalogOf, docOf, skillGroups, toolGroups, type CatalogSkill, type CatalogTool, type Group, type SkillDoc } from '../lib/catalog';
import { go, hrefOf, type SkillItem } from '../lib/route';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { Confirm, Markdown } from './common';
import { Glyph } from './icons';
import { Button, Chip, Mark, PaneHeader } from './primitives';
import { EmptyPane } from './Shell';
import { AddSkill, closeAddSkill, openAddSkill, useAddSkillOpen } from './AddSkill';

/* ---------- the catalog ---------- */

/**
 * The tools of GET /v1/tools, for a backend whose catalog of skills holds
 * no tools. The three panes share one read.
 */
let toolsRead: Promise<Tool[]> | null = null;
let toolsCache: Tool[] | null = null;

/** forgetTools drops the tools of GET /v1/tools, for the tests. */
export function forgetTools(): void {
  toolsRead = null;
  toolsCache = null;
}

export interface Catalog {
  skills: CatalogSkill[];
  tools: CatalogTool[];
}

/** useCatalog reads the skills and the tools of the fleet, or null while they load. */
export function useCatalog(): Catalog | null {
  const raw = useSelect((s) => s.skills);
  const skillsOf = useSelect((s) => s.agentSkills);
  const agents = useSelect((s) => s.agents);
  const [tools, setTools] = useState<Tool[] | null>(toolsCache);
  useEffect(() => {
    if (!raw) attempt(loadSkills);
  }, []);
  useEffect(() => {
    if (!raw || (raw.tools && raw.tools.length > 0)) return;
    if (!toolsRead) {
      toolsRead = api
        .tools()
        .then((list) => (toolsCache = list))
        .catch(() => (toolsCache = []));
    }
    let live = true;
    toolsRead.then((t) => live && setTools(t));
    return () => {
      live = false;
    };
  }, [raw]);
  const cat = useMemo(() => (raw ? catalogOf(raw, tools, { skillsOf, agents }) : null), [raw, tools, skillsOf, agents]);
  return cat;
}

/** agentsOfFleet names every agent that the page knows: the agents of GET /v1/agents and the agents of the members of the fleet. */
function agentsOfFleet(): string[] {
  const s = store.get();
  const names = new Set((s.agents || []).map((a) => a.name));
  for (const m of (s.fleet && s.fleet.members) || []) for (const a of m.agents || []) names.add(a.name);
  return [...names].sort();
}

/**
 * useLoaders reads the skills that each agent of the fleet can load, while
 * the Skills place is open, so the place can name the agents that can load
 * a skill. It forgets them when the place closes.
 */
function useLoaders(): void {
  const agents = useSelect((s) => s.agents);
  const fleet = useSelect((s) => s.fleet);
  useEffect(() => {
    if (!agents) attempt(loadAgents);
  }, []);
  useEffect(() => {
    for (const a of agentsOfFleet()) loadAgentSkills(a).catch(() => {});
  }, [agents, fleet]);
  useEffect(() => () => forgetAgentSkills(), []);
}

/** useAdmin reports whether whoami says the person is an admin. */
export function useAdmin(): boolean {
  return useSelect((s) => !!(s.me && s.me.admin));
}

function itemOf(cat: Catalog | null, item?: SkillItem): CatalogSkill | CatalogTool | undefined {
  if (!cat || !item) return undefined;
  return item.kind === 'skill' ? cat.skills.find((s) => s.name === item.id) : cat.tools.find((t) => t.id === item.id);
}

/* ---------- the list ---------- */

function GroupRows<T extends { name: string; description: string }>({ g, kind, idOf, current }: { g: Group<T>; kind: 'skill' | 'tool'; idOf: (x: T) => string; current?: SkillItem }) {
  const id = kind + '-' + g.key;
  return (
    <div class="group" role="group" aria-labelledby={id}>
      <h3 class="group-head" id={id}>
        <span>{g.title}</span>
        <Chip>{g.items.length}</Chip>
      </h3>
      <div role="list" class="c-rows">
        {g.items.map((x) => {
          const on = !!current && current.kind === kind && current.id === idOf(x);
          return (
            <div role="listitem">
              <a class={'srow' + (on ? ' sel' : '')} href={hrefOf({ place: 'skills', item: { kind, id: idOf(x) } })} data-item aria-current={on ? 'page' : undefined}>
                <span class="t-sub clip">{x.name}</span>
                <span class="t-meta clip">{x.description}</span>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SkillList({ current }: { current?: SkillItem }) {
  useLoaders();
  const cat = useCatalog();
  const admin = useAdmin();
  const list = useRoving<HTMLDivElement>();
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase();
  const hit = (x: { name: string; description: string }) => !words || x.name.toLowerCase().includes(words) || x.description.toLowerCase().includes(words);
  const skills = cat ? cat.skills.filter(hit) : [];
  const tools = cat ? cat.tools.filter(hit) : [];
  const many = !!cat && cat.skills.length + cat.tools.length > 10;
  return (
    <section class="screen skill-list" aria-labelledby="skills-title">
      <PaneHeader
        id="skills-title"
        title="Skills"
        count={cat ? cat.skills.length : undefined}
        countLabel={cat ? cat.skills.length + ' skills' : undefined}
        actions={
          admin ? (
            <Button size="s" class="collapsed-only" onClick={openAddSkill}>
              Add skill
            </Button>
          ) : undefined
        }
      />
      <div class="scroll" ref={list}>
        {many && (
          <div class="find recess">
            <Glyph name="search" size={16} />
            <input type="search" placeholder="Find a skill" aria-label="Find a skill or a tool" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          </div>
        )}
        {!cat && <p class="empty">Loading the skills.</p>}
        {cat && cat.skills.length === 0 && (
          <div class="empty">
            <p>No skill yet.</p>
            {admin && <Button onClick={openAddSkill}>Add skill</Button>}
          </div>
        )}
        {skillGroups(skills).map((g) => (
          <GroupRows g={g} kind="skill" idOf={(s) => s.name} current={current} />
        ))}
        {tools.length > 0 && (
          <h2 class="group-title t-heading">
            Tools <Chip label={tools.length + ' tools'}>{tools.length}</Chip>
          </h2>
        )}
        {toolGroups(tools).map((g) => (
          <GroupRows g={g} kind="tool" idOf={(t) => t.id} current={current} />
        ))}
        {cat && words && skills.length + tools.length === 0 && <p class="empty">No skill holds those words.</p>}
      </div>
    </section>
  );
}

/* ---------- the item ---------- */

function AgentsThatLoad({ agents }: { agents: string[] }) {
  return (
    <section class="msec" aria-labelledby="loaders">
      <h2 class="sec-head t-sub" id="loaders">
        Agents that can load it <Chip>{agents.length}</Chip>
      </h2>
      {agents.length > 0 && (
        <ul class="loaders">
          {agents.map((a) => (
            <li>
              <a href={hrefOf({ place: 'fleet', agent: a })}>
                <Mark agent={a} size={32} />
                <span class="t-sub">{a}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** chipsOf are the keys of the front matter of a skill, as chips: the text first, the catalog where the text has none. */
function chipsOf(s: CatalogSkill, doc: SkillDoc | null): [string, string][] {
  const out: [string, string][] = doc ? [...doc.frontMatter] : [];
  if (s.argumentHint && !out.some(([x]) => x === 'argument-hint')) out.push(['argument-hint', s.argumentHint]);
  return out;
}

function SkillView({ s }: { s: CatalogSkill }) {
  const [doc, setDoc] = useState<SkillDoc | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    let live = true;
    setDoc(null);
    setFailed('');
    api
      .skillFile(s.name)
      .then((d) => live && setDoc(docOf(d)))
      .catch((e) => live && setFailed(e instanceof Error ? e.message : 'The action failed. Try it again.'));
    return () => {
      live = false;
    };
  }, [s.name]);
  const chips = chipsOf(s, doc);
  return (
    <>
      <p class="c-lede">{s.description}</p>
      {chips.length > 0 && (
        <ul class="fm" aria-label="Front matter">
          {chips.map(([k, v]) => (
            <li>
              <span class="fm-key">{k}</span>
              <span class="fm-value">{v}</span>
            </li>
          ))}
        </ul>
      )}
      {!doc && !failed && <p class="t-meta">Loading the skill.</p>}
      {failed && (
        <p class="alert" role="alert">
          {failed}
        </p>
      )}
      {doc && <Markdown text={doc.body} class="article skill-text" />}
      <AgentsThatLoad agents={s.agents} />
    </>
  );
}

function ItemMenu({ s, admin, onRemove }: { s: CatalogSkill; admin: boolean; onRemove: () => void }) {
  if (!s.slash && !(admin && s.kind === 'imported')) return null;
  return (
    <span class="collapsed-only head-keys">
      <CopyKey slash={s.slash} />
      {admin && s.kind === 'imported' && (
        <Button size="s" kind="danger" onClick={onRemove}>
          Remove
        </Button>
      )}
    </span>
  );
}

/** SkillMain is the main pane of Skills. With add, from the address #skills/add, it opens the chooser. */
export function SkillMain({ item, add }: { item?: SkillItem; add?: boolean }) {
  const cat = useCatalog();
  const admin = useAdmin();
  const adding = useAddSkillOpen();
  useEffect(() => {
    if (add) openAddSkill();
  }, [add]);
  const [ask, setAsk] = useState(false);
  if (adding && admin) return <AddSkill />;
  const it = itemOf(cat, item);
  if (!item || !it) {
    return (
      <EmptyPane back={{ href: '#skills', label: 'Skills' }}>
        <p>{item && cat ? 'This skill is not here. It can be removed, or it was renamed.' : 'Pick a skill or a tool in the list.'}</p>
      </EmptyPane>
    );
  }
  const skill = item.kind === 'skill' ? (it as CatalogSkill) : null;
  const tool = item.kind === 'tool' ? (it as CatalogTool) : null;
  return (
    <section class="screen skill" aria-labelledby="skill-title">
      <PaneHeader
        id="skill-title"
        title={it.name}
        size="title"
        level={1}
        back={{ href: '#skills', label: 'Skills', to: 'list' }}
        actions={skill ? <ItemMenu s={skill} admin={admin} onRemove={() => setAsk(true)} /> : undefined}
      >
        <Chip>{skill ? (skill.kind === 'server' ? skill.server : skill.kind) : tool!.builtin ? 'built in' : tool!.server}</Chip>
      </PaneHeader>
      <div class="scroll pad">
        {skill ? (
          <SkillView s={skill} />
        ) : (
          <>
            <p class="c-lede">{tool!.description}</p>
            <AgentsThatLoad agents={tool!.agents} />
          </>
        )}
      </div>
      {ask && skill && <RemoveSkill s={skill} onDone={() => setAsk(false)} />}
    </section>
  );
}

/* ---------- the actions ---------- */

/** CopyKey copies the slash command of a skill and says so for a moment. */
function CopyKey({ slash }: { slash: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  if (!slash) return null;
  return (
    <Button
      size="s"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(slash);
          setCopied(true);
        } catch (e) {
          showError(e);
        }
      }}
    >
      <span aria-live="polite">{(copied ? 'Copied ' : 'Copy ') + slash}</span>
    </Button>
  );
}

function RemoveSkill({ s, onDone }: { s: CatalogSkill; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Confirm
      title={'Remove ' + s.name + '?'}
      confirm={'Remove ' + s.name}
      danger
      busy={busy}
      onCancel={onDone}
      onConfirm={async () => {
        setBusy(true);
        const ok = await attempt(async () => {
          await api.removeSkill(s.name);
          await loadSkills();
        });
        setBusy(false);
        onDone();
        if (ok) go({ place: 'skills' });
      }}
    >
      <p>No agent can load it after this.</p>
    </Confirm>
  );
}

/** ImportedList names the imported skills and where each came from: the names that an install can replace. */
function ImportedList({ skills }: { skills: CatalogSkill[] }) {
  if (skills.length === 0) return null;
  return (
    <section class="dsec" aria-labelledby="imported-head">
      <h2 class="sec-head t-sub" id="imported-head">
        Imported <Chip>{skills.length}</Chip>
      </h2>
      <ul class="imported">
        {skills.map((s) => (
          <li>
            <a href={hrefOf({ place: 'skills', item: { kind: 'skill', id: s.name } })} class="t-sub">
              {s.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SkillActions({ item }: { item?: SkillItem }) {
  const cat = useCatalog();
  const admin = useAdmin();
  const adding = useAddSkillOpen();
  const it = itemOf(cat, item);
  const skill = it && item && item.kind === 'skill' ? (it as CatalogSkill) : undefined;
  const tool = it && item && item.kind === 'tool' ? (it as CatalogTool) : undefined;
  const [ask, setAsk] = useState(false);
  return (
    <section class="screen skill-actions" aria-labelledby="skill-actions-title">
      <PaneHeader
        id="skill-actions-title"
        title={adding ? 'Skills' : skill ? 'Skill' : tool ? 'Tool' : 'Skills'}
        actions={
          admin ? (
            <Button size="s" aria-pressed={adding} onClick={() => (adding ? closeAddSkill() : openAddSkill())}>
              Add skill
            </Button>
          ) : undefined
        }
      />
      <div class="scroll">
        {skill && !adding && (
          <div class="dsec">
            <h2 class="sec-head t-sub">{skill.slash ? <code class="slash">{skill.slash}</code> : skill.name}</h2>
            <p class="t-meta">
              {skill.kind === 'server' ? skill.server : skill.kind === 'imported' ? 'Imported' : 'Local'}
            </p>
            <div class="dsec-keys">
              <CopyKey slash={skill.slash} />
              {admin && skill.kind === 'imported' && (
                <Button size="s" kind="danger" onClick={() => setAsk(true)}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        )}
        {tool && !adding && (
          <div class="dsec">
            <h2 class="sec-head t-sub">
              <code class="slash">{tool.id}</code>
            </h2>
            <p class="t-meta">{tool.builtin ? 'Built in' : tool.server}</p>
          </div>
        )}
        {cat && (adding || !it) && <ImportedList skills={cat.skills.filter((x) => x.kind === 'imported')} />}
      </div>
      {ask && skill && <RemoveSkill s={skill} onDone={() => setAsk(false)} />}
    </section>
  );
}
