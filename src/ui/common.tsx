// The small parts that every screen uses: faces, lights, Markdown, times,
// menus, and the confirmation dialog of the page. Face, Avatar, and Light
// draw the primitives of src/ui/primitives under the names of the screens.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { renderInline, renderMarkdown } from '../lib/markdown';
import { pageReason } from '../lib/pagepath';
import { quotedTexts, refCandidates, type Refs } from '../lib/refs';
import { loadPages } from '../state/actions';
import { useSelect } from '../state/store';
import type { Light as LightT } from '../lib/presence';
import { clock, dayWords } from '../lib/words';
import { Glyph } from './icons';
import { Avatar as PersonAvatar, GrooveBand, Led, Mark, buttonClass, type MarkSize } from './primitives';

export type Size = 16 | 20 | 24 | 32 | 36 | 40 | 64 | 72 | 96;

/**
 * Face shows the face of an agent: the mark that the page draws from the
 * name, or the custom picture of the API. It is the Mark primitive under
 * the name that the screens use.
 */
export function Face({ agent, size = 32 }: { agent: string; size?: Size }) {
  return <Mark agent={agent} size={(size === 16 ? 20 : size) as MarkSize} />;
}

/** Avatar shows a person as initials on an ink square. A person has no face in the API. */
export function Avatar({ subject, display, size = 32 }: { subject: string; display?: string; size?: Size }) {
  const s = size <= 20 ? 20 : size <= 24 ? 24 : size <= 32 ? 32 : 36;
  return <PersonAvatar subject={subject} display={display} size={s} />;
}

/** Light shows a status: its light and its word. With short, the word stays for a screen reader and a tooltip. */
export function Light({ light, short }: { light: LightT; short?: boolean }) {
  return <Led tone={light.tone} word={light.word} struck={light.struck} quiet={short} label={light.label} />;
}

/** The read of the page list that a message started, once for the page. It answers false when the read failed. */
let pagesRead: Promise<boolean> | null = null;
const readPages = (): Promise<boolean> =>
  (pagesRead ||= loadPages().then(
    () => true,
    () => false,
  ));

/**
 * useRefs gives what a text of a message can name and the page knows: the
 * titles of the bridges whose ids it holds, and the pages of the wiki
 * whose paths it holds. The page reads the list of the wiki once, for the
 * first message that holds a path, and the stream keeps it current. Until
 * the list arrives, a path links nothing. If the read fails, a path that
 * follows the rules of a page path links.
 */
function useRefs(text: string): { refs?: Refs; key: string } {
  const cands = useMemo(() => (text ? refCandidates(text) : null), [text]);
  // A text in double quotes that is the exact title of a bridge that the page knows links that bridge; the newest bridge of a title wins.
  const quoted = useMemo(() => (text ? quotedTexts(text) : []), [text]);
  const titleKey = useSelect((s) => {
    if (!quoted.length) return '';
    const out: string[] = [];
    for (const q of quoted) {
      const id = s.bridges.order.find((x) => s.bridges.byId[x] && s.bridges.byId[x].title === q);
      if (id) out.push(q + '\u0001' + id);
    }
    return out.join('\u0002');
  });
  const bridgeKey = useSelect((s) =>
    cands && cands.words.length
      ? cands.words
          .filter((w) => s.bridges.byId[w])
          .map((w) => w + '\u0001' + (s.bridges.byId[w].title || w))
          .join('\u0002')
      : '',
  );
  const loaded = useSelect((s) => s.pages.loaded);
  const pageKey = useSelect((s) => (cands && cands.paths.length ? cands.paths.filter((p) => !!s.pages.byPath[p]).join('\n') : ''));
  const [failed, setFailed] = useState(false);
  const wants = !!cands && cands.paths.length > 0 && !loaded;
  useEffect(() => {
    if (wants) readPages().then((ok) => !ok && setFailed(true));
  }, [wants]);
  return useMemo(() => {
    if (!cands) return { key: '' };
    const bridges: Record<string, string> = {};
    for (const line of bridgeKey ? bridgeKey.split('\u0002') : []) {
      const [id, title] = line.split('\u0001');
      bridges[id] = title;
    }
    const titles: Record<string, string> = {};
    for (const line of titleKey ? titleKey.split('\u0002') : []) {
      const [title, id] = line.split('\u0001');
      titles[title] = id;
    }
    const held = new Set(pageKey ? pageKey.split('\n') : []);
    const page = loaded ? (p: string) => held.has(p) : failed ? (p: string) => pageReason(p) === '' : () => false;
    return { refs: { bridges, page, titles }, key: bridgeKey + '\u0003' + titleKey + '\u0003' + pageKey + (loaded ? 'L' : failed ? 'F' : '') };
  }, [cands, bridgeKey, titleKey, pageKey, loaded, failed]);
}

