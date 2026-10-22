// The pure parts of the quick chat and of the live answer of a one-on-one
// view: whether a run works, the seqs of the answers of a transcript, the
// history grouped by day, the picks of tools and skills, the body that
// starts a chat, and the words of its usage. The tests read them without a
// page.

import type { InlineProfile, Item, NewRun, Run, RunUsage, Tool } from '../api/types';
import { dayWords, excerpt } from './words';

/** The metadata that marks a run that the quick chat started. */
export const CHAT_VIEW = { key: 'fw.view', value: 'quickchat' } as const;

/** works reports whether a run works now: it waits for a worker, or the model or a tool works. */
export function works(run: Pick<Run, 'state'> | undefined | null): boolean {
  return !!run && (run.state === 'queued' || run.state === 'running');
}

/** answerSeqs are the seqs of the answers of a transcript: its assistant items. */
export function answerSeqs(items: Item[]): number[] {
  return items.filter((x) => x.kind === 'assistant').map((x) => x.seq);
}

/** lastSeq is the newest seq that a view knows of a run: its last item, or the seq of the run when that is newer. */
export function lastSeq(items: Item[], run?: Pick<Run, 'seq'> | null): number {
  const last = items.length ? items[items.length - 1].seq : 0;
  return Math.max(last, run ? run.seq : 0);
}

/* ---------- the history ---------- */

/** isQuickChat reports whether a run is a quick chat of a person: the agent of the chat, the person, and the mark of the page. */
export function isQuickChat(run: Run, agent: string, principal: string): boolean {
  return run.agent === agent && (!principal || run.principal === principal) && !!run.metadata && run.metadata[CHAT_VIEW.key] === CHAT_VIEW.value;
}

/** chatTitle is the title of a chat in the history: the title of the run, else the start of its input. */
export function chatTitle(run: Pick<Run, 'title' | 'input'>): string {
  const t = (run.title || '').trim();
  if (t) return t;
  const i = excerpt((run.input || '').split('\n')[0] || '', 64);
  return i || 'Chat';
}

/** newestFirst orders runs by their start, the newest first. */
export function newestFirst(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
}

export interface DayGroup {
  /** The quiet heading: Today, Yesterday, or the date. */
  day: string;
  runs: Run[];
}

/** historyGroups groups the runs of the history by the day of their start, newest first. */
export function historyGroups(runs: Run[], now = new Date()): DayGroup[] {
  const out: DayGroup[] = [];
  for (const r of newestFirst(runs)) {
    const day = dayWords(r.createdAt, now) || 'Earlier';
    const last = out[out.length - 1];
    if (last && last.day === day) last.runs.push(r);
    else out.push({ day, runs: [r] });
  }
  return out;
}

/** findChats keeps the runs whose title holds every word of a filter. */
export function findChats(runs: Run[], q: string): Run[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return runs;
  return runs.filter((r) => {
    const t = chatTitle(r).toLowerCase();
    return words.every((w) => t.includes(w));
  });
}

/* ---------- the picks ---------- */

/** toolId is the name under which a profile lists a tool of the catalog. */
export const toolId = (t: Pick<Tool, 'id' | 'name'>): string => t.id || t.name;

const globMatch = (pattern: string, text: string): boolean => {
  if (!pattern.includes('*')) return pattern === text;
  const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(text);
};

/**
 * toolOn reports whether the tool list of a profile gives a tool. A list
 * that is empty, missing, or holds * gives every tool. An entry names a
 * tool, a whole server, or a glob, such as front.pages_*.
 */
export function toolOn(list: string[] | null | undefined, t: Pick<Tool, 'id' | 'name' | 'source' | 'server'>): boolean {
  if (!list || list.length === 0 || list.includes('*')) return true;
  const source = t.source || t.server || '';
  const names = [t.name, toolId(t)];
  if (source && source !== 'builtin') names.push(source + '.' + t.name, source + '/' + t.name);
  return list.some((e) => (source && source !== 'builtin' && (e === source || e === source + '/*' || e === source + '.*')) || names.some((n) => globMatch(e, n)));
}

/** defaultTools are the tools of the catalog that the list of an agent gives, as the picks of a new chat start. */
export function defaultTools(catalog: Tool[], list: string[] | null | undefined): string[] {
  return catalog.filter((t) => toolOn(list, t)).map(toolId);
}

