// The fake routes of the Know-how place, after section 5.3 of
// docs/KNOWHOW.md of the kernel. register gets the helpers of server.mjs:
// on adds a route, refuse answers a problem, readJson reads the body,
// publish sends a stream event, now is the time, AGENTS is the sample
// data, and writePage writes a page of the wiki.
//
//   GET    /v1/knowhow/notes?agent=                      {"notes": [item]}: the agent notes, the notes of the person, and
//                                                        the notes of the duties for an owner or an operator of the agent
//   GET    /v1/knowhow/notes/{agent}/{scope}/{name…}     one record with text. ?principal= names a principal note.
//   PUT    /v1/knowhow/notes/{agent}/{scope}/{name…}     {"text", "ifHash", "sources"}: 412 when ifHash does not match.
//                                                        A person changes only the notes that they wrote.
//   DELETE /v1/knowhow/notes/{agent}/{scope}/{name…}     ?ifHash=: puts the note away, 204. 412 as PUT.
//   GET    /v1/knowhow/journal?agent=&limit=&before=     {"entries": [entry]}, newest first. before is a time.
//   POST   /v1/knowhow/journal/{id}/undo                 takes one entry back. 409 when a later entry touched the same note.
//   GET    /v1/knowhow/settings/{agent}                  {"askFirst"}
//   PUT    /v1/knowhow/settings/{agent}                  {"askFirst"}, for an owner of the agent
//   GET    /v1/knowhow/waiting?agent=                    {"waiting": [change]}. Without agent, every agent of the person.
//   POST   /v1/knowhow/waiting/{id}                      {"keep"}. A change whose note changed since answers 409, and the
//                                                        fake drops it, because it no longer applies.
//   GET    /v1/knowhow/summary?agent=&days=7             the four numbers, split into normal and held-back runs
//
// The stream carries {"kind": "knowhow", "agent"} on each change.
//
// The data tells the stories of the contract. Triage asks first: two
// changes wait, a new note and a change to a note that changed since. Its
// journal holds a routine that stepped back, a note that went out of date
// after a change to its page, and a learned note whose undo meets that
// later change. Triage held back 95 runs, so its line compares; Identity
// desk held back 6, so its line says that there are not enough yet. alice
// wrote one note of her own, which she can edit and put away.

import { hash } from './data.mjs';

const iso = (t) => new Date(t).toISOString();
/** minsAgo is a moment some minutes back from the start of the server. */
const minsAgo = (m) => iso(Date.now() - m * 60000);

const run = (n) => '01K8KNOW' + String(n).padStart(4, '0');

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

/** The figures of the last 7 days, in line with the week of the Routines place. */
const SUMMARIES = {
  triage: { normal: { runs: 1817, doneWell: 1653, costPerJob: 0.0196, byRoutines: 41 }, heldBack: { runs: 95, doneWell: 78, costPerJob: 0.021, byRoutines: 0 }, costPerJobBefore: 0.0215, notesCorrected: 3 },
  'identity-desk': { normal: { runs: 152, doneWell: 146, costPerJob: 0.0066, byRoutines: 108 }, heldBack: { runs: 6, doneWell: 5, costPerJob: 0.022, byRoutines: 0 }, costPerJobBefore: 0.0071, notesCorrected: 1 },
  ops: { normal: { runs: 29, doneWell: 27, costPerJob: 0.028, byRoutines: 3 }, heldBack: { runs: 1, doneWell: 1, costPerJob: 0.03, byRoutines: 0 }, costPerJobBefore: 0.03, notesCorrected: 0 },
  migrator: { normal: { runs: 64, doneWell: 51, costPerJob: 0.41, byRoutines: 0 }, heldBack: { runs: 0, doneWell: 0, costPerJob: 0, byRoutines: 0 }, costPerJobBefore: 0.47, notesCorrected: 2 },
};
const NONE = { normal: { runs: 0, doneWell: 0, costPerJob: 0, byRoutines: 0 }, heldBack: { runs: 0, doneWell: 0, costPerJob: 0, byRoutines: 0 }, costPerJobBefore: null, notesCorrected: 0 };

/* ---------- the routes ---------- */

