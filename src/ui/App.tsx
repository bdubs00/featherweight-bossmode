// The page: the sign-in, then the shell with the app bar and three panes.
// The route picks the place, the screen of each pane, and the one pane that
// a narrow window shows. The keyboard reaches every action: / puts the
// focus in the composer, and Escape closes or goes back. A form, such as
// Open a bridge, keeps the person on it: / does not leave it, and Escape
// leaves it only where one pane shows, with the draft of the form kept.
//
// The conversation of a seat belongs to the place that opened it: from a
// bridge, it keeps Bridges lit and the list of the bridges, and Back goes to
// the members of its bridge. From the Fleet place, it stays in Fleet.
//
// panesOf maps each route to its screens. The screens live in files that the
// screens of the next stage own (docs/DESIGN.md, section 11), so a screen
// changes its file and never this one.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clearToken, getToken, scheduleRenewal, setReachHandler, setToken, setUnauthorizedHandler, stopRenewal, type SigninNeeded } from '../api/client';
import { noteAnswer, watchReach } from '../state/reach';
import { afterUnauthorized, clearSigninMarks, markSignedOut, sessionStore } from '../api/auth';
import { api } from '../api/routes';
import { store, useSelect } from '../state/store';
import { loadAgents, loadBridges, loadFaces, loadFleet, loadOpenRuns, loadSkills, startStream, stopStream } from '../state/actions';
import { forgetFaces } from '../lib/faces';
import { mayStart } from '../lib/agents';
import { dismissBuild, useNewBuild } from '../lib/build';
import { applyTheme, themeOf } from '../lib/theme';
import { canonicalPath, columnOf, go, parentOf, parseRoute, placeOf, type Place, type Route } from '../lib/route';
import { isTyping } from './keys';
import { clearNotice, clearSaid, currentSaidLink, holdSaid, showError, undoSaid, useNotice, useSaid, useUndo } from './notice';
import { EmptyPane, Shell, opensOn, shownOf } from './Shell';
import { BridgeList } from './BridgeList';
import { Channel } from './Channel';
import { Roster } from './Roster';
import { RunPane } from './RunPane';
import { Manager, ManagerList } from './Manager';
import { ChatDetails, ChatList, ChatMain, NoChat } from './Chat';
import { Fleet, AgentPane, FleetList } from './Fleet';
import { MemberMain, MemberProfile, memberFrom, setMemberFrom } from './Member';
import { Board } from './Board';
import { Work } from './Work';
import { ActivityList, ActivityMain } from './Activity';
import { PageEditor, PageHistory, PageTree, PageView } from './Pages';
import { NewBridge } from './NewBridge';
import { NewAgent } from './NewAgent';
import { Appearance } from './Appearance';
import { Results } from './Results';
import { SkillActions, SkillList, SkillMain } from './Skills';
import { RoutineAgent, RoutineMain } from './Routines';
import { KnowhowAgents, KnowhowMain } from './Knowhow';
import { DutyList, DutyMain } from './Duties';
import { PlaybookList, PlaybookMain } from './Playbooks';
import { Signin } from './Signin';
import { ChatApp, LegacyFrame } from './chat/ChatApp';
import { parseChat } from './chat/route';
import { Button, Card, Led } from './primitives';

type Auth = { kind: 'loading' } | { kind: 'ready' } | { kind: 'signin'; signinUrl: string; expired: boolean; returned: boolean; error: string } | { kind: 'failed'; error: string };

let leaving = false;
let tokenTry = false;
// confirming is true while the page asks GET /v1/whoami whether a 401 of
// another route means that the session ended (unauthorized).
let confirming = false;
// streamAgainAt is when the page last started the stream again after such a
// 401, so a stream that refuses again and again starts at most once in 30 s.
let streamAgainAt = 0;
/** The bridge that the person read last, so Bridges opens it again. */
let lastBridge = '';
/** The route that the page showed before this one, so a seat knows the place that opened it. */
let lastRoute: Route | null = null;

/**
 * followMember notes the place that opens the conversation of a seat: the
 * Fleet place keeps it, and every other place, such as a bridge or
 * Activity, gives it to Bridges. A move between the tabs of a seat keeps
 * what the first move noted.
 */
function followMember(r: Route): void {
  if (r.place === 'member' && (!lastRoute || lastRoute.place !== 'member')) setMemberFrom(lastRoute && placeOf(lastRoute) === 'fleet' ? 'fleet' : 'bridges');
  lastRoute = r;
}