/** The tools that a quick chat never starts with: they hand work to other runs, propose agents, or wait on the person. */
export const NOT_FOR_CHAT = ['spawn_task', 'await_task', 'propose_agent', 'ask_user'];

/** One chip of the picks: the name that goes into the inline profile, the name on the chip, and the plain phrase of the tool. */
export interface PickItem {
  id: string;
  name: string;
  text: string;
}

export interface ToolPicks {
  /** The tools of the profile, which start on. */
  own: PickItem[];
  /** The other tools of the catalog, under More tools, which start off. */
  more: PickItem[];
}

const itemOf = (t: Tool): PickItem => ({ id: toolId(t), name: t.name, text: t.text || t.description || '' });

/**
 * toolPicks splits the tools of a new chat in two rows. The first holds
 * the tool list of the profile of the agent, which the catalog of the
 * front does not always hold: an entry that names tools of the catalog
 * shows those tools, and an entry that names none, such as front.pages_*
 * that only the worker has, shows as one chip by its name, as written. A
 * list that is empty, missing, or holds * gives every tool of the catalog.
 * The second row, More tools, holds the other tools of the catalog. The
 * tools of NOT_FOR_CHAT never start on, so they sit in More tools.
 */
export function toolPicks(catalog: Tool[], list: string[] | null | undefined): ToolPicks {
  const own: PickItem[] = [];
  const seen = new Set<string>();
  const add = (x: PickItem) => {
    if (seen.has(x.id) || NOT_FOR_CHAT.includes(x.id) || NOT_FOR_CHAT.includes(x.name)) return;
    seen.add(x.id);
    own.push(x);
  };
  if (!list || list.length === 0 || list.includes('*')) {
    for (const t of catalog) add(itemOf(t));
  } else {
    for (const e of list) {
      const hits = catalog.filter((t) => toolOn([e], t));
      if (hits.length) for (const t of hits) add(itemOf(t));
      else add({ id: e, name: e, text: '' });
    }
  }
  const more = catalog.map(itemOf).filter((x) => !seen.has(x.id));
  return { own, more };
}

/** toggle turns one name on or off in a list of picks, and keeps the order of the list. */
export function toggle(list: string[], name: string, on: boolean): string[] {
  if (on) return list.includes(name) ? list : [...list, name];
  return list.filter((x) => x !== name);
}

/**
 * startBody is the body of POST /v1/runs that starts a quick chat: the
 * agent of the chat, the first message, the picks as an inline profile,
 * whose lists replace the lists of the agent for this run, and the mark of
 * the page. A list that the page did not offer stays out, so the list of
 * the agent holds, because an empty tool list gives the run every tool.
 */
export function startBody(agent: string, input: string, picks: InlineProfile): NewRun {
  const profile: InlineProfile = {};
  if (picks.tools) profile.tools = [...picks.tools];
  if (picks.skills) profile.skills = [...picks.skills];
  const body: NewRun = { agent, input };
  if (profile.tools || profile.skills) body.profile = profile;
  body.metadata = { [CHAT_VIEW.key]: CHAT_VIEW.value };
  return body;
}

/* ---------- the usage ---------- */

/** tokensOf sums the tokens of a usage: input, output, and the cache. */
export function tokensOf(u: RunUsage | undefined): number {
  if (!u) return 0;
  return (u.inputTokens || 0) + (u.outputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0);
}

/** usageParts are the figures of the usage of a run and their words: turns, tokens, and cost, with so far while it works. */
export function usageParts(u: RunUsage | undefined, working: boolean): { n: string; word: string }[] {
  if (!u) return [];
  const out: { n: string; word: string }[] = [];
  if (u.turns !== undefined) out.push({ n: u.turns.toLocaleString('en-US'), word: u.turns === 1 ? 'turn' : 'turns' });
  const tokens = tokensOf(u);
  if (tokens > 0) out.push({ n: tokens.toLocaleString('en-US'), word: tokens === 1 ? 'token' : 'tokens' });
  if (u.costUSD !== undefined) out.push({ n: '$' + u.costUSD.toFixed(2), word: working ? 'so far' : '' });
  else if (working && out.length) out[out.length - 1] = { ...out[out.length - 1], word: out[out.length - 1].word + ' so far' };
  return out;
}
