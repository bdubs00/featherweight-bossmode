// Plain words for one step of a run: a call of a tool of the front, such as
// front.pages_write, reads as a person says it, with its target where the
// input names one. The kernel words a shell call and a file call itself,
// such as Ran "ls" or Wrote a.yml, so those keep its words.

import { list } from './words';

function fields(input: unknown): Record<string, unknown> {
  let v = input;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * stepWords names one tool call: "Wrote notes/plan.md", "Posted to the
 * bridge", "Read the channel". said is the text that the kernel gave the
 * step, which stands for a tool that the page does not know, unless it is
 * only the name of the tool. Else the step says "Used <tool>".
 */
export function stepWords(tool: string | undefined, input?: unknown, said?: string): string {
  const name = String(tool || '').replace(/^front\./, '');
  const v = fields(input);
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
  const path = str('path');
  switch (name) {
    case 'pages_write':
      return path ? 'Wrote ' + path : 'Wrote a page';
    case 'pages_read':
      return path ? 'Read ' + path : 'Read a page';
    case 'pages_history':
      return path ? 'Read the history of ' + path : 'Read the history of a page';
    case 'pages_search':
      return str('query') ? 'Searched the wiki for "' + str('query') + '"' : 'Searched the wiki';
    case 'pages_list':
      return str('prefix') ? 'Listed the pages under ' + str('prefix') : 'Listed the pages';
    case 'bridge_post': {
      const to = Array.isArray(v.to) ? v.to.filter((x): x is string => typeof x === 'string' && !!x) : [];
      return to.length ? 'Posted to ' + list(to) : 'Posted to the bridge';
    }
    case 'bridge_read':
      return 'Read the channel';
    case 'bridge_list':
      return 'Listed the bridges';
    case 'bridge_open':
      return str('title') ? 'Opened the bridge ' + str('title') : 'Opened a bridge';
    case 'fleet':
      return 'Read the fleet';
    case 'spawn_task':
      return str('agent') ? 'Handed off a task to ' + str('agent') : 'Handed off a task';
    case 'bridge_add_member':
      return str('handle') ? 'Seated ' + str('handle') : 'Seated a member';
    case 'bridge_remove_member':
      return str('handle') ? 'Fired ' + str('handle') : 'Fired a member';
    case 'bridge_close':
      return 'Closed the bridge';
    case 'ask_user':
      return 'Asked you';
  }
  const s = String(said || '').trim();
  if (s && s !== tool && s !== name) return s;
  return 'Used ' + (name || 'a tool');
}

/** pagesWritten lists the wiki pages that the calls of a run wrote, once each, in the order of their last write. A call whose result failed wrote nothing. */
export function pagesWritten(items: { kind: string; tool?: string; callId?: string; input?: unknown; isError?: boolean }[]): string[] {
  const failed = new Set(items.filter((x) => x.kind === 'result' && x.isError && x.callId).map((x) => x.callId));
  const out: string[] = [];
  for (const it of items) {
    if (it.kind !== 'tool' || String(it.tool || '').replace(/^front\./, '') !== 'pages_write') continue;
    if (it.callId && failed.has(it.callId)) continue;
    const p = fields(it.input).path;
    if (typeof p !== 'string' || !p.trim()) continue;
    const path = p.trim().replace(/^\/+/, '');
    const at = out.indexOf(path);
    if (at >= 0) out.splice(at, 1);
    out.push(path);
  }
  return out;
}

/**
 * stepInputs pairs each step of a result with the input of its call in the
 * transcript, for the words of the step. A step names its tool but not its
 * call, and the result holds the newest steps, so the steps of one tool
 * pair with the calls of that tool from the end. A step without a call in
 * the transcript gets undefined.
 */
export function stepInputs(steps: { tool: string }[], items: { kind: string; tool?: string; input?: unknown }[]): unknown[] {
  const calls = new Map<string, unknown[]>();
  for (const it of items) {
    if (it.kind !== 'tool' || !it.tool) continue;
    const list = calls.get(it.tool) || [];
    list.push(it.input);
    calls.set(it.tool, list);
  }
  const out: unknown[] = new Array(steps.length).fill(undefined);
  for (let i = steps.length - 1; i >= 0; i--) {
    const list = calls.get(steps[i].tool);
    if (list && list.length) out[i] = list.pop();
  }
  return out;
}
