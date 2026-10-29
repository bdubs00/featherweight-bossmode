// The chat-first page: the top bar, the sidebar, the stream in the middle,
// and the pane at the right. A wide window shows all three. A medium window
// shows the sidebar and the stream, and the pane at the right takes the
// place of the stream when the person opens it. A phone shows one at a
// time: the sidebar is its home screen, a tap opens a stream, and Members
// opens from the header. The older places live behind the grid of the
// sidebar, in the frame of the top bar (LegacyFrame).

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useSelect } from '../../state/store';
import { themeOf } from '../../lib/theme';
import { Notifications } from '../Notifications';
import { Manager } from '../Manager';
import { DecisionTitle } from '../Decision';
import { TopBar } from './TopBar';
import { Sidebar, useChannelRows } from './Sidebar';
import { ChannelView } from './ChannelView';
import { Members } from './Members';
import { JobView, JobPane } from './JobView';
import { RunView, RunSide } from './RunView';
import { AgentView } from './AgentView';
import { ManagerSide } from './ManagerSide';
import { useNeeds } from './data';
import { chatHref, focusOf, type ChatRoute } from './route';

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
 * Home opens a stream where two panes show: the channel that needs you,
 * else the newest open channel, else the Manager. A phone keeps the sidebar.
 */
function Home() {
  const two = useMedia(TWO);
  const { open, loaded } = useChannelRows();
  const first = open[0];
  useEffect(() => {
    if (!two || !loaded) return;
    location.replace(first ? chatHref({ view: 'channel', id: first.id, tab: 'posts' }) : chatHref({ view: 'manager' }));
  }, [two, loaded, first && first.id]);
  return null;
}

interface Panes {
  main: ComponentChildren;
  right: ComponentChildren | null;
  title: string;
}

function panesOf(r: ChatRoute, bridgeTitle: (id: string) => string): Panes {
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
      return { main: <AgentView name={r.name} />, right: null, title: 'Agent' };
  }
}

/** The back of a route on a phone: the right pane goes to its stream, a stream goes home. */
export function backOfChat(r: ChatRoute): string {
  if (r.view === 'channel' && r.members) return chatHref({ view: 'channel', id: r.id, tab: 'posts' });
  if ((r.view === 'job' || r.view === 'run') && r.about) return chatHref(r.view === 'job' ? { view: 'job', name: r.name } : { view: 'run', id: r.id });
  return '#';
}

export function ChatApp({ route, notice, onSignOut }: { route: ChatRoute; notice?: ComponentChildren; onSignOut: () => void }) {
  const [reach, setReach] = useState(false);
  const bridges = useSelect((s) => s.bridges);
  const config = useSelect((s) => s.config);
  const needs = useNeeds().length;
  const three = useMedia(THREE);
  const focus = focusOf(route);
  const p = panesOf(route, (id) => (bridges.byId[id] ? bridges.byId[id].title : 'Channel'));
  // The title of the tab: what needs you, the stream, and the workspace.
  useEffect(() => {
    const name = themeOf(config).name || 'Bossmode';
    document.title = (needs > 0 ? '(' + needs + ') ' : '') + p.title + ' - ' + name;
  }, [needs, p.title, config]);
  // The keys of the page: Escape goes back on a phone and from the pane at the right, and / puts the focus in the composer.
  useEffect(() => {
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
    <div class="cf" data-focus={focus} data-right={right ? '1' : '0'} data-view={route.view}>
      <a class="skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        Skip to the content
      </a>
      <TopBar onSignOut={onSignOut} onReach={() => setReach(true)} />
      <div class="cf-body">
        <aside class="cf-side">
          <Sidebar route={route} />
        </aside>
        <main class="cf-main" id="main" tabIndex={-1}>
          {notice}
          {p.main}
        </main>
        {right && <aside class="cf-right">{right}</aside>}
      </div>
      {reach && <Notifications onClose={() => setReach(false)} />}
    </div>
    </DecisionTitle.Provider>
  );
}

/** LegacyFrame holds an older place under the top bar, so the way home stays in sight. */
export function LegacyFrame({ children, onSignOut }: { children: ComponentChildren; onSignOut: () => void }) {
  const [reach, setReach] = useState(false);
  return (
    <div class="cf cf-legacy">
      <TopBar onSignOut={onSignOut} onReach={() => setReach(true)} />
      <div class="cf-legacy-body">{children}</div>
      {reach && <Notifications onClose={() => setReach(false)} />}
    </div>
  );
}
