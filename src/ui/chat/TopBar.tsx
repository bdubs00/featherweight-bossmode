// The top bar of the chat-first page: the mark of the workspace, one search
// box in the middle, then Library and the account. The search finds a
// channel, an agent, or a job as the person types. Enter on a text that
// finds nothing, or the last row, asks the Manager. Ctrl+K or Cmd+K puts the
// focus in the box from anywhere.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useSelect } from '../../state/store';
import { selectAgents } from '../../state/agents';
import { useDuties } from '../../state/duties';
import { askManager } from '../../state/actions';
import { dutyTitle } from '../../lib/duties';
import { setChoice, themeOf, useChoice, type ThemeChoice } from '../../lib/theme';
import { personName } from '../../lib/words';
import { attempt } from '../notice';
import { isToken, useLogo } from '../Shell';
import { Glyph, Icon } from '../icons';
import { Avatar, LogoWell, Mark } from '../primitives';
import { Pop } from './Pop';
import { agentNameOf } from './data';
import { chatHref } from './route';

/** A row of the results of the search. */
export interface Found {
  kind: 'channel' | 'agent' | 'job' | 'ask';
  label: string;
  meta: string;
  href: string;
  agent?: string;
}

/** matches reports whether every word of the query starts a word of the text, or sits inside it. */
export function matches(text: string, q: string): boolean {
  const t = text.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w));
}

/** The most rows of each kind that the search shows. */
const EACH = 5;

/** Typing a modifier on a Mac says Cmd, elsewhere Ctrl. */
const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/** narrowNow reports whether the window is as narrow as a phone. */
const narrowNow = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 799px)').matches;

