// The chat-first page: the top bar, the sidebar, the stream in the middle,
// and the pane at the right. A wide window shows all three. A medium window
// shows the sidebar and the stream, and the pane at the right takes the
// place of the stream when the person opens it. A phone shows one at a
// time: the sidebar is its home screen, a tap opens a stream, and Members
// opens from the header.
//
// Every place of the page lives in this one shell. Results, Agents, the
// Library, and Settings are views of the middle. An older place, such as
// the wiki, Skills, or the editor of a job, shows its own panes in the
// middle and at the right, with the type and the colors of a channel.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Place } from '../../lib/route';
import type { Column } from '../../lib/route';
import { useSelect } from '../../state/store';
import { themeOf } from '../../lib/theme';
import { Notifications } from '../Notifications';
import { Manager } from '../Manager';
import { Results } from '../Results';
import { DecisionTitle, QuestionTitle } from '../Decision';
import { LineText } from '../Message';
import { lineText } from './channels';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { ChannelView } from './ChannelView';
import { Members } from './Members';
import { JobView, JobPane } from './JobView';
import { RunView, RunSide } from './RunView';
import { AgentView, AgentSetup } from './AgentView';
import { AgentsView } from './AgentsView';
import { FilesView, LibraryHead } from './LibraryView';
import { SettingsView } from './SettingsView';
import { ManagerSide } from './ManagerSide';
import { useBoard, useNeeds, useNeedsCount } from './data';
import { TodayView, sinceLastVisit } from './TodayView';
import { chatHref, focusOf, type ChatRoute, type Focus } from './route';

/** The width from which the sidebar and the stream show side by side. */
const TWO = '(min-width: 800px)';
/** The width from which the pane at the right shows beside them. */
const THREE = '(min-width: 1200px)';

