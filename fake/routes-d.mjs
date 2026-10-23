// The fake routes of the Routines place, after section 4.4 of
// docs/ROUTINES.md of the kernel. The lead owns this file. register gets
// the helpers of server.mjs: on adds a route, refuse answers a problem,
// readJson reads the body, publish sends a stream event, S is the state,
// now is the time, AGENTS and FLEET are the sample data, and writePage
// writes a page of the wiki.
//
//   GET  /v1/routines?agent=<name>                 {"routines": [record]}, newest change first, without evidence
//   GET  /v1/routines/{agent}/{name}               the record with evidence
//   PUT  /v1/routines/{agent}/{name}               {"routine", "standing"?, "source"?}: create or replace the body
//   POST /v1/routines/{agent}/{name}/standing      {"standing", "note"?}: 409 on a move that the table forbids
//   GET  /v1/routines/summary?agent=<name>&days=7  the week of an agent
//
// The stream carries {"kind": "routine", "agent", "name"} on every change.
// A sign-off writes the runbook agents/<agent>/routines/<name>.md.
//
// The data tells the three stories of the canvas: one routine needs your
// sign-off, four are live, one rehearses, one is proposed, and two are
// retired. The agent of the certificate is not yours, so its routines show
// no key.

import { hash } from './data.mjs';
import { identicon } from './faces.mjs';

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();
/** minsAgo is a moment some minutes back from the start of the server. */
const minsAgo = (m) => iso(Date.now() - m * 60000);
const dayOf = (t) => iso(t).slice(0, 10);
/** ago is a moment n days back from the start of the server, at an hour of the working day. */
const ago = (n, hour = 9) => {
  const d = new Date(Date.now() - n * DAY);
  d.setUTCHours(hour, 12, 0, 0);
  return iso(Math.min(d.getTime(), Date.now() - 60000));
};

/** The agents of the routines, with their faces and their workers. */
const NEW_AGENTS = [
  { name: 'triage', description: 'Sorts each new helpdesk ticket and hands it to its team.', role: 'owner', displayName: 'Triage', tagline: 'Sorts each new helpdesk ticket and hands it to its team.' },
  { name: 'identity-desk', description: 'Resets passwords and grants access.', role: 'owner', displayName: 'Identity desk', tagline: 'Resets passwords and grants access, by the book.' },
  { name: 'ops', description: 'Keeps the certificates and the services of the helpdesk up.', role: 'operator', displayName: 'Ops', tagline: 'Keeps the certificates and the services up.' },
];

/* ---------- the routines ---------- */

const repo = '"owner": "lab", "repo": "helpdesk"';
const issue = '{{ find .input `#(\\d+)` }}';
const labelOf = (name) => `{{ find .labels ${name} }}`;

const ACK = {
  name: 'acknowledge-a-new-ticket',
  version: 3,
  canary: 0.05,
  decider: 'clef',
  questions: {
    team: {
      type: 'choice',
      instructions: 'Which team owns the ticket?',
      criteria: { network: 'The network, the VPN, or the Wi-Fi', identity: 'An account, a password, or a group', endpoint: 'A laptop, a phone, or a printer', other: 'None of these' },
      act: 0.85,
      expect: ['network', 'identity', 'endpoint'],
      observe: { tool: 'gitea.issue_write', match: '"name":"team/([a-z]+)"' },
    },
    urgency: {
      type: 'choice',
      instructions: 'How urgent is it?',
      criteria: { p1: 'Many people cannot work', p2: 'One person cannot work', p3: 'It can wait a day', other: 'None of these' },
      act: 0.8,
      expect: ['p1', 'p2', 'p3'],
      observe: { tool: 'gitea.issue_write', match: '"name":"prio/([a-z0-9]+)"' },
    },
    beyond: {
      type: 'noul',
      instructions: 'Does it ask for more than triage?',
      act: 0.95,
      expect: 'no',
    },
  },
  steps: [
    { tool: 'gitea.label_read', input: `{"method": "list", ${repo}}`, as: 'labels' },
    { tool: 'gitea.issue_write', input: `{"method": "add_labels", ${repo}, "issue_number": ${issue}, "labels": [${labelOf('(printf `"id":(\\d+),[^}]*"name":"team/%s"` .team)')}, ${labelOf('(printf `"id":(\\d+),[^}]*"name":"prio/%s"` .urgency)')}]}` },
    { tool: 'gitea.issue_write', input: `{"method": "remove_label", ${repo}, "issue_number": ${issue}, "label_id": ${labelOf('`"id":(\\d+),[^}]*"name":"status/new"`')}}` },
    { tool: 'gitea.issue_write', input: `{"method": "add_comment", ${repo}, "issue_number": ${issue}, "body": {{ json (printf "Thanks. The %s team has your ticket, at %s." .team .urgency) }}}` },
  ],
  after: [{ tool: 'gitea.issue_read', input: `{"method": "get", ${repo}, "issue_number": ${issue}}`, contains: ['team/{{ .team }}', 'prio/{{ .urgency }}'], lacks: ['status/new'] }],
  answer: 'TRIAGE {"number": ' + issue + ', "team": "{{ .team }}", "urgency": "{{ .urgency }}"}',
};

