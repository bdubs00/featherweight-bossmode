// Button is a key. A primary key is raised on a 2-pixel hard edge in the
// accent, with a light top line, and sits one pixel higher. A secondary key
// sits on a 1-pixel hard edge. A quiet key has no edge and no ground. A
// danger key is a secondary key with the red word, for an action that
// cannot be undone. With href, the key is a link.

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentChildren, Ref, VNode } from 'preact';
import { forwardRef } from 'preact/compat';
import { Glyph, type GlyphName } from '../icons';

export type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger';

type Common = {
  kind?: ButtonKind;
  /** m is 36 pixels, s is 32. Both grow to 44 on touch. */
  size?: 'm' | 's';
  icon?: GlyphName;
  children?: ComponentChildren;
  class?: string;
};

export type ButtonProps = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'icon'> & { href?: undefined };
export type LinkButtonProps = Common & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'size' | 'icon'> & { href: string };

export function buttonClass(kind: ButtonKind = 'secondary', size: 'm' | 's' = 'm', extra = ''): string {
  return 'key key-' + kind + ' key-' + size + (extra ? ' ' + extra : '');
}

/** The two shapes of Button: a button, or a link with href. Each takes the ref of its element. */
type ButtonComponent = {
  (p: ButtonProps & { ref?: Ref<HTMLButtonElement> }): VNode | null;
  (p: LinkButtonProps & { ref?: Ref<HTMLAnchorElement> }): VNode | null;
};

/** Button is a key. Its ref reaches the button or the link, so a screen can give the focus back to it. */
export const Button = forwardRef(function Button(p: ButtonProps | LinkButtonProps, ref: Ref<HTMLButtonElement | HTMLAnchorElement>) {
  const { kind = 'secondary', size = 'm', icon, children, class: cls, ...rest } = p;
  const inner = (
    <>
      {icon && <Glyph name={icon} size={size === 's' ? 16 : 18} />}
      {children}
    </>
  );
  if (typeof p.href === 'string') {
    return (
      <a ref={ref as Ref<HTMLAnchorElement>} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} class={buttonClass(kind, size, cls)}>
        {inner}
      </a>
    );
  }
  const b = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button ref={ref as Ref<HTMLButtonElement>} type="button" {...b} class={buttonClass(kind, size, cls)}>
      {inner}
    </button>
  );
}) as unknown as ButtonComponent;

/** IconButton is a key with one glyph and a name for a screen reader and a tooltip. */
export function IconButton(p: Omit<ButtonProps, 'children' | 'icon'> & { icon: GlyphName; label: string }) {
  const { kind = 'quiet', size = 's', icon, label, class: cls, ...rest } = p;
  return (
    <button type="button" aria-label={label} title={label} {...rest} class={buttonClass(kind, size, 'key-icon' + (cls ? ' ' + cls : ''))}>
      <Glyph name={icon} size={18} />
    </button>
  );
}
