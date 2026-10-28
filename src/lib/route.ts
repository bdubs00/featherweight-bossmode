// The address of the page keeps the screen: #bridge/<id>, #manager, #fleet,
// #chat/<run>, #pages/<path>, and so on. The route also names the place of the app bar
// and the focus column: the one pane that a narrow window shows.
//
// The routes of every screen live here, so the screens of the next stage
// add none. docs/DESIGN.md, section 11, lists them.

export type BridgeTab = 'posts' | 'wiki' | 'decisions';

/**
 * What Make this a duty brings to New duty: the agent, the action, and its
 * message, bridge, or playbook. The address holds it as a short query,
 * #duties/new?agent=scribe&do=ask&message=..., so a reload keeps it.
 */
export interface DutySeed {
  agent?: string;
  act?: 'ask' | 'post' | 'open' | 'manager';
  message?: string;
  bridge?: string;
  playbook?: string;
}

/** The longest message that the address of a new duty carries. */
export const SEED_MESSAGE = 2000;

const SEED_KEYS: [keyof DutySeed, string][] = [
  ['agent', 'agent'],
  ['act', 'do'],
  ['bridge', 'bridge'],
  ['playbook', 'playbook'],
  ['message', 'message'],
];

/** seedOf reads the query of #duties/new, or undefined for none. */
function seedOf(q: string): DutySeed | undefined {
  if (!q) return undefined;
  const p = new URLSearchParams(q);
  const out: DutySeed = {};
  for (const [k, name] of SEED_KEYS) {
    const v = p.get(name);
    if (v) (out as Record<string, string>)[k] = v;
  }
  if (out.act && !['ask', 'post', 'open', 'manager'].includes(out.act)) delete out.act;
  return Object.keys(out).length ? out : undefined;
}

/** seedQuery writes a seed as the query of #duties/new. */
function seedQuery(seed: DutySeed | undefined): string {
  if (!seed) return '';
  const p = new URLSearchParams();
  for (const [k, name] of SEED_KEYS) {
    const v = seed[k];
    if (v) p.set(name, k === 'message' ? String(v).slice(0, SEED_MESSAGE) : String(v));
  }
  const s = p.toString();
  return s ? '?' + s : '';
}
export type MemberTab = 'chat' | 'run' | 'files';
export type RoutineTab = 'steps' | 'evidence' | 'runbook';

/** A skill or a tool on the Skills place. The id of a tool can hold a slash, such as github/create_issue. */
export interface SkillItem {
  kind: 'skill' | 'tool';
  id: string;
}

export type Route =
  | { place: 'home' }
  | { place: 'activity'; item?: string; board?: boolean }
  | { place: 'tasks' }
  | { place: 'manager'; run?: string; fresh?: boolean }
  | { place: 'chat'; run?: string; fresh?: boolean; details?: boolean }
  | { place: 'new' }
  | { place: 'bridge'; id: string; pane: 'roster' | 'run' | 'none'; tab?: BridgeTab; run?: string; handle?: string }
  | { place: 'member'; bridge: string; handle: string; tab: MemberTab; profile?: boolean }
  | { place: 'fleet'; agent?: string; board?: boolean; profile?: boolean }
  | { place: 'new-agent' }
  | { place: 'appearance' }
  | { place: 'results' }
  | { place: 'skills'; item?: SkillItem; add?: boolean }
  | { place: 'routines'; agent?: string; name?: string; tab?: RoutineTab; details?: boolean }
  | { place: 'duties'; name?: string; edit?: boolean; fresh?: boolean; seed?: DutySeed; run?: string; tab?: 'playbooks'; playbook?: string }
  | { place: 'pages'; path?: string; mode: 'tree' | 'read' | 'history' | 'edit' | 'create'; version?: number };

/** The places of the app bar. */
export type Place = 'tasks' | 'results' | 'activity' | 'chat' | 'bridges' | 'fleet' | 'duties' | 'skills' | 'routines' | 'wiki' | 'manager' | 'account';

/** The column that a narrow window shows for a route. */
export type Column = 'list' | 'main' | 'details';

const dec = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const encPath = (p: string): string => p.split('/').map(encodeURIComponent).join('/');

const pagesOf = (rest: string[]): Route => (rest.length && rest.join('/') ? { place: 'pages', path: rest.map(dec).join('/'), mode: 'read' } : { place: 'pages', mode: 'tree' });

