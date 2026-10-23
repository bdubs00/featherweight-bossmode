// Abilities is what an agent or a chat can do, in the words of a person:
// one line per ability, such as Read and write the wiki, and one amber
// line per rule that asks first, such as Asks before git push. The raw
// names of the tools and the patterns of the rules sit in a tooltip. The
// profile of an agent and This chat show it. src/lib/tools.ts gives the
// words.

import type { Ability, RuleWords } from '../lib/tools';

export function Abilities({ abilities, rules = [], extra = [], label }: { abilities: Ability[]; rules?: RuleWords[]; extra?: string[]; label: string }) {
  if (abilities.length === 0 && rules.length === 0) return null;
  return (
    <ul class="abilities" aria-label={label}>
      {abilities.map((a) => (
        <li title={a.names.join(', ')}>
          {a.text}
          {a.names.some((n) => extra.includes(n)) && <span class="chip-note">for this chat</span>}
        </li>
      ))}
      {rules.map((r) => (
        <li class="ability-rule" title={r.raw.join('\n')}>
          {r.text}
        </li>
      ))}
    </ul>
  );
}
