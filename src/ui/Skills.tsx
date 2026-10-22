// The Skills place. The list pane holds the skills grouped by origin
// (Imported, Local, and one group per server), then the tools (Built in,
// and one group per server). The main pane shows the skill or the tool that
// the person picked, and the agents that can load it. The details pane
// holds Add skill and the actions on the item. Screen C builds the place
// out (docs/DESIGN.md, section 11): the text of a skill, the chooser of Add
// skill with its four avenues and the preview before Install, Remove, and
// Copy of the slash command. This first cut lists and shows.

import { useEffect } from 'preact/hooks';
import type { Skill, Tool } from '../api/types';
import { useSelect } from '../state/store';
import { loadSkills } from '../state/actions';
import { hrefOf, type SkillItem } from '../lib/route';
import { useRoving } from './keys';
import { attempt } from './notice';
import { Button, Chip, Mark, PaneHeader } from './primitives';

interface Group<T> {
  key: string;
  title: string;
  items: T[];
}

/** skillGroups groups the skills by origin: Imported, Local, then one group per server. */
export function skillGroups(skills: Skill[]): Group<Skill>[] {
  const out: Group<Skill>[] = [
    { key: 'imported', title: 'Imported', items: skills.filter((s) => s.origin === 'imported') },
    { key: 'local', title: 'Local', items: skills.filter((s) => s.origin === 'local') },
  ];
  const servers = [...new Set(skills.filter((s) => s.origin === 'server').map((s) => s.server || 'server'))].sort();
  for (const sv of servers) out.push({ key: 'server:' + sv, title: sv, items: skills.filter((s) => s.origin === 'server' && (s.server || 'server') === sv) });
  return out.filter((g) => g.items.length > 0);
}

/** toolGroups groups the tools: Built in, then one group per server. */
export function toolGroups(tools: Tool[]): Group<Tool>[] {
  const out: Group<Tool>[] = [{ key: 'builtin', title: 'Built in', items: tools.filter((t) => t.origin === 'builtin') }];
  const servers = [...new Set(tools.filter((t) => t.origin === 'server').map((t) => t.server || 'server'))].sort();
  for (const sv of servers) out.push({ key: 'server:' + sv, title: sv, items: tools.filter((t) => t.origin === 'server' && (t.server || 'server') === sv) });
  return out.filter((g) => g.items.length > 0);
}

function useSkills() {
  const all = useSelect((s) => s.skills);
  useEffect(() => {
    if (!all) attempt(loadSkills);
  }, []);
  return all;
}

export function SkillList({ current }: { current?: SkillItem }) {
  const all = useSkills();
  const list = useRoving<HTMLDivElement>();
  const row = (kind: 'skill' | 'tool', id: string, name: string, description: string) => {
    const on = !!current && current.kind === kind && current.id === id;
    return (
      <div role="listitem">
        <a class={'srow' + (on ? ' sel' : '')} href={hrefOf({ place: 'skills', item: { kind, id } })} data-item aria-current={on ? 'page' : undefined}>
          <span class="t-sub clip">{name}</span>
          <span class="t-meta clip">{description}</span>
        </a>
      </div>
    );
  };
  return (
    <section class="screen skill-list" aria-labelledby="skills-title">
      <PaneHeader id="skills-title" title="Skills" count={all ? all.skills.length : undefined} countLabel={all ? all.skills.length + ' skills' : undefined} />
      <div class="scroll" ref={list}>
        {!all && <p class="empty">Loading the skills.</p>}
        {all &&
          skillGroups(all.skills).map((g) => (
            <div class="group" role="group" aria-labelledby={'g-' + g.key}>
              <h3 class="group-head" id={'g-' + g.key}>
                <span>{g.title}</span>
                <Chip>{g.items.length}</Chip>
              </h3>
              <div role="list" class="rows">
                {g.items.map((s) => row('skill', s.name, s.name, s.description))}
              </div>
            </div>
          ))}
        {all && all.tools.length > 0 && (
          <h2 class="group-title t-heading">
            Tools <Chip label={all.tools.length + ' tools'}>{all.tools.length}</Chip>
          </h2>
        )}
        {all &&
          toolGroups(all.tools).map((g) => (
            <div class="group" role="group" aria-labelledby={'t-' + g.key}>
              <h3 class="group-head" id={'t-' + g.key}>
                <span>{g.title}</span>
                <Chip>{g.items.length}</Chip>
              </h3>
              <div role="list" class="rows">
                {g.items.map((t) => row('tool', t.id, t.name, t.description))}
              </div>
            </div>
          ))}
        {all && all.skills.length === 0 && all.tools.length === 0 && (
          <div class="empty">
            <p>No skill yet. Add one from a marketplace, an address, or a SKILL.md.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function itemOf(all: ReturnType<typeof useSkills>, item?: SkillItem): Skill | Tool | undefined {
  if (!all || !item) return undefined;
  return item.kind === 'skill' ? all.skills.find((s) => s.name === item.id) : all.tools.find((t) => t.id === item.id);
}

export function SkillMain({ item }: { item?: SkillItem }) {
  const all = useSkills();
  const it = itemOf(all, item);
  if (!item || !it) {
    return (
      <section class="screen">
        <div class="empty center">
          <p>{item && all ? 'This skill is not here.' : 'Pick a skill or a tool in the list.'}</p>
        </div>
      </section>
    );
  }
  return (
    <section class="screen skill" aria-labelledby="skill-title">
      <PaneHeader id="skill-title" title={it.name} size="title" level={1} back={{ href: '#skills', label: 'Skills', to: 'list' }} />
      <div class="scroll pad">
        <p class="skill-description">{it.description}</p>
        <h2 class="t-sub section-head">
          Agents that can load it <Chip>{it.agents.length}</Chip>
        </h2>
        <ul class="agent-chips">
          {it.agents.map((a) => (
            <li>
              <a href={hrefOf({ place: 'fleet', agent: a })}>
                <Mark agent={a} size={20} />
                <span>{a}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function SkillActions({ item }: { item?: SkillItem }) {
  return (
    <section class="screen skill-actions" aria-labelledby="skill-actions-title">
      <PaneHeader id="skill-actions-title" title={item ? (item.kind === 'skill' ? 'Skill' : 'Tool') : 'Add'} back={item ? { href: hrefOf({ place: 'skills', item }), label: item.id, to: 'main' } : undefined} />
      <div class="pad">
        <Button kind="primary" disabled>
          Add skill
        </Button>
      </div>
    </section>
  );
}