/** parseRoute reads a route from the hash of the address. */
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (!h) return { place: 'home' };
  const parts = h.split('/');
  const head = parts[0];
  const rest = parts.slice(1);
  switch (head) {
    case 'bridges':
      return { place: 'home' };
    // #tasks is the door and the board of the tasks of the person.
    case 'tasks':
      return { place: 'tasks' };
    case 'activity':
      // The item is the key of a row of the inbox, such as d:<run>/<approval>.
      return rest.length && rest.join('/') ? { place: 'activity', item: rest.map(dec).join('/') } : { place: 'activity' };
    // #work is the board of the work, a view of the place Activity.
    case 'work':
      return { place: 'activity', board: true };
    // #manager is the newest conversation with the manager, #manager/new a
    // new one, and #manager/<run> a past one.
    case 'manager':
      if (rest[0] === 'new') return { place: 'manager', fresh: true };
      if (rest[0]) return { place: 'manager', run: dec(rest[0]) };
      return { place: 'manager' };
    // #chat is the history, #chat/new a new chat, #chat/<run> a chat, and
    // #chat/<run>/details the details of a chat, for a narrow window.
    case 'chat':
      if (rest[0] === 'new') return { place: 'chat', fresh: true };
      if (rest[0]) return rest[1] === 'details' ? { place: 'chat', run: dec(rest[0]), details: true } : { place: 'chat', run: dec(rest[0]) };
      return { place: 'chat' };
    case 'new':
      return { place: 'new' };
    case 'new-agent':
      return { place: 'new-agent' };
    case 'appearance':
      return { place: 'appearance' };
    case 'results':
      return { place: 'results' };
    case 'skills':
      if (rest[0] === 'add' && rest.length === 1) return { place: 'skills', add: true };
      if ((rest[0] === 'skill' || rest[0] === 'tool') && rest.length > 1 && rest.slice(1).join('/')) return { place: 'skills', item: { kind: rest[0], id: rest.slice(1).map(dec).join('/') } };
      return { place: 'skills' };
    // #routines/<agent>/<name> is a routine, with /evidence or /runbook for
    // a tab, and /agent for the week of its agent in a narrow window.
    case 'routines': {
      if (!rest[0] || !rest[1]) return { place: 'routines' };
      const base = { place: 'routines' as const, agent: dec(rest[0]), name: dec(rest[1]) };
      if (rest[2] === 'agent') return { ...base, details: true };
      if (rest[2] === 'evidence' || rest[2] === 'runbook') return { ...base, tab: rest[2] };
      return base;
    }
    // #duties is the list, #duties/new a new duty, #duties/<name> a duty,
    // #duties/<name>/edit its editor, and #duties/<name>/run/<run> a run of
    // its history. A duty named new opens at #duties/new/, with the slash,
    // so it never meets the new duty. A query after #duties/new holds what
    // Make this a duty brought.
    case 'duties': {
      if (!rest[0]) return { place: 'duties' };
      if (/^new(\?|$)/.test(rest[0]) && rest.length === 1) {
        const seed = seedOf(rest[0].slice(4));
        return seed ? { place: 'duties', fresh: true, seed } : { place: 'duties', fresh: true };
      }
      const name = dec(rest[0]);
      if (rest[1] === 'run' && rest[2]) return { place: 'duties', name, run: dec(rest[2]) };
      return rest[1] === 'edit' ? { place: 'duties', name, edit: true } : { place: 'duties', name };
    }
    // #playbooks is the tab Playbooks of Duties, and #playbooks/<name> one playbook. A head of its own keeps any name free for a duty.
    case 'playbooks':
      return rest[0] ? { place: 'duties', tab: 'playbooks', playbook: dec(rest[0]) } : { place: 'duties', tab: 'playbooks' };
    case 'bridge': {
      if (!rest[0]) return { place: 'home' };
      const id = dec(rest[0]);
      if (rest[1] === 'roster' || rest[1] === 'members') return { place: 'bridge', id, pane: 'roster' };
      if (rest[1] === 'run' && rest[2]) return { place: 'bridge', id, pane: 'run', run: dec(rest[2]), handle: rest[3] ? dec(rest[3]) : undefined };
      if (rest[1] === 'wiki' || rest[1] === 'decisions') return { place: 'bridge', id, pane: 'none', tab: rest[1] };
      return { place: 'bridge', id, pane: 'none' };
    }
    case 'member': {
      if (!rest[0] || !rest[1]) return { place: 'fleet' };
      if (rest[2] === 'profile') return { place: 'member', bridge: dec(rest[0]), handle: dec(rest[1]), tab: 'chat', profile: true };
      const tab: MemberTab = rest[2] === 'run' || rest[2] === 'files' ? rest[2] : 'chat';
      return { place: 'member', bridge: dec(rest[0]), handle: dec(rest[1]), tab };
    }
    case 'board':
      return { place: 'fleet', board: true };
    case 'fleet':
      if (!rest[0]) return { place: 'fleet' };
      return rest[1] === 'profile' ? { place: 'fleet', agent: dec(rest[0]), profile: true } : { place: 'fleet', agent: dec(rest[0]) };
    // #page/<path> is the address of a page of the wiki in the links that
    // the backend writes, such as the report of a closed bridge. #wiki is
    // the name of the place.
    case 'pages':
    case 'page':
    case 'wiki':
      return pagesOf(rest);
    case 'history':
      return rest.length ? { place: 'pages', path: rest.map(dec).join('/'), mode: 'history' } : { place: 'pages', mode: 'tree' };
    case 'edit':
      return rest.length ? { place: 'pages', path: rest.map(dec).join('/'), mode: 'edit' } : { place: 'pages', mode: 'tree' };
    case 'create':
      return { place: 'pages', path: rest.length ? rest.map(dec).join('/') : undefined, mode: 'create' };
    case 'version': {
      const v = Number(rest[0]);
      if (!Number.isInteger(v) || v < 1 || rest.length < 2) return { place: 'pages', mode: 'tree' };
      return { place: 'pages', path: rest.slice(1).map(dec).join('/'), mode: 'read', version: v };
    }
  }
  // An old or unknown address opens home without an error.
  return { place: 'home' };
}

