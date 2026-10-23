// The shell of the page: the app bar and the three panes. In a wide window
// the list, the main, and the details pane show side by side. In a medium
// window two show: the list and the main pane, or the main and the details
// pane when the route puts the focus on the details. In a narrow window one
// pane shows at a time, and the app bar becomes a bar of places at the
// bottom of a list. docs/DESIGN.md, section 5, draws the layouts.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { useSelect } from '../state/store';
import { columnOf, placeOf, type Column, type Place, type Route } from '../lib/route';
import { themeOf, setChoice, useChoice, type ThemeChoice } from '../lib/theme';
import { personName } from '../lib/words';
import { LAMP_ORDER, readoutOf, type Lamp, type LampKind, type Readout } from '../lib/status';
import { selectFacts } from '../state/reducer';
import { selectAttention } from '../state/inbox';
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
        // A logo that fails to load leaves the monogram. The page needs no logo.
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
  { id: 'routines', label: 'Routines', glyph: 'routines', href: '#routines' },
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

/** AppBar is the column of places: the logo well, the eight places, and the account. */
export function AppBar({ route, onSignOut }: { route: Route; onSignOut: () => void }) {
  const place = placeOf(route);
  const config = useSelect((s) => s.config);
  // The count on Activity is the number of members that need you, over the open bridges.
  const attention = useSelect(selectAttention);
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

/* ---------- the readout of the fleet ---------- */

/** RACK_LAMPS is the most lamps that the rack shows one by one. A larger fleet shows each status as its share of the rack. */
export const RACK_LAMPS = 14;

/** The word of each lamp, as the figures and the tooltips say it. */
const LAMP_WORDS: Record<LampKind, string> = { failed: 'failed', working: 'working', awake: 'awake', starting: 'starting', asleep: 'asleep', stopping: 'stopping' };

export interface Figure {
  kind: LampKind;
  n: number;
  word: string;
}

/** figuresOf gives the count of each status of a readout that holds one, in the order of attention, such as 2 working and 7 asleep. */
export function figuresOf(r: Readout): Figure[] {
  return LAMP_ORDER.filter((k) => r.counts[k] > 0).map((k) => ({ kind: k, n: r.counts[k], word: LAMP_WORDS[k] }));
}

/**
 * GRACE_MS is how long the stream may connect, or connect again, before the
 * readout says so. The reads of the page are fresh while the stream
 * connects, so a short wait is no news: through a proxy the first byte of
 * the stream can take seconds.
 */
export const GRACE_MS = 6000;

/**
 * useDownWord is the word of a stream that is down: Offline at once for a
 * stream that the page closed, and Connecting only once the stream has
 * been down for GRACE_MS, else "".
 */
export function useDownWord(status: string): string {
  const [late, setLate] = useState(false);
  useEffect(() => {
    setLate(false);
    if (status === 'live' || status === 'closed') return;
    const t = setTimeout(() => setLate(true), GRACE_MS);
    return () => clearTimeout(t);
  }, [status === 'live' || status === 'closed']);
  if (status === 'closed') return 'Offline';
  return status !== 'live' && late ? 'Connecting' : '';
}

/** captionOf names the size of the fleet: 1 worker, 9 workers, or No workers. */
export function captionOf(total: number): string {
  if (total === 0) return 'No workers';
  return total === 1 ? '1 worker' : total + ' workers';
}

/** Rack is the recessed strip of lamps: one per worker for a small fleet, else one share per status. */
function Rack({ lamps, counts }: Readout) {
  if (lamps.length <= RACK_LAMPS) {
    return (
      <span class="rack" aria-hidden="true">
        {lamps.map((l: Lamp) => (
          <i class={'lamp lamp-' + l.kind} title={(l.agent ? l.agent + ', ' : '') + l.worker + ': ' + LAMP_WORDS[l.kind]} />
        ))}
      </span>
    );
  }
  return (
    <span class="rack rack-share" aria-hidden="true">
      {LAMP_ORDER.filter((k) => counts[k] > 0).map((k) => (
        <i class={'lamp lamp-' + k} style={{ flexGrow: counts[k] }} title={counts[k] + ' ' + LAMP_WORDS[k]} />
      ))}
    </span>
  );
}

/**
 * FleetFoot is the foot of the Bridges list: the readout of the workers of
 * the fleet. A rack holds one lamp per worker, in the order of attention,
 * and the figures below it count each status. The readout opens the Fleet
 * place. Once the stream has been down for GRACE_MS, the lamps go dark and
 * the state of the connection takes the place of the figures, because the
 * page no longer gets the changes. A deployment without a fleet shows the
 * foot only then.
 */
export function FleetFoot() {
  const status = useSelect((s) => s.stream.status);
  const facts = useSelect(selectFacts);
  const r = useMemo(() => readoutOf(facts), [facts]);
  const known = !!facts.fleet;
  const down = useDownWord(status);
  if (!known && !down) return null;
  const caption = known ? captionOf(r.lamps.length) : 'Workers';
  const figures = known ? figuresOf(r) : [];
  const said = down || figures.map((f) => f.n + ' ' + f.word).join(', ');
  return (
    <footer class="pane-foot fleet-foot">
      <a class={'readout' + (down ? ' stale' : '')} href="#fleet" aria-label={'Fleet: ' + caption + (said ? ', ' + said : '')}>
        <span class="readout-head">
          <span class="t-meta">{caption}</span>
          {known && r.lamps.length > 0 && <Rack lamps={r.lamps} counts={r.counts} />}
        </span>
        <span class="readout-figures" aria-hidden="true">
          {down ? (
            <Led tone={status === 'closed' ? 'red' : 'grey'} word={down} label={status === 'closed' ? 'The page gets no updates.' : 'The page connects to the workbench again.'} />
          ) : (
            figures.map((f) => (
              <span class={'figure figure-' + f.kind}>
                <strong>{f.n}</strong> {f.word}
              </span>
            ))
          )}
        </span>
      </a>
      <span class="sr" role="status">
        {down}
      </span>
    </footer>
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
