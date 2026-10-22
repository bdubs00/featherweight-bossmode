// Markdown for the channel, the run pane, and the wiki. Agents write these
// texts, so the page treats them as data: marked turns the Markdown into
// HTML with raw HTML shown as text, and DOMPurify then keeps only a short
// list of tags and attributes. The result holds no script, no event
// attribute, no style, no SVG, no form, and no image. A link keeps only a
// safe address.

import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const md = new Marked({ gfm: true, breaks: true, async: false });
md.use({
  renderer: {
    // Raw HTML in the Markdown shows as text. It never becomes markup.
    html({ text }) {
      return esc(text);
    },
    // An image from the API never loads. The page shows a link to it with
    // its text, and the sanitizer below decides whether the link stays.
    image({ href, text }) {
      return `<a href="${esc(href || '')}">${esc('Image: ' + (text || 'no description'))}</a>`;
    },
    // A task list shows its boxes as characters, not as inputs.
    checkbox({ checked }) {
      return checked ? '☑ ' : '☐ ';
    },
  },
});

/** The tags that the sanitizer keeps. */
export const TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'del', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span',
];

/** The attributes that the sanitizer keeps. class is limited further below. */
export const ATTRS = ['href', 'title', 'start', 'align', 'class', 'colspan', 'rowspan'];

/** The address that a relative link resolves against, a name that never resolves. */
const WIKI = 'https://wiki.invalid/';

export interface RenderOptions {
  /** The path of the wiki page that holds the text, for its relative links. */
  base?: string;
  /** The handles to mark as mentions. */
  handles?: string[];
}

export interface SafeLink {
  href: string;
  external: boolean;
}

/**
 * safeHref returns the address that a link keeps, or null. A link keeps an
 * http, https, or mailto address. A relative link to a .md file, which
 * resolves against the folder of the page in base, and a link #page/<path>
 * of the backend, become a link to that page of the wiki in the page. A
 * relative link that climbs above the root of the wiki, and any other link,
 * lose the address and stay as text, because a relative address would load
 * the page with no route.
 */
export function safeHref(href: string, base = ''): SafeLink | null {
  const raw = String(href || '').trim();
  // The backend links a page of the wiki as #page/<path>, the route of the
  // page at /ui. The link opens the same page of the wiki here.
  const wiki = /^#pages?\/(.+)$/.exec(raw);
  if (wiki) {
    let path = '';
    try {
      path = decodeURIComponent(wiki[1]);
    } catch {
      return null;
    }
    const parts = path.split('/');
    if (!/\.md$/i.test(path) || parts.some((x) => x === '' || x === '..' || x === '.') || /[\u0000-\u001f\\]/.test(path)) return null;
    return { href: '#pages/' + parts.map(encodeURIComponent).join('/'), external: false };
  }
  if (!raw || raw.startsWith('#')) return null;
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  // A relative path resolves against the folder of the page. A path that
  // climbs above the root of the wiki points outside it, so it opens no
  // page of the wiki.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('/') && !raw.startsWith('\\')) {
    let depth = dir.split('/').filter(Boolean).length;
    for (const part of raw.split(/[?#]/)[0].split('/')) {
      if (part === '..') depth--;
      else if (part && part !== '.') depth++;
      if (depth < 0) return null;
    }
  }
  let u: URL;
  try {
    u = new URL(raw, WIKI + dir.split('/').map(encodeURIComponent).join('/'));
  } catch {
    return null;
  }
  if (u.origin === new URL(WIKI).origin) {
    const path = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (/\.md$/i.test(path) && !path.split('/').includes('..')) return { href: '#pages/' + path.split('/').map(encodeURIComponent).join('/'), external: false };
    return null;
  }
  if (u.protocol === 'http:' || u.protocol === 'https:') return { href: u.href, external: true };
  if (u.protocol === 'mailto:') return { href: u.href, external: false };
  return null;
}

let purifier: ReturnType<typeof DOMPurify> | null = null;
let current: RenderOptions = {};

/** sanitizer makes the DOMPurify instance once, with its hooks. */
function sanitizer(): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier;
  const p = DOMPurify(window);
  p.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName !== 'class') return;
    const tag = node.nodeName.toLowerCase();
    const keep = String(data.attrValue)
      .split(/\s+/)
      .filter((c) => (tag === 'code' && /^language-[A-Za-z0-9_+-]{1,32}$/.test(c)) || (tag === 'span' && c === 'mention'));
    if (keep.length === 0) data.keepAttr = false;
    else data.attrValue = keep.join(' ');
  });
  p.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'A') return;
    const el = node as Element;
    const link = safeHref(el.getAttribute('href') || '', current.base || '');
    if (!link) {
      el.removeAttribute('href');
      return;
    }
    el.setAttribute('href', link.href);
    if (link.external) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  purifier = p;
  return p;
}

