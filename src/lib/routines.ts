// The words and the figures of the Routines place, as pure functions: the
// status of a routine, the groups of the list, the meta line of a row, the
// figures of the sign-off card, the words of a step and of a question, the
// rows of the evidence, and the runbook that the page renders before the
// front writes one. docs/DESIGN.md, section 11.9, names the screen.

import type { Band, Counts, Disagreement, Evidence, EvidenceDay, Move, RoutineCheck, RoutineQuestion, RoutineRecord, RoutineStep, Said, Standing } from '../api/routines';
import type { Tone } from './presence';
import { cap, since } from './words';

/* ---------- numbers ---------- */

/** num writes a count with the separators of English, such as 1,480. */
export const num = (n: number): string => Math.round(n).toLocaleString('en-US');

/** pct writes a share as a percent with at most one decimal, such as 97.6%. */
export function pct(x: number): string {
  const v = Math.round(x * 1000) / 10;
  return String(v) + '%';
}

/** pct0 writes a threshold as a whole percent, such as 85%. */
export const pct0 = (x: number): string => Math.round(x * 100) + '%';

/** money writes a cost in dollars: two decimals from a cent, else the first digit that counts, such as $0.001. */
export function money(x: number): string {
  if (!x || x < 0) return '$0';
  if (x >= 0.01) return '$' + x.toFixed(2);
  return '$' + String(Number(x.toPrecision(1)));
}

/**
 * The page calls a run of a routine a run. A routine belongs to a duty of
 * any kind of work, so the word of one kind, such as ticket, would be
 * wrong for the others. A field of the record that names the noun of the
 * work of an agent would let an agent say its own word.
 */
export const units = (n: number): string => (n === 1 ? '1 run' : num(n) + ' runs');

/* ---------- the status ---------- */

/** The status of a routine: its standing, or needs you for a rehearsing routine that is ready. */
export type RoutineStatus = 'needs-you' | Standing;

export interface StatusLight {
  word: string;
  tone: Tone;
  struck?: boolean;
}

export const STATUS: Record<RoutineStatus, StatusLight> = {
  'needs-you': { word: 'needs you', tone: 'amber' },
  live: { word: 'live', tone: 'green' },
  rehearsing: { word: 'rehearsing', tone: 'grey' },
  proposed: { word: 'proposed', tone: 'grey' },
  paused: { word: 'paused', tone: 'grey' },
  retired: { word: 'retired', tone: 'grey', struck: true },
};

/** The groups of the list, in the order of attention. */
export const ORDER: RoutineStatus[] = ['needs-you', 'live', 'rehearsing', 'proposed', 'paused', 'retired'];

export const GROUP_TITLE: Record<RoutineStatus, string> = {
  'needs-you': 'Needs you',
  live: 'Live',
  rehearsing: 'Rehearsing',
  proposed: 'Proposed',
  paused: 'Paused',
  retired: 'Retired',
};

export function statusOf(r: Pick<RoutineRecord, 'standing' | 'ready'>): RoutineStatus {
  return r.standing === 'rehearsing' && r.ready ? 'needs-you' : r.standing;
}

/** keyOf names a routine in the page: its agent and its name. */
export const keyOf = (agent: string, name: string): string => agent + '/' + name;

/** The short words that a title writes in capitals, such as VPN. */
const CAPS = new Set(['api', 'cpu', 'dns', 'gpu', 'hr', 'ip', 'mfa', 'sso', 'ssh', 'ssl', 'tls', 'url', 'vpn']);

/** titleOf turns the name of a routine into its title: acknowledge-a-new-ticket is Acknowledge a new ticket, and escalate-a-vpn-outage is Escalate a VPN outage. */
export const titleOf = (name: string): string =>
  cap(
    name
      .replace(/[-_]+/g, ' ')
      .trim()
      .split(' ')
      .map((w) => (CAPS.has(w) ? w.toUpperCase() : w))
      .join(' '),
  );

/* ---------- the evidence ---------- */

export type Totals = Counts;

/** totalsOf adds up days of the evidence. */
export function totalsOf(days: EvidenceDay[] | undefined): Totals {
  const t: Totals = { decided: 0, acted: 0, agreed: 0, disagreed: 0, handed: 0, applied: 0, failed: 0 };
  for (const d of days || []) {
    t.decided += d.decided || 0;
    t.acted += d.acted || 0;
    t.agreed += d.agreed || 0;
    t.disagreed += d.disagreed || 0;
    t.handed += d.handed || 0;
    t.applied += d.applied || 0;
    t.failed += d.failed || 0;
  }
  return t;
}

