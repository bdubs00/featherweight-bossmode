// The places where the front reaches the person who is signed in, as the
// dialog Where to reach me holds them, and back to the body of PUT
// /v1/notifications. Each place is a channel of one kind with its own three
// switches. The quiet hours stay one setting of the person. Section 11 of
// reports/Duties contract 2026-10-23.md names the shapes.
//
// The page never reads a write-only field: the address of a channel, the
// secret of a webhook, or the token of ntfy. The front answers "set" or "".
// A save sends "set" to keep the stored value, "" to clear it, or the new
// value. Quiet hours that are off go as two empty times.

import type { ChannelKind, NotifyChannel, NotifyRead, NotifySend, NotifySettings, NotifyTestResult, SharedChannel } from '../api/types';
import { oneSentence } from '../api/client';
import { money, splitProblem } from './duties';

export { channelWords } from './duties';

/** The most channels that a person keeps. */
export const MAX_CHANNELS = 10;

/** The kinds in the order that the page offers them. */
export const KIND_ORDER: ChannelKind[] = ['ntfy', 'slack', 'discord', 'teams', 'webhook', 'email', 'agent', 'shared'];

/** The name of each kind and one line that says what it reaches. */
export const KINDS: Record<ChannelKind, { name: string; about: string }> = {
  ntfy: { name: 'ntfy', about: 'The ntfy app on your phone, through a topic that it follows.' },
  slack: { name: 'Slack', about: 'A channel of your Slack workspace, through an incoming webhook.' },
  discord: { name: 'Discord', about: 'A channel of your Discord server, through its webhook.' },
  teams: { name: 'Teams', about: 'A channel of Microsoft Teams, through a workflow.' },
  webhook: { name: 'Webhook', about: 'Any app that takes a JSON post, such as Home Assistant, n8n, or Zapier.' },
  email: { name: 'Email', about: 'A plain mail to an address that you name.' },
  agent: { name: 'Through an agent', about: 'An agent of the fleet delivers it with its own tools, as you describe in words.' },
  shared: { name: 'A shared channel', about: 'A channel that an admin shares, such as the room of your team.' },
};

const known = (k: string): k is ChannelKind => (KIND_ORDER as string[]).includes(k);

/**
 * offeredKinds names the kinds that the page offers: the kinds of offered
 * that the page knows, in its order. A shared channel needs one of the
 * operator to pick, so shared shows only with one.
 */
export function offeredKinds(r: NotifyRead | null): ChannelKind[] {
  const said = new Set(((r && r.offered) || []).map((o) => o.kind));
  const shared = !!(r && r.shared && r.shared.length);
  return KIND_ORDER.filter((k) => said.has(k) && (k !== 'shared' || shared));
}

/** kindName names a kind: the word of the page, else the label of the front, else the kind. */
export function kindName(kind: string, r?: NotifyRead | null): string {
  if (known(kind)) return KINDS[kind].name;
  const o = r && r.offered ? r.offered.find((x) => x.kind === kind) : undefined;
  return (o && o.label) || kind;
}

/** sharedOf finds a shared channel of the operator by its name. */
export const sharedOf = (r: NotifyRead | null, name: string): SharedChannel | undefined => ((r && r.shared) || []).find((s) => s.name === name);

/** placeLine says where a channel reaches, under its label, such as Email to alice@example.com. agentName gives the display name of an agent. */
export function placeLine(c: NotifyChannel, r: NotifyRead | null, agentName: (a: string) => string = (a) => a): string {
  switch (c.kind) {
    case 'ntfy':
      return c.ntfy && c.ntfy.topic ? 'ntfy, topic ' + c.ntfy.topic : 'ntfy';
    case 'email':
      return c.email && c.email.to ? 'Email to ' + c.email.to : 'Email';
    case 'agent':
      return c.agent && c.agent.agent ? 'Through ' + agentName(c.agent.agent) : 'Through an agent';
    case 'shared': {
      const s = sharedOf(r, c.shared || '');
      return (s ? s.label : c.shared || 'A channel') + ', shared by an admin';
    }
  }
  return kindName(c.kind, r);
}

/* ---------- a write-only field ---------- */

