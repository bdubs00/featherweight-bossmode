// The people of the fleet, as the list pane and the board of the Fleet
// place show them: the seats of every open bridge, grouped by bridge, then
// the agents that sit on no bridge. Each row has a status: a light and its
// word. The functions here are pure, so the tests read them without a page.

import type { Agent, Bridge, Fleet, Member, Rules, Run, Skill } from '../api/types';
import { whyWords } from '../lib/words';
import { presenceOf, seatLight, type Light } from '../lib/presence';
import { hrefOf } from '../lib/route';
import { workersOf, type Workers } from '../lib/workers';
import type { Channel, Roster } from './reducer';

export interface PersonRow {
  /** seat:<bridge>/<handle>, or agent:<name> for an agent on no bridge. */
  key: string;
  kind: 'seat' | 'agent';
  bridge?: string;
  /** The handle of a seat, or the name of an agent. */
  handle: string;
  agent: string;
  /** The task of a seat, or the free workers of an agent. */
  task: string;
  /** The status: a light and its word. A null light is an agent with no worker. */
  light: Light | null;
  href: string;
}

export interface PeopleGroup {
  /** The id of the bridge, or "" for Not on a bridge. */
  key: string;
  title: string;
  /** The link of the title, for a bridge. */
  href?: string;
  rows: PersonRow[];
  /** The rows that count: every row but a fired seat. */
  count: number;
}

/** The parts of the state that the people list reads. */
export interface PeopleInput {
  bridges: { order: string[]; byId: Record<string, Bridge> };
  rosters: Record<string, Roster>;
  runs: Record<string, Run>;
  /** The agents of the fleet, from selectAgents of src/state/agents.ts. */
  agents: Agent[] | null;
  fleet: Fleet | null;
}

/** The title of the group of agents that sit on no bridge. */
export const NOT_ON_A_BRIDGE = 'Not on a bridge';

/** newestRun is the id of the newest run of a seat, or "". */
export const newestRun = (m: Pick<Member, 'runs'>): string => (m.runs && m.runs.length ? m.runs[m.runs.length - 1] : '');

/** seatRowLight is the status of a seat: its presence, or waiting for a worker while its newest run waits in the queue. */
export function seatRowLight(m: Member, runs: Record<string, Run>): Light {
  const r = runs[newestRun(m)];
  return seatLight(m.fired ? 'fired' : m.presence, r ? r.state : undefined);
}

/**
 * workerLight is the status of an agent from its workers: awake when one is
 * up, starting, failed, or asleep. An agent with no worker has no light.
 */
export function workerLight(w: Workers): Light | null {
  if (w.workers.length === 0) return null;
  if (w.awake > 0) return { word: 'awake', tone: 'green', label: 'The worker is up.' };
  if (w.workers.some((x) => x.phase === 'Pending')) return { word: 'starting', tone: 'grey', label: 'The worker starts.' };
  if (w.workers.every((x) => x.phase === 'Failed')) return { word: 'failed', tone: 'red', label: 'The worker failed.' };
  return { word: 'asleep', tone: 'grey', label: 'The worker sleeps. A request wakes it.' };
}

/** capacityWords says how many workers of an agent are free: 1 free, 2 free, or waiting for a worker. An agent with no worker gets no words. */
export function capacityWords(w: Workers): string {
  if (w.workers.length === 0) return '';
  return w.free > 0 ? w.free + ' free' : 'waiting for a worker';
}

/**
 * peopleOf builds the people list. The groups follow the order of the
 * bridges, open bridges only, each with its seats in the order of the
 * roster and a fired seat last. Not on a bridge comes last, with the agents
 * of the fleet in the order of their names. It shows only when every open
 * bridge has its roster, so an agent never shows there for a moment before
 * its seat loads.
 */
