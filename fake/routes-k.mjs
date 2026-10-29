// The fake routes of the Know-how place, after the package knowhow of the
// workbench (routes.go, summary.go, journal.go, access.go). register gets
// the helpers of server.mjs: on adds a route, refuse answers a problem,
// readJson reads the body, publish sends a stream event, now is the time,
// AGENTS is the sample data, and writePage writes a page of the wiki.
//
//   GET    /v1/knowhow/notes?agent=                      {"agent", "notes": [item]}: the agent notes, the notes of the person,
//                                                        and the notes of the duties for an owner or an operator
//   GET    /v1/knowhow/notes/{agent}/{scope}/{name…}     the note with text. ?principal= names a principal note.
//   PUT    /v1/knowhow/notes/{agent}/{scope}/{name…}     {"text", "ifHash", "sources"}: {"note"}, 201 for a new note, 412
//                                                        when ifHash does not match. A person changes the notes of their
//                                                        own principal as an operator, and the others as an owner.
//   DELETE /v1/knowhow/notes/{agent}/{scope}/{name…}     ?ifHash=: puts the note away, 200 {"note"}. 412 as PUT.
//   GET    /v1/knowhow/journal?agent=&limit=&before=     {"agent", "entries": [entry]}, newest first. before is the id of an entry.
//   POST   /v1/knowhow/journal/{id}/undo                 {"entry", "undone"}. 409 when a later entry touched the same note,
//                                                        or the entry was taken back already. 409 with outOfDate for a move
//                                                        to out of date, and for a note that went out of date since.
//   GET    /v1/knowhow/settings/{agent}                  {"agent", "askFirst", "review"}
//   PUT    /v1/knowhow/settings/{agent}                  {"askFirst"}, for an owner of the agent
//   GET    /v1/knowhow/waiting?agent=                    {"waiting": [change]}. Without agent, every agent that the person views.
//   POST   /v1/knowhow/waiting/{id}                      {"keep"}: {"kept", "entry"}. A change whose note changed since
//                                                        answers 409 and stays until a person drops it.
//   GET    /v1/knowhow/summary?agent=&days=7             the four numbers, split into normal runs and comparison runs, and the line
//   POST   /v1/knowhow/review/{agent}                    for an owner: {"agent", "started": false, "reason"}. The fake starts no run.
//
// An id of an entry or of a change is public: <id>-<agent in base64url>.
// The stream carries {"kind": "knowhow", "agent"} on each change.
//
// The data tells the stories of the contract. Triage asks first: two
// changes wait, a new note and a change to a note that changed since. Its
// journal holds a routine that stepped back, a note that went out of date
// after a change to its page, and a learned note whose undo meets that
// later change. Triage has 95 comparison runs, so its line compares; Identity
// desk has 6, so its line says that there are not enough yet. alice
// keeps notes of her own with triage, which she owns, and with ops, which
// she runs as an operator, and she can edit and put away both.

import { hash } from './data.mjs';

const iso = (t) => new Date(t).toISOString();
/** minsAgo is a moment some minutes back from the start of the server. */
const minsAgo = (m) => iso(Date.now() - m * 60000);

const run = (n) => '01K8KNOW' + String(n).padStart(4, '0');

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** pid makes a public id of the workbench for an entry or a change: an id that starts with its time, a dash, and the agent in base64url. */
function pid(agent, at) {
  let t = new Date(at).getTime();
  let head = '';
  for (let i = 0; i < 10; i++) {
    head = B32[t % 32] + head;
    t = Math.floor(t / 32);
  }
  let tail = '';
  for (let i = 0; i < 16; i++) tail += B32[Math.floor(Math.random() * 32)];
  return head + tail + '-' + Buffer.from(agent).toString('base64url');
}

/** subjectOf writes the subject of an entry as the workbench does: the note with the kind of its scope and its principal, or the routine. */
function subjectOf(s) {
  if (!s.note) return { routine: s.routine };
  const sc = s.scope || { kind: 'agent' };
  return sc.kind === 'principal' ? { note: s.note, scope: 'principal', principal: sc.principal } : { note: s.note, scope: 'agent' };
}