/** hrefOf writes the hash of a route. */
export function hrefOf(r: Route): string {
  switch (r.place) {
    case 'home':
      return '#';
    case 'tasks':
      return '#tasks';
    case 'activity':
      if (r.board) return '#work';
      return r.item ? '#activity/' + encPath(r.item) : '#activity';
    case 'manager':
      if (r.run) return '#manager/' + encodeURIComponent(r.run);
      return r.fresh ? '#manager/new' : '#manager';
    case 'chat':
      if (r.run) return '#chat/' + encodeURIComponent(r.run) + (r.details ? '/details' : '');
      return r.fresh ? '#chat/new' : '#chat';
    case 'new':
      return '#new';
    case 'new-agent':
      return '#new-agent';
    case 'appearance':
      return '#appearance';
    case 'results':
      return '#results';
    case 'skills':
      if (r.add) return '#skills/add';
      return r.item ? '#skills/' + r.item.kind + '/' + encPath(r.item.id) : '#skills';
    case 'routines': {
      if (!r.agent || !r.name) return '#routines';
      const base = '#routines/' + encodeURIComponent(r.agent) + '/' + encodeURIComponent(r.name);
      if (r.details) return base + '/agent';
      return r.tab === 'evidence' || r.tab === 'runbook' ? base + '/' + r.tab : base;
    }
    case 'duties':
      if (r.tab === 'playbooks') return '#playbooks' + (r.playbook ? '/' + encodeURIComponent(r.playbook) : '');
      if (r.fresh) return '#duties/new' + seedQuery(r.seed);
      if (!r.name) return '#duties';
      if (r.run) return '#duties/' + encodeURIComponent(r.name) + '/run/' + encodeURIComponent(r.run);
      return '#duties/' + encodeURIComponent(r.name) + (r.edit ? '/edit' : r.name === 'new' ? '/' : '');
    case 'bridge': {
      const base = '#bridge/' + encodeURIComponent(r.id);
      if (r.pane === 'roster') return base + '/roster';
      if (r.pane === 'run' && r.run) return base + '/run/' + encodeURIComponent(r.run) + (r.handle ? '/' + encodeURIComponent(r.handle) : '');
      if (r.tab === 'wiki' || r.tab === 'decisions') return base + '/' + r.tab;
      return base;
    }
    case 'member':
      return '#member/' + encodeURIComponent(r.bridge) + '/' + encodeURIComponent(r.handle) + (r.profile ? '/profile' : r.tab === 'chat' ? '' : '/' + r.tab);
    case 'fleet':
      if (r.board) return '#board';
      return r.agent ? '#fleet/' + encodeURIComponent(r.agent) + (r.profile ? '/profile' : '') : '#fleet';
    case 'pages':
      if (r.mode === 'create') return '#create' + (r.path ? '/' + encPath(r.path) : '');
      if (!r.path) return '#pages';
      if (r.mode === 'history') return '#history/' + encPath(r.path);
      if (r.mode === 'edit') return '#edit/' + encPath(r.path);
      if (r.version) return '#version/' + r.version + '/' + encPath(r.path);
      return '#pages/' + encPath(r.path);
  }
}