function Search() {
  const [q, setQ] = useState('');
  const [narrow, setNarrow] = useState(narrowNow);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia('(max-width: 799px)');
    const f = () => setNarrow(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const bridges = useSelect((s) => s.bridges);
  const agents = useSelect(selectAgents);
  const faces = useSelect((s) => s.faces);
  const manager = useSelect((s) => (s.config && s.config.manager ? s.config.manager.agent : ''));
  const duties = useDuties((s) => s.list);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (box.current) {
          box.current.focus();
          box.current.select();
        }
      }
    };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, []);
  const found = useMemo((): Found[] => {
    const t = q.trim();
    if (!t) return [];
    const out: Found[] = [];
    const chans = bridges.order.map((id) => bridges.byId[id]).filter((b) => matches(b.title + ' ' + (b.goal || ''), t));
    for (const b of chans.slice(0, EACH)) out.push({ kind: 'channel', label: b.title, meta: b.state === 'open' ? 'Channel' : 'Closed channel', href: chatHref({ view: 'channel', id: b.id, tab: 'posts' }) });
    const named = (agents || []).filter((a) => a.name !== 'default' && matches(a.name + ' ' + agentNameOf({ faces }, a.name), t));
    for (const a of named.slice(0, EACH)) out.push({ kind: 'agent', label: agentNameOf({ faces }, a.name), meta: a.name === manager ? 'Manager' : 'Agent', href: a.name === manager ? chatHref({ view: 'manager' }) : chatHref({ view: 'agent', name: a.name }), agent: a.name });
    const jobs = (duties || []).filter((d) => matches(dutyTitle(d) + ' ' + d.name, t));
    for (const d of jobs.slice(0, EACH)) out.push({ kind: 'job', label: dutyTitle(d), meta: 'Job', href: chatHref({ view: 'job', name: d.name }), agent: d.agent });
    if (manager) out.push({ kind: 'ask', label: t, meta: 'Ask the Manager', href: '' });
    return out;
  }, [q, bridges, agents, faces, duties, manager]);
  useEffect(() => setAt(0), [q]);
  const pick = async (f: Found | undefined) => {
    if (!f) return;
    setOpen(false);
    if (f.kind === 'ask') {
      const text = q.trim();
      setQ('');
      if (box.current) box.current.blur();
      let run = '';
      const ok = await attempt(async () => {
        run = await askManager(text);
      });
      if (ok) location.hash = chatHref({ view: 'manager', run });
      return;
    }
    setQ('');
    if (box.current) box.current.blur();
    location.hash = f.href;
  };
  const kbd = isMac() ? '⌘K' : 'Ctrl K';
  return (
    <div class="cf-search" role="search">
      <label class="cf-search-box">
        <Icon name="search" />
        <input
          ref={box}
          type="search"
          value={q}
          placeholder={narrow ? 'Find or ask anything' : 'Find a channel, agent or job, or ask anything'}
          aria-label="Find a channel, agent or job, or ask anything"
          aria-expanded={open && found.length > 0}
          aria-controls="cf-found"
          aria-autocomplete="list"
          role="combobox"
          onInput={(e) => {
            setQ((e.target as HTMLInputElement).value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAt((i) => Math.min(found.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAt((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              void pick(found[at]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setQ('');
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <kbd class="cf-kbd" aria-hidden="true">
          {kbd}
        </kbd>
      </label>
      {open && found.length > 0 && (
        <ul class="cf-found menu" id="cf-found" role="listbox" aria-label="Found">
          {found.map((f, i) => (
            <li role="option" aria-selected={i === at} class={i === at ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(f)} onMouseEnter={() => setAt(i)}>
              {f.kind === 'ask' ? (
                <span class="cf-found-ic" aria-hidden="true">
                  <Icon name="send" />
                </span>
              ) : f.agent ? (
                <Mark agent={f.agent} size={20} />
              ) : (
                <span class="cf-hash" aria-hidden="true">
                  #
                </span>
              )}
              <span class="cf-found-label">{f.kind === 'ask' ? 'Ask the Manager: ' + f.label : f.label}</span>
              <span class="cf-found-meta">{f.kind === 'ask' ? 'Enter' : f.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const THEMES: [ThemeChoice, string][] = [
  ['system', 'Match the system'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** Account is the face of the person at the right of the top bar: the name, the theme, Where to reach me, and Sign out. */
function Account({ onSignOut, onReach }: { onSignOut: () => void; onReach: () => void }) {
  const me = useSelect((s) => s.me);
  const choice = useChoice();
  const token = isToken(me && me.principal);
  const subject = (me && me.principal && me.principal.subject) || '';
  const name = token ? 'You' : (me && me.principal && (me.principal.name || personName(subject))) || 'You';
  return (
    <Pop
      label={token ? 'Your account' : name + ', account'}
      keyClass="cf-account"
      align="end"
      keyBody={<Avatar subject={subject || 'you'} display={me && me.principal ? me.principal.name : undefined} size={32} />}
      head={
        <>
          <div class="t-sub clip">{name}</div>
          <div class="t-meta clip">{token ? 'Signed in with an access token' : subject}</div>
        </>
      }
      items={[
        ...THEMES.map(([c, label]) => ({ label, checked: choice === c, onSelect: () => setChoice(c) })),
        { label: 'Where to reach me', onSelect: onReach, sep: true },
        { label: 'Connections', href: '/ui#connections' },
        { label: 'Sign out', onSelect: onSignOut },
      ]}
    />
  );
}

export function TopBar({ onSignOut, onReach }: { onSignOut: () => void; onReach: () => void }) {
  const config = useSelect((s) => s.config);
  const theme = themeOf(config);
  const logo = useLogo(theme.logo);
  return (
    <header class="cf-top">
      <div class="cf-top-start">
        <LogoWell src={logo} name={theme.name} href="#" />
      </div>
      <Search />
      <div class="cf-top-end">
        <a class="cf-library" href="#pages" title="The wiki and the files">
          <Glyph name="wiki" size={18} />
          <span>Library</span>
        </a>
        <Account onSignOut={onSignOut} onReach={onReach} />
      </div>
    </header>
  );
}