/** wired gives an entry or a change of the seed its public id and the subject of the workbench. An entry without an undo carries none. */
function wired(e) {
  const out = { ...e, id: pid(e.agent, e.at), subject: subjectOf(e.subject), by: e.by === 'front' ? '' : e.by };
  if (!out.undo) delete out.undo;
  return out;
}

/* ---------- the notes ---------- */

/** note makes a note record. Its hash is the hash of its text. */
function note(agent, scope, name, text, more = {}) {
  return { agent, scope, name, text, hash: hash(text), description: more.description || text.split(/(?<=\.)\s/)[0].slice(0, 120), by: 'review', run: '', at: minsAgo(60 * 24), sources: [], state: 'unchecked', uses: 0, ...more };
}

const AGENT = { kind: 'agent' };
const duty = (name) => ({ kind: 'principal', principal: 'duty:' + name });
const person = (subject) => ({ kind: 'principal', principal: subject });

function seedNotes() {
  const list = [
    note('triage', AGENT, 'gotchas/gitea-labels.md', 'Gitea refuses a label name with a space. Use a dash, as in team/end-user.', {
      by: 'review',
      at: minsAgo(60 * 50),
      sources: [{ ref: 'run:' + run(11) }, { ref: 'run:' + run(12) }, { ref: 'page:agents/triage/labels.md', version: 'v1' }],
      state: 'out-of-date',
      uses: 7,
      lastUsed: minsAgo(60 * 5),
      outOfDate: { since: minsAgo(60 * 3), source: 'page:agents/triage/labels.md' },
    }),
    note('triage', AGENT, 'places/team-labels.md', 'The team labels live under team/ in Gitea: team/network, team/identity, and team/endpoint.', {
      at: minsAgo(60 * 26),
      sources: [{ ref: 'run:' + run(21) }, { ref: 'item:gitea/issue/42', version: '2026-10-26T10:00:00Z' }],
      state: 'checked',
      uses: 31,
      lastUsed: minsAgo(40),
    }),
    note('triage', AGENT, 'places/priority-words.md', 'A ticket that says "nobody can work" is a p1. One that says "only me" is a p2.', {
      at: minsAgo(60 * 24 * 8),
      sources: [{ ref: 'run:' + run(31) }, { ref: 'page:runbooks/priorities.md', version: 'v3' }],
      state: 'checked',
      uses: 112,
      lastUsed: minsAgo(15),
    }),
    note('triage', AGENT, 'gotchas/old-portal.md', 'The old self-service portal answered on port 8443.', {
      by: 'agent',
      at: minsAgo(60 * 24 * 20),
      sources: [{ ref: 'run:' + run(41) }],
      state: 'resting',
      uses: 3,
      lastUsed: minsAgo(60 * 24 * 17),
    }),
    note('triage', person('alice@example.com'), 'mine/escalation.md', 'I take every p1 ticket by phone, also at night. Call +1 555 0100.', {
      by: 'person:alice@example.com',
      description: 'I take every p1 ticket by phone, also at night.',
      at: minsAgo(60 * 24 * 4),
      uses: 9,
      lastUsed: minsAgo(60 * 20),
    }),
    note('triage', duty('watch-p1-incidents'), 'incidents/servicenow-503.md', 'ServiceNow answers 503 for about a minute after 02:00 UTC. A second check a minute later passes.', {
      at: minsAgo(60 * 24 * 9),
      sources: [{ ref: 'run:' + run(51) }, { ref: 'run:' + run(52) }],
      uses: 14,
      lastUsed: minsAgo(60 * 2),
    }),
    note('ops', person('alice@example.com'), 'mine/cert-window.md', 'I renew a certificate only between 09:00 and 11:00 UTC, when the help desk is quiet.', {
      by: 'person:alice@example.com',
      description: 'I renew a certificate only between 09:00 and 11:00 UTC.',
      at: minsAgo(60 * 24 * 2),
      uses: 2,
      lastUsed: minsAgo(60 * 30),
    }),
    // An owner wrote this note of the agent through the admin token: the front records the writer as person:token.
    note('triage', AGENT, 'places/vpn-portal.md', 'The VPN portal answers only on its internal address, vpn.lab.internal, from the office network.', {
      by: 'person:token',
      at: minsAgo(60 * 6),
      state: 'unchecked',
      uses: 1,
      lastUsed: minsAgo(60 * 2),
    }),
    note('identity-desk', AGENT, 'places/mailbox-groups.md', 'A shared mailbox grants access through the group mbx-<name>, never to a person directly.', {
      at: minsAgo(60 * 24 * 3),
      sources: [{ ref: 'run:' + run(61) }, { ref: 'page:runbooks/mailboxes.md', version: 'v2' }],
      state: 'checked',
      uses: 22,
      lastUsed: minsAgo(90),
    }),
    note('identity-desk', AGENT, 'gotchas/locked-accounts.md', 'An account locked by three failed sign-ins unlocks by itself after 30 minutes.', {
      by: 'agent',
      at: minsAgo(60 * 24 * 11),
      sources: [{ ref: 'run:' + run(62) }],
      uses: 5,
      lastUsed: minsAgo(60 * 24 * 2),
    }),
    note('ops', AGENT, 'places/cert-paths.md', 'The certificates of the helpdesk live in /etc/ssl/helpdesk, one directory per host.', {
      at: minsAgo(60 * 24 * 6),
      sources: [{ ref: 'run:' + run(71) }],
      uses: 4,
      lastUsed: minsAgo(60 * 24),
    }),
  ];
  const put = note('triage', AGENT, 'gotchas/ldap-timeout.md', 'The LDAP server drops a search after 10 seconds.', { at: minsAgo(60 * 24 * 40), sources: [{ ref: 'run:' + run(81) }], state: 'put-away', uses: 2 });
  list.push(put);
  return list;
}

