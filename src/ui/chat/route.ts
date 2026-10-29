// The addresses of the chat-first page:
//
//   #            home: the sidebar on a phone, the channel that needs you
//                (else the newest channel) where the panes fit
//   #c/<id>      a channel, with /wiki or /decisions for a tab, and /members
//                for the members pane on a phone
//   #m           the newest conversation with the Manager, #m/new a new one,
//                #m/<run> one conversation
//   #j/<duty>    a job: the runs of a repeating job, with /about for its pane
//   #r/<run>     one run that sits in no channel and no job
//   #a/<agent>   an agent: what it does, where it works, what it learned,
//                with /setup for its setup on a narrow window
//   #agents      every agent, with New agent
//   #results     what the work gave
//   #library/files  the files that the channels wrote; the wiki (#pages)
//                and the skills (#skills) are the other tabs of the Library
//   #settings    where to reach you, the connections, the packages, and the
//                switch of every job
//
// The addresses of the older places open in the same shell. An older
// address with a home on this page goes there: #fleet goes to #agents, a
// team to its channel, Know-how to its agent, and the board home.
//
// A channel is a bridge of the API. The page never says bridge.

export type ChannelTab = 'posts' | 'wiki' | 'decisions';

export type ChatRoute =
  | { view: 'home' }
  | { view: 'channel'; id: string; tab: ChannelTab; members?: boolean }
  | { view: 'manager'; run?: string; fresh?: boolean }
  | { view: 'job'; name: string; about?: boolean }
  | { view: 'run'; id: string; about?: boolean }
  | { view: 'agent'; name: string; setup?: boolean }
  | { view: 'agents' }
  | { view: 'results' }
  | { view: 'files' }
  | { view: 'settings' };

const dec = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * activityHome is the place of an item of the older Activity, as the links
 * of a notification name it: a decision or a result of a run opens the
 * run, a question of a team opens its channel, and anything else opens home.
 */
function activityHome(item: string): ChatRoute {
  let m = /^[dvw]:([^/]+)/.exec(item);
  if (m) return { view: 'run', id: m[1] };
  m = /^[qms]:([^/]+)/.exec(item);
  if (m) return { view: 'channel', id: m[1], tab: 'posts' };
  return { view: 'home' };
}