/** simple makes the body of a routine of one question and a few steps. */
function simple(name, version, question, steps, after) {
  return { name, version, canary: 0.05, decider: 'clef', questions: question ? { [question.key]: question.q } : {}, steps, after: after || [], answer: 'DONE' };
}

const RESET = simple(
  'reset-a-password',
  2,
  { key: 'locked', q: { type: 'noul', instructions: 'Is the requester locked out of an account that they own?', act: 0.95, expect: 'yes' } },
  [
    { tool: 'idp.user_read', input: '{"method": "get", "user": {{ json .json.requester }}}', as: 'user' },
    { tool: 'idp.user_write', input: '{"method": "reset_password", "user": {{ json .json.requester }}}' },
    { tool: 'gitea.issue_write', input: `{"method": "add_comment", ${repo}, "issue_number": ${issue}, "body": "Your password is reset. Check your mail."}` },
  ],
  [{ tool: 'idp.user_read', input: '{"method": "get", "user": {{ json .json.requester }}}', contains: ['"mustChange":true'], lacks: [] }],
);
const DUPLICATE = simple(
  'close-a-duplicate-ticket',
  1,
  { key: 'duplicate', q: { type: 'noul', instructions: 'Does an open ticket already ask the same?', act: 0.9, expect: 'yes' } },
  [
    { tool: 'gitea.issue_read', input: `{"method": "search", ${repo}, "query": {{ json .input }}}`, as: 'found' },
    { tool: 'gitea.issue_write', input: `{"method": "add_comment", ${repo}, "issue_number": ${issue}, "body": {{ json (printf "This is a duplicate of #%s." (find .found \`"number":(\\d+)\`)) }}}` },
    { tool: 'gitea.issue_write', input: `{"method": "close", ${repo}, "issue_number": ${issue}}` },
  ],
  [{ tool: 'gitea.issue_read', input: `{"method": "get", ${repo}, "issue_number": ${issue}}`, contains: ['"state":"closed"'], lacks: [] }],
);
const MAILBOX = simple(
  'grant-a-shared-mailbox',
  1,
  { key: 'mailbox', q: { type: 'choice', instructions: 'Which shared mailbox does the requester ask for?', criteria: { helpdesk: 'helpdesk@', finance: 'finance@', hr: 'hr@', other: 'Another one' }, act: 0.9, expect: ['helpdesk', 'finance', 'hr'] } },
  [
    { tool: 'idp.group_write', input: '{"method": "add_member", "group": {{ json (printf "mailbox-%s" .mailbox) }}, "user": {{ json .json.requester }}}' },
    { tool: 'gitea.issue_write', input: `{"method": "add_comment", ${repo}, "issue_number": ${issue}, "body": {{ json (printf "You can open %s now." .mailbox) }}}` },
  ],
  [{ tool: 'idp.group_read', input: '{"method": "members", "group": {{ json (printf "mailbox-%s" .mailbox) }}}', contains: ['{{ .json.requester }}'], lacks: [] }],
);
const CERT = simple(
  'renew-an-expiring-certificate',
  4,
  { key: 'expiring', q: { type: 'noul', instructions: 'Does a certificate of the helpdesk expire within 14 days?', act: 0.97, expect: 'yes' } },
  [
    { tool: 'certs.renew', input: '{"host": {{ json (find .input `host ([a-z0-9.-]+)`) }}}' },
    { tool: 'bash', input: '{"command": "systemctl reload nginx"}' },
  ],
  [{ tool: 'certs.read', input: '{"host": {{ json (find .input `host ([a-z0-9.-]+)`) }}}', contains: ['"days":'], lacks: ['"expired":true'] }],
);
const REOPEN = simple(
  'reopen-a-ticket-the-requester-answered',
  2,
  { key: 'answered', q: { type: 'noul', instructions: 'Did the requester answer a question of the helpdesk?', act: 0.9, expect: 'yes' } },
  [
    { tool: 'gitea.issue_write', input: `{"method": "reopen", ${repo}, "issue_number": ${issue}}` },
    { tool: 'gitea.issue_write', input: `{"method": "remove_label", ${repo}, "issue_number": ${issue}, "label_id": ${labelOf('`"id":(\\d+),[^}]*"name":"status/waiting"`')}}` },
  ],
  [{ tool: 'gitea.issue_read', input: `{"method": "get", ${repo}, "issue_number": ${issue}}`, contains: ['"state":"open"'], lacks: ['status/waiting'] }],
);
const VPN = simple(
  'escalate-a-vpn-outage',
  1,
  { key: 'outage', q: { type: 'noul', instructions: 'Does the ticket report that the VPN is down for many people?', act: 0.95, expect: 'yes' } },
  [
    { tool: 'gitea.issue_write', input: `{"method": "add_labels", ${repo}, "issue_number": ${issue}, "labels": [${labelOf('`"id":(\\d+),[^}]*"name":"prio/p1"`')}]}` },
    { tool: 'pager.page', input: '{"team": "network", "summary": {{ json .input }}}' },
  ],
  [],
);
const PRINTER = simple('label-a-printer-ticket', 1, null, [{ tool: 'gitea.issue_write', input: `{"method": "add_labels", ${repo}, "issue_number": ${issue}, "labels": [7]}` }]);
const RESTART = simple('restart-a-stuck-service', 2, null, [{ tool: 'bash', input: '{"command": "systemctl restart helpdesk-mail"}' }]);

