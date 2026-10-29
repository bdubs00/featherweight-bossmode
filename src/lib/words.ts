// Plain words for times, people, and decisions.

import type { Bridge, Decision, ResultDecision, Run, Sender } from '../api/types';

/** cap gives a text a capital first letter. */
export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** personName is the short name of a subject: the part before an @. */
export function personName(subject: string | undefined, display?: string): string {
  if (display) return display;
  if (!subject) return 'someone';
  const at = subject.indexOf('@');
  return at > 0 ? subject.slice(0, at) : subject;
}

/** senderName names the sender of a channel entry. */
export function senderName(s: Sender): string {
  // The handle manager is reserved for the Manager of the workspace, which a person reads as a name.
  if (s.kind === 'agent') return s.handle === 'manager' ? 'Manager' : s.handle || 'an agent';
  if (s.kind === 'person') return personName(s.name, s.display);
  return 'bossmode';
}

/** clock is the time of day of a moment, such as 14:05. */
export function clock(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** dayWords names the day of a moment: Today, Yesterday, or the date. */
export function dayWords(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * since is the short meta of a moment in a list: "now", "14 min", "3 h",
 * "2 d", or a date for a moment older than a week. The full time belongs
 * in a tooltip.
 */
export function since(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'now';
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return m + ' min';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h';
  const d = Math.round(h / 24);
  if (d < 7) return d + ' d';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** spanWords says a span of seconds in its largest whole unit, such as "1 day", "6 hours", or "30 minutes". */
export function spanWords(seconds: number): string {
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, word] of units) {
    if (seconds >= size && seconds % size === 0) {
      const n = seconds / size;
      return n + ' ' + word + (n === 1 ? '' : 's');
    }
  }
  return Math.max(1, Math.round(seconds / 60)) + ' minutes';
}

/** ago says how long ago a moment was, such as "3 minutes ago". */
export function ago(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : m + ' minutes ago';
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : h + ' hours ago';
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : d + ' days ago';
}

/** inputFields reads the input of a call as an object, also from its JSON text, or answers null. */
export function inputFields(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * toolBase is the name of a tool without the server that serves it:
 * front.bridge_open and mcp__front__bridge_open give bridge_open.
 */
export function toolBase(tool: string | undefined): string {
  return String(tool || '').split(/\.|__/).pop() || '';
}

/** toolName is the name of a tool as the page shows it: without the prefix front. of the tools of the front. */
export const toolName = (tool: string | undefined): string => String(tool || '').replace(/^front\./, '');

/**
 * The change that an input of the files tool makes, when it says so. The
 * files tool names its operation in command, and older inputs in op,
 * operation, or action.
 */
export function editOf(input: unknown): { what: string; path: string } | null {
  const v = inputFields(input);
  if (!v || typeof v.path !== 'string') return null;
  const op = String(v.command || v.op || v.operation || v.action || '');
  if (op === 'delete' || op === 'remove') return { what: 'remove ' + v.path, path: v.path };
  if (op === 'create' || op === 'write') return { what: 'create ' + v.path, path: v.path };
  return { what: 'change ' + v.path, path: v.path };
}

/**
 * commandOf returns the command of a shell input, or "". The files tool
 * also names its operation in command, next to a path, so an input with a
 * path holds no shell command.
 */
export function commandOf(input: unknown): string {
  const v = inputFields(input);
  return v && typeof v.command === 'string' && typeof v.path !== 'string' ? v.command : '';
}

/**
 * A call of the tool env of the kernel: the command add, remove, or list,
 * the manager python or tools, and the package as the agent wrote it.
 */
export interface EnvCall {
  command: string;
  manager: string;
  name: string;
}

/** envCallOf reads a call of the tool env, or answers null for a call of any other tool. */
export function envCallOf(tool: string | undefined, input: unknown): EnvCall | null {
  if (toolBase(tool) !== 'env') return null;
  const v = inputFields(input) || {};
  const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  return { command: s(v.command), manager: s(v.manager), name: s(v.package) };
}

/**
 * envWhat names the package of a call in the words of a person: the Python
 * package ansible-lint, or the program iproute2. The page never names the
 * manager that installs it.
 */
export function envWhat(c: EnvCall): string {
  const kind = c.manager === 'tools' ? 'program' : c.manager === 'python' ? 'Python package' : 'package';
  return c.name ? 'the ' + kind + ' ' + c.name : 'a ' + kind;
}

/** envTitle says what a call of env asks: wants the Python package ansible-lint, or wants to remove the program jq. */
export function envTitle(who: string, c: EnvCall): string {
  if (c.command === 'add') return `${who} wants ${envWhat(c)}`;
  if (c.command === 'remove') return `${who} wants to remove ${envWhat(c)}`;
  return `${who} wants to list its packages`;
}

/** envEffect says what Allow does for a call of env, or "" for a command that changes nothing. */
export function envEffect(c: EnvCall): string {
  if (c.command === 'add') return 'Allow installs it now and keeps it for every worker of this agent.';
  if (c.command === 'remove') return 'Allow removes it now and from every worker of this agent.';
  return '';
}

/**
 * decisionTitle says what a call asks to do, without a tool name where the
 * page knows the tool: open a bridge, write a page, hand off a task, add or
 * remove a package, change a file, or run a command. A label of the backend
 * other than Allow names the action. Any other tool goes by its name, and a
 * call that the page knows nothing of asks for a decision.
 */
export function decisionTitle(who: string, d: Decision | ResultDecision): string {
  const base = toolBase(d.tool);
  const v = inputFields(d.input);
  const env = envCallOf(d.tool, d.input);
  if (env) return envTitle(who, env);
  if (base === 'bridge_open') return `${who} wants to open a bridge`;
  if (base === 'pages_write') return `${who} wants to write a page`;
  if (base === 'spawn_task') return v && typeof v.agent === 'string' && v.agent ? `${who} wants to hand off a task to ${v.agent}` : `${who} wants to hand off a task`;
  const e = !d.tool || base === 'files' ? editOf(d.input) : null;
  if (e) return `${who} wants to ${e.what}`;
  if (commandOf(d.input)) return `${who} wants to run a command`;
  if (d.label && d.label !== 'Allow' && d.label !== 'Answer') return `${who} wants to ${d.label.toLowerCase()}`;
  if (d.tool) return `${who} wants to use ${toolName(d.tool)}`;
  return `${who} asks for your decision`;
}

/**
 * whyWords names the rule that holds a call for a person, as a short label:
 * "rule: ask bash: git push*" becomes "Rule: ask before git push". A rule
 * that names a tool of the front names it without the prefix front.
 */
export function whyWords(reason: string | undefined): string {
  const r = reason || '';
  const m = /^rule: ask [a-z0-9_.*-]+: (.+)$/i.exec(r);
  if (m) return 'Rule: ask before ' + m[1].replace(/\*+$/, '').trim();
  if (/^rule: ask (destructive|readonly|read-only|idempotent|parallel|parallelsafe)$/i.test(r)) return 'Rule: ask before a tool that changes things';
  const t = /^rule: ask ([a-z0-9_.*-]+)$/i.exec(r);
  if (t) return 'Rule: ask before ' + toolName(t[1]);
  if (r === 'default') return 'Rule: ask first';
  return r ? cap(r) : '';
}

/** rawInput is the input of a call as indented JSON, for Details. */
export function rawInput(input: unknown): string {
  if (input === undefined || input === null) return '';
  try {
    return JSON.stringify(typeof input === 'string' ? JSON.parse(input) : input, null, 2);
  } catch {
    return String(input);
  }
}

/** list joins words as a person says them: a, b, and c. */
export function list(words: string[]): string {
  if (words.length <= 1) return words.join('');
  if (words.length === 2) return words[0] + ' and ' + words[1];
  return words.slice(0, -1).join(', ') + ', and ' + words[words.length - 1];
}

/**
 * plainText turns the Markdown of a message into plain words for a preview:
 * it drops the marks of emphasis, code, headings, quotes, lists, rules, and
 * tables, and keeps the text of a link. A mark of emphasis sits at the edge
 * of a word, so an underscore inside a word, as in bridge_read, stays. The
 * text of a code span stays as it is.
 */
export function plainText(md: string): string {
  const spans: string[] = [];
  return String(md || '')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => ' ' + code + ' ')
    .replace(/`+([^`]+?)`+/g, (_, code: string) => '\u0000' + (spans.push(code) - 1) + '\u0000')
    .replace(/^[ \t|:-]*-{3,}[ \t|:-]*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}(?:#{1,6}|>+|[-*+]|\d+[.)])[ \t]+/gm, '')
    .replace(/(^|[^\w\\])(?:\*{1,3}|_{1,3}|~~)(?=\S)/g, '$1')
    .replace(/(\S)(?:\*{1,3}|_{1,3}|~~)(?![\w])/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => spans[Number(i)])
    .replace(/\s+/g, ' ')
    .trim();
}

/** excerpt cuts a text to one line of at most n characters. */
export function excerpt(text: string, n = 80): string {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/** sizeText writes a size in bytes for a person. */
export function sizeText(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

/** unreadText writes the unread count of a bridge: 2000+ past the bound of the backend, else 99+ above 99. */
export function unreadText(b: Pick<Bridge, 'unread' | 'unreadMore'>): string {
  if (b.unreadMore) return '2000+';
  return b.unread > 99 ? '99+' : String(b.unread || 0);
}

/**
 * errorReason is the short reason of a stopped run for a row of the
 * members, such as "Stopped at 40 turns". A limit gives that form. Another
 * error gives its first sentence.
 */
export function errorReason(run: Pick<Run, 'state' | 'error'> | undefined): string {
  if (!run || !run.error) return '';
  const text = run.error.trim();
  const limit = /\blimit of (.+?)\.?$/i.exec(text.split(/(?<=\.)\s/)[0]);
  if (limit) return 'Stopped at ' + limit[1].trim();
  const first = text.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '');
  return first.length > 80 ? first.slice(0, 79).trimEnd() + '…' : first;
}