/** parseChat reads a route of the chat-first page from the hash, or null for an address of an older place, which the shell shows as it is. */
export function parseChat(hash: string): ChatRoute | null {
  const h = hash.replace(/^#\/?/, '');
  if (!h) return { view: 'home' };
  const [head, ...rest] = h.split('/');
  switch (head) {
    case 'c': {
      if (!rest[0]) return { view: 'home' };
      const id = dec(rest[0]);
      if (rest[1] === 'members') return { view: 'channel', id, tab: 'posts', members: true };
      const tab: ChannelTab = rest[1] === 'wiki' || rest[1] === 'decisions' ? rest[1] : 'posts';
      return { view: 'channel', id, tab };
    }
    // #manager is the address of the Manager in the older places and in the links of the server.
    case 'manager':
    case 'm':
      if (rest[0] === 'new') return { view: 'manager', fresh: true };
      return rest[0] ? { view: 'manager', run: dec(rest[0]) } : { view: 'manager' };
    case 'j':
      if (!rest[0]) return { view: 'home' };
      return rest[1] === 'about' ? { view: 'job', name: dec(rest[0]), about: true } : { view: 'job', name: dec(rest[0]) };
    case 'r':
      if (!rest[0]) return { view: 'home' };
      return rest[1] === 'about' ? { view: 'run', id: dec(rest[0]), about: true } : { view: 'run', id: dec(rest[0]) };
    case 'a':
      if (!rest[0]) return { view: 'agents' };
      return rest[1] === 'setup' ? { view: 'agent', name: dec(rest[0]), setup: true } : { view: 'agent', name: dec(rest[0]) };
    case 'agents':
      return { view: 'agents' };
    case 'results':
      return { view: 'results' };
    case 'library':
      return { view: 'files' };
    case 'settings':
      return { view: 'settings' };
    // The older addresses that have a home on this page.
    case 'fleet':
      if (!rest[0]) return { view: 'agents' };
      return rest[1] === 'profile' ? { view: 'agent', name: dec(rest[0]), setup: true } : { view: 'agent', name: dec(rest[0]) };
    case 'board':
      return { view: 'agents' };
    case 'knowhow':
      return rest[0] ? { view: 'agent', name: dec(rest[0]) } : { view: 'agents' };
    case 'work':
    case 'tasks':
    case 'bridges':
      return { view: 'home' };
    case 'bridge':
      if (!rest[0]) return { view: 'home' };
      if (rest[1] === 'run' && rest[2]) return { view: 'run', id: dec(rest[2]) };
      if (rest[1] === 'roster' || rest[1] === 'members') return { view: 'channel', id: dec(rest[0]), tab: 'posts', members: true };
      return { view: 'channel', id: dec(rest[0]), tab: rest[1] === 'wiki' || rest[1] === 'decisions' ? rest[1] : 'posts' };
    case 'member':
      return rest[0] ? { view: 'channel', id: dec(rest[0]), tab: 'posts', members: true } : { view: 'agents' };
    case 'new':
      return { view: 'manager', fresh: true };
    case 'activity':
      return rest.length ? activityHome(rest.map(dec).join('/')) : { view: 'home' };
    case 'chat':
      if (rest[0] === 'new') return { view: 'manager', fresh: true };
      return rest[0] ? { view: 'run', id: dec(rest[0]) } : { view: 'home' };
    case 'duties':
      // A duty is a job. Its editor and New duty stay the older form, in this shell.
      if (rest[0] && rest[1] === 'run' && rest[2]) return { view: 'run', id: dec(rest[2]) };
      if (rest[0] && !/^new(\?|$)/.test(rest[0]) && rest.length === 1) return { view: 'job', name: dec(rest[0]) };
      return null;
  }
  return null;
}

const enc = encodeURIComponent;

/** chatHref writes the hash of a route of the chat-first page. */
export function chatHref(r: ChatRoute): string {
  switch (r.view) {
    case 'home':
      return '#';
    case 'channel':
      if (r.members) return '#c/' + enc(r.id) + '/members';
      return '#c/' + enc(r.id) + (r.tab === 'posts' ? '' : '/' + r.tab);
    case 'manager':
      if (r.run) return '#m/' + enc(r.run);
      return r.fresh ? '#m/new' : '#m';
    case 'job':
      return '#j/' + enc(r.name) + (r.about ? '/about' : '');
    case 'run':
      return '#r/' + enc(r.id) + (r.about ? '/about' : '');
    case 'agent':
      return '#a/' + enc(r.name) + (r.setup ? '/setup' : '');
    case 'agents':
      return '#agents';
    case 'results':
      return '#results';
    case 'files':
      return '#library';
    case 'settings':
      return '#settings';
  }
}

/** The pane that a phone shows for a route: the sidebar, the stream, or the pane on the right. */
export type Focus = 'side' | 'main' | 'right';

export function focusOf(r: ChatRoute): Focus {
  if (r.view === 'home') return 'side';
  if (r.view === 'channel' && r.members) return 'right';
  if ((r.view === 'job' || r.view === 'run') && r.about) return 'right';
  if (r.view === 'agent' && r.setup) return 'right';
  return 'main';
}

/** streamKey names what a route shows, so the sidebar marks the row of the open channel, job, Manager, or agent. */
export function streamKey(r: ChatRoute): string {
  switch (r.view) {
    case 'channel':
      return 'c:' + r.id;
    case 'manager':
      return 'm:';
    case 'job':
      return 'j:' + r.name;
    case 'run':
      return 'r:' + r.id;
    case 'agent':
      return 'a:' + r.name;
  }
  return '';
}