/* ---------- the evidence ---------- */

/** spread splits a total over n days by the weights, so the parts add up to the total. */
function spread(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % out.length, left--) out[(i * 5) % out.length]++;
  return out;
}

/** rehearsal makes the days of a rehearsal that ends today: n days of agreed, disagreed, and handed. */
function rehearsal(n, { agreed, disagreed, handed }, weights, endAgo = 0) {
  const w = weights || Array.from({ length: n }, (_, i) => 1 + ((i * 7) % 5) / 10);
  const a = spread(agreed, w);
  const d = spread(disagreed, w.slice().reverse());
  const h = spread(handed, w);
  return Array.from({ length: n }, (_, i) => {
    const t = Date.now() - (endAgo + n - 1 - i) * DAY;
    return { day: dayOf(t), decided: a[i] + d[i] + h[i], acted: a[i] + d[i], agreed: a[i], disagreed: d[i], handed: h[i], applied: 0, failed: 0 };
  });
}

/** liveDays makes the days of a live routine: what it handled each day, and the canary share that the agent still handled. */
function liveDays(n, perWeek) {
  const per = spread(Math.round((perWeek * n) / 7), Array.from({ length: n }, (_, i) => 1 + ((i * 3) % 4) / 5));
  return per.map((applied, i) => {
    const t = Date.now() - (n - 1 - i) * DAY;
    const canary = Math.max(applied > 6 ? 1 : 0, Math.round(applied / 19));
    return { day: dayOf(t), decided: canary, acted: canary, agreed: canary, disagreed: 0, handed: 0, applied, failed: applied > 10 && i % 5 === 0 ? 1 : 0 };
  });
}

