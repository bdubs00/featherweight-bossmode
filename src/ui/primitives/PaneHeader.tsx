// PaneHeader is the 56-pixel header of a pane, with the groove band under
// it: a back link where the column before is out of sight, the heading, its
// count as a chip on the same line, anything the screen adds, such as tabs,
// and the actions at the end.

import type { ComponentChildren, Ref } from 'preact';
import { Glyph } from '../icons';
import { Chip } from './Chip';
import { GrooveBand } from './GrooveBand';

export interface Back {
  href: string;
  /** The name of the place it goes back to, such as Bridges. */
  label: string;
  /**
   * The column of that place: the list or the main pane, which shows the
   * link only where that column is out of sight, or here, for a place in
   * the same pane, which always shows it.
   */
  to: 'list' | 'main' | 'here';
}

export interface PaneHeaderProps {
  title: ComponentChildren;
  /** title for the main pane (22 pixels, wide), heading for a list or details pane (18 pixels). */
  size?: 'title' | 'heading';
  level?: 1 | 2;
  id?: string;
  count?: ComponentChildren;
  countLabel?: string;
  back?: Back;
  /** Something before the heading, such as a mark. */
  lead?: ComponentChildren;
  /** Something after the heading and its chip, such as a meta line or tabs. */
  children?: ComponentChildren;
  actions?: ComponentChildren;
  headingRef?: Ref<HTMLHeadingElement>;
  focusable?: boolean;
}

export function PaneHeader(p: PaneHeaderProps) {
  const size = p.size || 'heading';
  const H = p.level === 1 ? 'h1' : 'h2';
  return (
    <>
      <header class={'pane-head pane-head-' + size}>
        {p.back && (
          <a class={'back to-' + p.back.to} href={p.back.href} aria-label={'Back to ' + p.back.label} title={'Back to ' + p.back.label}>
            <Glyph name="back" size={20} />
          </a>
        )}
        {p.lead}
        <H id={p.id} class={'t-' + size + ' clip'} ref={p.headingRef} tabIndex={p.focusable ? -1 : undefined}>
          {p.title}
        </H>
        {p.count !== undefined && p.count !== null && <Chip label={p.countLabel}>{p.count}</Chip>}
        {p.children}
        {p.actions && <div class="pane-actions">{p.actions}</div>}
      </header>
      <GrooveBand />
    </>
  );
}