/** sanitize cleans HTML with the allow list of the page. */
export function sanitize(html: string, opts: RenderOptions = {}): string {
  const p = sanitizer();
  current = opts;
  try {
    const frag = p.sanitize(html, {
      ALLOWED_TAGS: TAGS,
      ALLOWED_ATTR: ATTRS,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      KEEP_CONTENT: true,
      RETURN_DOM_FRAGMENT: true,
    }) as DocumentFragment;
    if (opts.handles && opts.handles.length) markMentions(frag, opts.handles);
    const box = document.createElement('div');
    box.appendChild(frag);
    return box.innerHTML;
  } finally {
    current = {};
  }
}

/** markMentions wraps each @handle of the roster in a span, outside code and links. */
function markMentions(root: DocumentFragment, handles: string[]): void {
  const known = new Map(handles.map((h) => [h.toLowerCase(), h]));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let up = n.parentNode as Element | null;
    let skip = false;
    while (up && up.nodeType === 1) {
      if (['CODE', 'PRE', 'A', 'SPAN'].includes(up.nodeName)) skip = true;
      up = up.parentNode as Element | null;
    }
    if (!skip && (n as Text).data.includes('@')) texts.push(n as Text);
  }
  const re = /(^|[\s([{"'“])@([A-Za-z0-9][A-Za-z0-9._-]*)/g;
  for (const t of texts) {
    const s = t.data;
    let last = 0;
    const parts: (string | HTMLElement)[] = [];
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(s))) {
      let word = m[2];
      while (!known.has(word.toLowerCase()) && /[._-]$/.test(word)) word = word.slice(0, -1);
      if (!known.has(word.toLowerCase())) continue;
      const at = m.index + m[1].length;
      parts.push(s.slice(last, at));
      const span = document.createElement('span');
      span.className = 'mention';
      span.textContent = '@' + word;
      parts.push(span);
      last = at + 1 + word.length;
    }
    if (parts.length === 0) continue;
    parts.push(s.slice(last));
    const frag = document.createDocumentFragment();
    for (const x of parts) frag.append(x);
    t.replaceWith(frag);
  }
}

/** renderMarkdown turns Markdown into sanitized HTML. */
export function renderMarkdown(text: string, opts: RenderOptions = {}): string {
  const html = md.parse(String(text || '')) as string;
  return sanitize(html, opts);
}

/**
 * renderInline turns one line of Markdown, such as a system line with the
 * link of a report, into sanitized HTML with no block element.
 */
export function renderInline(text: string, opts: RenderOptions = {}): string {
  const html = md.parseInline(String(text || '')) as string;
  return sanitize(html, opts);
}

/** stripFrontMatter removes the front matter of a wiki page and returns its title. */
export function stripFrontMatter(text: string): { body: string; title: string; tags: string[] } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { body: text, title: '', tags: [] };
  const title = (/^title:\s*(.+)$/m.exec(m[1]) || [])[1] || '';
  const tagLine = (/^tags:\s*\[(.*)\]$/m.exec(m[1]) || [])[1] || '';
  const tags = tagLine
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  return { body: text.slice(m[0].length), title: title.trim().replace(/^["']|["']$/g, ''), tags };
}