const TICKETS = [
  'VPN drops every hour since the update',
  'New starter needs a laptop and accounts',
  'Printer on floor 3 shows an error',
  'Cannot open the shared calendar',
  'Password expired while on leave',
  'Teams call quality is poor in room 4B',
  'Request for a second monitor',
  'Wi-Fi in the east wing is slow',
  'MFA prompt never arrives',
  'Laptop fan is loud and hot',
  'Need access to the finance share',
  'Outlook keeps asking for a password',
  'Docking station shows no display',
  'Guest Wi-Fi code does not work',
  'Phone will not enroll in the device manager',
];
const ticket = (n, i) => `#${n} ${TICKETS[i % TICKETS.length]}`;

const SAID = [
  // Which team, what the routine said, how sure, what the agent chose, and what happened afterward.
  ['team', 'network', 0.91, 'endpoint', 'accepted'],
  ['team', 'identity', 0.86, 'endpoint', 'satisfied'],
  ['urgency', 'p3', 0.85, 'p2', 'accepted'],
  ['team', 'network', 0.88, 'identity', 'accepted'],
  ['urgency', 'p2', 0.83, 'p1', ''],
  ['team', 'endpoint', 0.9, 'network', 'accepted'],
  ['urgency', 'p3', 0.81, 'p2', 'accepted'],
];

function disagreements(count, first) {
  return Array.from({ length: count }, (_, i) => {
    const [q, said, p, observed, v] = SAID[i % SAID.length];
    const out = { run: `run-ack-${first - i * 7}`, input: ticket(first - i * 7, i), at: ago(Math.floor(i / 3), 15 - (i % 6)), answers: { [q]: { said, observed, probability: Math.round((p - (i % 3) * 0.01) * 100) / 100 } } };
    if (v) out.verification = v;
    return out;
  });
}

function replayRuns(total, first, diverged = []) {
  return Array.from({ length: total }, (_, i) => ({ run: `run-past-${first - i * 3}`, input: ticket(first - i * 3, i + 3), same: !diverged.includes(i) }));
}

const ackDays = rehearsal(12, { agreed: 1397, disagreed: 35, handed: 48 }, [116, 129, 121, 124, 110, 93, 84, 129, 133, 124, 119, 119]);

/** record makes one record of the store, with its evidence. */
function record(agent, routine, standing, more = {}) {
  const history = more.history || [];
  const at = history.length ? history[history.length - 1].at : ago(1);
  return {
    agent,
    routine,
    standing,
    ready: !!more.ready,
    signedOff: more.signedOff || null,
    history,
    source: more.source || null,
    createdAt: history.length ? history[0].at : at,
    updatedAt: more.updatedAt || at,
    evidence: {
      days: more.days || [],
      questions: more.questions || {},
      disagreements: more.disagreements || [],
      sentBack: more.sentBack || { applied: 0, agreed: 0 },
      replay: more.replay || null,
    },
  };
}

const ALICE = 'alice@example.com';
const GRACE = 'grace@example.com';
const PROPOSE = 'fw routine propose';