/** countsOf is the counts over the version of a routine: the totals of the workbench, else the sum of its days. */
export function countsOf(ev: Pick<Evidence, 'totals' | 'days'> | null | undefined): Totals {
  if (ev && ev.totals) return ev.totals;
  return totalsOf(ev ? ev.days : []);
}

/** dayOf is the UTC day of a moment, as the evidence writes it. */
const dayOf = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** weekOf counts the runs that a live routine handled over the last seven UTC days. */
export function weekOf(days: EvidenceDay[] | undefined, now = Date.now()): number {
  const first = dayOf(now - 6 * 86400000);
  return (days || []).filter((d) => d.day >= first).reduce((n, d) => n + (d.applied || 0), 0);
}

/** lastMove is the newest move of a routine. */
export function lastMove(r: Pick<RoutineRecord, 'history'>): Move | undefined {
  const h = r.history || [];
  return h.length ? h[h.length - 1] : undefined;
}

/**
 * metaOf is the one meta line of a row: the agent and the figure of its
 * status. With withAgent false, as in the tab Routines of one agent, the
 * line leaves the agent out.
 */
export function metaOf(r: RoutineRecord, now = Date.now(), withAgent = true): string {
  const fig = figureOf(r, now);
  if (!withAgent) return fig;
  return fig ? `${r.agent}, ${fig}` : r.agent;
}

/** figureOf is the figure of the status of a routine for its meta line, or "". */
function figureOf(r: RoutineRecord, now: number): string {
  const s = statusOf(r);
  const ev = r.evidence;
  const t = ev ? countsOf(ev) : null;
  if (s === 'needs-you') return t ? `rehearsed ${units(t.decided)}` : '';
  if (s === 'live') return ev ? `${num(weekOf(ev.days, now))} this week` : '';
  if (s === 'rehearsing') return t && t.acted > 0 ? `${pct(t.agreed / t.acted)} agreed over ${units(t.acted)}` : '';
  const m = lastMove(r);
  return m ? since(m.at, now) : '';
}

/** The three figures of the sign-off card. agreed gives the share with the runs that it counts, such as 97.6% of 1,432. */
export interface Figures {
  agreed: string;
  handed: number;
  sentBack: number;
}

export function figuresOf(r: RoutineRecord): Figures | null {
  const ev = r.evidence;
  if (!ev) return null;
  const t = countsOf(ev);
  const sb = ev.sentBack || { applied: 0, agreed: 0 };
  return { agreed: t.acted > 0 ? `${pct(t.agreed / t.acted)} of ${num(t.acted)}` : '0%', handed: t.handed, sentBack: (sb.agreed || 0) + (sb.applied || 0) };
}

/** The bars of the rehearsal: each day as its three parts, and the three labels of the axis. */
export interface Bar {
  day: string;
  agreed: number;
  disagreed: number;
  handed: number;
  total: number;
}

export function barsOf(days: EvidenceDay[] | undefined): { bars: Bar[]; max: number; axis: string[] } {
  const bars = (days || []).map((d) => ({ day: d.day, agreed: d.agreed || 0, disagreed: d.disagreed || 0, handed: d.handed || 0, total: (d.agreed || 0) + (d.disagreed || 0) + (d.handed || 0) }));
  const max = bars.reduce((m, b) => Math.max(m, b.total), 0);
  const axis = bars.length === 0 ? [] : bars.length < 3 ? bars.map((b) => b.day) : [bars[0].day, bars[Math.floor((bars.length - 1) / 2)].day, bars[bars.length - 1].day];
  return { bars, max, axis };
}

