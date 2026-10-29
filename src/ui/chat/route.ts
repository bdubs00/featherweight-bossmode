// The addresses of the chat-first page. Each head is new, so the addresses of
// the older places keep working under the grid menu:
//
//   #            home: the sidebar on a phone, the channel that needs you
//                (else the newest channel) where the panes fit
//   #c/<id>      a channel, with /wiki or /decisions for a tab, and /members
//                for the members pane on a phone
//   #m           the newest conversation with the Manager, #m/new a new one,
//                #m/<run> one conversation
//   #j/<duty>    a job: the runs of a repeating job, with /about for its pane
//   #r/<run>     one run that sits in no channel and no job
//   #a/<agent>   an agent: what it does, where it works, what it learned
//
// A channel is a bridge of the API. The page never says bridge.

export type ChannelTab = 'posts' | 'wiki' | 'decisions';

export type ChatRoute =
  | { view: 'home' }
  | { view: 'channel'; id: string; tab: ChannelTab; members?: boolean }
  | { view: 'manager'; run?: string; fresh?: boolean }
  | { view: 'job'; name: string; about?: boolean }
  | { view: 'run'; id: string; about?: boolean }
  | { view: 'agent'; name: string };

const dec = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** parseChat reads a route of the chat-first page from the hash, or null for an address of an older place. */
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
      return rest[0] ? { view: 'agent', name: dec(rest[0]) } : { view: 'home' };
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
      return '#a/' + enc(r.name);
  }
}

/** The pane that a phone shows for a route: the sidebar, the stream, or the pane on the right. */
export type Focus = 'side' | 'main' | 'right';

export function focusOf(r: ChatRoute): Focus {
  if (r.view === 'home') return 'side';
  if (r.view === 'channel' && r.members) return 'right';
  if ((r.view === 'job' || r.view === 'run') && r.about) return 'right';
  return 'main';
}

/** sameStream reports whether two routes show the same stream, so the sidebar marks its row. */
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
