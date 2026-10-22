// The shell of the page: the app bar and the three panes. In a wide window
// the list, the main, and the details pane show side by side. In a medium
// window two show: the list and the main pane, or the main and the details
// pane when the route puts the focus on the details. In a narrow window one
// pane shows at a time, and the app bar becomes a bar of places at the
// bottom of a list. docs/DESIGN.md, section 5, draws the layouts.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { useSelect } from '../state/store';
import { columnOf, placeOf, type Column, type Place, type Route } from '../lib/route';
import { themeOf, setChoice, useChoice, type ThemeChoice } from '../lib/theme';
import { personName } from '../lib/words';
import { awakeWorkers } from '../lib/workers';
import { Glyph, type GlyphName } from './icons';
import { Avatar, Chip, LogoWell, Led, countText } from './primitives';

/* ---------- the logo of the deployment ---------- */

let logoCache: { path: string; url: string } | null = null;

/** useLogo reads the logo of the theme behind the token, once per path, as a blob URL. */
export function useLogo(path: string): string {
  const [url, setUrl] = useState(logoCache && logoCache.path === path ? logoCache.url : '');
  useEffect(() => {
    if (!path) {
      setUrl('');
      return;
    }
    if (logoCache && logoCache.path === path) {
      setUrl(logoCache.url);
      return;
    }
    let live = true;
    api
      .logoBlob(path)
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        if (logoCache) URL.revokeObjectURL(logoCache.url);
        logoCache = { path, url: u };
        if (live) setUrl(u);
      })
      .catch(() => {
        // A logo that fails to load leaves the empty well. The page needs no logo.
      });
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}

/* ---------- the app bar ---------- */

interface PlaceItem {
  id: Exclude<Place, 'account'>;
  label: string;
  glyph: GlyphName;
  href: string;
}

/** The last address of each place, so a place opens where the person left it. */
const lastOf: Partial<Record<Place, string>> = {};

const PLACES: PlaceItem[] = [
  { id: 'activity', label: 'Activity', glyph: 'activity', href: '#activity' },
  { id: 'chat', label: 'Chat', glyph: 'chat', href: '#chat' },
  { id: 'bridges', label: 'Bridges', glyph: 'bridges', href: '#' },
  { id: 'fleet', label: 'Fleet', glyph: 'fleet', href: '#fleet' },
  { id: 'skills', label: 'Skills', glyph: 'skills', href: '#skills' },
  { id: 'wiki', label: 'Wiki', glyph: 'wiki', href: '#pages' },
  { id: 'manager', label: 'Manager', glyph: 'manager', href: '#manager' },
];

const THEMES: [ThemeChoice, string][] = [
  ['system', 'Match the system'],
  ['light', 'Light'],
  ['dark', 'Graphite'],
];

/**
 * AccountMenu is the account key at the foot of the app bar: the name of
 * the person, the theme, Connections, and Sign out. ArrowUp and ArrowDown
 * move in the menu, and Escape closes it and gives the focus back.
 */