/* ---------- the journal ---------- */

function seedJournal(N) {
  const find = (agent, name) => N.find((n) => n.agent === agent && n.name === name);
  const at = (m) => minsAgo(m);
  /** An entry keeps prev, the note before the change, so its undo can put it back. */
  return [
    { id: 'kh-00', at: at(60 * 6), agent: 'triage', what: 'learned', subject: { note: 'places/vpn-portal.md' }, why: 'A person wrote this note.', runs: [], by: 'person:token', undo: { revision: 0 } },
    { id: 'kh-01', at: at(25), agent: 'triage', what: 'stepped-back', subject: { routine: 'reopen-a-ticket-the-requester-answered' }, why: 'A ticket that it handled came back sent back, so it rehearses again.', runs: [run(91)], by: 'front', undo: null },
    { id: 'kh-02', at: at(60 * 3), agent: 'triage', what: 'out-of-date', subject: { note: 'gotchas/gitea-labels.md' }, why: 'The page agents/triage/labels.md changed after the note was written.', runs: [], by: 'front', undo: null },
    {
      id: 'kh-03',
      at: at(60 * 26),
      agent: 'triage',
      what: 'learned',
      subject: { note: 'places/team-labels.md', scope: AGENT },
      why: 'Four runs labeled their tickets under team/, and the teams kept each label.',
      runs: [run(21), run(22), run(23), run(24)],
      by: 'review',
      undo: { revision: 1 },
      prev: null,
    },
    {
      id: 'kh-04',
      at: at(60 * 50),
      agent: 'triage',
      what: 'learned',
      subject: { note: 'gotchas/gitea-labels.md', scope: AGENT },
      why: 'Two runs failed on a label with a space and passed without it.',
      runs: [run(11), run(12)],
      by: 'review',
      undo: { revision: 1 },
      prev: null,
    },
    {
      id: 'kh-05',
      at: at(60 * 24 * 3),
      agent: 'triage',
      what: 'resting',
      subject: { note: 'gotchas/old-portal.md', scope: AGENT },
      why: 'No run used this note for 14 days.',
      runs: [],
      by: 'front',
      undo: { revision: 2 },
      prev: { ...find('triage', 'gotchas/old-portal.md'), state: 'unchecked' },
    },
    { id: 'kh-06', at: at(60 * 24 * 5), agent: 'triage', what: 'proposed', subject: { routine: 'escalate-a-vpn-outage' }, why: 'Twelve runs of the duty helpdesk-tickets took the same steps.', runs: [run(31), run(32), run(33)], by: 'front', undo: null },
    {
      id: 'kh-07',
      at: at(60 * 24 * 6),
      agent: 'triage',
      what: 'put-away',
      subject: { note: 'gotchas/ldap-timeout.md', scope: AGENT },
      why: 'No run used this note for 30 days.',
      runs: [],
      by: 'front',
      undo: { revision: 1 },
      prev: { ...find('triage', 'gotchas/ldap-timeout.md'), state: 'unchecked' },
    },
    {
      id: 'kh-08',
      at: at(60 * 24 * 9),
      agent: 'triage',
      what: 'learned',
      subject: { note: 'incidents/servicenow-503.md', scope: duty('watch-p1-incidents') },
      why: 'Two runs of the duty watch-p1-incidents failed on a 503 and passed a minute later.',
      runs: [run(51), run(52)],
      by: 'review',
      undo: { revision: 1 },
      prev: null,
    },
    { id: 'kh-11', at: at(60 * 9), agent: 'identity-desk', what: 'live', subject: { routine: 'grant-a-shared-mailbox' }, why: 'It agreed with the agent on 20 of 20 tickets, and it only reads.', runs: [], by: 'front', undo: null },
    {
      id: 'kh-12',
      at: at(60 * 24 * 3),
      agent: 'identity-desk',
      what: 'learned',
      subject: { note: 'places/mailbox-groups.md', scope: AGENT },
      why: 'Three runs granted a mailbox through its group, and each grant held.',
      runs: [run(61), run(63), run(64)],
      by: 'review',
      undo: { revision: 1 },
      prev: null,
    },
  ];
}

