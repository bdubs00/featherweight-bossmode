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
  /** The ids of the bridges that the page knows, by their exact titles, for a title that a text quotes. */
  titles?: Record<string, string>;
}

/** A text in double quotes, straight or curly, on one line, as an agent quotes the title of a bridge. */
const QUOTED = String.raw`(["“])([^"“”
]{1,200})(["”])`;

/** quotedTexts lists the texts that a text holds in double quotes, which can be the titles of bridges. */
export function quotedTexts(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text || '').matchAll(new RegExp(QUOTED, 'g'))) out.add(m[2]);
  return [...out];
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

const bridgeLink = (doc: Document, id: string, title: string, quoted = false): HTMLAnchorElement => {
  const a = doc.createElement('a');
  a.setAttribute('href', hrefOf({ place: 'bridge', id, pane: 'none' }));
  a.className = quoted ? 'ref-bridge ref-title' : 'ref-bridge';
  a.textContent = title || id;
  return a;
};

/**
 * dropRepeats removes the link of an id that only repeats the quoted title
 * right before it, as in "Proxmox blanks table" (01m5...): the quoted title
 * is the link, and the parenthesis goes. A parenthesis that repeats the
 * title as words goes too.
 */
function dropRepeats(root: DocumentFragment | Element): void {
  for (const q of [...root.querySelectorAll('a.ref-title')]) {
    const t1 = q.nextSibling;
    if (!t1 || t1.nodeType !== 3) continue;
    const text = t1 as Text;
    const href = q.getAttribute('href');
    const words = new RegExp('^(["\u201d])\\s*\\(\\s*' + (q.textContent || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\)');
    const plain = words.exec(text.data);
    if (plain) {
      text.data = plain[1] + text.data.slice(plain[0].length);
      continue;
    }
    const open = /^(["\u201d])\s*\($/.exec(text.data);
    const link = t1.nextSibling;
    const t2 = link ? link.nextSibling : null;
    if (!open || !link || link.nodeName !== 'A' || (link as Element).getAttribute('href') !== href || !t2 || t2.nodeType !== 3 || !(t2 as Text).data.startsWith(')')) continue;
    text.data = open[1];
    link.remove();
    (t2 as Text).data = (t2 as Text).data.slice(1);
  }
}

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
  // A quoted title of a known bridge, a path, or an id. A quoted text that names no bridge stays text, and the names inside it still link.
  const titles = refs.titles || {};
  const re = new RegExp(QUOTED + '|' + EDGE_BEFORE + '(?:(' + PATH + ')|(' + WORD + '))' + EDGE_AFTER, 'g');
  for (const t of texts) {
    const s = t.data;
    const parts: (string | Node)[] = [];
    let last = 0;
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (m[2] !== undefined) {
        const id = titles[m[2]];
        if (id === undefined) {
          re.lastIndex = m.index + 1;
          continue;
        }
        // The quotes stay as text around the link.
        parts.push(s.slice(last, m.index) + m[1], bridgeLink(doc, id, m[2], true));
        last = m.index + m[1].length + m[2].length;
        re.lastIndex = last;
        continue;
      }
      let link: Node | null = null;
      if (m[4] && pageReason(m[4]) === '' && refs.page(m[4])) {
        link = pageLink(doc, m[4]);
        link.textContent = m[4];
      } else if (m[5] && refs.bridges[m[5]] !== undefined) link = bridgeLink(doc, m[5], refs.bridges[m[5]]);
      if (!link) continue;
      parts.push(s.slice(last, m.index), link);
      last = m.index + m[0].length;
    }
    if (!parts.length) continue;
    parts.push(s.slice(last));
    const frag = doc.createDocumentFragment();
    for (const x of parts) frag.append(x);
    t.replaceWith(frag);
  }
  dropRepeats(root);
}