/** dayLabel writes a UTC day of the evidence as a short date, such as Oct 12. */
export function dayLabel(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  if (isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** dateWords names the day of a moment in a sentence: today, yesterday, or a short date. */
export function dateWords(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** bandWords names a band of how sure the routine was. */
export function bandWords(b: Pick<Band, 'from' | 'to'>): string {
  if (b.to >= 1) return `${pct0(b.from)} sure or more`;
  if (b.from <= 0) return `under ${pct0(b.to)} sure`;
  return `${pct0(b.from)} to ${pct0(b.to)} sure`;
}

/** A row of How sure it was: the band, its runs, and how often it was right, or handed for the runs under the mark of the question. */
export interface BandRow {
  words: string;
  runs: number;
  right: string;
  handed: boolean;
}

/**
 * bandRows words the bands of a question, the surest first. A band at or
 * above the mark shows when it holds a run. The bands under the mark join
 * in one row, handed to the agent, because the routine does not act there.
 */
export function bandRows(bands: Band[] | undefined, act?: number): BandRow[] {
  const list = (bands || []).filter((b) => b.to > b.from);
  const mark = typeof act === 'number' ? act : 0;
  const under = list.filter((b) => b.to <= mark + 1e-9);
  const rows: BandRow[] = list
    .filter((b) => b.to > mark + 1e-9 && b.runs > 0)
    .sort((a, b) => b.from - a.from)
    .map((b) => ({ words: bandWords(b), runs: b.runs, right: pct(b.agreed / b.runs), handed: false }));
  const runs = under.reduce((n, b) => n + b.runs, 0);
  if (runs > 0) rows.push({ words: bandWords({ from: 0, to: mark }), runs, right: pct(under.reduce((n, b) => n + b.agreed, 0) / runs), handed: true });
  return rows;
}

/** disagreedOf keeps the answers of a run where the routine and the agent differ. */
export function disagreedOf(d: Disagreement): Said[] {
  return (d.answers || []).filter((a) => !a.agree);
}

/** verificationWords says what happened after a run, from the verification of its receipt. */
export function verificationWords(v: string | undefined): string {
  if (v === 'accepted') return 'accepted';
  if (v === 'satisfied') return 'checked';
  if (v === 'rejected') return 'sent back';
  return 'no answer yet';
}

/* ---------- the body of a routine ---------- */

/** answersOf lists the answers of a question: the options of a choice, the levels of a score, or yes and no. */
export function answersOf(q: RoutineQuestion): string[] {
  if (q.type === 'noul') return ['yes', 'no'];
  if (Array.isArray(q.criteria)) return q.criteria.map(String);
  if (q.criteria && typeof q.criteria === 'object') return Object.keys(q.criteria);
  return [];
}

const expectOf = (q: RoutineQuestion): string[] => (Array.isArray(q.expect) ? q.expect : q.expect ? [q.expect] : []);

/** actsWhen says when the routine acts on a question: how sure it must be, and of which answers. */
export function actsWhen(q: RoutineQuestion): string {
  const sure = typeof q.act === 'number' ? pct0(q.act) + ' sure' : '';
  const expect = expectOf(q);
  if (q.type === 'noul') {
    if (expect.length === 1) return sure ? `${sure} it is ${expect[0]}` : `when it is ${expect[0]}`;
    return sure || 'always';
  }
  const all = answersOf(q);
  const out = expect.length ? all.filter((a) => !expect.includes(a)) : [];
  if (out.length > 0 && out.length <= 2) return (sure ? sure + ', ' : '') + 'not ' + out.join(' or ');
  if (out.length > 2) return (sure ? sure + ', ' : '') + 'on ' + expect.join(', ');
  return sure || 'always';
}

/** questionWords is the whole question as the person reads it: its instructions, else its name. */
export const questionWords = (key: string, q: RoutineQuestion): string => (q.instructions && q.instructions.replace(/\s+/g, ' ').trim()) || titleOf(key);

/** The longest short form of a question, in characters. */
export const SHORT_QUESTION = 80;

/**
 * questionShort is the first sentence of a question, cut at a word and
 * ended with an ellipsis past 80 characters, so a table of questions stays
 * easy to scan. cut is true when the short form leaves part of the whole
 * question out.
 */
export function questionShort(key: string, q: RoutineQuestion): { short: string; whole: string; cut: boolean } {
  const whole = questionWords(key, q);
  const m = /^.*?[.?!](?=\s|$)/.exec(whole);
  let short = m ? m[0] : whole;
  if (short.length > SHORT_QUESTION) {
    const room = short.slice(0, SHORT_QUESTION);
    const at = room.lastIndexOf(' ');
    short = (at > SHORT_QUESTION / 2 ? room.slice(0, at) : room).replace(/[\s,;:.]+$/, '') + '…';
  }
  return { short, whole, cut: short !== whole };
}

/**
 * questionKeys orders the questions of a routine: the choices and the
 * scores first, by name, then the yes or no questions, by name. The order
 * is stable, whatever the order of the map.
 */
export function questionKeys(questions: Record<string, RoutineQuestion> | undefined): string[] {
  const qs = questions || {};
  const last = (k: string) => (qs[k].type === 'noul' ? 1 : 0);
  return Object.keys(qs).sort((a, b) => last(a) - last(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** holeless shows a template with each hole as an ellipsis: type/{{ .type }} is type/…. */
export const holeless = (s: string): string => s.replace(/\{\{[\s\S]*?\}\}/g, '…');

/** The words of a call: the method of its input, else the name of its tool. */
function callWords(tool: string, input: string): string {
  const seg = (tool.split('.').pop() || tool).trim();
  const m = /"method"\s*:\s*"([A-Za-z_]+)"/.exec(input || '');
  if (m) {
    const method = m[1].toLowerCase();
    if (method.includes('_')) return cap(method.replace(/_/g, ' '));
    const noun = seg.split('_')[0];
    if (!noun || noun === method) return cap(method);
    return cap(method) + ' ' + (method === 'list' || method === 'search' ? noun + 's' : noun);
  }
  return cap(seg.replace(/_/g, ' '));
}

/** The words of a step: what it does, and the answers of the questions that it uses. */
export interface StepWords {
  words: string;
  uses: string[];
}

export function stepWords(s: RoutineStep, questions: string[]): StepWords {
  const uses: string[] = [];
  for (const hole of (s.input || '').match(/\{\{[\s\S]*?\}\}/g) || []) {
    for (const m of hole.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)/g)) if (questions.includes(m[1]) && !uses.includes(m[1])) uses.push(m[1]);
  }
  return { words: callWords(s.tool, s.input), uses };
}

/** The words of a check afterward: the read, what its result must hold, and what it must not. */
export interface CheckWords {
  words: string;
  holds: string[];
  lacks: string[];
}

export function checkWords(c: RoutineCheck): CheckWords {
  return { words: callWords(c.tool, c.input), holds: (c.contains || []).map(holeless), lacks: (c.lacks || []).map(holeless) };
}

/* ---------- the moves ---------- */

/** resumeTo is the standing that Resume moves a paused routine back to: the one before the pause. */
export function resumeTo(r: Pick<RoutineRecord, 'history' | 'signedOff'>): Standing {
  const h = r.history || [];
  for (let i = h.length - 1; i > 0; i--) {
    if (h[i].standing === 'paused') return h[i - 1].standing === 'live' ? 'live' : 'rehearsing';
  }
  return r.signedOff ? 'live' : 'rehearsing';
}

/* ---------- the list ---------- */

/** matchesRoutine reports whether every word of a filter is in the title or the agent of a routine. */
export function matchesRoutine(r: RoutineRecord, filter: string): boolean {
  const hay = (titleOf(r.routine.name) + ' ' + r.agent).toLowerCase();
  return filter
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export interface RoutineGroup {
  status: RoutineStatus;
  title: string;
  items: RoutineRecord[];
}

/** groupsOf sorts the routines into the groups of attention. Each group keeps the newest change first. */
export function groupsOf(records: RoutineRecord[]): RoutineGroup[] {
  return ORDER.map((status) => ({
    status,
    title: GROUP_TITLE[status],
    items: records.filter((r) => statusOf(r) === status).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)),
  })).filter((g) => g.items.length > 0);
}

/* ---------- the runbook ---------- */

/** runbookOf renders a routine as the prose of its runbook, in Markdown, as the front writes the page on a sign-off. */
export function runbookOf(r: RoutineRecord): string {
  const qs = r.routine.questions || {};
  const keys = questionKeys(qs);
  const out: string[] = [];
  if (keys.length) {
    out.push('## What it decides', '');
    for (const k of keys) {
      const q = qs[k];
      const answers = answersOf(q).map((a) => '`' + a + '`');
      const list = answers.length > 1 ? answers.slice(0, -1).join(', ') + ', or ' + answers[answers.length - 1] : answers.join('');
      out.push(`- ${questionWords(k, q)} ${list ? list + '. ' : ''}It acts when it is ${actsWhen(q)}.`);
    }
    out.push('');
  }
  out.push('## Steps', '');
  (r.routine.steps || []).forEach((s, i) => {
    const w = stepWords(s, keys);
    out.push(`${i + 1}. ${w.words}${w.uses.length ? ', with the answers ' + w.uses.join(' and ') : ''}. \`${s.tool}\``);
  });
  if ((r.routine.after || []).length) {
    out.push('', '## Afterward', '');
    for (const c of r.routine.after!) {
      const w = checkWords(c);
      const holds = w.holds.map((x) => '`' + x + '`').join(' and ');
      const lacks = w.lacks.map((x) => '`' + x + '`').join(' and ');
      out.push(`- ${w.words}${holds ? ': holds ' + holds : ''}${lacks ? (holds ? ', and not ' : ': not ') + lacks : ''}. \`${c.tool}\``);
    }
  }
  const src = r.source;
  if (src) {
    out.push('', '## Where it comes from', '');
    const proposed = (r.history || []).find((m) => m.standing === 'proposed');
    const by = src.proposedBy ? (/^fw\s/.test(src.proposedBy) ? '`' + src.proposedBy + '`' : src.proposedBy) : '';
    out.push(`From ${units(src.runs)} of ${r.agent}, ${dayLabel(src.from)} to ${dayLabel(src.to)}.${by ? ` Proposed by ${by}${proposed ? ', ' + dayLabel(proposed.at.slice(0, 10)) : ''}.` : ''}`);
  }
  return out.join('\n') + '\n';
}

/** The path of the runbook of a routine in the wiki. */
export const runbookPath = (agent: string, name: string): string => `agents/${agent}/routines/${name}.md`;