/* ---------- the changes that wait ---------- */

function seedWaiting(N) {
  const team = N.find((n) => n.agent === 'triage' && n.name === 'places/team-labels.md');
  return [
    {
      id: 'kw-01',
      at: minsAgo(35),
      agent: 'triage',
      what: 'learned',
      subject: { note: 'gotchas/vpn-portal.md', scope: AGENT },
      why: 'Three runs failed on the short name of the portal and passed with the full one.',
      runs: [run(101), run(102), run(103)],
      by: 'review',
      text: 'The VPN portal answers only on its full domain, vpn.corp.example.com, not on the short name vpn.',
      sources: [{ ref: 'run:' + run(101) }, { ref: 'run:' + run(102) }, { ref: 'run:' + run(103) }],
      pin: 'absent',
    },
    {
      id: 'kw-02',
      at: minsAgo(80),
      agent: 'triage',
      what: 'updated',
      subject: { note: 'places/team-labels.md', scope: AGENT },
      why: 'Two runs labeled a printer ticket team/endpoint, and the team kept both labels.',
      runs: [run(111), run(112)],
      by: 'review',
      text: team.text + ' A printer ticket goes to team/endpoint.',
      sources: team.sources,
      // The note changed after the change was made, so Keep answers 409.
      pin: 'an-older-hash',
    },
  ];
}

/* ---------- the numbers ---------- */

/**
 * The runs of the last 7 days, in line with the week of the Routines
 * place: per kind, the runs, the runs done well, the runs of a routine,
 * and the mean cost. before is the mean cost of the 7 days before.
 * compared is the count of the normal runs of the duties that held runs
 * back, which the line compares, as summary.go of the workbench does.
 */
const RUNS = {
  triage: { normal: [1817, 1653, 41, 0.0196], heldBack: [95, 78, 0, 0.021], compared: 1311, comparedWell: 1193, before: 0.0215, corrected: 3 },
  'identity-desk': { normal: [152, 146, 108, 0.0066], heldBack: [6, 5, 0, 0.022], compared: 40, comparedWell: 38, before: 0.0071, corrected: 1 },
  ops: { normal: [29, 27, 3, 0.028], heldBack: [1, 1, 0, 0.03], compared: 12, comparedWell: 11, before: 0.0281, corrected: 0 },
  migrator: { normal: [64, 51, 0, 0.41], heldBack: [0, 0, 0, 0], compared: 0, comparedWell: 0, before: 0.47, corrected: 2 },
};