export function register({ on, refuse, readJson, publish, now, AGENTS, writePage }) {
  const N = seedNotes();
  const J = seedJournal(N);
  const W = seedWaiting(N);
  const ask = { triage: true, ops: true };

  // The page that put the note about the labels out of date: the version that the note names, then a newer one.
  writePage('agents/triage/labels.md', '# Labels of the helpdesk\n\nA label name holds no space. Use a dash, as in `team/end-user`.\n', 'grace@example.com', 'The labels of the helpdesk');
  writePage('agents/triage/labels.md', '# Labels of the helpdesk\n\nGitea 1.22 takes a label name with a space. The helpdesk still uses a dash, as in `team/end-user`.\n', 'grace@example.com', 'Gitea takes spaces now');

  const roleOf = (c, agent) => (AGENTS.find((a) => a.name === agent) || {}).role || '';
  const canView = (agent) => AGENTS.some((a) => a.name === agent);
  const canEdit = (agent) => (AGENTS.find((a) => a.name === agent) || {}).role === 'owner';
  const viewAgent = (agent) => {
    if (!agent) refuse(400, 'name the agent with ?agent=');
    if (!canView(agent)) refuse(404, `no agent ${agent}`);
  };
  /** sees reports whether a person reads a note: an agent note, a note of their own, or a note of a duty for an owner or an operator. */
  const sees = (c, n) => {
    if (n.scope.kind === 'agent') return true;
    const p = n.scope.principal || '';
    if (p === c.person.subject) return true;
    return p.startsWith('duty:') && ['owner', 'operator'].includes(roleOf(c, n.agent));
  };
  const changed = (agent) => publish('knowhow', { kind: 'knowhow', agent });
  const item = ({ text: _t, sources, outOfDate: _o, run: _r, ...rest }) => ({ ...rest, sources: (sources || []).length });
  const sameNote = (a, b) => !!a && !!b && a.note === b.note && (!a.scope || !b.scope || (a.scope.kind === b.scope.kind && (a.scope.principal || '') === (b.scope.principal || '')));
  const entry = (agent, what, subject, why, by, more = {}) => {
    const e = { id: 'kh-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: now(), agent, what, subject, why, runs: [], by, undo: null, ...more };
    J.unshift(e);
    return e;
  };
  const bare = ({ prev: _p, ...e }) => e;

  /** findNote reads the address of a note from the path and the query, and answers 404 for a note the person cannot read. */
  const findNote = (c, a, kind, raw) => {
    const agent = decodeURIComponent(a);
    const name = raw.split('/').map(decodeURIComponent).join('/');
    const principal = c.url.searchParams.get('principal') || '';
    if (kind === 'principal' && !principal) refuse(400, 'a principal note needs ?principal=');
    viewAgent(agent);
    const n = N.find((x) => x.agent === agent && x.name === name && x.scope.kind === kind && (kind === 'agent' || x.scope.principal === principal));
    return { agent, name, principal, n: n && sees(c, n) ? n : null };
  };

  on('GET', '/v1/knowhow/notes', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    viewAgent(agent);
    return { notes: N.filter((n) => n.agent === agent && sees(c, n)).map(item) };
  });

  on('GET', '/v1/knowhow/notes/([^/]+)/(agent|principal)/(.+)', (c, a, kind, raw) => {
    const { n, name, agent } = findNote(c, a, kind, raw);
    if (!n) refuse(404, `no note ${name} of ${agent}`);
    return n;
  });

  on('PUT', '/v1/knowhow/notes/([^/]+)/(agent|principal)/(.+)', async (c, a, kind, raw) => {
    const { n, name, agent, principal } = findNote(c, a, kind, raw);
    const body = await readJson(c.req);
    const text = String(body.text || '').trim();
    if (!text) refuse(400, 'text is empty');
    if (!n) {
      // A new note of the person, in their own scope.
      if (body.ifHash !== 'absent') refuse(412, 'the note does not exist; send ifHash absent for a new note');
      if (kind === 'principal' && principal !== c.person.subject) refuse(403, 'a person writes only the notes of their own principal');
      if (kind === 'agent' && !canEdit(agent)) refuse(403, `only an owner of ${agent} writes its agent notes`);
      const fresh = note(agent, kind === 'agent' ? AGENT : person(principal), name, text, { by: 'person:' + c.person.subject, at: now(), sources: body.sources || [] });
      N.push(fresh);
      entry(agent, 'learned', { note: name, scope: fresh.scope }, 'A person wrote this note.', 'person:' + c.person.subject, { undo: { revision: 1 }, prev: null });
      changed(agent);
      c.status = 201;
      return fresh;
    }
    if (n.by !== 'person:' + c.person.subject) refuse(403, 'a person changes only the notes that they wrote');
    if (body.ifHash !== n.hash) refuse(412, 'This note changed in another run. View it again before you change it.', { hash: n.hash });
    const prev = { ...n };
    Object.assign(n, { text, hash: hash(text), description: text.split(/(?<=\.)\s/)[0].slice(0, 120), at: now(), sources: Array.isArray(body.sources) ? body.sources : n.sources });
    entry(agent, 'updated', { note: name, scope: n.scope }, 'A person changed this note.', 'person:' + c.person.subject, { undo: { revision: 2 }, prev });
    changed(agent);
    return n;
  });

  on('DELETE', '/v1/knowhow/notes/([^/]+)/(agent|principal)/(.+)', (c, a, kind, raw) => {
    const { n, name, agent } = findNote(c, a, kind, raw);
    if (!n || n.state === 'put-away') refuse(404, `no note ${name} of ${agent}`);
    if (n.by !== 'person:' + c.person.subject) refuse(403, 'a person puts away only the notes that they wrote');
    if (c.url.searchParams.get('ifHash') !== n.hash) refuse(412, 'This note changed in another run. View it again before you change it.', { hash: n.hash });
    const prev = { ...n };
    n.state = 'put-away';
    entry(agent, 'put-away', { note: name, scope: n.scope }, 'A person put this note away.', 'person:' + c.person.subject, { undo: { revision: 2 }, prev });
    changed(agent);
    c.status = 204;
    return undefined;
  });

  on('GET', '/v1/knowhow/journal', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    viewAgent(agent);
    const limit = Math.min(500, Math.max(1, Number(c.url.searchParams.get('limit')) || 50));
    const before = c.url.searchParams.get('before') || '';
    const list = J.filter((e) => e.agent === agent && (!before || e.at < before) && (!e.subject.scope || e.subject.scope.kind === 'agent' || sees(c, { agent, scope: e.subject.scope })));
    return { entries: list.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, limit).map(bare) };
  });

  on('POST', '/v1/knowhow/journal/([^/]+)/undo', (c, raw) => {
    const e = J.find((x) => x.id === decodeURIComponent(raw));
    if (!e || !canView(e.agent)) refuse(404, 'no entry ' + raw);
    if (!canEdit(e.agent)) refuse(403, `only an owner of ${e.agent} takes back its changes`);
    if (!e.undo || !e.subject.note) refuse(409, 'this entry cannot be taken back');
    const later = J.find((x) => x !== e && x.agent === e.agent && x.at > e.at && sameNote(x.subject, e.subject));
    if (later) refuse(409, `a later change touched the note ${e.subject.note}: ${later.id}`, { later: later.id });
    const n = N.find((x) => x.agent === e.agent && x.name === e.subject.note && sameNote({ note: x.name, scope: x.scope }, e.subject));
    if (e.prev) {
      if (n) Object.assign(n, e.prev);
      else N.push({ ...e.prev });
    } else if (n) n.state = 'put-away';
    e.undo = null;
    entry(e.agent, 'undone', { note: e.subject.note, scope: e.subject.scope }, 'A person took back a change of ' + e.at.slice(0, 10) + '.', 'person:' + c.person.subject);
    changed(e.agent);
    return { ok: true };
  });

  on('GET', '/v1/knowhow/settings/([^/]+)', (c, raw) => {
    const agent = decodeURIComponent(raw);
    viewAgent(agent);
    return { askFirst: !!ask[agent] };
  });

  on('PUT', '/v1/knowhow/settings/([^/]+)', async (c, raw) => {
    const agent = decodeURIComponent(raw);
    viewAgent(agent);
    if (!canEdit(agent)) refuse(403, `only an owner of ${agent} turns the switch`);
    const body = await readJson(c.req);
    if (typeof body.askFirst !== 'boolean') refuse(400, 'askFirst must be true or false');
    ask[agent] = body.askFirst;
    changed(agent);
    return { askFirst: ask[agent] };
  });

  on('GET', '/v1/knowhow/waiting', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    if (agent) viewAgent(agent);
    return { waiting: W.filter((w) => (agent ? w.agent === agent : canView(w.agent))).map(({ pin: _p, sources: _s, ...w }) => w) };
  });

  on('POST', '/v1/knowhow/waiting/([^/]+)', async (c, raw) => {
    const i = W.findIndex((x) => x.id === decodeURIComponent(raw));
    if (i < 0 || !canView(W[i].agent)) refuse(404, 'no waiting change ' + raw);
    const w = W[i];
    if (!canEdit(w.agent)) refuse(403, `only an owner of ${w.agent} decides what it keeps`);
    const body = await readJson(c.req);
    if (typeof body.keep !== 'boolean') refuse(400, 'keep must be true or false');
    const n = N.find((x) => x.agent === w.agent && x.name === w.subject.note);
    const pinned = n && n.state !== 'put-away' ? n.hash : 'absent';
    if (body.keep && w.pin !== pinned) {
      // The note changed after the change was made, so it no longer applies, and the fake drops it.
      W.splice(i, 1);
      changed(w.agent);
      refuse(409, `the note ${w.subject.note} changed since this change was made`, { hash: pinned });
    }
    W.splice(i, 1);
    if (body.keep) {
      const prev = n ? { ...n } : null;
      if (n) Object.assign(n, { text: w.text, hash: hash(w.text), description: w.text.split(/(?<=\.)\s/)[0].slice(0, 120), at: now(), by: w.by, sources: w.sources || n.sources });
      else N.push(note(w.agent, w.subject.scope || AGENT, w.subject.note, w.text, { by: w.by, at: now(), sources: w.sources || [] }));
      entry(w.agent, w.what === 'updated' ? 'updated' : 'learned', w.subject, w.why, w.by, { runs: w.runs, undo: { revision: prev ? 2 : 1 }, prev });
    }
    changed(w.agent);
    return { ok: true };
  });

  on('GET', '/v1/knowhow/summary', (c) => {
    const agent = c.url.searchParams.get('agent') || '';
    viewAgent(agent);
    const days = Math.min(90, Math.max(1, Number(c.url.searchParams.get('days')) || 7));
    return { agent, days, ...(SUMMARIES[agent] || NONE) };
  });
}
