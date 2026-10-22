// The page: the sign-in, then the shell with the app bar and three panes.
// The route picks the place, the screen of each pane, and the one pane that
// a narrow window shows. The keyboard reaches every action: / puts the
// focus in the composer, and Escape closes or goes back.
//
// panesOf maps each route to its screens. The screens live in files that the
// screens of the next stage own (docs/DESIGN.md, section 11), so a screen
// changes its file and never this one.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { clearToken, getToken, setToken, setUnauthorizedHandler, type SigninNeeded } from '../api/client';
import { afterUnauthorized, clearSigninMarks, markSignedOut, sessionStore } from '../api/auth';
import { api } from '../api/routes';
import { store, useSelect } from '../state/store';
import { loadAgents, loadBridges, loadFaces, loadFleet, loadSkills, startStream, stopStream } from '../state/actions';
import { forgetFaces } from '../lib/faces';
import { applyTheme, themeOf } from '../lib/theme';
import { canonicalPath, columnOf, go, parentOf, parseRoute, type Route } from '../lib/route';
import { isTyping } from './keys';
import { clearNotice, showError, useNotice } from './notice';
import { EmptyPane, Shell, shownOf } from './Shell';
import { BridgeList } from './BridgeList';
import { Channel } from './Channel';
import { Roster } from './Roster';
import { RunPane } from './RunPane';
import { Manager } from './Manager';
import { Fleet, AgentPane, FleetList } from './Fleet';
import { MemberMain, MemberProfile } from './Member';
import { Board } from './Board';
import { ActivityList, ActivityMain } from './Activity';
import { PageEditor, PageHistory, PageTree, PageView } from './Pages';
import { NewBridge } from './NewBridge';
import { NewAgent } from './NewAgent';
import { Appearance } from './Appearance';
import { SkillActions, SkillList, SkillMain } from './Skills';
import { Signin } from './Signin';
import { Button, Card, Led } from './primitives';

type Auth = { kind: 'loading' } | { kind: 'ready' } | { kind: 'signin'; signinUrl: string; expired: boolean; error: string } | { kind: 'failed'; error: string };

let leaving = false;
let tokenTry = false;
/** The bridge that the person read last, so Bridges opens it again. */
let lastBridge = '';

/** The width from which two panes show side by side. */
const TWO_PANES = '(min-width: 800px)';
/** The width from which three panes show side by side. */
const THREE_PANES = '(min-width: 1200px)';

/** here is the address of the page for the sign-in, with the slash that the sign-in needs. */
const here = () => canonicalPath(location.pathname) + location.search + location.hash;

