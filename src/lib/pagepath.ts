// The rule of a page path, as the pages store of the workbench checks it:
// a relative path of at most 8 parts and 512 bytes, with no part that is
// empty or starts with a dot, no control character, and the suffix .md on
// the last part alone. The paths search and .../history meet routes of
// their own, so the store refuses them too.

export const MAX_PARTS = 8;
export const MAX_BYTES = 512;

/** The page that the store writes after each change. Nobody else writes it. */
export const INDEX_PATH = '_index.md';

/** pageReason returns why a path is no page path, or "" for a good one. */
export function pageReason(p: string): string {
  if (!p) return 'A page needs a path, such as notes/plan.md.';
  if (new TextEncoder().encode(p).length > MAX_BYTES) return `A page path has at most ${MAX_BYTES} bytes.`;
  if (/[\u0000-\u001f\u007f]/.test(p)) return 'A page path holds no control character.';
  const parts = p.split('/');
  if (parts.length > MAX_PARTS) return `A page path has at most ${MAX_PARTS} parts.`;
  if (parts.some((x) => x === '')) return 'A page path has no empty part, and it does not start or end with a slash.';
  if (parts.some((x) => x.startsWith('.'))) return 'No part of a page path starts with a dot.';
  if (p === 'search') return 'The path search is a route of the wiki. Use search.md.';
  if (parts[parts.length - 1] === 'history') return 'A page path does not end with history. Use history.md.';
  if (!p.endsWith('.md')) return 'A page path ends with .md, such as notes/plan.md.';
  if (parts.slice(0, -1).some((x) => x.endsWith('.md'))) return 'Only the last part of a page path ends with .md.';
  if (p === INDEX_PATH) return 'The wiki writes _index.md on its own. Write index.md instead.';
  return '';
}

/**
 * withSuffix cleans what a person typed as a new path: it drops spaces at
 * the ends and leading slashes, and it adds .md to the last part when the
 * part lacks it.
 */
export function withSuffix(typed: string): string {
  const p = typed.trim().replace(/^\/+/, '');
  if (!p || p.endsWith('/') || p.endsWith('.md')) return p;
  return p + '.md';
}

/** pageName is the last part of a path without .md, for the tree. */
export function pageName(p: string): string {
  const last = p.split('/').pop() || p;
  return last.endsWith('.md') ? last.slice(0, -3) : last;
}