/**
 * The form of a write-only field. had is true when the front holds a value.
 * Remove drops it, Replace opens the field for a new one, and typed is
 * what the person wrote.
 */
export interface Secret {
  had: boolean;
  removed: boolean;
  replacing: boolean;
  typed: string;
}

/** secretOf reads the "set" or "" of a read. */
export const secretOf = (v: string | undefined): Secret => ({ had: v === 'set', removed: false, replacing: false, typed: '' });

/** secretOpen reports whether the field shows its box: nothing is saved, or the person pressed Remove or Replace. */
export const secretOpen = (s: Secret): boolean => !s.had || s.removed || s.replacing;

/** secretValue is the value of a write: the new value, else "set" to keep the stored one, else "" to clear it. */
export function secretValue(s: Secret): string {
  const t = s.typed.trim();
  if (t) return t;
  return s.had && !s.removed ? 'set' : '';
}

/* ---------- one channel ---------- */

/** The form of the dialog of one place. kind is "" until the person picks one. cost is the most a message can cost, as typed. */
export interface ChannelForm {
  id: string;
  kind: ChannelKind | '';
  label: string;
  questions: boolean;
  failures: boolean;
  digest: boolean;
  server: string;
  topic: string;
  token: Secret;
  url: Secret;
  secret: Secret;
  to: string;
  agent: string;
  how: string;
  cost: string;
  shared: string;
}

/** amount shows dollars as a person writes them. A new place has none: the person writes it. */
const amount = (n: number | undefined) => (typeof n === 'number' && n > 0 ? String(n) : '');

/** channelFormOf reads a channel into the form. A new place sends questions and failures, and no digest. */
export function channelFormOf(c: NotifyChannel | null): ChannelForm {
  const send = (c && c.send) || { questions: true, failures: true, digest: false };
  const n = (c && c.ntfy) || { server: '', topic: '', token: '' };
  const a = (c && c.agent) || { agent: '', how: '', budget: {} };
  return {
    id: (c && c.id) || '',
    kind: c && known(c.kind) ? c.kind : '',
    label: (c && c.label) || '',
    questions: !!send.questions,
    failures: !!send.failures,
    digest: !!send.digest,
    server: n.server || '',
    topic: n.topic || '',
    token: secretOf(n.token),
    url: secretOf(c ? c.url : ''),
    secret: secretOf(c ? c.secret : ''),
    to: (c && c.email && c.email.to) || '',
    agent: a.agent || '',
    how: a.how || '',
    // No silent cost: a new place has no budget until the person writes one.
    cost: amount(a.budget && a.budget.maxCostUSD),
    shared: (c && c.shared) || '',
  };
}

/** channelOf writes the channel of the form, with only the fields of its kind. base is the channel that the person edits: its other limits stay. */
export function channelOf(f: ChannelForm, base?: NotifyChannel | null): NotifyChannel {
  const c: NotifyChannel = { kind: f.kind, label: f.label.trim(), send: { questions: f.questions, failures: f.failures, digest: f.digest } };
  if (f.id) c.id = f.id;
  switch (f.kind) {
    case 'ntfy':
      c.ntfy = { server: f.server.trim(), topic: f.topic.trim(), token: secretValue(f.token) };
      break;
    case 'slack':
    case 'discord':
    case 'teams':
      c.url = secretValue(f.url);
      break;
    case 'webhook':
      c.url = secretValue(f.url);
      c.secret = secretValue(f.secret);
      break;
    case 'email':
      c.email = { to: f.to.trim() };
      break;
    case 'agent': {
      const budget = { ...((base && base.agent && base.agent.budget) || {}) };
      delete budget.maxCostUSD;
      const cost = money(f.cost);
      if (cost > 0) budget.maxCostUSD = cost;
      c.agent = { agent: f.agent, how: f.how.trim(), budget };
      break;
    }
    case 'shared':
      c.shared = f.shared;
      break;
  }
  return c;
}

/** The places of the dialog of a place that show an error or a problem of the front. row is the place as a whole. */
export type ChannelSlot = 'kind' | 'label' | 'send' | 'server' | 'topic' | 'token' | 'url' | 'secret' | 'to' | 'agent' | 'how' | 'cost' | 'shared' | 'row';

