// The entry of the page. The theme that the person picked applies before
// the first draw, so the page never flashes the other theme.

import { render } from 'preact';
import { App } from './ui/App';
import { applyChoice, readChoice } from './lib/theme';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/primitives.css';
import './styles/shell.css';
import './styles/legacy.css';
import './styles/channel.css';
import './styles/fleet.css';
import './styles/wiki.css';

applyChoice(readChoice());
render(<App />, document.getElementById('app')!);
