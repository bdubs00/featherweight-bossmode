// The definition of done of an agent, as its profile holds it, and the
// static rule of a weak check (plan 4.4). A check whose tool only reads a
// file, a view or a read of a path, and that names no contains and no
// lacks passes on a run that did nothing, because the file can be there
// from before the run. The kernel marks such a pass weak, so Results, the
// board, and Work do not count the run as checked. The profile of the
// agent warns of each such check, so its owner names what the file must
// hold.

import type { DoneCheck } from '../api/types';

/** FILE_TOOLS are the tools that take a command and a path, such as the text editor of the kernel. */
const FILE_TOOLS = ['files', 'memory', 'str_replace_based_edit_tool', 'text_editor'];

/** READ_COMMANDS are the commands of such a tool that only read. */
const READ_COMMANDS = ['view', 'read'];

/** READ_TOOLS are the names of tools that only read a file, also after the prefix of a server, such as fs.read_file. */
const READ_TOOLS = /(^|[._])(read|read_file|view|view_file|cat|get_file|read_text_file)$/;

/** inputOf reads the input of a check, or {} when it does not read as an object. */
function inputOf(c: DoneCheck): Record<string, unknown> {
  try {
    const v = JSON.parse(c.input || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** readsOnly reports whether the call of a check only reads a file: a view or a read of a path. */
export function readsOnly(c: DoneCheck): boolean {
  const tool = (c.tool || '').trim();
  const base = tool.replace(/^.*[/.]/, '');
  if (FILE_TOOLS.includes(base) || base.startsWith('text_editor')) {
    const cmd = String(inputOf(c).command || '').trim();
    return READ_COMMANDS.includes(cmd);
  }
  return READ_TOOLS.test(tool);
}

/** weakCheck reports whether a check is weak: it only reads a file and names no contains and no lacks. */
export function weakCheck(c: DoneCheck): boolean {
  const some = (l: string[] | null | undefined) => !!l && l.some((x) => String(x).length > 0);
  return readsOnly(c) && !some(c.contains) && !some(c.lacks);
}

/** checkName names a check for a person: its name, else its tool. */
export const checkName = (c: DoneCheck): string => (c.name && c.name.trim()) || c.tool;

/** WEAK_WORDS warn of a weak check on the profile of an agent. */
export const WEAK_WORDS = 'This check only reads a file and looks for nothing in it, so a run that did nothing passes it. Results does not count such a run as checked. Name what the file must hold.';