function seedRoutines() {
  const live = (agent, routine, perWeek, signedBy, signedAgo, extra = {}) => {
    // The evidence holds the last weeks: the rehearsal right before the live days.
    const span = Math.min(signedAgo, 21);
    const days = [...rehearsal(10, { agreed: 196, disagreed: 3, handed: 6 }, null, span), ...liveDays(span, perWeek)];
    const signedAt = ago(signedAgo, 11);
    return record(agent, routine, 'live', {
      signedOff: { by: signedBy, at: signedAt },
      history: [
        { at: ago(signedAgo + 12), by: PROPOSE, standing: 'proposed' },
        { at: ago(signedAgo + 10), by: signedBy, standing: 'rehearsing' },
        { at: signedAt, by: signedBy, standing: 'live', note: extra.note || '' },
      ],
      source: { runs: extra.runs || 40, from: dayOf(Date.now() - (signedAgo + 40) * DAY), to: dayOf(Date.now() - (signedAgo + 13) * DAY), proposedBy: PROPOSE },
      days,
      questions: Object.fromEntries(Object.keys(routine.questions || {}).map((k) => [k, { bands: [{ from: 0.95, to: 1, runs: 180, agreed: 179 }, { from: routine.questions[k].act, to: 0.95, runs: 19, agreed: 17 }, { from: 0, to: routine.questions[k].act, runs: 6, agreed: 4 }] }])),
      sentBack: { applied: extra.sentBack || 0, agreed: 0 },
      replay: { matched: extra.runs || 40, total: extra.runs || 40, at: ago(signedAgo + 12) },
      updatedAt: minsAgo(extra.changed || 120),
    });
  };
  const list = [
    record('triage', ACK, 'rehearsing', {
      ready: true,
      history: [
        { at: ago(12, 16), by: PROPOSE, standing: 'proposed' },
        { at: ago(11, 9), by: ALICE, standing: 'rehearsing', note: 'Rehearse it on the new tickets.' },
      ],
      source: { runs: 212, from: dayOf(Date.now() - 39 * DAY), to: dayOf(Date.now() - 13 * DAY), proposedBy: PROPOSE },
      days: ackDays,
      questions: {
        team: { bands: [{ from: 0.95, to: 1, runs: 1201, agreed: 1182 }, { from: 0.85, to: 0.95, runs: 231, agreed: 215 }, { from: 0, to: 0.85, runs: 48, agreed: 31 }] },
        urgency: { bands: [{ from: 0.95, to: 1, runs: 1088, agreed: 1079 }, { from: 0.8, to: 0.95, runs: 354, agreed: 329 }, { from: 0, to: 0.8, runs: 38, agreed: 22 }] },
        beyond: { bands: [{ from: 0.95, to: 1, runs: 1464, agreed: 1463 }, { from: 0, to: 0.95, runs: 16, agreed: 12 }] },
      },
      disagreements: disagreements(35, 4821),
      sentBack: { applied: 0, agreed: 0 },
      replay: { matched: 212, total: 212, at: ago(12, 17), runs: replayRuns(212, 4410) },
      updatedAt: minsAgo(25),
    }),
    live('identity-desk', RESET, 96, GRACE, 21, { runs: 64, note: 'Checked with the identity team.', changed: 40 }),
    live('triage', DUPLICATE, 41, ALICE, 30, { runs: 58, sentBack: 1, changed: 55 }),
    live('identity-desk', MAILBOX, 12, GRACE, 16, { runs: 31, changed: 130 }),
    live('ops', CERT, 3, ALICE, 40, { runs: 22, changed: 300 }),
    record('triage', REOPEN, 'rehearsing', {
      history: [
        { at: ago(7, 15), by: PROPOSE, standing: 'proposed' },
        { at: ago(6, 10), by: ALICE, standing: 'rehearsing' },
      ],
      source: { runs: 47, from: dayOf(Date.now() - 30 * DAY), to: dayOf(Date.now() - 8 * DAY), proposedBy: PROPOSE },
      days: rehearsal(6, { agreed: 126, disagreed: 24, handed: 30 }),
      questions: { answered: { bands: [{ from: 0.95, to: 1, runs: 96, agreed: 88 }, { from: 0.9, to: 0.95, runs: 54, agreed: 38 }, { from: 0, to: 0.9, runs: 30, agreed: 17 }] } },
      disagreements: disagreements(24, 4790).map((d, i) => ({ ...d, answers: { answered: { said: 'yes', observed: 'no', probability: 0.93 - (i % 3) / 100 } } })),
      sentBack: { applied: 0, agreed: 2 },
      replay: { matched: 44, total: 47, at: ago(7, 16), runs: replayRuns(47, 4300, [5, 18, 31]) },
      updatedAt: minsAgo(70),
    }),
    record('triage', VPN, 'proposed', {
      history: [{ at: ago(2, 14), by: PROPOSE, standing: 'proposed' }],
      source: { runs: 14, from: dayOf(Date.now() - 60 * DAY), to: dayOf(Date.now() - 3 * DAY), proposedBy: PROPOSE },
      replay: { matched: 13, total: 14, at: ago(2, 14), runs: replayRuns(14, 4700, [9]) },
    }),
    record('triage', PRINTER, 'retired', {
      history: [
        { at: ago(60), by: PROPOSE, standing: 'proposed' },
        { at: ago(58), by: ALICE, standing: 'rehearsing' },
        { at: ago(20), by: ALICE, standing: 'retired', note: 'The printers moved to the endpoint team.' },
      ],
      source: { runs: 18, from: dayOf(Date.now() - 90 * DAY), to: dayOf(Date.now() - 61 * DAY), proposedBy: PROPOSE },
    }),
    record('ops', RESTART, 'retired', {
      history: [
        { at: ago(45), by: PROPOSE, standing: 'proposed' },
        { at: ago(44), by: ALICE, standing: 'rehearsing' },
        { at: ago(30), by: ALICE, standing: 'live' },
        { at: ago(9), by: ALICE, standing: 'retired' },
      ],
      signedOff: { by: ALICE, at: ago(30) },
      source: { runs: 26, from: dayOf(Date.now() - 80 * DAY), to: dayOf(Date.now() - 46 * DAY), proposedBy: PROPOSE },
    }),
  ];
  return new Map(list.map((r) => [r.agent + '/' + r.routine.name, r]));
}

