// The shell of the page: the app bar and the three panes. In a wide window
// the list, the main, and the details pane show side by side. In a medium
// window two show: the list and the main pane, or the main and the details
// pane when the route puts the focus on the details. In a narrow window one
// pane shows at a time, and the app bar becomes a bar of places at the
// bottom of a list. docs/DESIGN.md, section 5, draws the layouts.
//
// A link at the start of the page skips the places to the main pane. The
// title of the tab names the place, the count of what needs you, and the
// deployment. After a move that leaves the focus on the page, the focus
// goes to the row that the list marks, or to the heading of the pane that
// shows. While the page reaches no server, a bar at the top says Offline.
// Trying again., and the figures of the page show as stale: the readout of
// the fleet says Offline and the counts fade, because they show what the
// page read last.

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { BossConfig } from '../api/types';
import { useSelect } from '../state/store';
import { loadInbox } from '../state/duties';
import { useOffline } from '../state/reach';
import { columnOf, placeOf, type Column, type Place, type Route } from '../lib/route';
import { themeOf, setChoice, useChoice, type ThemeChoice } from '../lib/theme';
import { personName } from '../lib/words';
import { LAMP_ORDER, readoutOf, type Lamp, type LampKind, type Readout } from '../lib/status';
import { selectFacts } from '../state/reducer';
import { useAttention } from '../state/activity';
import { Glyph, Icon, type GlyphName } from './icons';
import { Avatar, Chip, LogoWell, Led, countText } from './primitives';
import { ManagerDot } from './Manager';
import { Notifications } from './Notifications';
import { focusHome, focusLost } from './keys';

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

export interface PlaceItem {
  id: Exclude<Place, 'account'>;
  label: string;
  glyph: GlyphName;
  href: string;
}

/** The last address of each place, so a place opens where the person left it. */
const lastOf: Partial<Record<Place, string>> = {};

const PLACES: PlaceItem[] = [
  { id: 'results', label: 'Results', glyph: 'results', href: '#results' },
  { id: 'tasks', label: 'Tasks', glyph: 'tasks', href: '#tasks' },
  { id: 'activity', label: 'Activity', glyph: 'activity', href: '#activity' },
  { id: 'chat', label: 'Chat', glyph: 'chat', href: '#chat' },
  { id: 'bridges', label: 'Bridges', glyph: 'bridges', href: '#' },
  { id: 'fleet', label: 'Fleet', glyph: 'fleet', href: '#fleet' },
  { id: 'duties', label: 'Duties', glyph: 'duties', href: '#duties' },
  { id: 'skills', label: 'Skills', glyph: 'skills', href: '#skills' },
  { id: 'routines', label: 'Routines', glyph: 'routines', href: '#routines' },
  { id: 'wiki', label: 'Wiki', glyph: 'wiki', href: '#pages' },
  { id: 'manager', label: 'Manager', glyph: 'manager', href: '#manager' },
];