function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  const me = useSelect((s) => s.me);
  const choice = useChoice();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const subject = (me && me.principal && me.principal.subject) || '';
  const name = (me && me.principal && (me.principal.name || personName(subject))) || 'You';
  useEffect(() => {
    if (!open) return;
    const first = list.current && (list.current.querySelector('[role^="menuitem"]') as HTMLElement | null);
    if (first) first.focus();
    const away = (e: Event) => {
      const t = e.target as Node;
      if (list.current && !list.current.contains(t) && btn.current && !btn.current.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const close = () => {
    setOpen(false);
    if (btn.current) btn.current.focus();
  };
  const onKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const all = [...(list.current ? list.current.querySelectorAll<HTMLElement>('[role^="menuitem"]') : [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[(i + 1) % all.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      all[(i - 1 + all.length) % all.length].focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };
  return (
    <div class="account pop">
      <button ref={btn} type="button" class="account-key" aria-label={name + ', account'} title={subject || name} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar subject={subject} display={me && me.principal ? me.principal.name : undefined} size={32} />
      </button>
      {open && (
        <div ref={list} class="menu menu-account" role="menu" aria-label="Account" onKeyDown={onKey}>
          <div class="menu-head" role="presentation">
            <div class="t-sub clip">{name}</div>
            <div class="t-meta clip">{subject}</div>
          </div>
          <div class="menu-sep" role="separator" />
          {THEMES.map(([c, label]) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={choice === c}
              onClick={() => {
                setChoice(c);
              }}
            >
              <span class="t">
                {label}
                {choice === c && <Glyph name="check" size={16} class="menu-check" />}
              </span>
            </button>
          ))}
          <div class="menu-sep" role="separator" />
          <a role="menuitem" href="/ui#connections">
            <span class="t">Connections</span>
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <span class="t">Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** AppBar is the column of places: the logo well, the seven places, and the account. */
export function AppBar({ route, onSignOut }: { route: Route; onSignOut: () => void }) {
  const place = placeOf(route);
  const config = useSelect((s) => s.config);
  // The count on Activity is the number of members that need you, over the open bridges.
  const attention = useSelect((s) => s.bridges.order.reduce((n, id) => n + (s.bridges.byId[id].state === 'open' ? s.bridges.byId[id].needsYou || 0 : 0), 0));
  const theme = themeOf(config);
  const logo = useLogo(theme.logo);
  return (
    <nav class="appbar" aria-label="Places">
      <LogoWell src={logo} name={theme.name} href="#" />
      <div class="places">
        {PLACES.map((it) => {
          const on = it.id === place;
          const count = it.id === 'activity' ? attention : 0;
          return (
            <a class={'place' + (on ? ' on' : '')} href={on ? it.href : lastOf[it.id] || it.href} aria-current={on ? 'page' : undefined}>
              <Glyph name={it.glyph} size={22} />
              <span class="place-label">{it.label}</span>
              {count > 0 && (
                <Chip tone="ink" class="place-count" label={count === 1 ? '1 member needs you' : count + ' members need you'}>
                  {countText(count)}
                </Chip>
              )}
            </a>
          );
        })}
      </div>
      <AccountMenu onSignOut={onSignOut} />
    </nav>
  );
}

/* ---------- the live status ---------- */

/** LiveStatus is the state of the stream and the number of awake workers, for the foot of a list. */
export function LiveStatus() {
  const status = useSelect((s) => s.stream.status);
  const awake = useSelect((s) => awakeWorkers(s.fleet));
  const known = useSelect((s) => !!s.fleet);
  const word = status === 'live' ? 'Live' : status === 'closed' ? 'Offline' : 'Connecting';
  return (
    <div class="live-status" role="status">
      <Led tone={status === 'live' ? 'green' : status === 'closed' ? 'red' : 'grey'} word={word} label={status === 'live' ? 'Updates arrive as they happen.' : 'The page connects to the workbench again.'} />
      {known && <span class="t-meta">{awake === 1 ? '1 worker awake' : awake + ' workers awake'}</span>}
    </div>
  );
}

/* ---------- an empty pane ---------- */

/**
 * EmptyPane is a pane with nothing picked: the header row and its groove
 * band, so the bands of the panes stay in one line, and the invitation to
 * act in the middle.
 */
export function EmptyPane({ children, back }: { children: ComponentChildren; back?: { href: string; label: string } }) {
  return (
    <section class="screen empty-pane">
      <header class="pane-head" aria-hidden={back ? undefined : 'true'}>
        {back && (
          <a class="back to-list" href={back.href} aria-label={'Back to ' + back.label} title={'Back to ' + back.label}>
            <Glyph name="back" size={20} />
          </a>
        )}
      </header>
      <div class="groove groove-paper" aria-hidden="true" />
      <div class="empty center">{children}</div>
    </section>
  );
}

/* ---------- the shell ---------- */

export interface ShellProps {
  route: Route;
  list: ComponentChildren | null;
  main: ComponentChildren;
  details: ComponentChildren | null;
  notice?: ComponentChildren;
  onSignOut: () => void;
}

/** shownOf is the column that a narrow window shows: the focus of the route, or the main pane when that column is empty. */
export function shownOf(focus: Column, hasList: boolean, hasDetails: boolean): Column {
  if (focus === 'list' && !hasList) return 'main';
  if (focus === 'details' && !hasDetails) return 'main';
  return focus;
}

export function Shell({ route, list, main, details, notice, onSignOut }: ShellProps) {
  const place = placeOf(route);
  const shown = shownOf(columnOf(route), !!list, !!details);
  // Each place remembers its last address for the app bar.
  useEffect(() => {
    lastOf[place] = location.hash || '#';
  });
  return (
    <div class="shell" data-show={shown} data-place={place} data-list={list ? '1' : '0'} data-details={details ? '1' : '0'}>
      <AppBar route={route} onSignOut={onSignOut} />
      {list && (
        <section class="pane pane-list" aria-label="List">
          {list}
        </section>
      )}
      <main class="pane pane-main" id="main">
        {notice}
        {main}
      </main>
      {details && (
        <aside class="pane pane-details" aria-label="Details">
          {details}
        </aside>
      )}
    </div>
  );
}
