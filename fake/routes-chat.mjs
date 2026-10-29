// The fake routes of the quick chat: the history of a person, and the
// sample chats of alice and bob. register gets the helpers of server.mjs:
// on adds a route, refuse answers a problem, S is the state, and now is the
// time.
//
// The routes:
//   GET /v1/fleet/runs?agent=&principal=&state=&limit=   the runs of the fleet that the caller can see, newest first,
//                                                        as {runs, total}, narrowed by agent, person, and state
//
// The live stream of a run, GET /v1/runs/{id}/live, lives in server.mjs
// beside the turns of the agents outside a bridge, which feed it.

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';
/** A person of Cloudflare Access: the subject is an id, and the board names her by the name beside it. */
const DANA = 'fd1e8a14-ac12-5a00-b4d6-bb6e50d15c10';
const MEMBER = 'default/manager-0';

/** at is an ISO time some minutes before the start of the server. */
const T0 = Date.now();
const at = (min) => new Date(T0 - min * 60_000).toISOString();
/** daysAgo is an ISO time at an hour of a day before today. */
const daysAgo = (d, hour) => {
  const x = new Date(T0);
  x.setDate(x.getDate() - d);
  x.setHours(hour, 12, 0, 0);
  return x.toISOString();
};

/** The sample chats: the question, the answer, the state, when, and whether a step came first. */
const CHATS = [
  { who: ALICE, when: at(25), q: 'Which handler reloads nginx after a change of its site?', a: '`Reload nginx`. Each task that writes the site notifies it, and it runs once at the end of the play.', step: true },
  { who: ALICE, when: at(130), q: 'Summarize the release notes of 2.3 in five lines.', a: '- The fleet view shows workers.\n- Bridges close with a report.\n- The wiki keeps hearts.\n- Skills install from a marketplace.\n- The manager asks before it spends.', up: true },
  { who: ALICE, when: daysAgo(1, 16), q: 'What does the cron role do with the hiera keys?', a: 'It reads `cron_jobs` as a list and makes one job per item, with the user root unless an item names another.', step: true },
  // The chat stopped at its limit of 8 turns, as the kernel words it. Continue with more room gives it 8 more.
  { who: ALICE, when: daysAgo(1, 10), q: 'Draft a reply to the platform team about the freeze.', a: '', state: 'failed', error: 'budget exceeded: maxTurns', turns: 8 },
  // A run that stopped at its limit of tool calls ran its checks of done after its final report, and they passed.
  { who: ALICE, when: at(40), q: 'Collect the open ports of web-1 and web-2 into reports/ports.md.', a: 'I reached my limit of tool calls. reports/ports.md lists the ports of web-1; web-2 is not in it yet.', state: 'failed', error: 'budget exceeded: maxToolCalls', turns: 6, done: { state: 'checked', attempt: 1, attempts: 1, checks: [{ name: 'the report is saved', tool: 'files', passed: true }] } },
  { who: ALICE, when: daysAgo(3, 14), q: 'Explain the difference between a handler and a task that notifies.', a: 'A handler runs once at the end of a play, however many tasks notify it.' },
  { who: ALICE, when: daysAgo(6, 11), q: 'Plan the migration of the ntp module.', a: '1. Read the manifests.\n2. List the resources.\n3. Write the plan to the wiki before any edit.' },
  { who: BOB, when: at(50), q: 'Which bridges are open?', a: 'Two: the Puppet migration and the release notes of 2.4.' },
  // The manager asked for Dana, so the card says Manager for Dana Reyes, never her id.
  { who: DANA, when: at(70), origin: 'manager', q: 'Write Ansible playbooks to detect CPU crypto miners.', a: 'The playbooks are in the wiki under runbooks/miners.md.' },
];

export function register({ on, S }) {
  CHATS.forEach((c, i) => {
    const id = 'run-chat-' + (i + 1);
    const items = [{ seq: 1, time: c.when, kind: 'user', text: c.q, who: c.who }];
    if (c.step) {
      items.push({ seq: 2, time: c.when, kind: 'tool', tool: 'recall', callId: 'r' + i, input: { query: c.q } });
      items.push({ seq: 3, time: c.when, kind: 'result', tool: 'recall', callId: 'r' + i, text: '1 note' });
    }
    const failed = c.state === 'failed';
    if (c.a) items.push({ seq: items.length + 1, time: c.when, kind: 'assistant', text: c.a });
    items.push({ seq: items.length + 1, time: c.when, kind: 'end', text: failed ? 'failed' : 'completed', isError: failed, ...(c.error ? { detail: c.error } : {}) });
    const run = {
      id, agent: 'chat', title: c.q.replace(/[.?!]$/, ''), state: failed ? 'failed' : 'completed', input: c.q, output: c.a || undefined, error: c.error, seq: items.length,
      // alice gave the summary of 2.3 a thumb up, so its card is done and accepted.
      ...(c.up ? { reactions: { up: 1 } } : {}),
      ...(c.done ? { done: c.done } : {}),
      origin: c.origin || 'http', principal: c.who, metadata: { 'fw.view': 'quickchat' }, createdAt: c.when, updatedAt: c.when, member: MEMBER,
      usage: { inputTokens: 4200 + i * 310, outputTokens: 380 + i * 40, turns: c.turns || (c.step ? 2 : 1), costUSD: Math.round((0.03 + i * 0.01) * 100) / 100 },
      resolved: { model: 'model-large', tools: ['files', 'recall', 'memory', 'clock', 'front.pages_*'], skills: ['wiki-writer', 'docs/search-docs'] },
    };
    S.runs.set(id, run);
    S.transcripts.set(id, items);
    S.results.set(id, { runId: id, title: run.title, agent: 'chat', status: failed ? 'failed' : 'ready', summary: c.a, error: c.error, started: c.when, changed: c.when, next: [] });
  });

  on('GET', '/v1/fleet/runs', (c) => {
    const q = c.url.searchParams;
    const agent = q.get('agent') || '';
    const principal = q.get('principal') || '';
    const state = (q.get('state') || '').toLowerCase();
    const limit = Number(q.get('limit')) || 0;
    // The state active keeps every run that is not finished, as the filter of the kernel does.
    const inState = (r) => !state || (state === 'active' ? !['completed', 'failed', 'canceled'].includes(r.state) : r.state === state);
    // The caller sees the runs that it started.
    const runs = [...S.runs.values()]
      .filter((r) => r.principal === c.person.subject && (!agent || r.agent === agent) && (!principal || r.principal === principal) && inState(r))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { runs: limit ? runs.slice(0, limit) : runs, total: runs.length };
  });
}