/** summaryOf words the summary of an agent as summary.go does: the trend is flat within 5%, and the line compares from 20 comparison runs. */
function summaryOf(agent, days) {
  const r = RUNS[agent] || { normal: [0, 0, 0, 0], heldBack: [0, 0, 0, 0], compared: 0, comparedWell: 0, before: null, corrected: 0 };
  const split = ([runs, doneWell, byRoutine, cost]) => ({ runs, doneWell, byRoutine, costPerJobUsd: cost });
  const normal = split(r.normal);
  const heldBack = split(r.heldBack);
  const runs = normal.runs + heldBack.runs;
  const usd = runs ? (normal.costPerJobUsd * normal.runs + heldBack.costPerJobUsd * heldBack.runs) / runs : 0;
  const costPerJob = { usd, runs };
  if (r.before !== null) {
    const d = (usd - r.before) / r.before;
    Object.assign(costPerJob, { previousUsd: r.before, trend: runs === 0 ? '' : d <= -0.05 ? 'down' : d >= 0.05 ? 'up' : 'flat' });
  }
  const compare = { enough: false, heldBack: heldBack.runs, normal: r.compared, line: 'Not enough comparison runs yet.' };
  if (heldBack.runs >= 20 && r.compared > 0) {
    const without = heldBack.doneWell / heldBack.runs;
    const withIt = r.comparedWell / r.compared;
    const oneIn = Math.round((heldBack.runs + r.compared) / heldBack.runs);
    Object.assign(compare, {
      enough: true,
      oneIn,
      doneWellWithout: without,
      doneWellWith: withIt,
      line: `Comparison runs: 1 in ${oneIn}. Done well: ${Math.round(without * 100)}% without what it learned, ${Math.round(withIt * 100)}% with it.`,
    });
  }
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return {
    agent,
    days,
    since,
    costPerJob,
    doneByRoutines: { runs: normal.runs, byRoutine: normal.byRoutine, share: normal.runs ? normal.byRoutine / normal.runs : 0 },
    notesCorrected: r.corrected,
    normal,
    heldBack,
    compare,
  };
}

/* ---------- the routes ---------- */