/** The week of each agent: its runs, by a routine, by the agent, with a person, the cost, and what came back. */
const WEEKS = {
  triage: { runs: 1912, byRoutine: 41, byAgent: 1776, withPerson: 95, costUSD: { routine: 0.041, agent: 35.52 }, sentBack: 7 },
  'identity-desk': { runs: 158, byRoutine: 108, byAgent: 44, withPerson: 6, costUSD: { routine: 0.108, agent: 0.968 }, sentBack: 1 },
  ops: { runs: 30, byRoutine: 3, byAgent: 25, withPerson: 2, costUSD: { routine: 0.003, agent: 0.75 }, sentBack: 0 },
};

/** The moves of section 4.1. A move of a ready routine from rehearsing to rehearsing is Not yet, a shape that the page assumed. */
const MOVES = { proposed: ['rehearsing', 'retired'], rehearsing: ['live', 'paused', 'retired'], live: ['paused', 'retired'], paused: ['rehearsing', 'live'], retired: [] };
const STANDINGS = ['proposed', 'rehearsing', 'live', 'paused', 'retired'];

/* ---------- the runbook ---------- */

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const short = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const units = (n) => (n === 1 ? '1 ticket' : n.toLocaleString('en-US') + ' tickets');
const pct0 = (x) => Math.round(x * 100) + '%';
const holeless = (s) => s.replace(/\{\{[\s\S]*?\}\}/g, '…');

function answersOf(q) {
  if (q.type === 'noul') return ['yes', 'no'];
  if (Array.isArray(q.criteria)) return q.criteria;
  return Object.keys(q.criteria || {});
}
function actsWhen(q) {
  const sure = typeof q.act === 'number' ? pct0(q.act) + ' sure' : '';
  const expect = Array.isArray(q.expect) ? q.expect : q.expect ? [q.expect] : [];
  if (q.type === 'noul') return expect.length === 1 ? `${sure} it is ${expect[0]}` : sure || 'always';
  const out = expect.length ? answersOf(q).filter((a) => !expect.includes(a)) : [];
  if (out.length > 0 && out.length <= 2) return (sure ? sure + ', ' : '') + 'not ' + out.join(' or ');
  return sure || 'always';
}
function callWords(tool, input) {
  const seg = tool.split('.').pop();
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

/** runbook renders a routine as the page of the wiki that the front writes on a sign-off, the same way as runbookOf of the page. */
function runbook(r) {
  const qs = r.routine.questions || {};
  const keys = Object.keys(qs);
  const out = [];
  if (r.signedOff) out.push(`Signed off by ${r.signedOff.by.split('@')[0]}, ${short(r.signedOff.at)}. The agent checks 1 in ${Math.round(1 / (r.routine.canary || 0.05))}.`, '');
  if (keys.length) {
    out.push('## What it decides', '');
    for (const k of keys) {
      const a = answersOf(qs[k]).map((x) => '`' + x + '`');
      const list = a.length > 1 ? a.slice(0, -1).join(', ') + ', or ' + a[a.length - 1] : a.join('');
      out.push(`- ${qs[k].instructions || cap(k)} ${list ? list + '. ' : ''}It acts when it is ${actsWhen(qs[k])}.`);
    }
    out.push('');
  }
  out.push('## Steps', '');
  r.routine.steps.forEach((s, i) => {
    const uses = [];
    for (const hole of s.input.match(/\{\{[\s\S]*?\}\}/g) || []) for (const m of hole.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)/g)) if (keys.includes(m[1]) && !uses.includes(m[1])) uses.push(m[1]);
    out.push(`${i + 1}. ${callWords(s.tool, s.input)}${uses.length ? ', with the answers ' + uses.join(' and ') : ''}. \`${s.tool}\``);
  });
  if ((r.routine.after || []).length) {
    out.push('', '## Afterward', '');
    for (const c of r.routine.after) {
      const holds = (c.contains || []).map((x) => '`' + holeless(x) + '`').join(' and ');
      const lacks = (c.lacks || []).map((x) => '`' + holeless(x) + '`').join(' and ');
      out.push(`- ${callWords(c.tool, c.input)}${holds ? ': holds ' + holds : ''}${lacks ? (holds ? ', and not ' : ': not ') + lacks : ''}. \`${c.tool}\``);
    }
  }
  if (r.source) {
    const ev = r.evidence || { days: [] };
    const decided = ev.days.reduce((n, d) => n + d.decided, 0);
    out.push('', '## Where it comes from', '', `From ${units(r.source.runs)} of ${r.agent}, ${short(r.source.from)} to ${short(r.source.to)}. Proposed by \`${r.source.proposedBy}\`. Rehearsed on ${units(decided)} beside the agent.`);
  }
  return out.join('\n') + '\n';
}

