// The @ completion of the composer. The text before the caret decides
// whether a completion is open: an @ at the start of a word, and the
// characters of a handle after it.

/** The characters of a handle. */
const HANDLE = /[A-Za-z0-9._-]/;

export interface Completion {
  /** The index of the @. */
  start: number;
  /** The index after the word that the completion replaces. */
  end: number;
  /** The text after the @, up to the caret. */
  query: string;
  /** The handles that match, the best first. */
  matches: string[];
  /** The sign before the word: @ for a handle, / for a command. @ when left out. */
  sigil?: '@' | '/';
}

/** MAX_MATCHES bounds the list of the completion. */
export const MAX_MATCHES = 8;

/**
 * completionAt returns the completion at the caret, or null. An @ counts at
 * the start of the text or after a space or an opening bracket, so an
 * address such as a@b.c opens no completion.
 */
export function completionAt(text: string, caret: number, handles: string[]): Completion | null {
  if (caret < 0 || caret > text.length) return null;
  let i = caret - 1;
  while (i >= 0 && HANDLE.test(text[i])) i--;
  if (i < 0 || text[i] !== '@') return null;
  const before = i > 0 ? text[i - 1] : '';
  if (before && !/[\s([{"'“]/.test(before)) return null;
  let end = caret;
  while (end < text.length && HANDLE.test(text[end])) end++;
  const query = text.slice(i + 1, caret);
  const q = query.toLowerCase();
  const starts = handles.filter((h) => h.toLowerCase().startsWith(q));
  const inside = q ? handles.filter((h) => !h.toLowerCase().startsWith(q) && h.toLowerCase().includes(q)) : [];
  const matches = [...starts, ...inside].slice(0, MAX_MATCHES);
  if (matches.length === 0) return null;
  return { start: i, end, query, matches };
}

/**
 * applyCompletion puts the handle in place of the word of the completion,
 * with one space after it, and returns the new text and caret.
 */
export function applyCompletion(text: string, c: Completion, handle: string): { text: string; caret: number } {
  const after = text.slice(c.end);
  const space = after.startsWith(' ') ? '' : ' ';
  const head = text.slice(0, c.start) + (c.sigil || '@') + handle + space;
  return { text: head + after, caret: head.length + (space ? 0 : 1) };
}

/**
 * mentionsIn returns the handles that a text addresses, in the order of
 * their first mention. Only a handle of the roster counts, and a period or
 * a comma after it ends the handle.
 */
export function mentionsIn(text: string, handles: string[]): string[] {
  const known = new Map(handles.map((h) => [h.toLowerCase(), h]));
  const out: string[] = [];
  const re = /(^|[\s([{"'“])@([A-Za-z0-9][A-Za-z0-9._-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let word = m[2];
    let h = known.get(word.toLowerCase());
    while (!h && /[._-]$/.test(word)) {
      word = word.slice(0, -1);
      h = known.get(word.toLowerCase());
    }
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

/**
 * slashAt returns the completion of a slash command at the caret, or null.
 * A command counts only as the first word of the text, as in a one-on-one
 * composer: /ansible-style runs the skill of that name.
 */
export function slashAt(text: string, caret: number, names: string[]): Completion | null {
  if (caret < 1 || caret > text.length || text[0] !== '/') return null;
  const word = text.slice(1, caret);
  // A skill of a server is named <server>/<name>, so a command can hold a slash.
  if (!/^[A-Za-z0-9._/-]*$/.test(word)) return null;
  let end = caret;
  while (end < text.length && /[A-Za-z0-9._/-]/.test(text[end])) end++;
  const q = word.toLowerCase();
  const starts = names.filter((n) => n.toLowerCase().startsWith(q));
  const inside = q ? names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q)) : [];
  const matches = [...starts, ...inside].slice(0, MAX_MATCHES);
  if (matches.length === 0) return null;
  return { start: 0, end, query: word, matches, sigil: '/' };
}

/** A slash command: the name of a skill and its arguments. */
export interface SlashCall {
  name: string;
  args: string;
}

/**
 * parseSlash reads a slash command at the start of a text: /name args. A
 * name outside the list is plain text, so a path such as /etc/hosts stays a
 * message.
 */
export function parseSlash(text: string, names: string[]): SlashCall | null {
  const m = /^\/([A-Za-z0-9._/-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m || !names.includes(m[1])) return null;
  return { name: m[1], args: (m[2] || '').trim() };
}