/** backOf is the route that Escape and Back go to: the parent of the route, and for a seat that a bridge opened, the members of that bridge. */
export function backOf(r: Route): Route {
  if (r.place === 'member' && !r.profile && memberFrom() === 'bridges') return { place: 'bridge', id: r.bridge, pane: 'roster' };
  return parentOf(r);
}

/** placeIn is the place of the app bar for a route, with the place that opened the conversation of a seat. */
export function placeIn(r: Route): Place {
  return r.place === 'member' && memberFrom() === 'bridges' ? 'bridges' : placeOf(r);
}

/**
 * isForm reports whether a route shows a form that the person fills: Open a
 * bridge, New agent, the editor of a duty, the editor of a page, and Add
 * skill. The / key never leaves such a form.
 */
export function isForm(r: Route): boolean {
  switch (r.place) {
    case 'new':
    case 'new-agent':
      return true;
    case 'duties':
      return !!(r.edit || r.fresh);
    case 'pages':
      return r.mode === 'edit' || r.mode === 'create';
    case 'skills':
      return !!r.add;
  }
  return false;
}

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
  const start = useSelect((s) => !s.me || mayStart(s.me));
  const loaded = useSelect((s) => s.bridges.loaded);
  const first = useSelect((s) => (lastBridge && s.bridges.byId[lastBridge] ? lastBridge : s.bridges.order.find((id) => s.bridges.byId[id].state === 'open')));
  useEffect(() => {
    // Where two panes show, the main pane opens a bridge, so it is never empty.
    if (first && window.matchMedia(TWO_PANES).matches) go({ place: 'bridge', id: first, pane: 'none' }, true);
  }, [first]);
  return (
    <EmptyPane back={{ href: '#', label: 'Teams' }}>
      {loaded && !first ? (
        <>
          {/* A person who can start no run reads no invitation to open one. */}
          <p>{start ? 'No team is open. Open one, or ask the manager to open one.' : 'No team is open.'}</p>
          {start && (
            <Button href="#new" kind="primary">
              Open a team
            </Button>
          )}
        </>
      ) : (
        <p>Loading the teams.</p>
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
    case 'work':
      return { list: null, main: <Work />, details: null };
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
      return { list: memberFrom() === 'bridges' ? <BridgeList current={r.bridge} /> : <FleetList member={r.bridge + '/' + r.handle} />, main: <MemberMain bridge={r.bridge} handle={r.handle} tab={r.tab} />, details: <MemberProfile bridge={r.bridge} handle={r.handle} /> };
    case 'new-agent':
      return { list: <FleetList />, main: <NewAgent />, details: null };
    case 'skills':
      return { list: <SkillList current={r.item} />, main: <SkillMain item={r.item} add={r.add} />, details: <SkillActions item={r.item} /> };
    case 'knowhow':
      return { list: <KnowhowAgents current={r.agent} tab={r.tab || 'learned'} />, main: <KnowhowMain agent={r.agent} tab={r.tab || 'learned'} />, details: null };
    case 'routines':
      // A routine lives in the tab Routines of Know-how: the agents in the list, the routine, and the week of its agent.
      if (!r.agent || !r.name) return { list: <KnowhowAgents tab="routines" />, main: <KnowhowMain tab="routines" />, details: null };
      return {
        list: <KnowhowAgents current={r.agent} tab="routines" />,
        main: <RoutineMain agent={r.agent} name={r.name} tab={r.tab || 'steps'} />,
        details: <RoutineAgent agent={r.agent} name={r.name} />,
      };
    case 'duties':
      return r.tab === 'playbooks' ? { list: <PlaybookList current={r.playbook} />, main: <PlaybookMain name={r.playbook} />, details: null } : { list: <DutyList current={r.name} />, main: <DutyMain name={r.name} edit={r.edit} fresh={r.fresh} seed={r.seed} run={r.run} />, details: null };
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
      // Without a manager in the settings, the place holds one pane that says so.
      if (!store.get().config || !store.get().config!.manager) return { list: null, main: <Manager />, details: null };
      return { list: <ManagerList run={r.run} fresh={r.fresh} />, main: <Manager run={r.run} fresh={r.fresh} />, details: null };
    case 'chat': {
      const cfg = store.get().config;
      // Without a quick chat in the settings, the place holds one pane that says so.
      if (!cfg || !cfg.chat || !cfg.chat.agent) return { list: null, main: <NoChat />, details: null };
      return { list: <ChatList current={r.run} />, main: <ChatMain run={r.run} />, details: r.run ? <ChatDetails run={r.run} /> : null };
    }
    case 'appearance':
      return { list: null, main: <Appearance />, details: null };
    case 'results':
      return { list: null, main: <Results />, details: null };
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

/** Said is the notice of an action that worked: its sentence, with Undo for an action that waits to go out or a link to what the action made, and Dismiss. It goes by itself after a few seconds. */
function Said({ text, undo }: { text: string; undo: boolean }) {
  const link = currentSaidLink();
  // The notice stays while the pointer rests on it or the focus sits in it, so a person can read it and reach its link.
  const box = useRef<HTMLDivElement>(null);
  const hover = useRef(false);
  const inside = useRef(false);
  const follow = () => holdSaid(hover.current || inside.current);
  // A notice that leaves while the person rests on it lets the next one go after its time.
  useEffect(() => () => holdSaid(false), []);
  return (
    <div
      class="notice"
      role="status"
      ref={box}
      onMouseEnter={() => {
        hover.current = true;
        follow();
      }}
      onMouseLeave={() => {
        hover.current = false;
        follow();
      }}
      onFocusIn={() => {
        inside.current = true;
        follow();
      }}
      onFocusOut={(e) => {
        inside.current = !!(box.current && e.relatedTarget && box.current.contains(e.relatedTarget as Node));
        follow();
      }}
    >
      <p>{text}</p>
      {undo && (
        <Button kind="secondary" size="s" onClick={undoSaid}>
          Undo
        </Button>
      )}
      {!undo && link && (
        <Button kind="secondary" size="s" href={link.href} onClick={clearSaid}>
          {link.label}
        </Button>
      )}
      <Button kind="quiet" size="s" onClick={clearSaid}>
        Dismiss
      </Button>
    </div>
  );
}

/**
 * NewBuild offers the page that a deploy put out while this tab ran the old
 * one. The person reloads when it suits. A draft of a composer or of a page
 * stays in the tab across the reload. A failed action takes the place first.
 */
function NewBuild() {
  return (
    <div class="notice" role="status">
      <p>A new version of this page is ready.</p>
      <Button kind="secondary" size="s" onClick={() => location.reload()}>
        Reload
      </Button>
      <Button kind="quiet" size="s" onClick={dismissBuild}>
        Dismiss
      </Button>
    </div>
  );
}

export function App() {
  const route = useRoute();
  followMember(route);
  const [auth, setAuth] = useState<Auth>({ kind: 'loading' });
  const notice = useNotice();
  const said = useSaid();
  const undo = useUndo();
  const fresh = useNewBuild();
  // The chat-first page has its own addresses (src/ui/chat/route.ts). Every other address opens an older place.
  const chat = parseChat(location.hash);
  const open = chat && chat.view === 'channel' ? chat.id : route.place === 'bridge' ? route.id : '';
  const config = useSelect((s) => s.config);

  useEffect(() => {
    store.dispatch({ type: 'open', bridge: open });
    if (open) lastBridge = open;
  }, [open]);

  // A notice tells of a failed action on the screen where it happened. It clears when the person moves to another screen.
  useEffect(() => {
    clearNotice();
  }, [route]);

  // The theme of the deployment: its accent and its logo, or the defaults.
  useEffect(() => {
    applyTheme(themeOf(config));
  }, [config]);

  const unauthorized = (e: SigninNeeded) => {
    if (leaving) return;
    // A 401 of one route, while the page holds a token and has not just
    // tried a new one, ends the session only when GET /v1/whoami says so
    // too: its own 401 comes back here and signs out. Until then the
    // person keeps the screen and an unsent draft.
    if (e.path && e.path !== '/v1/whoami' && getToken() && !tokenTry) {
      if (confirming) return;
      confirming = true;
      api
        .whoami()
        .then(() => {
          // A 401 stopped the stream, and the session holds, so it starts again.
          if (e.path === '/v1/bossmode/stream' && Date.now() - streamAgainAt > 30_000) {
            streamAgainAt = Date.now();
            startStream(unauthorized);
          } else showError(new Error('The server refused one request. You are still signed in. Try again.'));
        })
        .catch(() => {})
        .finally(() => {
          confirming = false;
        });
      return;
    }
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
    setAuth({ kind: 'signin', signinUrl: step.signinUrl, expired: step.expired, returned: step.returned, error });
  };

  const boot = async () => {
    setAuth({ kind: 'loading' });
    try {
      const me = await api.whoami();
      tokenTry = false;
      clearSigninMarks();
      scheduleRenewal();
      store.dispatch({ type: 'me', me });
      setAuth({ kind: 'ready' });
      const cfg = await api.config().catch(() => null);
      store.dispatch({ type: 'config', config: cfg });
      // The page opens on the chat-first home, and on Results for a person
      // who can start no work, such as a sponsor. An address that names a place keeps it.
      if (cfg && cfg.work && opensOn(me) === 'results' && (location.hash === '' || location.hash === '#')) go({ place: 'results' }, true);
      await Promise.all([loadBridges(), loadFaces().catch(showError), loadAgents().catch(showError)]);
      startStream(unauthorized);
      // The fleet, its open runs, and the skills fill the statuses of the
      // workers and the pickers. A page without them still works, so their
      // errors stay quiet.
      loadFleet().catch(() => {});
      loadOpenRuns().catch(() => {});
      // The front gives the catalog only to a person who can start an
      // agent. A viewer, such as a sponsor, gets 403, which the browser
      // shows as an error on every place, so the page does not ask. Chat
      // still asks when it opens, for an agent of a pool.
      if (mayStart(me)) loadSkills().catch(() => {});
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err && err.name === 'SigninNeeded') return;
      setAuth({ kind: 'failed', error: (err && err.message) || 'The server did not answer. Check the connection, then try again.' });
    }
  };

  useEffect(() => {
    // The sign-in takes a return address only under /bossmode/, with the slash.
    const path = canonicalPath(location.pathname);
    if (path !== location.pathname) history.replaceState(null, '', path + location.search + location.hash);
    setUnauthorizedHandler(unauthorized);
    // Each call says whether it reached the server, for the bar Offline.
    setReachHandler(noteAnswer);
    boot();
    // A page that comes back from the cache of the browser, as after Back
    // from a sign-in that did not finish, starts again. Without this, the
    // person sees a page that waits for a move that ended.
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      leaving = false;
      boot();
    };
    // A page that leaves, also into the cache of the browser, closes its
    // stream, so it holds no connection while nobody reads it. A browser
    // keeps six connections per host, and the streams of a few reloads in a
    // row starved the reads of the next page.
    const onHide = () => stopStream();
    // A browser slows the timers of a tab out of view, so the renewal of
    // the token is planned again when the tab comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRenewal();
    };
    addEventListener('pageshow', onShow);
    addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      removeEventListener('pageshow', onShow);
      removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisible);
      stopStream();
    };
  }, []);

  // While the person is signed in, the page follows whether it reaches the server, and tries again with a read of whoami while it does not.
  const signedIn = auth.kind === 'ready';
  useEffect(() => {
    if (!signedIn) return;
    return watchReach(() => api.whoami());
  }, [signedIn]);

  // The keys of the whole page: / and Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('dialog[open]')) return;
      // The chat-first page keeps its own keys (src/ui/chat/ChatApp.tsx).
      if (parseChat(location.hash)) return;
      if (e.key === '/' && !isTyping(e)) {
        // A form keeps the person: / would leave it for a composer elsewhere.
        if (isForm(parseRoute(location.hash))) return;
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
        // Work and Results are places of their own with no parent: Escape stays there.
        if (r.place === 'work' || r.place === 'results') return;
        // A form stays too, as the editor of a duty does: a stray Escape never throws its work away.
        if (wide && shown !== 'details' && (r.place === 'bridge' || r.place === 'home' || r.place === 'manager' || r.place === 'chat' || r.place === 'activity' || r.place === 'member' || r.place === 'routines' || r.place === 'knowhow' || r.place === 'duties' || r.place === 'new' || r.place === 'new-agent' || (r.place === 'fleet' && !r.board) || (r.place === 'skills' && !r.item))) return;
        e.preventDefault();
        go(backOf(r));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const signOut = () => {
    stopStream();
    void stopRenewal();
    clearToken();
    markSignedOut();
    forgetFaces();
    store.dispatch({ type: 'me', me: null });
    boot();
  };

  if (auth.kind === 'loading') {
    return (
      <div class="boot" role="status">
        Loading the page.
      </div>
    );
  }
  if (auth.kind === 'signin') {
    return (
      <Signin
        signinUrl={auth.signinUrl}
        expired={auth.expired}
        returned={auth.returned}
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
        <Card title="Bossmode" tone="red" label="The server did not answer">
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

  const shown = notice ? <Notice text={notice} /> : said ? <Said text={said} undo={undo} /> : fresh ? <NewBuild /> : null;
  // A person who only views opens on Results: the chat-first page needs a person who can start work.
  if (chat && !(chat.view === 'home' && auth.kind === 'ready' && config && config.work && opensOn(store.get().me) === 'results')) return <ChatApp route={chat} notice={shown} onSignOut={signOut} />;
  const panes = panesOf(route);
  const place = placeIn(route);
  return (
    <LegacyFrame onSignOut={signOut}>
      <Shell route={route} place={place} list={panes.list} main={panes.main} details={panes.details} notice={shown} onSignOut={signOut} />
    </LegacyFrame>
  );
}
