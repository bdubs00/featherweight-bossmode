// Appearance: the theme that the person picks, the same choice as the
// account menu offers. The accent and the logo belong to the deployment,
// and the page does not change them.

import { setChoice, useChoice, type ThemeChoice } from '../lib/theme';
import { PaneHeader } from './primitives';

export const CHOICES: [ThemeChoice, string][] = [
  ['system', 'Match the system'],
  ['light', 'Light'],
  ['dark', 'Graphite'],
];

export function Appearance() {
  const choice = useChoice();
  return (
    <section class="screen appearance" aria-labelledby="appearance-title">
      <PaneHeader id="appearance-title" title="Appearance" size="title" level={1} back={{ href: '#', label: 'Bridges', to: 'list' }} />
      <div class="scroll pad">
        <fieldset class="make">
          <legend>Theme</legend>
          <div class="choices" role="radiogroup">
            {CHOICES.map(([c, label]) => (
              <label class={'choice' + (choice === c ? ' on' : '')}>
                <input type="radio" name="theme" value={c} checked={choice === c} onChange={() => setChoice(c)} />
                <span class="t-sub">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}
