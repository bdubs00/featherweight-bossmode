// The fake archive of the runs: conversations whose worker was replaced
// (section 11.3 of the Packages plan of 2026-10-25). The front answers
// them from its archive with "archived": true, in GET /v1/fleet/runs and
// GET /v1/runs/{id}, and a message to one answers 409. register gets the
// helpers of server.mjs: S is the state.
//
// alice has four archived conversations: two with the manager, one with
// migrator, and one quick chat. One conversation with the manager still
// worked when its worker was replaced.

const ALICE = 'alice@example.com';

/** The sentence of the 409 of a message to an archived run, as the front says it. */
export const ARCHIVED_REFUSAL = 'The worker of this conversation was replaced, so the conversation is read-only. Start a new one.';

/** daysAgo is an ISO time at an hour of a day before today. */
const T0 = Date.now();
const daysAgo = (d, hour) => {
  const x = new Date(T0);
  x.setDate(x.getDate() - d);
  x.setHours(hour, 5, 0, 0);
  return x.toISOString();
};

/** The archived conversations: the agent, the worker that held it, the question, the answer, the state, when, and the metadata. */
const ARCHIVED = [
  { id: 'run-archived-manager-1', agent: 'manager', member: 'default/manager-0', when: daysAgo(2, 9), q: 'Which workers slept last night?', a: 'All three workers of `crew` slept from 01:10 to 06:40. Nothing waited for them.' },
  { id: 'run-archived-manager-2', agent: 'manager', member: 'default/manager-0', when: daysAgo(2, 15), q: 'Open a bridge to review the logrotate role.', a: '', state: 'running' },
  { id: 'run-archived-migrator', agent: 'migrator', member: 'default/crew-0', when: daysAgo(3, 11), q: 'Lint roles/cron with ansible-lint and fix what it finds.', a: 'Two warnings, both fixed: a task without a name, and a shell call that the module `cron` replaces.' },
  { id: 'run-archived-chat', agent: 'chat', member: 'default/manager-0', when: daysAgo(4, 10), q: 'What is a handler in Ansible?', a: 'A task that runs only when another task notifies it, once at the end of the play.', metadata: { 'fw.view': 'quickchat' } },
];

export function register({ S }) {
  for (const c of ARCHIVED) {
    const items = [{ seq: 1, time: c.when, kind: 'user', text: c.q, who: ALICE }];
    if (c.a) items.push({ seq: 2, time: c.when, kind: 'assistant', text: c.a });
    if (!c.state) items.push({ seq: items.length + 1, time: c.when, kind: 'end', text: 'completed' });
    const run = {
      id: c.id, agent: c.agent, title: c.q.replace(/[.?!]$/, ''), state: c.state || 'completed', input: c.q, output: c.a || undefined, seq: items.length,
      origin: 'http', principal: ALICE, metadata: c.metadata || {}, createdAt: c.when, updatedAt: c.when, member: c.member, archived: true,
    };
    S.runs.set(c.id, run);
    S.transcripts.set(c.id, items);
    S.results.set(c.id, { runId: c.id, title: run.title, agent: c.agent, status: c.state ? 'working' : 'ready', summary: c.a, started: c.when, changed: c.when, next: [] });
  }
}
