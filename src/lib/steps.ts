// Plain words for one step of a run: a call of a tool of the front, such as
// front.pages_write, reads as a person says it, with its target where the
// input names one. The kernel words a shell call and a file call itself,
// such as Ran "ls" or Wrote a.yml, so those keep its words.

import { envCallOf, envWhat, excerpt, list, plainText } from './words';

/** firstLine is the first line of a text with words, as plain words, at most 80 characters, without the @operator that opens a question to the person. */
const firstLine = (text: string): string =>
  excerpt(
    plainText((String(text || '').split('\n').find((l) => l.trim()) || '').trim())
      .replace(/^@operator\b[,:]?\s*/i, '')
      .trim(),
    80,
  );

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
 * The words of the tools that read or change one thing without a target in
 * their input that the line needs: the tools of the front that the
 * manager uses, and the built-in tools of the kernel that say nothing of
 * their own. A line never names a tool by its code name.
 */
const PLAIN: Record<string, string> = {
  agents_list: 'Looked at the agents',
  whoami: 'Checked who you are',
  capabilities: 'Looked at what the tools can do',
  dashboard: 'Opened the dashboard',
  usage: 'Read the usage',
  runs_list: 'Looked at the recent work',
  run_status: 'Checked on a piece of work',
  run_result: 'Read the result of a piece of work',
  run_events: 'Read the steps of a piece of work',
  run_file: 'Read a file of a piece of work',
  run_budget: 'Changed the limits of a piece of work',
  cancel: 'Stopped a piece of work',
  approve: 'Made a decision',
  fork: 'Started a copy of a piece of work',
  enqueue: 'Queued work',
  batch: 'Made several changes',
  inbox: 'Read what needs you',
  duties_list: 'Read the duties',
  duties_pause_all: 'Paused every duty',
  duty_preview: 'Checked a duty',
  duty_write_check: 'Wrote the check of a duty',
  playbooks_list: 'Looked at the playbooks',
  templates_list: 'Looked at the worker templates',
  pools_list: 'Looked at the workers',
  pool_delete: 'Removed the workers of an agent',
  orphans_list: 'Looked at the workers that lost their parent',
  orphans_remove: 'Removed the workers that lost their parent',
  packages_get: 'Read the packages',
  packages_put: 'Changed the packages',
  notifications_get: 'Read where to reach you',
  notifications_put: 'Changed where to reach you',
  notification_test: 'Sent a test notice',
  connections: 'Looked at the connections',
  disconnect: 'Disconnected a service',
  skills_list: 'Looked at the skills',
  skill_preview: 'Looked at a skill before an install',
  bridge_patch: 'Changed the team',
  bridge_react: 'Reacted to a message',
  bridge_mark_read: 'Marked the team as read',
  bridge_member_patch: 'Changed a seat',
  agent_builder: 'Started to build an agent',
  propose_agent: 'Proposed an agent',
  recall: 'Searched its memory',
  clock: 'Read the time',
  await_task: 'Waited for the work that it handed off',
  send: 'Sent a message',
};

/** The words of the tools that name one thing in a field of their input: the field, the words with the name, and the words without it. */
const NAMED: Record<string, [string, string, string]> = {
  agent_get: ['name', 'Read the profile of ', 'Read the profile of an agent'],
  agent_put: ['name', 'Saved the agent ', 'Saved an agent'],
  agent_delete: ['name', 'Removed the agent ', 'Removed an agent'],
  duty_get: ['name', 'Read the duty ', 'Read a duty'],
  duty_put: ['name', 'Saved the duty ', 'Saved a duty'],
  duty_delete: ['name', 'Removed the duty ', 'Removed a duty'],
  duty_run_now: ['name', 'Ran the duty ', 'Ran a duty'],
  playbook_get: ['name', 'Read the playbook ', 'Read a playbook'],
  playbook_put: ['name', 'Saved the playbook ', 'Saved a playbook'],
  playbook_delete: ['name', 'Removed the playbook ', 'Removed a playbook'],
  skill_install: ['name', 'Installed the skill ', 'Installed a skill'],
  skill_send: ['name', 'Ran the skill ', 'Ran a skill'],
  skill: ['name', 'Read the skill ', 'Read a skill'],
  faces_put: ['agent', 'Drew a picture of ', 'Drew a picture of an agent'],
  run: ['agent', 'Gave work to ', 'Started a piece of work'],
  pool_put: ['agent', 'Changed the workers of ', 'Changed the workers of an agent'],
  routine_put: ['name', 'Saved the routine ', 'Saved a routine'],
  routine_standing: ['name', 'Changed the routine ', 'Changed a routine'],
};

/** memoryWords words a call of the memory tool by its command: a read of the notes, or a change. */
function memoryWords(command: string): string {
  if (command === 'view') return 'Checked its notes';
  if (command === 'delete' || command === 'rename') return 'Tidied its notes';
  if (command) return 'Wrote in its notes';
  return 'Used its notes';
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
  if (PLAIN[name]) return PLAIN[name];
  if (NAMED[name]) {
    const [field, withName, without] = NAMED[name];
    return str(field) ? withName + str(field) : without;
  }
  switch (name) {
    case 'memory':
      return memoryWords(str('command'));
    case 'http':
    case 'web_fetch':
      return str('url') ? 'Fetched ' + str('url') : 'Fetched a web address';
    case 'duty_pause':
      if (v.paused === false) return str('name') ? 'Resumed the duty ' + str('name') : 'Resumed a duty';
      return str('name') ? 'Paused the duty ' + str('name') : 'Paused a duty';
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
      // A post with ask is a question to the person: the step says what it asked.
      if (v.ask === true) return firstLine(str('text')) ? 'Asked you: ' + firstLine(str('text')) : 'Asked you';
      const to = Array.isArray(v.to) ? v.to.filter((x): x is string => typeof x === 'string' && !!x).map((x) => (x === 'operator' ? 'you' : x)) : [];
      return to.length ? 'Posted to ' + list(to) : 'Posted to the team';
    }
    case 'bridge_read':
      return 'Read the channel';
    case 'bridge_list':
      return 'Listed the teams';
    case 'bridge_open':
      return str('title') ? 'Opened the team ' + str('title') : 'Opened a team';
    case 'fleet':
      return 'Read the fleet';
    case 'spawn_task':
      return str('agent') ? 'Handed off a task to ' + str('agent') : 'Handed off a task';
    case 'bridge_add_member':
      return str('handle') ? 'Seated ' + str('handle') : 'Seated a member';
    case 'bridge_remove_member':
      return str('handle') ? 'Fired ' + str('handle') : 'Fired a member';
    case 'bridge_close':
      return 'Closed the team';
    case 'ask_user':
      return firstLine(str('question')) ? 'Asked you: ' + firstLine(str('question')) : 'Asked you';
    case 'env': {
      // The command of env, such as add, is no shell command: the step names the package.
      const c = envCallOf(name, input)!;
      if (c.command === 'add') return 'Added ' + envWhat(c);
      if (c.command === 'remove') return 'Removed ' + envWhat(c);
      return 'Listed the packages';
    }
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
