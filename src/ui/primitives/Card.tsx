// Card is a surface with a hard edge: the groove band, a title with an
// optional light, the body, and the actions at the end. A card is rare on
// purpose. The channel uses one for a decision that needs you, so the only
// hard black edge in the channel marks the only thing that waits.

import type { ComponentChildren } from 'preact';
import type { Tone } from '../../lib/presence';
import { GrooveBand } from './GrooveBand';

export interface CardProps {
  title?: ComponentChildren;
  /** The light beside the title. The title is its word. */
  tone?: Tone;
  /** True once, when the card arrives on the stream: it settles into place. */
  settle?: boolean;
  /** True when nothing waits: the edge turns to a line and the drop goes. */
  quiet?: boolean;
  actions?: ComponentChildren;
  children?: ComponentChildren;
  label?: string;
  class?: string;
}

export function Card({ title, tone, settle, quiet, actions, children, label, class: cls }: CardProps) {
  return (
    <section class={'card' + (settle ? ' settle' : '') + (quiet ? ' quiet' : '') + (cls ? ' ' + cls : '')} aria-label={label}>
      <GrooveBand on="card" />
      <div class="card-body">
        {title && (
          <div class="card-title">
            {tone && <span class={'led led-l led-' + tone + (tone === 'amber' && !quiet ? ' breathe' : '')} aria-hidden="true" />}
            <h3 class="t-heading">{title}</h3>
          </div>
        )}
        {children}
        {actions && <div class="card-actions">{actions}</div>}
      </div>
    </section>
  );
}
