// The address of the page keeps the screen, as on /ui: #bridge/<id>,
// #manager, #fleet, #pages/<path>, and so on. In a narrow window the route
// also picks the one column that shows.

export type Route =
  | { place: 'home' }
  | { place: 'manager' }
  | { place: 'new' }
  | { place: 'bridge'; id: string; pane: 'roster' | 'run' | 'none'; run?: string; handle?: string }
  | { place: 'fleet'; agent?: string }
  | { place: 'pages'; path?: string; mode: 'tree' | 'read' | 'history' | 'edit' | 'create'; version?: number };

/** The column that a narrow window shows for a route. */
export type Column = 'rail' | 'main' | 'pane';

const dec = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const encPath = (p: string): string => p.split('/').map(encodeURIComponent).join('/');

/** parseRoute reads a route from the hash of the address. */
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (!h) return { place: 'home' };
  const parts = h.split('/');
  const head = parts[0];
  const rest = parts.slice(1);
  switch (head) {
    case 'manager':
      return { place: 'manager' };
    case 'new':
      return { place: 'new' };
    case 'bridge': {
      if (!rest[0]) return { place: 'home' };
      const id = dec(rest[0]);
      if (rest[1] === 'roster') return { place: 'bridge', id, pane: 'roster' };
      if (rest[1] === 'run' && rest[2]) return { place: 'bridge', id, pane: 'run', run: dec(rest[2]), handle: rest[3] ? dec(rest[3]) : undefined };
      return { place: 'bridge', id, pane: 'none' };
    }
    case 'fleet':
      return rest[0] ? { place: 'fleet', agent: dec(rest[0]) } : { place: 'fleet' };
    case 'pages':
      return rest.length && rest.join('/') ? { place: 'pages', path: rest.map(dec).join('/'), mode: 'read' } : { place: 'pages', mode: 'tree' };
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
  // An old or unknown address opens home without an error, as on /ui.
  return { place: 'home' };
}

/** hrefOf writes the hash of a route. */
export function hrefOf(r: Route): string {
  switch (r.place) {
    case 'home':
      return '#';
    case 'manager':
      return '#manager';
    case 'new':
      return '#new';
    case 'bridge': {
      const base = '#bridge/' + encodeURIComponent(r.id);
      if (r.pane === 'roster') return base + '/roster';
      if (r.pane === 'run' && r.run) return base + '/run/' + encodeURIComponent(r.run) + (r.handle ? '/' + encodeURIComponent(r.handle) : '');
      return base;
    }
    case 'fleet':
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

/** columnOf names the column that a narrow window shows for a route. */
export function columnOf(r: Route): Column {
  switch (r.place) {
    case 'home':
      return 'rail';
    case 'bridge':
      return r.pane === 'none' ? 'main' : 'pane';
    case 'fleet':
      return r.agent ? 'pane' : 'main';
    case 'pages':
      return r.mode === 'tree' ? 'pane' : 'main';
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
    case 'fleet':
      return r.agent ? { place: 'fleet' } : { place: 'home' };
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
