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
import { forgetAgentSkills, loadAgentSkills, loadAgents, loadFleet, loadSkills } from '../state/actions';
import { selectAgents } from '../state/agents';
import { catalogOf, docOf, skillGroups, toolGroups, type CatalogSkill, type CatalogTool, type Group, type SkillDoc } from '../lib/catalog';
import { go, hrefOf, type SkillItem } from '../lib/route';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { Confirm, Markdown } from './common';
import { Button, Chip, Find, Mark, PaneHeader } from './primitives';
import { EmptyPane } from './Shell';
import { AddSkill, openAddSkill, useAddSkillOpen } from './AddSkill';

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
  const agents = useSelect(selectAgents);
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

/** agentsOfFleet names every agent of the fleet (src/state/agents.ts). */
function agentsOfFleet(): string[] {
  return (selectAgents(store.get()) || []).map((a) => a.name);
}

/**
 * useLoaders reads the skills that each agent of the fleet can load, while
 * the Skills place is open, so the place can name the agents that can load
 * a skill. It forgets them when the place closes.
 */
function useLoaders(): void {
  const agents = useSelect(selectAgents);
  useEffect(() => {
    const s = store.get();
    if (!s.agents) attempt(loadAgents);
    if (!s.fleet) loadFleet().catch(() => {});
  }, []);
  useEffect(() => {
    for (const a of agentsOfFleet()) loadAgentSkills(a).catch(() => {});
  }, [agents]);
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
            <Button size="s" class="collapsed-only" href={ADD_SKILL}>
              Add skill
            </Button>
          ) : undefined
        }
      />
      <div class="scroll" ref={list}>
        {many && (
          <div class="list-find">
            <Find label="Find a skill or a tool" placeholder="Find a skill" value={q} onInput={setQ} />
          </div>
        )}
        {!cat && <p class="empty">Loading the skills.</p>}
        {cat && cat.skills.length === 0 && (
          <div class="empty">
            <p>No skill yet.</p>
            {admin && <Button href={ADD_SKILL}>Add skill</Button>}
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

/**
 * callOf is how a person calls a skill: its slash command and the hint of
 * its arguments, such as /proxmox-ops [task], or "" for a skill that only a
 * model loads. The hint comes from the catalog, else from the front matter
 * of the text.
 */
export function callOf(s: Pick<CatalogSkill, 'slash' | 'argumentHint'>, doc: SkillDoc | null): string {
  if (!s.slash) return '';
  const fromText = doc ? (doc.frontMatter.find(([k]) => k === 'argument-hint') || ['', ''])[1] : '';
  const hint = (s.argumentHint || fromText).trim();
  return hint ? s.slash + ' ' + hint : s.slash;
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
  // The front matter is for the agent that loads the skill. A person needs only the way to call it.
  const call = callOf(s, doc);
  return (
    <>
      <p class="c-lede">{s.description}</p>
      {call && (
        <p class="skill-call">
          <code>{call}</code>
        </p>
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

/** The width from which two panes show side by side, as App names it. */
const TWO_PANES = '(min-width: 800px)';

/** firstItem is the first skill of the list, else its first tool, else null. */
export function firstItem(cat: Catalog): SkillItem | null {
  const g = skillGroups(cat.skills)[0];
  if (g && g.items[0]) return { kind: 'skill', id: g.items[0].name };
  const t = toolGroups(cat.tools)[0];
  if (t && t.items[0]) return { kind: 'tool', id: t.items[0].id };
  return null;
}

/** The address of Add skill. A key that opens the chooser links there, so the address names the chooser. */
const ADD_SKILL = hrefOf({ place: 'skills', add: true });

/** SkillMain is the main pane of Skills. With add, from the address #skills/add, it opens the chooser. */
export function SkillMain({ item, add }: { item?: SkillItem; add?: boolean }) {
  const cat = useCatalog();
  const admin = useAdmin();
  const adding = useAddSkillOpen();
  useEffect(() => {
    if (add) openAddSkill();
  }, [add]);
  const [ask, setAsk] = useState(false);
  // Where two panes show, the place opens the first skill of the list, else the first tool, so the main pane is never empty beside the list.
  const first = !item && !add && !adding && cat ? firstItem(cat) : null;
  useEffect(() => {
    if (first && window.matchMedia(TWO_PANES).matches) go({ place: 'skills', item: first }, true);
  }, [first && first.kind + ':' + first.id]);
  if (adding && admin) return <AddSkill />;
  const it = itemOf(cat, item);
  if (!item || !it) {
    // The list says when it holds nothing, so the main pane does not say it twice.
    return <EmptyPane back={{ href: '#skills', label: 'Skills' }}>{item && cat ? <p>This skill is not here. It can be removed, or it was renamed.</p> : cat && !first ? null : <p>Pick a skill or a tool in the list.</p>}</EmptyPane>;
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
        <Chip class="head-kind">{skill ? (skill.kind === 'server' ? skill.server : skill.kind) : tool!.builtin ? 'built in' : tool!.server}</Chip>
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
      aria-label={(copied ? 'Copied ' : 'Copy ') + slash}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(slash);
          setCopied(true);
        } catch (e) {
          showError(e);
        }
      }}
    >
      <span aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
        <span class="copy-slash">{' ' + slash}</span>
      </span>
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
            <Button size="s" href={ADD_SKILL} aria-current={adding ? 'page' : undefined}>
              Add skill
            </Button>
          ) : undefined
        }
      />
      <div class="scroll">
        {/* The main pane names the skill, its origin, and how to call it, so the details hold its keys alone. */}
        {skill && !adding && (skill.slash || (admin && skill.kind === 'imported')) && (
          <div class="dsec">
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
        {cat && adding && <ImportedList skills={cat.skills.filter((x) => x.kind === 'imported')} />}
      </div>
      {ask && skill && <RemoveSkill s={skill} onDone={() => setAsk(false)} />}
    </section>
  );
}