function useMedia(q: string): boolean {
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  const [on, setOn] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

/**
 * Home opens where two panes show on the top item of Needs you, the place
 * where the person answers it, or on Today when nothing waits. A phone
 * keeps the sidebar, which lists the same items.
 */
function Home() {
  const two = useMedia(TWO);
  const board = useBoard();
  const needs = useNeeds();
  const top = needs[0];
  useEffect(() => {
    if (!two || !board) return;
    location.replace(top ? top.href : chatHref({ view: 'today' }));
  }, [two, board !== null, top && top.href]);
  return null;
}

/** The panes of an older place, as App.tsx names them for its address. */
export interface OldPanes {
  list: ComponentChildren | null;
  main: ComponentChildren;
  details: ComponentChildren | null;
  /** The column that a narrow window shows. */
  column: Column;
  /** The place of the older app bar, for the Library tabs of the wiki and of Skills. */
  place: Place;
}

interface Panes {
  main: ComponentChildren;
  right: ComponentChildren | null;
  title: string;
}

/** The names of the older places in the title of the tab. */
const OLD_TITLES: Partial<Record<Place, string>> = { wiki: 'Library', skills: 'Library', duties: 'Job', fleet: 'Agents', results: 'Results', account: 'Settings', knowhow: 'Agent', bridges: 'Channels', manager: 'Manager', chat: 'Task', activity: 'Needs you', work: 'Home' };

function panesOf(r: ChatRoute, bridgeTitle: (id: string) => string, onReach: () => void): Panes {
  switch (r.view) {
    case 'home':
      return { main: <Home />, right: null, title: 'Home' };
    case 'channel':
      return { main: <ChannelView id={r.id} tab={r.tab} />, right: <Members id={r.id} />, title: bridgeTitle(r.id) };
    case 'manager':
      return { main: <Manager run={r.run} fresh={r.fresh} />, right: <ManagerSide />, title: 'Manager' };
    case 'job':
      return { main: <JobView name={r.name} />, right: <JobPane name={r.name} />, title: 'Job' };
    case 'run':
      return { main: <RunView id={r.id} />, right: <RunSide id={r.id} />, title: 'Task' };
    case 'agent':
      return { main: <AgentView name={r.name} />, right: <AgentSetup name={r.name} />, title: 'Agent' };
    case 'agents':
      return { main: <AgentsView />, right: null, title: 'Agents' };
    case 'results':
      return { main: <Results />, right: null, title: 'Results' };
    case 'files':
      return { main: <FilesView />, right: null, title: 'Library' };
    case 'settings':
      return { main: <SettingsView onReach={onReach} />, right: null, title: 'Settings' };
    case 'today':
      return { main: <TodayView />, right: null, title: 'Today' };
  }
}

/**
 * OldPlace shows the list and the main pane of an older place in the middle
 * of the shell: the list as a column at the left of the middle, as a
 * browser of files does. A narrow window shows one of them. The wiki and
 * Skills sit under the tabs of the Library.
 */
function OldPlace({ old }: { old: OldPanes }) {
  const library = old.place === 'wiki' || old.place === 'skills';
  return (
    <div class="cf-view cf-old-view">
      {library && <LibraryHead tab={old.place === 'wiki' ? 'wiki' : 'skills'} />}
      <div class="cf-old" data-show={old.column === 'details' ? 'main' : old.column} data-list={old.list ? '1' : '0'}>
        {old.list && <section class="pane pane-list">{old.list}</section>}
        <div class="pane pane-main">{old.main}</div>
      </div>
    </div>
  );
}

/** The back of a route on a phone: the right pane goes to its stream, a stream goes home. */
export function backOfChat(r: ChatRoute): string {
  if (r.view === 'channel' && r.members) return chatHref({ view: 'channel', id: r.id, tab: 'posts' });
  if ((r.view === 'job' || r.view === 'run') && r.about) return chatHref(r.view === 'job' ? { view: 'job', name: r.name } : { view: 'run', id: r.id });
  if (r.view === 'agent' && r.setup) return chatHref({ view: 'agent', name: r.name });
  if (r.view === 'agent') return chatHref({ view: 'agents' });
  return '#';
}

export function ChatApp({ route, old, notice, onSignOut }: { route: ChatRoute | null; old?: OldPanes; notice?: ComponentChildren; onSignOut: () => void }) {
  const [reach, setReach] = useState(false);
  const bridges = useSelect((s) => s.bridges);
  const config = useSelect((s) => s.config);
  const needs = useNeedsCount();
  // The last visit is read once, when the page opens, so Today counts from the visit before this one.
  sinceLastVisit();
  const three = useMedia(THREE);
  const focus: Focus = route ? focusOf(route) : old && old.column === 'details' && old.details ? 'right' : 'main';
  const p: Panes = route
    ? panesOf(route, (id) => (bridges.byId[id] ? bridges.byId[id].title : 'Channel'), () => setReach(true))
    : { main: old ? <OldPlace old={old} /> : null, right: old && old.details ? <div class="pane pane-details">{old.details}</div> : null, title: (old && OLD_TITLES[old.place]) || 'Bossmode' };
  // The title of the tab: what needs you, the view, and the workspace.
  useEffect(() => {
    const name = themeOf(config).name || 'Bossmode';
    document.title = (needs > 0 ? '(' + needs + ') ' : '') + p.title + ' - ' + name;
  }, [needs, p.title, config]);
  // The keys of the page: Escape goes back on a phone and from the pane at the right, and / puts the focus in the composer. An older place keeps the keys of App.tsx.
  useEffect(() => {
    if (!route) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('dialog[open]')) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing) {
        const box = document.getElementById('composer') as HTMLTextAreaElement | null;
        if (box && !box.disabled) {
          e.preventDefault();
          box.focus();
        }
        return;
      }
      if (e.key === 'Escape' && !typing) {
        e.preventDefault();
        const wide = window.matchMedia(THREE).matches;
        if (wide && focus !== 'right') return;
        if (focus !== 'side') location.hash = backOfChat(route);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [route, focus]);
  const right = p.right && (three || focus === 'right') ? p.right : null;
  return (
    <DecisionTitle.Provider value="Asks first">
      <QuestionTitle.Provider value="Asks you">
        <LineText.Provider value={lineText}>
          <div class="cf" data-focus={focus} data-right={right ? '1' : '0'} data-view={route ? route.view : 'old'}>
            <a class="skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
              Skip to the content
            </a>
            <TopBar onSignOut={onSignOut} onReach={() => setReach(true)} />
            <div class="cf-body">
              <aside class="cf-side">
                <Sidebar route={route} />
              </aside>
              <main
                class="cf-main"
                id="main"
                tabIndex={-1}
                onClickCapture={(e) => {
                  // The back key of a pane that an older component drew inside a view of this page, such as the Manager, goes back in this page.
                  if (!route) return;
                  const a = (e.target as HTMLElement).closest('.pane-head a.back');
                  if (!a) return;
                  e.preventDefault();
                  location.hash = backOfChat(route);
                }}
              >
                {notice}
                {p.main}
              </main>
              {right && <aside class="cf-right">{right}</aside>}
            </div>
            {reach && <Notifications onClose={() => setReach(false)} />}
          </div>
        </LineText.Provider>
      </QuestionTitle.Provider>
    </DecisionTitle.Provider>
  );
}
