// SkillPicker is the list of skills with check boxes that the new-agent
// screen and the profile of an agent use. The skills sit in groups by
// origin, each with its description, and a search field narrows them. It
// writes profile.skills as names. A whole server goes on as its glob,
// server/*, so a skill that the server adds later is on too. A name that the
// catalog does not know stays in the value.

import { useMemo, useState } from 'preact/hooks';
import type { Skill } from '../api/types';
import { groupState, isOn, skillGroups, skillOf, toggleGroup, toggleSkill, type CatalogSkill } from '../lib/catalog';
import { Glyph } from './icons';
import { Chip } from './primitives';

export interface SkillPickerProps {
  /** The skills of the catalog: state.skills.skills, or the skills of catalogOf. */
  skills: (Skill | CatalogSkill)[];
  /** The names that are on, as profile.skills holds them. */
  value: string[];
  onChange: (next: string[]) => void;
  /** The name of the list for a screen reader. */
  label?: string;
}

const norm = (s: Skill | CatalogSkill): CatalogSkill => ('kind' in s ? s : skillOf(s as Skill & Record<string, unknown>));

export function SkillPicker({ skills, value, onChange, label = 'Skills' }: SkillPickerProps) {
  const [q, setQ] = useState('');
  const all = useMemo(() => skills.map(norm), [skills]);
  const groups = useMemo(() => skillGroups(all), [all]);
  const words = q.trim().toLowerCase();
  const shown = groups
    .map((g) => ({ g, items: words ? g.items.filter((s) => s.name.toLowerCase().includes(words) || s.description.toLowerCase().includes(words)) : g.items }))
    .filter((x) => x.items.length > 0);
  return (
    <div class="picker" role="group" aria-label={label}>
      {all.length > 6 && (
        <div class="find recess">
          <Glyph name="search" size={16} />
          <input type="search" placeholder="Find a skill" aria-label="Find a skill" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
      )}
      {all.length === 0 && <p class="t-meta">No skill yet.</p>}
      {all.length > 0 && shown.length === 0 && <p class="t-meta">No skill holds those words.</p>}
      {shown.map(({ g, items }) => {
        const state = groupState(value, g);
        return (
          <div class="pick-group" key={g.key}>
            <label class="pick-head">
              <input type="checkbox" checked={state === 'all'} indeterminate={state === 'some'} onChange={(e) => onChange(toggleGroup(value, g, (e.target as HTMLInputElement).checked))} />
              <span class="t-caption">{g.title}</span>
              <Chip>{g.items.length}</Chip>
              {g.server && state === 'all' && value.includes(g.server + '/*') && <code class="glob">{g.server}/*</code>}
            </label>
            {items.map((s) => (
              <label class="pick-row" key={s.name}>
                <input type="checkbox" checked={isOn(value, s)} onChange={(e) => onChange(toggleSkill(value, s, (e.target as HTMLInputElement).checked, all))} />
                <span class="pick-text">
                  <span class="t-sub clip">{s.name}</span>
                  <span class="t-meta clip">{s.description}</span>
                </span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}