export function peopleOf(s: PeopleInput): PeopleGroup[] {
  const groups: PeopleGroup[] = [];
  const seated = new Set<string>();
  let complete = true;
  for (const id of s.bridges.order) {
    const b = s.bridges.byId[id];
    if (!b || b.state !== 'open') continue;
    const roster = s.rosters[id];
    if (!roster) {
      complete = false;
      continue;
    }
    const members = roster.order.map((h) => roster.byHandle[h]).filter(Boolean);
    const ordered = [...members.filter((m) => !m.fired), ...members.filter((m) => m.fired)];
    const rows: PersonRow[] = ordered.map((m) => {
      if (!m.fired) seated.add(m.agent);
      return {
        key: 'seat:' + id + '/' + m.handle,
        kind: 'seat',
        bridge: id,
        handle: m.handle,
        agent: m.agent,
        task: m.task,
        light: seatRowLight(m, s.runs),
        href: hrefOf({ place: 'member', bridge: id, handle: m.handle, tab: 'chat' }),
      };
    });
    groups.push({ key: id, title: b.title, href: hrefOf({ place: 'bridge', id, pane: 'none' }), rows, count: ordered.filter((m) => !m.fired).length });
  }
  if (complete && s.agents) {
    const rows: PersonRow[] = s.agents
      .filter((a) => !seated.has(a.name))
      .map((a) => a.name)
      .sort()
      .map((name) => {
        const w = workersOf(s.fleet, name);
        return { key: 'agent:' + name, kind: 'agent', handle: name, agent: name, task: capacityWords(w), light: workerLight(w), href: hrefOf({ place: 'fleet', agent: name }) };
      });
    if (rows.length) groups.push({ key: '', title: NOT_ON_A_BRIDGE, rows, count: rows.length });
  }
  return groups;
}

/** peopleCount is the number of members that the header counts: every row but a fired seat. */
export function peopleCount(groups: PeopleGroup[]): number {
  return groups.reduce((n, g) => n + g.count, 0);
}