const THEMES: [ThemeChoice, string][] = [
  ['system', 'Match the system'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** The names of the places in the title of the tab. */
const PLACE_NAMES: Record<Place, string> = {
  results: 'Results',
  tasks: 'Tasks',
  activity: 'Activity',
  chat: 'Chat',
  bridges: 'Bridges',
  fleet: 'Fleet',
  duties: 'Duties',
  skills: 'Skills',
  routines: 'Routines',
  wiki: 'Wiki',
  manager: 'Manager',
  account: 'Appearance',
};

/** tabTitle is the title of the tab: the count of what needs you, the place, and the name of the deployment, such as (2) Activity - Homelab. */
export function tabTitle(place: Place, count: number, name: string): string {
  return (count > 0 ? '(' + count + ') ' : '') + PLACE_NAMES[place] + ' - ' + (name || 'Bossmode');
}

/**
 * isToken reports whether the person signed in with the access token of the
 * fleet, a principal with no name of a person. The page then says You, and
 * never the word token.
 */
export function isToken(p: { subject: string; name?: string; kind?: string } | null | undefined): boolean {
  return !!p && !p.name && (p.kind === 'token' || p.subject === 'token');
}

/**
 * AccountMenu is the account key at the foot of the app bar: the name of
 * the person, the theme, Where to reach me, Connections, and Sign out.
 * ArrowUp and ArrowDown move in the menu, and Escape closes it and gives the
 * focus back. Where to reach me asks the shell to open its dialog, which
 * gives the focus back to the account key when it closes.
 */
function AccountMenu({ onSignOut, onReach }: { onSignOut: () => void; onReach: () => void }) {
  const me = useSelect((s) => s.me);
  const choice = useChoice();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const token = isToken(me && me.principal);
  const subject = (me && me.principal && me.principal.subject) || '';
  const name = token ? 'You' : (me && me.principal && (me.principal.name || personName(subject))) || 'You';
  // The line under the name: the subject of a person, or how a person with the token of the fleet signed in.
  const how = token ? 'Signed in with an access token' : subject;
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
      <button ref={btn} type="button" class="account-key" aria-label={token ? 'Your account' : name + ', account'} title={token ? name : subject || name} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {token ? (
          <span class="avatar s32 avatar-you" aria-hidden="true">
            <Icon name="person" />
          </span>
        ) : (
          <Avatar subject={subject} display={me && me.principal ? me.principal.name : undefined} size={32} />
        )}
      </button>
      {open && (
        <div ref={list} class="menu menu-account" role="menu" aria-label="Account" onKeyDown={onKey}>
          <div class="menu-head" role="presentation">
            <div class="t-sub clip">{name}</div>
            <div class="t-meta clip">{how}</div>
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onReach();
            }}
          >
            <span class="t">Where to reach me</span>
          </button>
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

/**
 * placesOf gives the places of the app bar for the settings of the front.
 * Routines shows once the settings say that the front keeps routines, and
 * an older front that leaves the key out keeps the place. Tasks shows once
 * the settings name the door. With the door, a person who has not asked
 * for every place sees four: Tasks, Activity, Chat, and Wiki, and the place
 * of the screen that shows, so the bar always lights the place you are in.
 */
export function placesOf(config: BossConfig | null, every = true, current?: Place): PlaceItem[] {
  const door = !!(config && config.door);
  const all = PLACES.filter((it) => (it.id !== 'routines' || (config && config.routines !== false)) && (it.id !== 'tasks' || door));
  if (!door || every) return all;
  return all.filter((it) => SIMPLE_PLACES.includes(it.id) || it.id === current);
}

/** The places of a person who has not asked for every place. */
export const SIMPLE_PLACES: Place[] = ['tasks', 'activity', 'chat', 'wiki'];

const EVERY_KEY = 'fw.bossmode.everyPlace';

/** everyPlace reads whether the person asked for every place of the app bar. A browser without storage shows the four places. */
export function everyPlace(): boolean {
  try {
    return localStorage.getItem(EVERY_KEY) === '1';
  } catch {
    return false;
  }
}

/** useEveryPlace is the switch More of the app bar, kept in the browser. */
function useEveryPlace(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(everyPlace);
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(EVERY_KEY, v ? '1' : '0');
    } catch {
      // A browser without storage keeps the choice for this tab only.
    }
  };
  return [on, set];
}

/**
 * AppBar is the column of places: the logo well, the places, and the
 * account. onReach opens Where to reach me. place is the place to light,
 * when the route alone does not say it.
 */
export function AppBar({ route, place: placeProp, onSignOut, onReach }: { route: Route; place?: Place; onSignOut: () => void; onReach: () => void }) {
  const place = placeProp || placeOf(route);
  const config = useSelect((s) => s.config);
  // The count on Activity counts the rows of Activity that need you: the same rows as its list, less the new messages.
  const attention = useAttention();
  const offline = useOffline();
  const theme = themeOf(config);
  const logo = useLogo(theme.logo);
  // A run that starts to wait for the person, such as a decision in a chat
  // with an agent, reaches the page on the stream at once. Its row of
  // Activity comes from the inbox, so the count reads the inbox then, and
  // does not wait for the next read of the minute.
  const waiting = useSelect((s) =>
    Object.keys(s.runs)
      .filter((id) => s.runs[id].state === 'input-required')
      .map((id) => id + '/' + (s.runs[id].pending ? s.runs[id].pending!.id : ''))
      .sort()
      .join(','),
  );
  useEffect(() => {
    if (waiting) loadInbox().catch(() => {});
  }, [waiting]);
  useEffect(() => {
    document.title = tabTitle(place, attention, theme.name);
  }, [place, attention, theme.name]);
  const [every, setEvery] = useEveryPlace();
  const door = !!(config && config.door);
  return (
    <nav class="appbar" aria-label="Places">
      <LogoWell src={logo} name={theme.name} href="#" />
      <div class="places">
        {placesOf(config, every, place).map((it) => {
          const on = it.id === place;
          const count = it.id === 'activity' ? attention : 0;
          return (
            <a class={'place' + (on ? ' on' : '')} href={on ? it.href : lastOf[it.id] || it.href} aria-current={on ? 'page' : undefined}>
              <Glyph name={it.glyph} size={22} />
              <span class="place-label">{it.label}</span>
              {count > 0 && (
                <Chip tone="ink" class={'place-count' + (offline ? ' stale' : '')} label={(count === 1 ? '1 item needs you' : count + ' items need you') + (offline ? ', as the page read it last' : '')}>
                  {countText(count)}
                </Chip>
              )}
              {it.id === 'manager' && <ManagerDot />}
            </a>
          );
        })}
        {door && (
          <button type="button" class="place place-more" aria-pressed={every} title={every ? 'Show four places' : 'Show every place'} onClick={() => setEvery(!every)}>
            <Glyph name="more" size={22} />
            <span class="place-label">{every ? 'Fewer' : 'More'}</span>
          </button>
        )}
      </div>
      <AccountMenu onSignOut={onSignOut} onReach={onReach} />
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
  const offline = useOffline();
  const word = useDownWord(status);
  // A page that reaches no server says so here too, whatever the stream says.
  const down = offline ? 'Offline' : word;
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
            <Led
              tone={offline || status === 'closed' ? 'red' : 'grey'}
              word={down}
              label={offline ? 'The page reaches no server. The figures show what it read last.' : status === 'closed' ? 'The page gets no updates.' : 'The page connects to the server again.'}
            />
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
  /** The place to light, when the route alone does not say it, such as Bridges for a seat that a bridge opened. */
  place?: Place;
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

export function Shell({ route, place: placeProp, list, main, details, notice, onSignOut }: ShellProps) {
  const place = placeProp || placeOf(route);
  const shown = shownOf(columnOf(route), !!list, !!details);
  // The shell holds Where to reach me, and the app bar only opens it. A
  // narrow window hides the app bar while it shows the main pane or the
  // details. A modal dialog in a hidden element stays open but shows
  // nothing, and the rest of the page takes no click. Outside the app bar,
  // the dialog and its draft stay in sight when the width of the window
  // crosses 800 pixels.
  const [reach, setReach] = useState(false);
  const offline = useOffline();
  // Each place remembers its last address for the app bar.
  useEffect(() => {
    lastOf[place] = location.hash || '#';
  });
  // A move to another screen that leaves the focus on the page, such as
  // Escape or Back in a narrow window, gives it to the pane that shows: the
  // row that its list marks, or its heading. A screen that puts the focus
  // in a field of its own keeps it.
  const at = location.hash;
  useEffect(() => {
    const t = setTimeout(() => {
      if (!focusLost() || document.querySelector('dialog[open]')) return;
      if (!focusHome(document.querySelector('.shell .pane-' + shown))) focusHome(document.querySelector('.shell .pane-main'));
    }, 0);
    return () => clearTimeout(t);
  }, [at, shown]);
  const skip = (e: Event) => {
    e.preventDefault();
    focusHome(document.getElementById('main'));
  };
  return (
    <div class="shell" data-show={shown} data-place={place} data-list={list ? '1' : '0'} data-details={details ? '1' : '0'} data-offline={offline ? '1' : undefined}>
      <a class="skip" href="#main" onClick={skip}>
        Skip to the content
      </a>
      {offline && (
        <div class="offline-bar" aria-hidden="true">
          <Led tone="red" word="Offline." />
          <span>Trying again.</span>
        </div>
      )}
      <span class="sr" role="status">
        {offline ? 'Offline. Trying again.' : ''}
      </span>
      <AppBar route={route} place={place} onSignOut={onSignOut} onReach={() => setReach(true)} />
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
      {reach && <Notifications onClose={() => setReach(false)} />}
    </div>
  );
}
