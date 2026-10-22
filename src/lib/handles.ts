// The rule of a handle and the next free handle for a seat. The workbench
// checks the same rule: lower-case letters, digits, dots, dashes, and
// underscores, at most 32, starting with a letter or a digit. The handles
// operator and manager are reserved: an agent addresses the operator with
// one, and the manager posts with the other.

export const HANDLE_MAX = 32;
export const HANDLE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
export const RESERVED_HANDLES = ['operator', 'manager'];

/** handleReason returns why a handle cannot take a seat, or "" for a good one. */
export function handleReason(handle: string, taken: string[] = []): string {
  if (!handle) return 'A seat needs a handle, such as reviewer.';
  if (handle.length > HANDLE_MAX) return `A handle has at most ${HANDLE_MAX} characters.`;
  if (!HANDLE.test(handle)) return 'A handle starts with a letter or a digit and holds lower-case letters, digits, dots, dashes, and underscores.';
  if (RESERVED_HANDLES.includes(handle)) return `The handle ${handle} is reserved. Pick another.`;
  if (taken.includes(handle)) return `${handle} has a seat on this bridge already. Pick another handle.`;
  return '';
}

/** baseOf turns the name of an agent into the start of a handle. */
export function baseOf(agent: string): string {
  let b = String(agent || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+$/, '');
  if (!b) b = 'seat';
  return b.slice(0, HANDLE_MAX - 3);
}

/**
 * nextHandle is the handle of a new seat of an agent. The first seat of an
 * agent takes the bare name, such as reviewer. A later seat takes the next
 * number: with migrator-1 and migrator-2 seated, the next is migrator-3, and
 * with reviewer seated, the next is reviewer-2. A reserved name, such as
 * manager, starts at manager-1.
 */
export function nextHandle(agent: string, taken: string[]): string {
  const base = baseOf(agent);
  const re = new RegExp('^' + base.replace(/[.]/g, '\\.') + '(?:-(\\d+))?$');
  let max = 0;
  for (const h of taken) {
    const m = re.exec(h);
    if (m) max = Math.max(max, m[1] ? Number(m[1]) : 1);
  }
  if (max === 0 && !RESERVED_HANDLES.includes(base)) return base;
  let n = Math.max(max + 1, RESERVED_HANDLES.includes(base) && max === 0 ? 1 : 2);
  while (taken.includes(base + '-' + n)) n++;
  return base + '-' + n;
}