/* ---------- the routes ---------- */

export function register({ on, refuse, readJson, publish, S, now, AGENTS, FLEET, writePage }) {
  // The agents of the routines join the sample data, with their faces and their workers.
  for (const a of NEW_AGENTS) {
    if (!AGENTS.some((x) => x.name === a.name)) AGENTS.push(a);
    const svg = identicon(a.name);
    S.faces.set(a.name, { agent: a.name, displayName: a.displayName, tagline: a.tagline, svg, hash: hash(svg + a.displayName + a.tagline), custom: false });
  }
  const pools = [
    { name: 'triage', agent: 'triage', tasks: [['triage-0', 'Running'], ['triage-1', 'Suspended']] },
    { name: 'identity', agent: 'identity-desk', tasks: [['identity-0', 'Running']] },
    { name: 'ops', agent: 'ops', tasks: [['ops-0', 'Suspended']] },
  ];
  for (const p of pools) {
    if (FLEET.pools.some((x) => x.name === p.name)) continue;
    const role = NEW_AGENTS.find((a) => a.name === p.agent).role;
    FLEET.pools.push({ name: p.name, atespace: 'default', agent: p.agent, intake: 'fw.jobs.' + p.agent, wanted: p.tasks.length, actual: p.tasks.length, ready: p.tasks.length, hash: 'rt-' + p.name, generation: 1, tasks: p.tasks.map(([name, phase]) => ({ name, phase, current: true })), gaps: [], checkedAt: now() });
    for (const [name, phase] of p.tasks) FLEET.members.push({ name: 'default/' + name, self: false, state: phase === 'Running' ? 'live' : 'suspended', lastSeen: now(), canForward: true, accessMode: 'static', agents: [{ name: p.agent, role }], active: 0, inputRequired: 0 });
  }

  const R = seedRoutines();
  for (const r of R.values()) if (r.signedOff && r.standing === 'live') writePage(`agents/${r.agent}/routines/${r.routine.name}.md`, runbook(r), 'bossmode', 'Signed off');

  const canView = (agent) => AGENTS.some((a) => a.name === agent);
  const canEdit = (agent) => (AGENTS.find((a) => a.name === agent) || {}).role === 'owner';
  const bare = ({ evidence: _e, ...rest }) => rest;
  const find = (agent, name) => {
    const r = R.get(agent + '/' + name);
    if (!r || !canView(agent)) refuse(404, `no routine ${name} of ${agent}`);
    return r;
  };
  const changed = (r) => publish('routine', { kind: 'routine', agent: r.agent, name: r.routine.name });

  on('GET', '/v1/routines', (c) => {
    const agent = c.url.searchParams.get('agent');
    const list = [...R.values()].filter((r) => canView(r.agent) && (!agent || r.agent === agent)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return { routines: list.map(bare) };
  });

  on('GET', '/v1/routines/summary', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    if (!canView(agent)) refuse(404, `no agent ${agent}`);
    return WEEKS[agent] || { runs: 0, byRoutine: 0, byAgent: 0, withPerson: 0, costUSD: { routine: 0, agent: 0 }, sentBack: 0 };
  });

  on('GET', '/v1/routines/([^/]+)/([^/]+)', (c, a, n) => find(decodeURIComponent(a), decodeURIComponent(n)));

  on('PUT', '/v1/routines/([^/]+)/([^/]+)', async (c, a, n) => {
    const agent = decodeURIComponent(a);
    const name = decodeURIComponent(n);
    if (!canView(agent)) refuse(404, `no agent ${agent}`);
    const body = await readJson(c.req);
    for (const k of Object.keys(body)) if (!['routine', 'standing', 'source'].includes(k)) refuse(400, `json: unknown field "${k}"`);
    if (!body.routine || typeof body.routine !== 'object' || !Array.isArray(body.routine.steps)) refuse(400, 'routine needs steps');
    if (!/^[a-z0-9-]{1,64}$/.test(name)) refuse(400, `invalid routine name "${name}"`);
    if ([...R.values()].filter((r) => r.agent === agent).length >= 64 && !R.has(agent + '/' + name)) refuse(409, `${agent} holds 64 routines, which is the most it takes`);
    const old = R.get(agent + '/' + name);
    const at = now();
    if (!old) {
      const standing = body.standing === 'rehearsing' && canEdit(agent) ? 'rehearsing' : 'proposed';
      const r = record(agent, { ...body.routine, name, version: 1 }, standing, { history: [{ at, by: c.person.subject, standing }], source: body.source || null, updatedAt: at });
      R.set(agent + '/' + name, r);
      changed(r);
      c.status = 201;
      return bare(r);
    }
    if (!canEdit(agent)) refuse(403, `only an owner of ${agent} can change its routines`);
    old.routine = { ...body.routine, name, version: old.routine.version + 1 };
    old.ready = false;
    old.evidence = { days: [], questions: {}, disagreements: [], sentBack: { applied: 0, agreed: 0 }, replay: null };
    if (old.standing === 'live') {
      old.standing = 'rehearsing';
      old.history.push({ at, by: c.person.subject, standing: 'rehearsing', note: 'A new version rehearses again.' });
    }
    if (body.source) old.source = body.source;
    old.updatedAt = at;
    changed(old);
    return bare(old);
  });

  on('POST', '/v1/routines/([^/]+)/([^/]+)/standing', async (c, a, n) => {
    const r = find(decodeURIComponent(a), decodeURIComponent(n));
    const body = await readJson(c.req);
    for (const k of Object.keys(body)) if (!['standing', 'note'].includes(k)) refuse(400, `json: unknown field "${k}"`);
    if (!STANDINGS.includes(body.standing)) refuse(400, `standing must be one of ${STANDINGS.join(', ')}`);
    if (!canEdit(r.agent)) refuse(403, `only an owner of ${r.agent} can move its routines`);
    const notYet = r.standing === 'rehearsing' && body.standing === 'rehearsing' && r.ready;
    const allowed = MOVES[r.standing];
    if (!notYet && !allowed.includes(body.standing)) refuse(409, `a ${r.standing} routine cannot move to ${body.standing}; the allowed moves are ${allowed.join(', ') || 'none'}`, { allowed });
    const at = now();
    const move = { at, by: c.person.subject, standing: body.standing };
    if (body.note) move.note = String(body.note).slice(0, 1024);
    r.history.push(move);
    r.standing = body.standing;
    r.updatedAt = at;
    // Not yet keeps the routine in rehearsal until it is ready again over the runs after the move.
    if (notYet || body.standing !== 'rehearsing') r.ready = false;
    if (body.standing === 'live') {
      r.signedOff = { by: c.person.subject, at };
      writePage(`agents/${r.agent}/routines/${r.routine.name}.md`, runbook(r), 'bossmode', 'Signed off by ' + c.person.subject);
    }
    changed(r);
    return bare(r);
  });
}