/** The errors of the form of a place before a save, by field. */
export type ChannelErrors = Partial<Record<ChannelSlot, string>>;

/** The start of the address of each kind with a fixed host. */
const URL_START: Partial<Record<ChannelKind, RegExp>> = {
  slack: /^https:\/\/hooks\.slack\.com\//i,
  discord: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//i,
};

/**
 * channelErrors says what the form of a place lacks. serverDefault is the
 * ntfy server of the front: "" says that the front has none, so the place
 * needs its own, and undefined that the page cannot tell.
 */
export function channelErrors(f: ChannelForm, serverDefault?: string): ChannelErrors {
  const e: ChannelErrors = {};
  if (!f.kind) {
    e.kind = 'Pick a kind of place.';
    return e;
  }
  if (!f.label.trim()) e.label = 'Give the place a name.';
  switch (f.kind) {
    case 'ntfy': {
      const s = f.server.trim();
      if (s && !/^https?:\/\/[^\s/]+/.test(s)) e.server = 'Write the address of the server, such as https://ntfy.sh.';
      else if (!s && serverDefault === '') e.server = 'This workbench has no ntfy server of its own. Write the address of one, such as https://ntfy.sh.';
      const t = f.topic.trim();
      if (!t) e.topic = 'Write the topic that your phone follows.';
      else if (/\s|\//.test(t)) e.topic = 'A topic holds no space and no slash.';
      break;
    }
    case 'slack':
    case 'discord':
    case 'teams':
    case 'webhook': {
      const u = f.url.typed.trim();
      const start = URL_START[f.kind];
      if (!u && secretValue(f.url) !== 'set') e.url = f.kind === 'webhook' ? 'Paste the address of the app.' : 'Paste the address from ' + KINDS[f.kind].name + '.';
      else if (u && start && !start.test(u)) e.url = f.kind === 'slack' ? 'A Slack address starts with https://hooks.slack.com/.' : 'A Discord address starts with https://discord.com/api/webhooks/.';
      else if (u && !/^https:\/\/[^\s/]+/i.test(u)) e.url = 'The address starts with https://.';
      break;
    }
    case 'email': {
      const t = f.to.trim();
      if (!t) e.to = 'Write the address to mail.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) e.to = 'Write an email address, such as you@example.com.';
      break;
    }
    case 'agent':
      if (!f.agent) e.agent = 'Pick the agent that reaches you.';
      if (!f.how.trim()) e.how = 'Say how the agent should reach you.';
      // No silent cost: a place through an agent saves only with the most that a message can cost.
      if (!f.cost.trim()) e.cost = 'A place through an agent needs a budget. Write the most a message can cost, such as 0.02.';
      else if (!(money(f.cost) > 0)) e.cost = 'Write an amount above 0, such as 0.02.';
      break;
    case 'shared':
      if (!f.shared) e.shared = 'Pick a shared channel.';
      break;
  }
  return e;
}

/* ---------- the settings ---------- */

/** The form of the dialog Where to reach me: the channels as the front reads them, with the switches as the person sets them, and the quiet hours. */
export interface NotifyForm {
  channels: NotifyChannel[];
  quiet: boolean;
  from: string;
  to: string;
  timeZone: string;
}

/** notifyFormOf reads the settings into the form. Quiet hours that are off default to 22:00 to 07:00 in the zone of the browser. */
export function notifyFormOf(r: NotifyRead | null, zone: string): NotifyForm {
  const q = (r && r.quietHours) || { from: '', to: '', timeZone: '' };
  const quiet = !!(q.from && q.to);
  return {
    channels: ((r && r.channels) || []).map((c) => {
      const s: Partial<NotifySend> = c.send || {};
      return { ...c, send: { questions: !!s.questions, failures: !!s.failures, digest: !!s.digest } };
    }),
    quiet,
    from: quiet ? q.from : '22:00',
    to: quiet ? q.to : '07:00',
    // Quiet hours that are off start in the zone of the browser.
    timeZone: (quiet && q.timeZone) || zone || 'UTC',
  };
}

/** notifyBodyOf writes the body of PUT /v1/notifications. It leaves out offered, shared, off, and serverDefault. */
export function notifyBodyOf(f: NotifyForm): NotifySettings {
  return {
    channels: f.channels,
    quietHours: f.quiet ? { from: f.from, to: f.to, timeZone: f.timeZone } : { from: '', to: '', timeZone: f.timeZone },
  };
}

/** masked turns the write-only fields of a body into "set" or "", as a read answers them, for a front that answers a write with no settings. */
export function masked(s: NotifySettings): NotifySettings {
  const m = (v: string | undefined) => (v ? 'set' : '');
  return {
    ...s,
    channels: s.channels.map((c) => {
      const x = { ...c };
      if (x.url !== undefined) x.url = m(x.url);
      if (x.secret !== undefined) x.secret = m(x.secret);
      if (x.ntfy) x.ntfy = { ...x.ntfy, token: m(x.ntfy.token) };
      return x;
    }),
  };
}

/** quietError says what the quiet hours lack, or "". */
export const quietError = (f: NotifyForm): string => (f.quiet && (!f.from || !f.to) ? 'Pick both times.' : '');

/* ---------- the problems of the front ---------- */

/** The problems of a 400, by place: the top of the dialog, the quiet hours, and each field of each channel by its index. */
export interface NotifyProblems {
  top: string[];
  quiet: string[];
  channels: Record<number, Partial<Record<ChannelSlot, string[]>>>;
}

/** channelSlot names the field of a place for the rest of a path after channels[i], such as ntfy.topic or agent.budget.maxCostUSD. */
export function channelSlot(rest: string): ChannelSlot {
  const [root, leaf] = rest.split('.');
  switch (root) {
    case 'label':
    case 'send':
    case 'url':
    case 'secret':
    case 'shared':
    case 'kind':
      return root;
    case 'ntfy':
      return leaf === 'server' || leaf === 'topic' || leaf === 'token' ? leaf : 'topic';
    case 'email':
      return 'to';
    case 'agent':
      return leaf === 'how' ? 'how' : leaf === 'budget' ? 'cost' : 'agent';
  }
  return 'row';
}

/**
 * notifyProblems sorts the problems of a 400. A problem of a field starts
 * with its path and a colon, such as "channels[1].url: ...". A problem of
 * the quiet hours shows beside them, and a problem with no path, or with a
 * path that names no channel, shows at the top.
 */
export function notifyProblems(ps: unknown[] | null | undefined): NotifyProblems {
  const out: NotifyProblems = { top: [], quiet: [], channels: {} };
  for (const p of ps || []) {
    const { path, text } = splitProblem(p);
    if (!text) continue;
    const m = /^channels\[(\d+)\](?:\.(.+))?$/.exec(path);
    if (m) {
      const i = Number(m[1]);
      const slot = m[2] ? channelSlot(m[2]) : 'row';
      const at = (out.channels[i] = out.channels[i] || {});
      (at[slot] = at[slot] || []).push(text);
    } else if (path.split('.')[0] === 'quietHours') out.quiet.push(text);
    else out.top.push(text);
  }
  return out;
}

/** problemTexts lists every problem of a channel, in the order of its fields. */
export function problemTexts(p: Partial<Record<ChannelSlot, string[]>> | undefined): string[] {
  if (!p) return [];
  const order: ChannelSlot[] = ['row', 'kind', 'label', 'send', 'server', 'topic', 'token', 'url', 'secret', 'to', 'agent', 'how', 'cost', 'shared'];
  return order.flatMap((k) => p[k] || []);
}

/* ---------- a test ---------- */

/** testWords says what a test did for one place: sent, or the reason in words. */
export function testWords(r: NotifyTestResult | undefined, label: string): { ok: boolean; words: string } {
  if (!r) return { ok: false, words: 'The front sent nothing to ' + label + '.' };
  if (r.sent) return { ok: true, words: 'Sent to ' + label + '. Look for it there.' };
  const why = r.error ? oneSentence(r.error) : '';
  return { ok: false, words: 'Not sent to ' + label + '.' + (why ? ' ' + why : '') };
}