/** placeOf names the place of the app bar that a route belongs to. */
export function placeOf(r: Route): Place {
  switch (r.place) {
    case 'tasks':
      return 'tasks';
    case 'activity':
      return 'activity';
    case 'manager':
      return 'manager';
    case 'chat':
      return 'chat';
    case 'member':
    case 'fleet':
    case 'new-agent':
      return 'fleet';
    case 'pages':
      return 'wiki';
    case 'skills':
      return 'skills';
    case 'routines':
      return 'routines';
    case 'duties':
      return 'duties';
    case 'appearance':
      return 'account';
    case 'results':
      return 'results';
  }
  return 'bridges';
}

/** columnOf names the column that a narrow window shows for a route. */
export function columnOf(r: Route): Column {
  switch (r.place) {
    case 'home':
      return 'list';
    case 'activity':
      return r.item || r.board ? 'main' : 'list';
    case 'bridge':
      return r.pane === 'none' ? 'main' : 'details';
    case 'member':
      return r.profile ? 'details' : 'main';
    case 'fleet':
      if (r.agent) return r.profile ? 'details' : 'main';
      return r.board ? 'main' : 'list';
    case 'pages':
      return r.mode === 'tree' ? 'list' : 'main';
    case 'skills':
      return r.item || r.add ? 'main' : 'list';
    case 'routines':
      if (r.name) return r.details ? 'details' : 'main';
      return 'list';
    case 'duties':
      if (r.tab === 'playbooks') return r.playbook ? 'main' : 'list';
      return r.name || r.fresh ? 'main' : 'list';
    case 'chat':
      if (r.run) return r.details ? 'details' : 'main';
      return r.fresh ? 'main' : 'list';
    case 'manager':
      return r.run || r.fresh ? 'main' : 'list';
  }
  return 'main';
}

/** parentOf is the route that Escape and Back go to in a narrow window. */
export function parentOf(r: Route): Route {
  switch (r.place) {
    case 'bridge':
      if (r.pane === 'run') return { place: 'bridge', id: r.id, pane: 'roster' };
      if (r.pane === 'roster') return { place: 'bridge', id: r.id, pane: 'none' };
      return { place: 'home' };
    case 'activity':
      return r.item || r.board ? { place: 'activity' } : { place: 'home' };
    case 'member':
      return r.profile ? { place: 'member', bridge: r.bridge, handle: r.handle, tab: 'chat' } : { place: 'fleet' };
    case 'fleet':
      if (r.agent && r.profile) return { place: 'fleet', agent: r.agent };
      return r.agent || r.board ? { place: 'fleet' } : { place: 'home' };
    case 'new-agent':
      return { place: 'fleet' };
    case 'skills':
      return r.item || r.add ? { place: 'skills' } : { place: 'home' };
    case 'routines':
      if (r.agent && r.name && r.details) return { place: 'routines', agent: r.agent, name: r.name };
      return r.name ? { place: 'routines' } : { place: 'home' };
    case 'duties':
      if (r.tab === 'playbooks') return r.playbook ? { place: 'duties', tab: 'playbooks' } : { place: 'home' };
      if (r.name && (r.edit || r.run)) return { place: 'duties', name: r.name };
      return r.name || r.fresh ? { place: 'duties' } : { place: 'home' };
    case 'chat':
      if (r.run && r.details) return { place: 'chat', run: r.run };
      return r.run || r.fresh ? { place: 'chat' } : { place: 'home' };
    case 'manager':
      return r.run || r.fresh ? { place: 'manager' } : { place: 'home' };
    case 'pages':
      if (r.mode === 'tree') return { place: 'home' };
      if (r.mode === 'read' && !r.version) return { place: 'pages', mode: 'tree' };
      return r.path ? { place: 'pages', path: r.path, mode: 'read' } : { place: 'pages', mode: 'tree' };
  }
  return { place: 'home' };
}

/** go opens a route. */
export function go(r: Route | string, replace = false): void {
  const h = typeof r === 'string' ? r : hrefOf(r);
  if (replace) history.replaceState(null, '', h === '#' ? location.pathname + location.search : h);
  else if (location.hash !== h) location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * canonicalPath is the path of the page with the slash that the sign-in
 * needs: the workbench takes a next address only when it starts with
 * /bossmode/, so /bossmode becomes /bossmode/.
 */
export function canonicalPath(pathname: string): string {
  return /\/bossmode$/.test(pathname) ? pathname + '/' : pathname;
}
