// The fake routes of the quick chat: the history of a person, and the
// sample chats of alice and bob. register gets the helpers of server.mjs:
// on adds a route, refuse answers a problem, S is the state, and now is the
// time.
//
// The routes:
//   GET /v1/fleet/runs?agent=&principal=&limit=   the runs of the fleet that the caller can see, newest first,
//                                                 as {runs, total}, narrowed by agent and person
//
// The live stream of a run, GET /v1/runs/{id}/live, lives in server.mjs
// beside the turns of the agents outside a bridge, which feed it.

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';
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
  { who: ALICE, when: at(25), q: 'How do I rotate the logs of nginx on Debian?', a: 'Logrotate reads `/etc/logrotate.d/nginx` once a day. Keep 14 rotations, compress all but the newest, and send `USR1` in `postrotate`.', step: true },
  { who: ALICE, when: at(130), q: 'Summarize the release notes of 2.3 in five lines.', a: '- The fleet view shows workers.\n- Bridges close with a report.\n- The wiki keeps hearts.\n- Skills install from a marketplace.\n- The manager asks before it spends.' },
  { who: ALICE, when: daysAgo(1, 16), q: 'What does the cron role do with the hiera keys?', a: 'It reads `cron_jobs` as a list and makes one job per item, with the user root unless an item names another.', step: true },
  { who: ALICE, when: daysAgo(1, 10), q: 'Draft a reply to the platform team about the freeze.', a: '', state: 'failed', error: 'The run reached its limit of 8 turns.' },
  { who: ALICE, when: daysAgo(3, 14), q: 'Explain the difference between a handler and a task that notifies.', a: 'A handler runs once at the end of a play, however many tasks notify it.' },
  { who: ALICE, when: daysAgo(6, 11), q: 'Plan the migration of the ntp module.', a: '1. Read the manifests.\n2. List the resources.\n3. Write the plan to the wiki before any edit.' },
  { who: BOB, when: at(50), q: 'Which bridges are open?', a: 'Two: the Puppet migration and the release notes of 2.4.' },
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
    items.push({ seq: items.length + 1, time: c.when, kind: 'end', text: failed ? 'failed' : 'completed', isError: failed });
    const run = {
      id, agent: 'chat', title: c.q.replace(/[.?!]$/, ''), state: failed ? 'failed' : 'completed', input: c.q, output: c.a || undefined, error: c.error, seq: items.length,
      origin: 'http', principal: c.who, metadata: { 'fw.view': 'quickchat' }, createdAt: c.when, updatedAt: c.when, member: MEMBER,
      usage: { inputTokens: 4200 + i * 310, outputTokens: 380 + i * 40, turns: c.step ? 2 : 1, costUSD: Math.round((0.03 + i * 0.01) * 100) / 100 },
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
    const limit = Number(q.get('limit')) || 0;
    // The caller sees the runs that it started.
    const runs = [...S.runs.values()]
      .filter((r) => r.principal === c.person.subject && (!agent || r.agent === agent) && (!principal || r.principal === principal))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { runs: limit ? runs.slice(0, limit) : runs, total: runs.length };
  });
}
