// Appearance: the theme that the person picks, the same choice as the
// account menu offers. The accent and the logo belong to the deployment,
// and the page does not change them.

import { setChoice, useChoice, type ThemeChoice } from '../lib/theme';
import { Choices, PaneHeader } from './primitives';

export const CHOICES: [ThemeChoice, string][] = [
  ['system', 'Match the system'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export function Appearance() {
  const choice = useChoice();
  return (
    <section class="screen appearance" aria-labelledby="appearance-title">
      <PaneHeader id="appearance-title" title="Appearance" size="title" level={1} back={{ href: '#', label: 'Teams', to: 'list' }} />
      <div class="scroll pad">
        <div class="make">
          <Choices name="theme" legend="Theme" value={choice} options={CHOICES.map(([id, label]) => ({ id, label }))} onChange={setChoice} />
        </div>
      </div>
    </section>
  );
}
