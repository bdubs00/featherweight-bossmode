// The address of the page keeps the screen: #bridge/<id>, #manager, #fleet,
// #pages/<path>, and so on. The route also names the place of the app bar
// and the focus column: the one pane that a narrow window shows.
//
// The routes of every screen live here, so the screens of the next stage
// add none. docs/DESIGN.md, section 11, lists them.

export type BridgeTab = 'posts' | 'wiki' | 'decisions';
export type MemberTab = 'chat' | 'run' | 'files';

/** A skill or a tool on the Skills place. The id of a tool can hold a slash, such as github/create_issue. */
export interface SkillItem {
  kind: 'skill' | 'tool';
  id: string;
}

export type Route =
  | { place: 'home' }
  | { place: 'activity' }
  | { place: 'manager' }
  | { place: 'new' }
  | { place: 'bridge'; id: string; pane: 'roster' | 'run' | 'none'; tab?: BridgeTab; run?: string; handle?: string }
  | { place: 'member'; bridge: string; handle: string; tab: MemberTab }
  | { place: 'fleet'; agent?: string; board?: boolean }
  | { place: 'new-agent' }
  | { place: 'appearance' }
  | { place: 'skills'; item?: SkillItem }
  | { place: 'pages'; path?: string; mode: 'tree' | 'read' | 'history' | 'edit' | 'create'; version?: number };

/** The places of the app bar. */
export type Place = 'activity' | 'bridges' | 'fleet' | 'skills' | 'wiki' | 'manager' | 'account';

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
    case 'activity':
      return { place: 'activity' };
    case 'manager':
      return { place: 'manager' };
    case 'new':
      return { place: 'new' };
    case 'new-agent':
      return { place: 'new-agent' };
    case 'appearance':
      return { place: 'appearance' };
    case 'skills':
      if ((rest[0] === 'skill' || rest[0] === 'tool') && rest.length > 1 && rest.slice(1).join('/')) return { place: 'skills', item: { kind: rest[0], id: rest.slice(1).map(dec).join('/') } };
      return { place: 'skills' };
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
      const tab: MemberTab = rest[2] === 'run' || rest[2] === 'files' ? rest[2] : 'chat';
      return { place: 'member', bridge: dec(rest[0]), handle: dec(rest[1]), tab };
    }
    case 'board':
      return { place: 'fleet', board: true };
    case 'fleet':
      return rest[0] ? { place: 'fleet', agent: dec(rest[0]) } : { place: 'fleet' };
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
    case 'activity':
      return '#activity';
    case 'manager':
      return '#manager';
    case 'new':
      return '#new';
    case 'new-agent':
      return '#new-agent';
    case 'appearance':
      return '#appearance';
    case 'skills':
      return r.item ? '#skills/' + r.item.kind + '/' + encPath(r.item.id) : '#skills';
    case 'bridge': {
      const base = '#bridge/' + encodeURIComponent(r.id);
      if (r.pane === 'roster') return base + '/roster';
      if (r.pane === 'run' && r.run) return base + '/run/' + encodeURIComponent(r.run) + (r.handle ? '/' + encodeURIComponent(r.handle) : '');
      if (r.tab === 'wiki' || r.tab === 'decisions') return base + '/' + r.tab;
      return base;
    }
    case 'member':
      return '#member/' + encodeURIComponent(r.bridge) + '/' + encodeURIComponent(r.handle) + (r.tab === 'chat' ? '' : '/' + r.tab);
    case 'fleet':
      if (r.board) return '#board';
      return r.agent ? '#fleet/' + encodeURIComponent(r.agent) : '#fleet';
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
    case 'activity':
      return 'activity';
    case 'manager':
      return 'manager';
    case 'member':
    case 'fleet':
    case 'new-agent':
      return 'fleet';
    case 'pages':
      return 'wiki';
    case 'skills':
      return 'skills';
    case 'appearance':
      return 'account';
  }
  return 'bridges';
}

/** columnOf names the column that a narrow window shows for a route. */
export function columnOf(r: Route): Column {
  switch (r.place) {
    case 'home':
    case 'activity':
      return 'list';
    case 'bridge':
      return r.pane === 'none' ? 'main' : 'details';
    case 'fleet':
      return r.agent ? 'details' : r.board ? 'main' : 'list';
    case 'pages':
      return r.mode === 'tree' ? 'list' : 'main';
    case 'skills':
      return r.item ? 'main' : 'list';
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
    case 'member':
      return { place: 'fleet' };
    case 'fleet':
      return r.agent || r.board ? { place: 'fleet' } : { place: 'home' };
    case 'new-agent':
      return { place: 'fleet' };
    case 'skills':
      return r.item ? { place: 'skills' } : { place: 'home' };
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
