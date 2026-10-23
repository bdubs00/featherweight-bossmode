// The links that the page adds to the text of a message: the id of a
// bridge that the page knows becomes a link with the title of the bridge,
// and the path of a page of the wiki becomes a link to the page. Agents
// name bridges by their ids and pages by their paths, mostly in code
// spans, and a person reads a title and clicks a path. The pass runs on
// the sanitized HTML of a message, so every link here comes from the page
// and holds only an address of its own routes.

import { hrefOf } from './route';
import { pageReason } from './pagepath';

/** What the page knows that a text can name. */
export interface Refs {
  /** The titles of the bridges that the page knows, by id, open or closed. */
  bridges: Record<string, string>;
  /** Whether a path names a page of the wiki. */
  page: (path: string) => boolean;
}

/** A path that ends with .md, at the edge of a word, as an agent writes it. A dot ends a sentence, so a path can end before one. */
const PATH = String.raw`(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.md`;
/** A word that can be the id of a bridge: a ULID, or the short ids of the fake server, which hold a dash. */
const WORD = String.raw`[A-Za-z0-9][\w-]{2,}`;
const EDGE_BEFORE = String.raw`(?<![\w./@-])`;
const EDGE_AFTER = String.raw`(?![\w/-]|\.\w)`;

/** idLike reports whether a word can be the id of a bridge: it holds a digit or a dash, so plain words never count. */
const idLike = (w: string): boolean => /[\d-]/.test(w);

/** isPath reports whether a text is the whole of a page path. */
const isPath = (t: string): boolean => new RegExp('^' + PATH + '$').test(t) && pageReason(t) === '';

/**
 * refCandidates finds what a text can name: the paths of pages, and the
 * words that can be the ids of bridges. The page asks the store only for
 * these, so a long text costs a few lookups.
 */
export function refCandidates(text: string): { paths: string[]; words: string[] } {
  const paths = new Set<string>();
  const words = new Set<string>();
  const re = new RegExp(EDGE_BEFORE + '(?:(' + PATH + ')|(' + WORD + '))' + EDGE_AFTER, 'g');
  for (const m of String(text || '').matchAll(re)) {
    if (m[1] && pageReason(m[1]) === '') paths.add(m[1]);
    else if (m[2] && idLike(m[2])) words.add(m[2]);
  }
  return { paths: [...paths], words: [...words] };
}

const bridgeLink = (doc: Document, id: string, title: string): HTMLAnchorElement => {
  const a = doc.createElement('a');
  a.setAttribute('href', hrefOf({ place: 'bridge', id, pane: 'none' }));
  a.className = 'ref-bridge';
  a.textContent = title || id;
  return a;
};

const pageLink = (doc: Document, path: string): HTMLAnchorElement => {
  const a = doc.createElement('a');
  a.setAttribute('href', hrefOf({ place: 'pages', path, mode: 'read' }));
  a.className = 'ref-page';
  return a;
};

/**
 * linkRefs adds the links of the page to sanitized HTML. A code span that
 * holds only the id of a known bridge becomes a link with the title of the
 * bridge. A code span that holds only the path of a page keeps its code
 * look inside a link, so it still reads as a path. In plain text, both
 * become links the same way. Text in a link and in a block of code stays
 * as it is, and so does a code span that holds more than one name.
 */
export function linkRefs(root: DocumentFragment | Element, refs: Refs): void {
  const doc = root.ownerDocument || document;
  const inside = (n: Node, tags: string[]): boolean => {
    for (let up = n.parentNode; up && up !== root; up = up.parentNode) if (tags.includes(up.nodeName)) return true;
    return false;
  };
  // Code spans first: the whole span is one name or none.
  for (const code of [...root.querySelectorAll('code')]) {
    if (inside(code, ['A', 'PRE'])) continue;
    const t = (code.textContent || '').trim();
    if (refs.bridges[t] !== undefined) code.replaceWith(bridgeLink(doc, t, refs.bridges[t]));
    else if (isPath(t) && refs.page(t)) {
      const a = pageLink(doc, t);
      code.replaceWith(a);
      a.appendChild(code);
    }
  }
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!inside(n, ['A', 'PRE', 'CODE'])) texts.push(n as Text);
  const re = new RegExp(EDGE_BEFORE + '(?:(' + PATH + ')|(' + WORD + '))' + EDGE_AFTER, 'g');
  for (const t of texts) {
    const s = t.data;
    const parts: (string | Node)[] = [];
    let last = 0;
    for (const m of s.matchAll(re)) {
      let link: Node | null = null;
      if (m[1] && pageReason(m[1]) === '' && refs.page(m[1])) {
        link = pageLink(doc, m[1]);
        link.textContent = m[1];
      } else if (m[2] && refs.bridges[m[2]] !== undefined) link = bridgeLink(doc, m[2], refs.bridges[m[2]]);
      if (!link) continue;
      parts.push(s.slice(last, m.index), link);
      last = m.index! + m[0].length;
    }
    if (!parts.length) continue;
    parts.push(s.slice(last));
    const frag = doc.createDocumentFragment();
    for (const x of parts) frag.append(x);
    t.replaceWith(frag);
  }
}
