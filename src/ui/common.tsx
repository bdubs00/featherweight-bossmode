// The small parts that every screen uses: faces, lights, Markdown, times,
// menus, and the confirmation dialog of the page.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useFace } from '../lib/faces';
import { renderMarkdown } from '../lib/markdown';
import type { Light as LightT } from '../lib/presence';
import { useSelect } from '../state/store';
import { clock, dayWords, personName } from '../lib/words';
import { Icon } from './icons';

export type Size = 16 | 20 | 24 | 32 | 40 | 64 | 96;

/** Face shows the face of an agent: the SVG of the API as a blob URL, else its initial. */
export function Face({ agent, size = 32 }: { agent: string; size?: Size }) {
  const hash = useSelect((s) => (s.faces[agent] ? s.faces[agent].hash : ''));
  const url = useFace(agent, hash);
  return (
    <span class={'face s' + size} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : <span class="initial">{(agent || '?').slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

/** hueOf picks one of eight calm hues from a name, for the avatar of a person. */
function hueOf(name: string): number {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ (ch.codePointAt(0) || 0), 16777619) >>> 0;
  return h % 8;
}

/** Avatar shows a person as initials on a calm color. A person has no face in the API. */
export function Avatar({ subject, display, size = 32 }: { subject: string; display?: string; size?: Size }) {
  const name = personName(subject, display);
  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
  return (
    <span class={'face person s' + size + ' hue' + hueOf(subject || name)} aria-hidden="true">
      <span class="initial">{initials || '?'}</span>
    </span>
  );
}

/** Light shows a status: its icon in its color, and its word. */
export function Light({ light, short }: { light: LightT; short?: boolean }) {
  return (
    <span class={'light ' + light.tone + (light.struck ? ' struck' : '')} title={light.label}>
      <Icon name={light.icon} />
      <span class={short ? 'w sr' : 'w'}>{light.word}</span>
    </span>
  );
}

/** Markdown shows a text of an agent or of the wiki, sanitized. */
export function Markdown({ text, base, handles, class: cls }: { text: string; base?: string; handles?: string[]; class?: string }) {
  const key = handles ? handles.join(',') : '';
  const html = useMemo(() => renderMarkdown(text, { base, handles }), [text, base, key]);
  return <div class={'md' + (cls ? ' ' + cls : '')} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** When shows the time of a moment, with the day and the full time on hover. */
export function When({ at }: { at: string }) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return null;
  return (
    <time dateTime={at} title={d.toLocaleString()}>
      {dayWords(at) === 'Today' ? clock(at) : dayWords(at) + ', ' + clock(at)}
    </time>
  );
}

/**
 * Confirm is the confirmation of the page: a modal dialog element, never a
 * browser dialog. It traps the focus, Escape closes it, and the first
 * button is Cancel, so Enter on the dialog does not destroy by accident.
 */
export function Confirm(props: {
  title: string;
  children?: ComponentChildren;
  confirm: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<Element | null>(null);
  useEffect(() => {
    back.current = document.activeElement;
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    const cancel = d && (d.querySelector('[data-cancel]') as HTMLElement | null);
    if (cancel) cancel.focus();
    return () => {
      const el = back.current as HTMLElement | null;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class="confirm"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        props.onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          props.onCancel();
        }
      }}
    >
      <h2 id="confirm-title">{props.title}</h2>
      {props.children}
      <div class="do">
        <button type="button" class="btn" data-cancel onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" class={'btn ' + (props.danger ? 'danger-fill' : 'primary')} disabled={props.busy} onClick={props.onConfirm}>
          {props.confirm}
        </button>
      </div>
    </dialog>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hint?: string;
}

/**
 * Menu is a button that opens a list of actions. ArrowUp and ArrowDown move
 * in the list, Enter picks, and Escape closes it and gives the focus back.
 */
export function Menu({ label, items, icon = 'more', class: cls }: { label: string; items: MenuItem[]; icon?: 'more' | 'gear'; class?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const first = list.current && (list.current.querySelector('button') as HTMLButtonElement | null);
    if (first) first.focus();
    const away = (e: Event) => {
      const t = e.target as Node;
      if (list.current && !list.current.contains(t) && btn.current && !btn.current.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const close = (focus = true) => {
    setOpen(false);
    if (focus && btn.current) btn.current.focus();
  };
  const onKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const all = [...(list.current ? list.current.querySelectorAll('button') : [])] as HTMLButtonElement[];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      e.stopPropagation();
      all[(i + 1) % all.length].focus();
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      e.stopPropagation();
      all[(i - 1 + all.length) % all.length].focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };
  return (
    <span class={'pop' + (cls ? ' ' + cls : '')}>
      <button ref={btn} type="button" class="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={icon} />
      </button>
      {open && (
        <div ref={list} class="menu" role="menu" aria-label={label} onKeyDown={onKey}>
          {items.map((it) => (
            <button
              type="button"
              role="menuitem"
              class={it.danger ? 'danger' : ''}
              onClick={() => {
                close();
                it.onSelect();
              }}
            >
              <span class="t">{it.label}</span>
              {it.hint && <span class="s">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * Back is the link to the column before. With narrow set, it shows only in
 * a narrow window, where that column is out of sight.
 */
export function Back({ label, href, narrow }: { label: string; href: string; narrow?: boolean }) {
  return (
    <a class={'back' + (narrow ? ' narrow-only' : '')} href={href}>
      <Icon name="back" />
      <span>{label}</span>
    </a>
  );
}

/** Empty is the quiet text of a place with nothing in it. */
export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="empty">{children}</p>;
}
