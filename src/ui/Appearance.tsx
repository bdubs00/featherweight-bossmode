// Appearance: the theme that the person picks, and the theme of the
// deployment. Screen C reworks it (docs/DESIGN.md, section 11). The account
// menu offers the same choice.

import { useSelect } from '../state/store';
import { setChoice, themeOf, useChoice, type ThemeChoice } from '../lib/theme';
import { PaneHeader } from './primitives';

const CHOICES: [ThemeChoice, string][] = [
  ['system', 'Match the system'],
  ['light', 'Light'],
  ['dark', 'Graphite'],
];

export function Appearance() {
  const choice = useChoice();
  const theme = themeOf(useSelect((s) => s.config));
  return (
    <section class="screen appearance" aria-labelledby="appearance-title">
      <PaneHeader id="appearance-title" title="Appearance" size="title" level={1} back={{ href: '#', label: 'Bridges', to: 'list' }} />
      <div class="scroll pad">
        <fieldset class="choices">
          <legend class="t-sub">Theme</legend>
          {CHOICES.map(([c, label]) => (
            <label class="check">
              <input type="radio" name="theme" checked={choice === c} onChange={() => setChoice(c)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <p class="t-meta">
          {theme.name ? theme.name + ' sets the accent ' : 'The accent is '}
          {theme.accent}.
        </p>
      </div>
    </section>
  );
}