function useRoute(): Route {
  const [r, setR] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const f = () => setR(parseRoute(location.hash));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

/** Home is the main pane of Bridges with no bridge open: the last bridge, the newest open one, or an invitation. */
function Home() {
  const loaded = useSelect((s) => s.bridges.loaded);
  const first = useSelect((s) => (lastBridge && s.bridges.byId[lastBridge] ? lastBridge : s.bridges.order.find((id) => s.bridges.byId[id].state === 'open')));
  useEffect(() => {
    // Where two panes show, the main pane opens a bridge, so it is never empty.
    if (first && window.matchMedia(TWO_PANES).matches) go({ place: 'bridge', id: first, pane: 'none' }, true);
  }, [first]);
  return (
    <EmptyPane back={{ href: '#', label: 'Bridges' }}>
      {loaded && !first ? (
        <>
          <p>No bridge is open. Open one, or ask the manager to open one.</p>
          <Button href="#new" kind="primary">
            Open a bridge
          </Button>
        </>
      ) : (
        <p>Loading the bridges.</p>
      )}
    </EmptyPane>
  );
}

function PageHint() {
  return (
    <EmptyPane back={{ href: '#pages', label: 'Wiki' }}>
      <p>Pick a page in the list, or search the wiki.</p>
      <Button href="#create">New page</Button>
    </EmptyPane>
  );
}

interface Panes {
  list: ComponentChildren | null;
  main: ComponentChildren;
  details: ComponentChildren | null;
}

/** panesOf names the screen of each pane for a route. */
function panesOf(r: Route): Panes {
  switch (r.place) {
    case 'home':
      return { list: <BridgeList current="" />, main: <Home />, details: null };
    case 'new':
      return { list: <BridgeList current="" />, main: <NewBridge />, details: null };
    case 'bridge':
      return {
        list: <BridgeList current={r.id} />,
        main: <Channel id={r.id} tab={r.tab || 'posts'} />,
        details: r.pane === 'run' && r.run ? <RunPane bridge={r.id} runId={r.run} handle={r.handle} /> : <Roster bridge={r.id} current={r.handle} />,
      };
    case 'activity':
      return { list: <ActivityList item={r.item} />, main: <ActivityMain item={r.item} />, details: null };
    case 'fleet':
      return { list: <FleetList current={r.agent} />, main: r.board ? <Board /> : <Fleet agent={r.agent} />, details: r.agent ? <AgentPane agent={r.agent} /> : null };
    case 'member':
      return { list: <FleetList member={r.bridge + '/' + r.handle} />, main: <MemberMain bridge={r.bridge} handle={r.handle} tab={r.tab} />, details: <MemberProfile bridge={r.bridge} handle={r.handle} /> };
    case 'new-agent':
      return { list: <FleetList />, main: <NewAgent />, details: null };
    case 'skills':
      return { list: <SkillList current={r.item} />, main: <SkillMain item={r.item} add={r.add} />, details: <SkillActions item={r.item} /> };
    case 'pages': {
      let main: ComponentChildren;
      if (r.mode === 'create') main = <PageEditor path={r.path} create />;
      else if (!r.path) main = <PageHint />;
      else if (r.mode === 'history') main = <PageHistory path={r.path} />;
      else if (r.mode === 'edit') main = <PageEditor path={r.path} />;
      else main = <PageView path={r.path} version={r.version} />;
      return { list: <PageTree current={r.path} />, main, details: null };
    }
    case 'manager':
      return { list: null, main: <Manager />, details: null };
    case 'appearance':
      return { list: null, main: <Appearance />, details: null };
  }
}

function Notice({ text }: { text: string }) {
  return (
    <div class="notice" role="alert">
      <Led tone="red" word="Failed" />
      <p>{text}</p>
      <Button kind="quiet" size="s" onClick={clearNotice}>
        Dismiss
      </Button>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const [auth, setAuth] = useState<Auth>({ kind: 'loading' });
  const notice = useNotice();
  const open = route.place === 'bridge' ? route.id : '';
  const config = useSelect((s) => s.config);

  useEffect(() => {
    store.dispatch({ type: 'open', bridge: open });
    if (open) lastBridge = open;
  }, [open]);

  // The theme of the deployment: its accent and its logo, or the defaults.
  useEffect(() => {
    applyTheme(themeOf(config));
  }, [config]);

  const unauthorized = (e: SigninNeeded) => {
    if (leaving) return;
    const step = afterUnauthorized({ signinUrl: e.signinUrl, here: here(), hadToken: !!getToken(), now: Date.now(), store: sessionStore });
    const error = tokenTry ? 'That access token did not work. Check it, or sign in.' : '';
    tokenTry = false;
    clearToken();
    stopStream();
    if (step.kind === 'redirect') {
      leaving = true;
      location.assign(step.url);
      return;
    }
    setAuth({ kind: 'signin', signinUrl: step.signinUrl, expired: step.expired, error });
  };

  const boot = async () => {
    setAuth({ kind: 'loading' });
    try {
      const me = await api.whoami();
      tokenTry = false;
      clearSigninMarks();
      store.dispatch({ type: 'me', me });
      setAuth({ kind: 'ready' });
      const cfg = await api.config().catch(() => null);
      store.dispatch({ type: 'config', config: cfg });
      await Promise.all([loadBridges(), loadFaces().catch(showError), loadAgents().catch(showError)]);
      startStream(unauthorized);
      // The fleet and the skills fill the counts of workers and the pickers.
      // A page without them still works, so their errors stay quiet.
      loadFleet().catch(() => {});
      loadSkills().catch(() => {});
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err && err.name === 'SigninNeeded') return;
      setAuth({ kind: 'failed', error: (err && err.message) || 'The workbench did not answer. Check the connection, then try again.' });
    }
  };

  useEffect(() => {
    // The sign-in takes a return address only under /bossmode/, with the slash.
    const path = canonicalPath(location.pathname);
    if (path !== location.pathname) history.replaceState(null, '', path + location.search + location.hash);
    setUnauthorizedHandler(unauthorized);
    boot();
    return () => stopStream();
  }, []);

  // The keys of the whole page: / and Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.key === '/' && !isTyping(e)) {
        const box = document.getElementById('composer') as HTMLTextAreaElement | null;
        e.preventDefault();
        if (box && !box.disabled) box.focus();
        else {
          const s = store.get();
          const id = s.open || lastBridge || s.bridges.order.find((x) => s.bridges.byId[x].state === 'open');
          go(id ? { place: 'bridge', id, pane: 'none' } : { place: 'manager' });
          setTimeout(() => {
            const b = document.getElementById('composer') as HTMLTextAreaElement | null;
            if (b) b.focus();
          }, 60);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (isTyping(e)) {
          (e.target as HTMLElement).blur();
          return;
        }
        const r = parseRoute(location.hash);
        const p = panesOf(r);
        const shown = shownOf(columnOf(r), !!p.list, !!p.details);
        // Where three panes show, the list and the main pane stay, so Escape
        // goes back only from what the details pane or the main pane opened.
        const wide = window.matchMedia(THREE_PANES).matches;
        if (wide && shown !== 'details' && (r.place === 'bridge' || r.place === 'home' || r.place === 'manager' || r.place === 'activity' || r.place === 'member' || (r.place === 'fleet' && !r.board) || (r.place === 'skills' && !r.item))) return;
        e.preventDefault();
        go(parentOf(r));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const signOut = () => {
    stopStream();
    clearToken();
    markSignedOut();
    forgetFaces();
    store.dispatch({ type: 'me', me: null });
    boot();
  };

  if (auth.kind === 'loading') {
    return (
      <div class="boot" role="status">
        Loading bossmode.
      </div>
    );
  }
  if (auth.kind === 'signin') {
    return (
      <Signin
        signinUrl={auth.signinUrl}
        expired={auth.expired}
        error={auth.error}
        here={here()}
        onToken={(t) => {
          tokenTry = true;
          setToken(t);
          clearSigninMarks();
          boot();
        }}
      />
    );
  }
  if (auth.kind === 'failed') {
    return (
      <main class="signin">
        <Card title="Bossmode" tone="red" label="The workbench did not answer">
          <p class="alert" role="alert">
            {auth.error}
          </p>
          <Button kind="primary" onClick={boot}>
            Try again
          </Button>
        </Card>
      </main>
    );
  }

  const panes = panesOf(route);
  return <Shell route={route} list={panes.list} main={panes.main} details={panes.details} notice={notice ? <Notice text={notice} /> : null} onSignOut={signOut} />;
}