/** filterPeople keeps the rows whose handle, agent, task, or bridge holds every word of the query. */
export function filterPeople(groups: PeopleGroup[], q: string): PeopleGroup[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  const out: PeopleGroup[] = [];
  for (const g of groups) {
    const rows = g.rows.filter((r) => {
      const hay = (r.handle + ' ' + r.agent + ' ' + r.task + ' ' + g.title).toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (rows.length) out.push({ ...g, rows, count: rows.filter((r) => !(r.light && r.light.struck)).length });
  }
  return out;
}

/** The statuses in the order of attention, for the board and its status strips. */
export const STATUS_ORDER = ['needs you', 'error', 'failed', 'working', 'awake', 'starting', 'waiting for a worker', 'idle', 'asleep', 'stopping', 'fired'];

/** statusOf is the word of the status of a row, or "" for an agent with no worker. */
export const statusOf = (r: PersonRow): string => (r.light ? r.light.word : '');

export interface StripSegment {
  word: string;
  tone: Light['tone'];
  count: number;
}

/** stripOf counts the rows of a group per status, in the order of attention. */
export function stripOf(rows: PersonRow[]): StripSegment[] {
  const by = new Map<string, StripSegment>();
  for (const r of rows) {
    if (!r.light) continue;
    const s = by.get(r.light.word);
    if (s) s.count++;
    else by.set(r.light.word, { word: r.light.word, tone: r.light.tone, count: 1 });
  }
  const rank = (w: string) => {
    const i = STATUS_ORDER.indexOf(w);
    return i < 0 ? STATUS_ORDER.length : i;
  };
  return [...by.values()].sort((a, b) => rank(a.word) - rank(b.word));
}

/** filterStatus keeps the rows of one status, and drops a group with none. */
export function filterStatus(groups: PeopleGroup[], word: string): PeopleGroup[] {
  if (!word) return groups;
  return groups.map((g) => ({ ...g, rows: g.rows.filter((r) => statusOf(r) === word) })).filter((g) => g.rows.length > 0);
}

/** firstPerson is the row that the main pane opens when nothing is picked: a seat that needs you, else the first seat, else the first agent. */
export function firstPerson(groups: PeopleGroup[]): PersonRow | null {
  const all = groups.flatMap((g) => g.rows);
  return all.find((r) => r.kind === 'seat' && r.light && r.light.word === 'needs you') || all.find((r) => r.kind === 'seat' && !(r.light && r.light.struck)) || all[0] || null;
}

/** seatsOfAgent returns the seats of an agent on the open bridges, with their bridge. */
export function seatsOfAgent(s: Pick<PeopleInput, 'bridges' | 'rosters'>, agent: string): { bridge: string; member: Member }[] {
  const out: { bridge: string; member: Member }[] = [];
  for (const id of s.bridges.order) {
    const b = s.bridges.byId[id];
    const r = s.rosters[id];
    if (!b || b.state !== 'open' || !r) continue;
    for (const h of r.order) {
      const m = r.byHandle[h];
      if (m && m.agent === agent && !m.fired) out.push({ bridge: id, member: m });
    }
  }
  return out;
}

/* ---------- the slash menu ---------- */

/** invocable reports whether a person can call a skill with a slash. A skill says so in its front matter, and true is the default. */
export function invocable(s: Pick<Skill, 'userInvocable'>): boolean {
  return s.userInvocable !== false;
}

/** A command of the slash menu: the name of a skill, its description, and the hint of its arguments. */
export interface SlashCommand {
  name: string;
  description: string;
  hint?: string;
}

/**
 * slashCommands lists the skills that a person can call with a slash in a
 * one-on-one conversation with an agent: the skills of the catalog that the
 * agent can load, from GET /v1/agents/{name}/skills, and that a person can
 * invoke, each with the hint of its arguments.
 */
export function slashCommands(skills: Skill[] | null | undefined, loadable: string[] | null | undefined): SlashCommand[] {
  const can = new Set(loadable || []);
  return (skills || [])
    .filter((s) => invocable(s) && can.has(s.name))
    .map((s) => (s.argumentHint ? { name: s.name, description: s.description, hint: s.argumentHint } : { name: s.name, description: s.description }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}


/* ---------- the Keep field ---------- */

/** parseKeep reads the number of workers that an agent keeps: a whole number, 0 or more. */
export function parseKeep(text: string): { value: number } | { error: string } {
  const t = String(text).trim();
  if (!/^\d{1,4}$/.test(t)) return { error: 'Keep is a whole number, 0 or more.' };
  return { value: Number(t) };
}

/* ---------- the workers of a profile ---------- */

/**
 * seatOnWorker names the seat that a worker serves now: a seat of the agent
 * whose newest run works on that worker. A run names its worker as
 * namespace/name, or the name alone.
 */
export function seatOnWorker(worker: string, seats: { bridge: string; member: Member }[], runs: Record<string, Run>): string {
  for (const { member } of seats) {
    const r = runs[newestRun(member)];
    if (!r || !r.member) continue;
    if (!['running', 'input-required', 'suspended'].includes(r.state)) continue;
    if (r.member === worker || r.member.endsWith('/' + worker)) return member.handle;
  }
  return '';
}

/** presenceWord is the word of a presence of the API, such as needs you for needs-you. */
export const presenceWord = (p: string): string => presenceOf(p).word;

/* ---------- the profile ---------- */

/**
 * rulesOf names the rules of an agent that the page has seen hold a call,
 * from the decisions of its runs, such as asks before git push. The agent
 * view of the backend can carry them instead.
 */
/** policyRules words the rules of a profile that ask first, such as asks before git push. */
export function policyRules(policy: Rules | null | undefined): string[] {
  const out = new Set<string>();
  for (const e of (policy && policy.ask) || []) {
    const w = whyWords(/^[a-z0-9_.-]+(: .+)?$/i.test(e) ? 'rule: ask ' + e : e);
    const m = /^Rule: ask before (.+)$/.exec(w);
    if (m) out.add('asks before ' + m[1]);
  }
  return [...out].sort();
}

export function rulesOf(agent: string, runs: Record<string, Run>, channels: Record<string, Channel>): string[] {
  const reasons = new Set<string>();
  for (const r of Object.values(runs)) if (r.agent === agent && r.pending && r.pending.reason) reasons.add(r.pending.reason);
  for (const ch of Object.values(channels)) {
    for (const seq of ch.seqs) {
      const d = ch.bySeq[seq] && ch.bySeq[seq].decision;
      const r = d ? runs[d.run] : undefined;
      if (d && d.reason && r && r.agent === agent) reasons.add(d.reason);
    }
  }
  const out = new Set<string>();
  for (const reason of reasons) {
    const w = whyWords(reason);
    const m = /^Rule: ask before (.+)$/.exec(w);
    if (m) out.add('asks before ' + m[1]);
    else if (w === 'Rule: ask first') out.add('asks first');
  }
  return [...out].sort();
}

/**
 * likedOf reads the page of what people liked about an agent: one item per
 * section, the note of the person when it has one, else the text that they
 * gave a heart. The newest comes first.
 */
export function likedOf(text: string): string[] {
  const body = String(text || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
  const out: string[] = [];
  for (const part of body.split(/^## .*$/m).slice(1)) {
    const paras = part
      .split(/\n\s*\n/)
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!paras.length) continue;
    const note = paras.find((x) => /^Their note:/i.test(x));
    out.push(note ? note.replace(/^Their note:\s*/i, '') : paras[0].replace(/^[^:]{1,40} hearted:\s*/, ''));
  }
  return out.reverse();
}
