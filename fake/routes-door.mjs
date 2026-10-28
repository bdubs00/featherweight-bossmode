// The fake routes of the Tasks place: the door that reads back what a
// person needs done before anything starts, and the board of the tasks of
// the person.
//
//   POST /v1/tasks/plan   {"words", "agent"?, "tell"?}: the plan in words, and in start the
//                         record that Start sends to a route that exists already:
//                         PUT /v1/duties/{name}, POST /v1/bridges, or POST /v1/runs?member=.
//                         The plan never names a cost. The page refuses Start until the
//                         person types the most that a run can cost.
//   GET  /v1/tasks        {"tasks": [<card>]}: the board, each card in one column of
//                         needs, working, next, or done.
//
// The fake reads the words with rules, not with a model, so the same words
// always give the same plan. A schedule comes from the grammar of the
// duties (routes-e.mjs). The agent comes from a table of topics, and a
// person can pick another. A real front could ask a small model to fill the
// slots that the rules leave empty, and the readback still goes before any
// start.

import { parseSay, readbackOf, nextOf, zoneOk } from './routes-e.mjs';

const DAY = 24 * 60 * 60_000;

/** The topics that name an agent, in the order of the test. */
const TOPICS = [
  [/\b(competitors?|competition|market|launch|e-?mail|newsletter|blog|campaign|announcement|press)\b/, 'writer'],
  [/\b(drift|hosts?|servers?|nodes?|uptime|certificates?)\b/, 'ops'],
  [/\b(tickets?|helpdesk)\b/, 'triage'],
  [/\b(backups?|restores?)\b/, 'backup'],
  [/\b(migrat\w*|puppet|ansible|modules?)\b/, 'migrator'],
  [/\b(release notes|changelog|merged)\b/, 'scribe'],
  [/\b(molecule|lint)\b/, 'tester'],
  [/\b(passwords?|grants?)\b/, 'identity-desk'],
  [/\b(summar\w*|sum up|digest|report|shipped|announced)\b/, 'writer'],
];

/** A question for now: the quick chat answers it. */
const QUESTION = /^(what|how|why|who|which|when|where|explain|is|are|can|does|do)\b|\?$/;

/** What each agent costs a run, from the sample history of the fake: the least and the most in the last 30 days. */
const COSTS = {
  writer: [0.04, 0.22], reviewer: [0.03, 0.12], ops: [0.02, 0.15], migrator: [0.3, 1.8], tester: [0.05, 0.2],
  triage: [0.01, 0.05], scribe: [0.03, 0.14], backup: [0.05, 0.21], chat: [0.01, 0.08], 'identity-desk': [0.02, 0.09],
};

/** The rules of each agent that ask a person first, in the words of the readback. */
const ASKS = {
  migrator: ['Before it runs git push'],
  backup: ['Before it restores a backup'],
  ops: ['Before it changes a host'],
};

const REVIEW = /\b(review\w*|proofread|before it goes out|check (?:my|the) draft)\b/;
/** Words that ask the person to see the work before it leaves. */
const SIGNOFF = /\b(before it goes out|before it is sent|show me|let me (?:see|check)|my ok|my approval)\b/;
const TEAM = /\b(split|across|in parallel|several agents|\d+ agents|team)\b/;
const FOUND = /\b(drift\w*|only when|watch|alert|anything (?:new|changed)|something (?:changed|drifted))\b/;

/** slug makes a name of a duty from words: a-z, 0-9, and hyphens, at most 40 characters. */
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'task';