/**
 * Markdown shows a text of an agent or of the wiki, sanitized. With refs,
 * the text of a message links the bridges and the pages that it names.
 */
export function Markdown({ text, base, handles, class: cls, refs }: { text: string; base?: string; handles?: string[]; class?: string; refs?: boolean }) {
  const r = useRefs(refs ? text : '');
  const key = (handles ? handles.join(',') : '') + '\n' + r.key;
  const html = useMemo(() => renderMarkdown(text, { base, handles, refs: r.refs }), [text, base, key]);
  return <div class={'md' + (cls ? ' ' + cls : '')} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** InlineMarkdown shows one line, such as a system line, sanitized and with no block element. */
export function InlineMarkdown({ text }: { text: string }) {
  const html = useMemo(() => renderInline(text), [text]);
  return <span class="md-inline" dangerouslySetInnerHTML={{ __html: html }} />;
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
 * Each dialog names itself by its own title, so a dialog that opens over
 * another one keeps its name.
 */
export function Confirm(props: {
  title: string;
  children?: ComponentChildren;
  confirm: string;
  danger?: boolean;
  busy?: boolean;
  /** A class of the dialog, such as the one of a tall form that scrolls. */
  class?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<Element | null>(null);
  const titleId = 'confirm-' + useId();
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
      // A modal dialog makes the rest of the page inert until it closes,
      // and the dialog leaves the document only after this cleanup. So the
      // dialog closes first, else the focus falls to the body.
      if (d && d.open) {
        if (typeof d.close === 'function') d.close();
        else d.removeAttribute('open');
      }
      const el = back.current as HTMLElement | null;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class={'confirm' + (props.class ? ' ' + props.class : '')}
      aria-labelledby={titleId}
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
      <GrooveBand on="card" />
      <div class="confirm-body">
        <h2 id={titleId}>{props.title}</h2>
        {props.children}
        <div class="do">
          <button type="button" class={buttonClass('secondary')} data-cancel onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" class={buttonClass(props.danger ? 'danger' : 'primary')} disabled={props.busy} onClick={props.onConfirm}>
            {props.confirm}
          </button>
        </div>
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
 * The key is quiet in a row, and a secondary key, with its edge and its
 * drop, on the header of a pane.
 */
export function Menu({ label, items, icon = 'more', kind = 'quiet', class: cls }: { label: string; items: MenuItem[]; icon?: 'more' | 'gear'; kind?: 'quiet' | 'secondary'; class?: string }) {
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
      <button ref={btn} type="button" class={buttonClass(kind, 's', 'key-icon')} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Glyph name={icon} size={18} />
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
 * Back is the link to the column before. With narrow set, it shows only
 * where that column is out of sight. Without narrow, it always shows. The
 * screens of the next stage use the back of PaneHeader instead.
 */
export function Back({ label, href, narrow }: { label: string; href: string; narrow?: boolean }) {
  return (
    <a class={'back ' + (narrow ? 'to-list' : 'always')} href={href} aria-label={'Back to ' + label} title={'Back to ' + label}>
      <Glyph name="back" size={20} />
    </a>
  );
}

/** Empty is the text of a place with nothing in it, with the key that fills it when there is one. */
export function Empty({ children }: { children: ComponentChildren }) {
  return (
    <div class="empty">
      <p>{children}</p>
    </div>
  );
}
