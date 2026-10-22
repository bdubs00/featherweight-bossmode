// Plain words for times, people, and decisions.

import type { Decision, ResultDecision, Sender } from '../api/types';

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
  if (s.kind === 'agent') return s.handle || 'an agent';
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

function obj(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The change that an input of the files tool makes, when it says so. */
export function editOf(input: unknown): { what: string; path: string } | null {
  const v = obj(input);
  if (!v || typeof v.path !== 'string') return null;
  const op = String(v.op || v.operation || v.action || '');
  if (op === 'delete' || op === 'remove') return { what: 'remove ' + v.path, path: v.path };
  if (op === 'create' || op === 'write') return { what: 'create ' + v.path, path: v.path };
  return { what: 'change ' + v.path, path: v.path };
}

/** commandOf returns the command of a shell input, or "". */
export function commandOf(input: unknown): string {
  const v = obj(input);
  return v && typeof v.command === 'string' ? v.command : '';
}

/** decisionTitle names the action and its target without a tool name. */
export function decisionTitle(who: string, d: Decision | ResultDecision): string {
  const e = editOf(d.input);
  if (e) return `${who} wants to ${e.what}`;
  if (commandOf(d.input)) return `${who} wants to run a command`;
  if (d.label && d.label !== 'Allow') return `${who} wants to ${d.label.toLowerCase()}`;
  return `${who} asks for your permission`;
}

/** whyWords says in plain words why a call waits for a person. */
export function whyWords(reason: string | undefined): string {
  const r = reason || '';
  if (/^rule: ask destructive/.test(r)) return 'This tool can change things, so it waits for you.';
  if (/^rule: /.test(r)) return 'A rule of this agent asks you first.';
  if (r === 'default') return 'The policy of this agent asks you first.';
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

/** excerpt cuts a text to one line of at most n characters. */
export function excerpt(text: string, n = 80): string {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