/** titleOf makes a short title of the words: the first clause, without the schedule, with a capital. */
function titleOf(words, said) {
  let t = words.replace(/\s+/g, ' ').trim();
  if (said) t = t.replace(new RegExp(said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
  t = t.replace(/\b(every|each) (night|morning|evening|week|month)\b/i, '').replace(/\b(nightly|weekly|monthly|daily)\b/i, '');
  t = t.replace(/^[\s,.;:-]+/, '').split(/[.;]|, (?:and )?(?:then|tell|and tell|show)\b/)[0].trim();
  t = t.replace(/[\s,]+$/, '');
  if (t.length > 64) t = t.slice(0, 64).replace(/\s+\S*$/, '').replace(/\s+(and|or|the|of|to|a|an|with|for|from)$/i, '');
  return t ? t[0].toUpperCase() + t.slice(1) : 'A task';
}

/**
 * whenOf finds the schedule in the words, with the grammar of the duties,
 * or null. Each, nightly, weekly, and monthly read as every. Night is 2 AM,
 * morning 9 AM, and evening 6 PM, unless the words name a time. A week is
 * Monday, and a month is its first day.
 */
function whenOf(words, zone) {
  const t = (' ' + words.toLowerCase() + ' ')
    .replace(/\beach\b/g, 'every')
    .replace(/\bnightly\b/g, 'every night')
    .replace(/\bweekly\b/g, 'every week')
    .replace(/\bmonthly\b/g, 'every month')
    .replace(/\bdaily\b/g, 'every day');
  const starts = [...t.matchAll(/\b(every|on the|weekdays|hourly)\b/g)].map((m) => m.index);
  for (const i of starts) {
    const words = t.slice(i).split(/[,.;:!?]/)[0].trim().split(/\s+/);
    for (let n = words.length; n >= 1; n--) {
      const said = words.slice(0, n).join(' ');
      let phrase = said;
      const part = /^every (night|morning|evening)\b/.exec(phrase);
      if (part) phrase = phrase.replace(part[0], 'every day') + (/ at /.test(phrase) ? '' : { night: ' at 2am', morning: ' at 9am', evening: ' at 6pm' }[part[1]]);
      phrase = phrase.replace(/^every week\b/, 'every monday').replace(/^every month\b/, 'on the first of the month');
      const r = parseSay(phrase, zone);
      if (r.schedule) return { said, schedule: r.schedule };
    }
  }
  return null;
}

/** perMonth is about how many runs a schedule starts in 30 days. */
function perMonth(s) {
  const times = (s.times || ['09:00']).length;
  const days = (s.days || []).length || 7;
  const span = (between) => (between ? (Date.parse('1970-01-01T' + between[1] + ':00Z') - Date.parse('1970-01-01T' + between[0] + ':00Z')) / 3_600_000 : 24);
  switch (s.repeat) {
    case 'daily':
      return 30 * times;
    case 'weekdays':
      return 22 * times;
    case 'weekly':
      return Math.round((4.3 * days * times) / (s.everyWeeks || 1));
    case 'monthly':
      return times;
    case 'hourly':
      return Math.round(span(s.between) * 4.3 * days);
    default: {
      const m = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(s.every || '');
      const mins = m ? (+m[1] || 0) * 60 + (+m[2] || 0) : 60;
      return Math.round(((span(s.between) * 60) / mins) * 4.3 * days);
    }
  }
}

const money = (n) => '$' + n.toFixed(2);
const nameOf = (faces, a) => (faces.get(a) && faces.get(a).displayName) || a;

export function register({ on, refuse, readJson, S, FLEET, port }) {
  const zoneOf = (c) => {
    const z = String(c.req.headers['x-time-zone'] || '');
    return z && zoneOk(z) ? z : 'UTC';
  };
  /** inner calls a route of this server as the person who called the door. */
  const inner = async (c, path) => {
    const r = await fetch('http://127.0.0.1:' + port + path, { headers: { Authorization: c.req.headers.authorization || '', 'X-Time-Zone': zoneOf(c) } });
    return r.ok ? r.json() : null;
  };
  /** memberOf names a worker of the fleet that runs an agent, for a run that starts once. */
  const memberOf = (agent) => {
    const m = FLEET.members.find((x) => x.state === 'live' && x.agents.some((a) => a.name === agent)) || FLEET.members.find((x) => x.agents.some((a) => a.name === agent));
    return m ? m.name : '';
  };
  /** basisOf says what the runs of an agent cost: the sample of the fake and its runs that report a cost. */
  const basisOf = (agent) => {
    const seen = [...S.runs.values()].filter((r) => r.agent === agent && r.usage && r.usage.costUSD > 0).map((r) => r.usage.costUSD);
    const [lo, hi] = COSTS[agent] || [0.02, 0.2];
    const all = [lo, hi, ...seen];
    return { lo: Math.min(...all), hi: Math.max(...all), n: 12 + seen.length };
  };

  on('POST', '/v1/tasks/plan', async (c) => {
    const body = await readJson(c.req);
    for (const k of Object.keys(body)) if (!['words', 'agent', 'tell'].includes(k)) refuse(400, `json: unknown field "${k}"`);
    const words = String(body.words || '').replace(/\s+/g, ' ').trim();
    if (!words) refuse(400, 'Say what you need done.', { problems: ['words: Say what you need done.'] });
    if (words.length > 4000) refuse(400, 'Say it in at most 4000 characters.', { problems: ['words: Say it in at most 4000 characters.'] });
    const w = words.toLowerCase();
    const zone = zoneOf(c);
    const faces = S.faces;
    const known = (a) => faces.has(a) && a !== 'manager';

    const when = whenOf(words, zone);
    const review = REVIEW.test(w);
    const split = TEAM.test(w);
    const topic = TOPICS.find(([re]) => re.test(w));
    const question = !when && !split && !review && QUESTION.test(w);
    let agent = body.agent && known(String(body.agent)) ? String(body.agent) : question ? 'chat' : topic ? topic[1] : '';
    const kind = when ? 'repeat' : split || (review && agent && agent !== 'reviewer') ? 'team' : 'once';
    if (!agent) agent = kind === 'once' ? 'chat' : review ? 'reviewer' : '';
    const title = titleOf(words, when && when.said);
    const problems = [];

    // Who: the agent that does it, and for a team the seats that the words ask for.
    const who = [];
    if (agent) who.push({ agent, name: nameOf(faces, agent), does: kind === 'team' && split ? 'takes a share' : 'does it' });
    let seats = [];
    if (kind === 'team') {
      if (split) {
        const m = /\b(\d+|two|three|four|five|several) agents\b/.exec(w);
        const n = m ? { two: 2, three: 3, four: 4, five: 5, several: 3 }[m[1]] || Math.min(Math.max(+m[1], 2), 6) : 3;
        seats = Array.from({ length: n }, (_, i) => ({ handle: agent + '-' + (i + 1), agent, task: `Take part ${i + 1} of ${n} of the work. Say in the channel which part you take before you start.` }));
        who[0].count = n;
        if (agent !== 'reviewer') {
          seats.push({ handle: 'reviewer', agent: 'reviewer', task: 'Review each finished part against its source, and say what must change.' });
          who.push({ agent: 'reviewer', name: nameOf(faces, 'reviewer'), does: 'checks each part' });
        }
        if (agent === 'migrator') {
          seats.push({ handle: 'tester', agent: 'tester', task: 'Test each finished part, and say whether it passes.' });
          who.push({ agent: 'tester', name: nameOf(faces, 'tester'), does: 'tests each part' });
        }
      } else {
        seats = [
          { handle: agent, agent, task: words },
          { handle: 'reviewer', agent: 'reviewer', task: 'Review the draft of ' + agent + '. Say what must change, and say when it is ready.' },
        ];
        who.push({ agent: 'reviewer', name: nameOf(faces, 'reviewer'), does: 'checks it' });
      }
    } else if (review && agent !== 'reviewer') {
      who.push({ agent: 'reviewer', name: nameOf(faces, 'reviewer'), does: 'checks it' });
    }
    if (!agent) problems.push('agent: No agent fits these words. Pick one.');

    // What it costs: the plan never names a limit. It says what the runs cost, and the person types the limit.
    const basis = agent ? basisOf(agent) : null;
    const cost = {
      basis: basis ? `Runs of ${nameOf(faces, agent)} cost ${money(basis.lo)} to ${money(basis.hi)} in the last 30 days.` + (kind === 'team' ? ' The team stops at your limit.' : '') : '',
      per: kind === 'team' ? 'bridge' : 'run',
      runsPerMonth: when ? perMonth(when.schedule) : 1,
    };

    // What it asks you, what it never bothers you with, and when you hear of it.
    const asks = [];
    for (const x of who) for (const a of ASKS[x.agent] || []) if (!asks.includes(a)) asks.push(a);
    if (SIGNOFF.test(w)) asks.push('Before it goes out: you read the final text and say it is ready');
    asks.push('When it is not sure what you mean. The question waits for you');
    const quiet = ['While it works'];
    if (kind === 'team') quiet.push('While the agents pass the work between them');
    const tell = ['each', 'found', 'failures'].includes(body.tell) ? body.tell : FOUND.test(w) && kind === 'repeat' ? 'found' : 'each';
    if (tell === 'found') quiet.push('When it finds nothing: one line in Done, and no message');
    if (tell === 'failures') quiet.push('When a run works: its result waits in Done');

    // Where the result lands.
    const base = agent ? `${agent}/${slug(title)}` : 'tasks/' + slug(title);
    const result = kind === 'repeat' ? 'A page in the wiki for each run, and a card in Done' : kind === 'team' ? 'A report page in the wiki when the work ends, and a card in Done' : agent === 'chat' ? 'The answer, in Chat' : 'The answer, in Done';

    // What the system cannot do for these words, said before the start.
    const gaps = [];
    if (/\be-?mail\b/.test(w) && /\b(send|goes out|go out)\b/.test(w)) gaps.push('No agent here can send email. After your OK, you send it.');
    if (/\b(competitors?|web ?sites?|online)\b/.test(w)) gaps.push(`${nameOf(faces, agent || 'writer')} reads only the sites that its workers may reach. The person who runs the server adds a site.`);
    if (agent && !faces.has(agent)) gaps.push(`No agent ${agent} exists yet.`);

    // The record that Start sends to a route that exists.
    let start;
    let open = '';
    const message = words + (kind === 'repeat' ? `\n\nWrite the result to the wiki page ${base}/{date}.md. When you find nothing, say so in one line.` : '');
    if (kind === 'repeat') {
      // A free name, so Start never changes a duty that exists.
      const taken = new Set((((await inner(c, '/v1/duties')) || {}).duties || []).map((d) => d.name));
      let name = slug(title);
      for (let i = 2; taken.has(name); i++) name = slug(title).slice(0, 36) + '-' + i;
      start = {
        duty: {
          name, title, agent,
          when: { schedule: when.schedule },
          do: { ask: { message } },
          limits: { budget: {}, overlap: 'skip', catchUp: '6h' },
          whileAway: { decider: 'nobody', timeout: '24h', then: 'deny' },
          notify: { failure: ['owner'], needsYou: ['owner'], result: tell === 'failures' ? [] : ['owner'], resultWhen: tell === 'found' ? 'found' : 'always' },
        },
      };
      open = '#duties/' + name;
    } else if (kind === 'team') {
      start = { bridge: { title, goal: words, placement: 'queue', members: seats, caps: { maxTurns: 400 }, delegation: { report: true } } };
    } else {
      start = { run: { member: agent === 'chat' ? 'default/manager-0' : memberOf(agent), body: { agent, input: words, title, metadata: agent === 'chat' ? { 'fw.view': 'quickchat' } : { 'fw.view': 'task' } } } };
    }
    return {
      words, kind, title, who,
      others: [...faces.values()].filter((f) => known(f.agent) && f.agent !== 'chat').map((f) => ({ agent: f.agent, name: f.displayName })),
      when: when ? { said: when.said, readback: readbackOf(when.schedule), next: nextOf(when.schedule, 3) } : { readback: 'Now, once.', next: [] },
      cost, asks, quiet, tell, result, gaps, problems, start, open,
    };
  });

  on('GET', '/v1/tasks', async (c) => {
    const [duties, inbox, bridges] = await Promise.all([inner(c, '/v1/duties'), inner(c, '/v1/inbox'), inner(c, '/v1/bridges')]);
    const me = c.person.subject;
    const cards = [];
    for (const it of (inbox && inbox.items) || []) {
      const decide = it.kind === 'approval' || it.kind === 'question';
      cards.push({ id: 'i:' + it.kind + ':' + (it.duty || it.run), kind: 'item', column: 'needs', title: it.text, agents: [it.agent], status: it.kind === 'paused' ? 'paused' : it.kind === 'failure' ? 'failed' : 'needs you', at: it.since, open: decide || !it.duty ? '#activity' : '#duties/' + encodeURIComponent(it.duty), detail: it.duty || '' });
    }
    for (const b of (bridges && bridges.bridges) || []) {
      const full = S.bridges.get(b.id);
      const agents = full ? [...new Set(full.members.filter((m) => !m.fired).map((m) => m.agent))] : [];
      if (b.state === 'open') cards.push({ id: 'b:' + b.id, kind: 'bridge', column: b.needsYou ? 'needs' : 'working', title: b.title, agents, status: b.needsYou ? 'needs you' : 'working', at: b.lastAt || b.createdAt, open: '#bridge/' + encodeURIComponent(b.id), detail: b.memberCount + ' agents' });
      else if (Date.now() - Date.parse(b.closedAt || b.createdAt) < 7 * DAY) cards.push({ id: 'b:' + b.id, kind: 'bridge', column: 'done', title: b.title, agents, status: 'done', at: b.closedAt || b.createdAt, open: '#bridge/' + encodeURIComponent(b.id) });
    }
    const named = new Set(cards.map((x) => x.id));
    for (const d of (duties && duties.duties) || []) {
      const last = d.state && d.state.lastRun;
      if (!d.paused && d.next && d.next.length) cards.push({ id: 'd:' + d.name, kind: 'duty', column: 'next', title: d.title || d.name, agents: [d.agent], status: 'scheduled', at: d.next[0], open: '#duties/' + encodeURIComponent(d.name), detail: d.readback });
      if (last && last.state === 'completed' && Date.now() - Date.parse(last.at) < 7 * DAY && !named.has('i:failure:' + d.name)) {
        cards.push({ id: 'r:' + d.name + ':' + last.at, kind: 'duty', column: 'done', title: last.title || d.title || d.name, agents: [d.agent], status: 'done', at: last.at, open: last.run ? '#duties/' + encodeURIComponent(d.name) + '/run/' + encodeURIComponent(last.run) : '#duties/' + encodeURIComponent(d.name), cost: last.costUSD });
      }
      if (last && ['running', 'queued'].includes(last.state)) cards.push({ id: 'w:' + d.name, kind: 'duty', column: 'working', title: d.title || d.name, agents: [d.agent], status: 'working', at: last.at, open: '#duties/' + encodeURIComponent(d.name) });
    }
    for (const r of S.runs.values()) {
      if (r.principal !== me || (r.metadata && r.metadata['workbench.duty'])) continue;
      const view = r.metadata && r.metadata['fw.view'];
      if (view !== 'task' && view !== 'quickchat') continue;
      const open = view === 'quickchat' ? '#chat/' + encodeURIComponent(r.id) : '#fleet/' + encodeURIComponent(r.agent);
      if (['queued', 'running'].includes(r.state)) cards.push({ id: 'run:' + r.id, kind: 'run', column: 'working', title: r.title, agents: [r.agent], status: 'working', at: r.updatedAt, open });
      else if (r.state === 'input-required') cards.push({ id: 'run:' + r.id, kind: 'run', column: 'needs', title: r.title, agents: [r.agent], status: 'needs you', at: r.updatedAt, open });
      else if (Date.now() - Date.parse(r.updatedAt) < 7 * DAY) cards.push({ id: 'run:' + r.id, kind: 'run', column: 'done', title: r.title, agents: [r.agent], status: r.state === 'failed' ? 'failed' : 'done', at: r.updatedAt, open, cost: r.usage && r.usage.costUSD });
    }
    // Newest first in every column, and the next start first in Coming up.
    cards.sort((a, b) => (a.column === 'next' ? Date.parse(a.at) - Date.parse(b.at) : Date.parse(b.at) - Date.parse(a.at)));
    return { tasks: cards };
  });
}