export function register({ on, refuse, readJson, publish, now, AGENTS, writePage, S }) {
  const N = seedNotes();
  for (const [i, n] of N.entries()) n.revision = i + 1;
  const J = seedJournal(N).map(wired);
  const W = seedWaiting(N).map(wired);
  const ask = { triage: true, ops: true };

  // The page that put the note about the labels out of date: the version that the note names, then a newer one.
  writePage('agents/triage/labels.md', '# Labels of the helpdesk\n\nA label name holds no space. Use a dash, as in `team/end-user`.\n', 'grace@example.com', 'The labels of the helpdesk');
  writePage('agents/triage/labels.md', '# Labels of the helpdesk\n\nGitea 1.22 takes a label name with a space. The helpdesk still uses a dash, as in `team/end-user`.\n', 'grace@example.com', 'Gitea takes spaces now');

  const roleOf = (agent) => (AGENTS.find((a) => a.name === agent) || {}).role || '';
  const canView = (agent) => AGENTS.some((a) => a.name === agent);
  const runs = (agent) => ['owner', 'operator'].includes(roleOf(agent));
  const canEdit = (agent) => roleOf(agent) === 'owner';
  const viewAgent = (agent) => {
    if (!agent) refuse(400, 'name the agent with ?agent=');
    if (!canView(agent)) refuse(404, 'nothing that you can view has the name ' + agent);
  };
  const scopeOfSubject = (s) => (s.scope === 'principal' ? { kind: 'principal', principal: s.principal } : { kind: 'agent' });
  /** reads reports whether a person reads the notes of a scope, as access.go decides. */
  const reads = (c, agent, sc) => {
    if (sc.kind === 'agent') return true;
    if (sc.principal === c.person.subject) return true;
    return /^(duty:|spiffe:\/\/|knowhow:|workload:)/.test(sc.principal || '') && runs(agent);
  };
  /** change decides a change of the notes of a scope: their own notes with the operator role, the others with the owner role. */
  const change = (c, agent, sc) => {
    if (!reads(c, agent, sc)) refuse(404, 'nothing that you can view has the name: no note of that scope');
    if (sc.kind === 'principal' && sc.principal === c.person.subject) {
      if (!runs(agent)) refuse(403, 'a change of your own notes needs the operator role on the agent');
      return;
    }
    if (!canEdit(agent)) refuse(403, 'a change of the notes of the agent or of a Duty needs the owner role on the agent');
  };
  const sees = (c, agent, s) => !s.note || reads(c, agent, scopeOfSubject(s));
  const changeSubject = (c, agent, s) => {
    if (s.note) return change(c, agent, scopeOfSubject(s));
    if (!canEdit(agent)) refuse(403, 'a change of a routine needs the owner role on the agent');
  };
  const changed = (agent) => publish('knowhow', { kind: 'knowhow', agent });
  const brief = ({ text: _t, ...rest }) => rest;
  const item = ({ text: _t, sources, ...rest }) => ({ ...rest, sources: (sources || []).length });
  const sameNote = (a, b) => !!a.note && a.note === b.note && (a.scope || 'agent') === (b.scope || 'agent') && (a.principal || '') === (b.principal || '');
  const entry = (agent, what, subject, why, by, more = {}) => {
    const at = now();
    const e = { id: pid(agent, at), at, agent, what, subject, why, runs: [], by, ...more };
    if (!e.undo) delete e.undo;
    J.unshift(e);
    return e;
  };
  const bare = ({ prev: _p, ...e }) => e;
  const describe = (text) => text.split(/(?<=\.)\s/)[0].slice(0, 120);
  const nextRevision = () => Math.max(0, ...N.map((n) => n.revision || 0)) + 1;

  /** findNote reads the address of a note from the path and the query. A person who names no principal of a principal note means their own. */
  const findNote = (c, a, kind, raw) => {
    const agent = decodeURIComponent(a);
    const name = raw.split('/').map(decodeURIComponent).join('/');
    const principal = c.url.searchParams.get('principal') || (kind === 'principal' ? c.person.subject : '');
    viewAgent(agent);
    const sc = kind === 'agent' ? { kind } : { kind, principal };
    const n = N.find((x) => x.agent === agent && x.name === name && x.scope.kind === kind && (kind === 'agent' || x.scope.principal === principal));
    return { agent, name, sc, n };
  };

  on('GET', '/v1/knowhow/notes', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    viewAgent(agent);
    const putAway = c.url.searchParams.get('putAway') === 'true';
    return { agent, notes: N.filter((n) => n.agent === agent && reads(c, agent, n.scope) && (putAway || n.state !== 'put-away')).map(item) };
  });

  on('GET', '/v1/knowhow/notes/([^/]+)/(agent|principal)/(.+)', (c, a, kind, raw) => {
    const { n, name, agent, sc } = findNote(c, a, kind, raw);
    if (!reads(c, agent, sc) || !n) refuse(404, `no note ${name} of ${agent}`);
    return n;
  });

  on('PUT', '/v1/knowhow/notes/([^/]+)/(agent|principal)/(.+)', async (c, a, kind, raw) => {
    const { n, name, agent, sc } = findNote(c, a, kind, raw);
    const body = await readJson(c.req);
    if (typeof body.text !== 'string') refuse(400, 'the body is {"text", "ifHash", "sources", "by", "run"}, and text is missing');
    change(c, agent, sc);
    const text = body.text.trim();
    const by = 'person:' + c.person.subject;
    if (!n) {
      if (body.ifHash && body.ifHash !== 'absent') refuse(412, 'the note does not exist', { hash: '' });
      const fresh = note(agent, sc, name, text, { by, at: now(), sources: body.sources || [], revision: nextRevision() });
      N.push(fresh);
      entry(agent, 'learned', subjectOf({ note: name, scope: sc }), 'A person wrote this note.', by, { undo: { revision: 0, after: fresh.revision }, prev: null });
      changed(agent);
      c.status = 201;
      return { note: brief(fresh) };
    }
    if (body.ifHash && body.ifHash !== n.hash) refuse(412, 'This note changed in another run. View it again before you change it.', { hash: n.hash });
    if (text === n.text) return { note: brief(n) };
    const prev = { ...n };
    Object.assign(n, { text, hash: hash(text), description: describe(text), at: now(), by, sources: Array.isArray(body.sources) ? body.sources : n.sources, revision: nextRevision() });
    entry(agent, 'updated', subjectOf({ note: name, scope: sc }), 'A person changed this note.', by, { undo: { revision: prev.revision, after: n.revision }, prev });
    changed(agent);
    return { note: brief(n) };
  });

  on('DELETE', '/v1/knowhow/notes/([^/]+)/(agent|principal)/(.+)', (c, a, kind, raw) => {
    const { n, name, agent, sc } = findNote(c, a, kind, raw);
    change(c, agent, sc);
    if (!n || n.state === 'put-away') refuse(404, `no note ${name} of ${agent}`);
    const cond = c.url.searchParams.get('ifHash');
    if (cond && cond !== n.hash) refuse(412, 'This note changed in another run. View it again before you change it.', { hash: n.hash });
    const prev = { ...n };
    Object.assign(n, { state: 'put-away', revision: nextRevision() });
    entry(agent, 'put-away', subjectOf({ note: name, scope: sc }), 'A person put this note away.', 'person:' + c.person.subject, { undo: { revision: prev.revision, after: n.revision }, prev });
    changed(agent);
    return { note: brief(n) };
  });

  on('GET', '/v1/knowhow/journal', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    viewAgent(agent);
    const limit = Number(c.url.searchParams.get('limit') || 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) refuse(400, 'limit is a whole number from 1 to 500');
    const before = c.url.searchParams.get('before') || '';
    const list = J.filter((e) => e.agent === agent).sort((x, y) => (x.at < y.at ? 1 : -1));
    let start = 0;
    if (before) {
      const i = list.findIndex((e) => e.id === before);
      if (i < 0) refuse(400, `before names no entry of the agent ${agent}`);
      start = i + 1;
    }
    return { agent, entries: list.slice(start).filter((e) => sees(c, agent, e.subject)).slice(0, limit).map(bare) };
  });

  on('POST', '/v1/knowhow/journal/([^/]+)/undo', (c, raw) => {
    const e = J.find((x) => x.id === decodeURIComponent(raw));
    if (!e || !canView(e.agent) || !sees(c, e.agent, e.subject)) refuse(404, 'no entry of the journal has the id ' + raw);
    changeSubject(c, e.agent, e.subject);
    if (e.undoneBy) refuse(409, 'this change was taken back already');
    const ood = 'an undo cannot make the agent trust a note over its source again; edit the note or put it away';
    if (e.what === 'out-of-date') refuse(409, ood, { outOfDate: true });
    if (!e.undo) refuse(400, 'this entry cannot be taken back');
    if (!e.subject.note) refuse(409, 'the fake takes back no move of a routine');
    const later = J.find((x) => x !== e && x.agent === e.agent && x.at > e.at && sameNote(x.subject, e.subject));
    if (later && later.what === 'out-of-date' && !later.undoneBy) refuse(409, ood, { outOfDate: true });
    if (later) refuse(409, `a later change touched it: the note ${e.subject.note}`);
    const sc = scopeOfSubject(e.subject);
    const n = N.find((x) => x.agent === e.agent && x.name === e.subject.note && x.scope.kind === sc.kind && (x.scope.principal || '') === (sc.principal || ''));
    if (e.prev) {
      if (n) Object.assign(n, e.prev, { revision: nextRevision() });
      else N.push({ ...e.prev });
    } else if (n) Object.assign(n, { state: 'put-away', revision: nextRevision() });
    const out = entry(e.agent, 'undone', e.subject, 'A person took back a change of ' + e.at.slice(0, 10) + '.', 'person:' + c.person.subject);
    e.undoneBy = out.id;
    changed(e.agent);
    return { entry: bare(out), undone: bare(e) };
  });

  // Who turned the switch last, and when: person:<subject>, so the static token is person:token.
  const switchedBy = {};
  const settings = (agent) => ({ agent, askFirst: !!ask[agent], ...(switchedBy[agent] || {}), review: { on: true, agent: 'review', every: '24h0m0s' } });

  on('POST', '/v1/knowhow/review/([^/]+)', (c, raw) => {
    const agent = decodeURIComponent(raw);
    viewAgent(agent);
    if (!canEdit(agent)) refuse(403, 'a start of the after-work review needs the owner role on the agent');
    return { agent, started: false, reason: `The agent ${agent} has no open candidate. Nothing to review now.` };
  });

  on('GET', '/v1/knowhow/settings/([^/]+)', (c, raw) => {
    const agent = decodeURIComponent(raw);
    viewAgent(agent);
    return settings(agent);
  });

  on('PUT', '/v1/knowhow/settings/([^/]+)', async (c, raw) => {
    const agent = decodeURIComponent(raw);
    const body = await readJson(c.req);
    if (typeof body.askFirst !== 'boolean') refuse(400, 'the body is {"askFirst": true} or {"askFirst": false}');
    viewAgent(agent);
    if (!canEdit(agent)) refuse(403, 'the switch of an agent needs the owner role on the agent');
    ask[agent] = body.askFirst;
    switchedBy[agent] = { by: 'person:' + c.person.subject, at: new Date().toISOString() };
    changed(agent);
    return settings(agent);
  });

  const outOf = ({ pin: _p, ...w }) => w;
  // The notes that wait for a person, for the one count and the items of GET /v1/inbox (knowhow.Service.WaitingFor).
  if (S) S.notesFor = (c) => W.filter((w) => canView(w.agent) && sees(c, w.agent, w.subject)).map(outOf);

  on('GET', '/v1/knowhow/waiting', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    if (agent) {
      viewAgent(agent);
      return { agent, waiting: W.filter((w) => w.agent === agent && sees(c, agent, w.subject)).map(outOf) };
    }
    // Without an agent, the changes of every agent that the person can view (knowhow/routes.go, waitingAll).
    return { waiting: W.filter((w) => canView(w.agent) && sees(c, w.agent, w.subject)).map(outOf) };
  });

  on('POST', '/v1/knowhow/waiting/([^/]+)', async (c, raw) => {
    const body = await readJson(c.req);
    if (typeof body.keep !== 'boolean') refuse(400, 'the body is {"keep": true} or {"keep": false}');
    const i = W.findIndex((x) => x.id === decodeURIComponent(raw));
    if (i < 0 || !canView(W[i].agent) || !sees(c, W[i].agent, W[i].subject)) refuse(404, 'no change waits with the id ' + raw);
    const w = W[i];
    changeSubject(c, w.agent, w.subject);
    const sc = scopeOfSubject(w.subject);
    const n = N.find((x) => x.agent === w.agent && x.name === w.subject.note && x.scope.kind === sc.kind && (x.scope.principal || '') === (sc.principal || ''));
    const pinned = n && n.state !== 'put-away' ? n.hash : 'absent';
    // The note changed after the change was made: 409, and the change stays until a person drops it.
    if (body.keep && w.pin !== pinned) refuse(409, `a later change touched it: the note ${w.subject.note} changed since this change waits`);
    W.splice(i, 1);
    let out = null;
    if (body.keep) {
      const prev = n ? { ...n } : null;
      if (n) Object.assign(n, { text: w.text, hash: hash(w.text), description: describe(w.text), at: now(), by: w.by, sources: w.sources || n.sources, revision: nextRevision() });
      else N.push(note(w.agent, sc, w.subject.note, w.text, { by: w.by, at: now(), sources: w.sources || [], revision: nextRevision() }));
      out = entry(w.agent, w.what === 'updated' ? 'updated' : 'learned', w.subject, w.why, w.by, { runs: w.runs, undo: { revision: prev ? prev.revision : 0 }, prev });
    }
    changed(w.agent);
    return { kept: body.keep, entry: out ? bare(out) : null };
  });

  on('GET', '/v1/knowhow/summary', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    viewAgent(agent);
    const days = Number(c.url.searchParams.get('days') || 7);
    if (!Number.isInteger(days) || days < 1 || days > 30) refuse(400, 'days is a whole number from 1 to 30');
    return summaryOf(agent, days);
  });
}
