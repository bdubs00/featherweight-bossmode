// The page: the rail, the main column, and the pane. In a wide window the
// three show side by side. In a narrow window one shows at a time, and the
// route picks it. The keyboard reaches every action: / puts the focus in
// the composer, and Escape closes or goes back.

import { useEffect, useState } from 'preact/hooks';
import { clearToken, getToken, setToken, setUnauthorizedHandler, type SigninNeeded } from '../api/client';
import { afterUnauthorized, clearSigninMarks, markSignedOut, sessionStore } from '../api/auth';
import { api } from '../api/routes';
import { store, useSelect } from '../state/store';
import { loadAgents, loadBridges, loadFaces, startStream, stopStream } from '../state/actions';
import { forgetFaces } from '../lib/faces';
import { columnOf, go, parentOf, parseRoute, type Route } from '../lib/route';
import { isTyping } from './keys';
import { clearNotice, showError, useNotice } from './notice';
import { Rail } from './Rail';
import { Channel } from './Channel';
import { Roster } from './Roster';
import { RunPane } from './RunPane';
import { Manager } from './Manager';
import { Fleet, AgentPane } from './Fleet';
import { PageEditor, PageHistory, PageTree, PageView } from './Pages';
import { NewBridge } from './NewBridge';
import { Signin } from './Signin';
import { Empty } from './common';

type Auth = { kind: 'loading' } | { kind: 'ready' } | { kind: 'signin'; signinUrl: string; expired: boolean; error: string } | { kind: 'failed'; error: string };

let leaving = false;
let tokenTry = false;

function useRoute(): Route {
  const [r, setR] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const f = () => setR(parseRoute(location.hash));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

/** Home is the main column with no bridge open: the newest open bridge, or a hint. */
function Home() {
  const loaded = useSelect((s) => s.bridges.loaded);
  const first = useSelect((s) => s.bridges.order.find((id) => s.bridges.byId[id].state === 'open'));
  useEffect(() => {
    // A wide window opens the newest open bridge, so the main column is never empty.
    if (first && window.matchMedia('(min-width: 1024px)').matches) go({ place: 'bridge', id: first, pane: 'none' }, true);
  }, [first]);
  return (
    <section class="screen home">
      <div class="scroll pad">
        {loaded && !first ? (
          <Empty>
            No bridge is open. <a href="#new">Open a bridge</a>, or ask the <a href="#manager">manager</a> to open one.
          </Empty>
        ) : (
          <Empty>Pick a bridge in the rail.</Empty>
        )}
      </div>
    </section>
  );
}

function mainOf(r: Route) {
  switch (r.place) {
    case 'bridge':
      return <Channel id={r.id} />;
    case 'manager':
      return <Manager />;
    case 'new':
      return <NewBridge />;
    case 'fleet':
      return <Fleet />;
    case 'pages':
      if (r.mode === 'create') return <PageEditor path={r.path} create />;
      if (!r.path) return <PageTreeHint />;
      if (r.mode === 'history') return <PageHistory path={r.path} />;
      if (r.mode === 'edit') return <PageEditor path={r.path} />;
      return <PageView path={r.path} version={r.version} />;
  }
  return <Home />;
}

function PageTreeHint() {
  return (
    <section class="screen">
      <div class="scroll pad">
        <Empty>Pick a page in the tree, or search the wiki.</Empty>
      </div>
    </section>
  );
}

function paneOf(r: Route) {
  switch (r.place) {
    case 'bridge':
      if (r.pane === 'run' && r.run) return <RunPane bridge={r.id} runId={r.run} handle={r.handle} />;
      return <Roster bridge={r.id} current={r.handle} />;
    case 'fleet':
      return r.agent ? <AgentPane agent={r.agent} /> : null;
    case 'pages':
      return <PageTree current={r.path} />;
  }
  return null;
}

export function App() {
  const route = useRoute();
  const [auth, setAuth] = useState<Auth>({ kind: 'loading' });
  const notice = useNotice();
  const open = route.place === 'bridge' ? route.id : '';

  useEffect(() => {
    store.dispatch({ type: 'open', bridge: open });
  }, [open]);

  const unauthorized = (e: SigninNeeded) => {
    if (leaving) return;
    const step = afterUnauthorized({ signinUrl: e.signinUrl, here: location.pathname + location.search + location.hash, hadToken: !!getToken(), now: Date.now(), store: sessionStore });
    const error = tokenTry ? 'That access token did not work.' : '';
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
      const config = await api.config().catch(() => null);
      store.dispatch({ type: 'config', config });
      await Promise.all([loadBridges(), loadFaces().catch(showError), loadAgents().catch(showError)]);
      startStream(unauthorized);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err && err.name === 'SigninNeeded') return;
      setAuth({ kind: 'failed', error: (err && err.message) || 'The workbench did not answer.' });
    }
  };

  useEffect(() => {
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
          const id = s.open || s.bridges.order.find((x) => s.bridges.byId[x].state === 'open');
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
        const wide = window.matchMedia('(min-width: 1024px)').matches;
        // In a wide window the rail and the main column stay, so Escape goes
        // back only from what the pane or the main column opened.
        if (wide && ((r.place === 'bridge' && r.pane !== 'run') || r.place === 'home' || r.place === 'manager' || (r.place === 'fleet' && !r.agent))) return;
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
        <h1>Bossmode</h1>
        <p class="alert" role="alert">
          {auth.error}
        </p>
        <button type="button" class="btn primary wide" onClick={boot}>
          Try again
        </button>
      </main>
    );
  }

  const pane = paneOf(route);
  return (
    <div class={'app' + (pane ? '' : ' no-pane')} data-col={columnOf(route)}>
      <Rail route={route} onSignOut={signOut} />
      <main class="col-main" id="main">
        {notice && (
          <div class="alert top" role="alert">
            <p>{notice}</p>
            <button type="button" class="btn small" onClick={clearNotice}>
              Dismiss
            </button>
          </div>
        )}
        {mainOf(route)}
      </main>
      {pane && <aside class="col-pane" aria-label="Details">{pane}</aside>}
    </div>
  );
}
