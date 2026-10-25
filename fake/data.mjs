// The sample data of the fake server: two bridges, one with five members in
// five presences and a channel of forty entries, a manager conversation, a
// fleet with workers for five agents, a wiki of eight pages, and a face for
// every agent.

import crypto from 'node:crypto';
import { identicon, FOX, MANAGER } from './faces.mjs';

export const ALICE = 'alice@example.com';
export const BOB = 'bob@example.com';

export const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

/** minutesAgo is an ISO time some minutes before the start of the server. */
const T0 = Date.now();
export const minutesAgo = (m) => new Date(T0 - m * 60_000).toISOString();

export const AGENTS = [
  { name: 'migrator', description: 'Moves a Puppet module to an Ansible role.', role: 'owner', displayName: 'Migrator', tagline: 'Turns manifests into roles, one module at a time.' },
  { name: 'reviewer', description: 'Reviews a change against its source and the style guide.', role: 'owner', displayName: 'Reviewer', tagline: 'Reads every line twice.' },
  { name: 'tester', description: 'Runs molecule and the lint checks of a role.', role: 'operator', displayName: 'Tester', tagline: 'Green or it did not happen.' },
  { name: 'writer', description: 'Writes the notes of a migration in the wiki.', role: 'operator', displayName: 'Writer', tagline: 'Plain words for the next person.' },
  { name: 'scribe', description: 'Drafts release notes from the merged changes.', role: 'operator', displayName: 'Scribe', tagline: 'What changed, for whom, and why.' },
  { name: 'backup', description: 'Keeps the backups of the cluster and checks that each one restores.', role: 'operator', displayName: 'Backup Keeper', tagline: 'A backup counts once it restores.' },
  { name: 'manager', description: 'Helps the operator run the fleet.', role: 'operator', displayName: 'Manager', tagline: 'Reads before it acts. Asks before it spends.' },
  { name: 'chat', description: 'Answers the questions of one person, with the tools that the person picks.', role: 'operator', displayName: 'Chat', tagline: 'Asks back when a question is not clear.' },
];

export function seedFaces() {
  const faces = new Map();
  for (const a of AGENTS) {
    const custom = a.name === 'reviewer' ? FOX : a.name === 'manager' ? MANAGER : '';
    const svg = custom || identicon(a.name);
    faces.set(a.name, { agent: a.name, displayName: a.displayName, tagline: a.tagline, svg, hash: hash(svg + a.displayName + a.tagline), custom: !!custom });
  }
  return faces;
}

const CRON_YAML = `---
- name: Install cron
  ansible.builtin.package:
    name: cron
    state: present

- name: Keep the cron service running
  ansible.builtin.service:
    name: cron
    state: started
    enabled: true

- name: Place the jobs of hiera
  ansible.builtin.cron:
    name: "{{ item.name }}"
    user: "{{ item.user | default('root') }}"
    job: "{{ item.command }}"
    minute: "{{ item.minute | default('*') }}"
  loop: "{{ cron_jobs }}"
`;

const NGINX_YAML = `---
- name: Install nginx
  ansible.builtin.package:
    name: nginx
    state: present

- name: Write the site configuration
  ansible.builtin.template:
    src: site.conf.j2
    dest: /etc/nginx/sites-available/{{ nginx_site }}.conf
  notify: Reload nginx
`;

/** item builds one transcript item. */
function item(seq, minutes, kind, fields = {}) {
  return { seq, time: minutesAgo(minutes), kind, ...fields };
}

/**
 * memberRun builds the run, the transcript, the result, and the files of
 * one member, from the shape of its presence.
 */
function memberRun({ id, agent, handle, bridge, task, shape, start }) {
  const files = new Map();
  const items = [];
  let seq = 1;
  const add = (kind, fields, m) => items.push(item(seq++, m, kind, fields));
  add('user', { text: task, who: ALICE }, start);
  add('assistant', { text: `I read the bridge plan and \`index.md\` first. Then I work on: ${task.toLowerCase()}.` }, start - 1);
  add('tool', { tool: 'bash', callId: 'c1', input: { command: 'ls modules/' + (handle.includes('2') ? 'nginx' : 'cron') + '/manifests' } }, start - 2);
  add('result', { tool: 'bash', callId: 'c1', text: 'init.pp\nconfig.pp\nservice.pp' }, start - 2);
  add('tool', { tool: 'bash', callId: 'c2', input: { command: 'cat modules/cron/manifests/init.pp' } }, start - 3);
  add('result', { tool: 'bash', callId: 'c2', text: "class cron (\n  Hash $jobs = {},\n) {\n  package { 'cron': ensure => installed }\n}" }, start - 3);
  const path = handle.includes('2') ? 'roles/nginx/tasks/main.yml' : agent === 'writer' ? 'docs/migration.md' : 'roles/cron/tasks/main.yml';
  const text = handle.includes('2') ? NGINX_YAML : agent === 'writer' ? '# Migration notes\n\nDraft.\n' : CRON_YAML;
  add('tool', { tool: 'files', callId: 'c3', input: { op: 'create', path } }, start - 4);
  add('file', { tool: 'files', callId: 'c3', path, text: 'created', size: text.length }, start - 4);
  add('result', { tool: 'files', callId: 'c3', text: 'Created ' + path + '.' }, start - 4);
  files.set(path, { path, op: 'created', size: text.length, mediaType: 'text/yaml', text });
  const run = {
    id,
    agent,
    title: task,
    state: 'running',
    input: task,
    seq: 0,
    origin: 'http',
    principal: ALICE,
    metadata: { 'fw.batch': 'bridge:' + bridge, 'fw.bridge.member': handle },
    createdAt: minutesAgo(start),
    updatedAt: minutesAgo(start - 5),
    member: 'default/crew-' + (handle.length % 3),
    usage: { turns: 7, toolCalls: 4, costUSD: 0.14 },
    reactions: { up: 0, down: 0, heart: 0 },
  };
  const result = {
    runId: id,
    title: task,
    agent,
    status: 'working',
    files: [{ path, op: 'created', size: text.length, seq: seq - 2 }],
    steps: [
      { seq: 3, tool: 'bash', text: 'Ran "ls modules/cron/manifests"', done: true },
      { seq: 5, tool: 'bash', text: 'Ran "cat modules/cron/manifests/init.pp"', done: true },
      { seq: 7, tool: 'files', text: 'Created ' + path, done: true },
    ],
    started: run.createdAt,
    changed: run.updatedAt,
    next: [],
  };
  switch (shape) {
    case 'working':
      run.activity = { turn: 7, tool: 'bash', callId: 'c4', phrase: 'Ran "ansible-lint roles/cron"', since: minutesAgo(1) };
      break;
    case 'needs-you': {
      const command = 'git push origin migrate/nginx';
      add('tool', { tool: 'bash', callId: 'c4', input: { command } }, start - 6);
      add('ask', { id: 'ap-' + id, tool: 'bash', callId: 'c4', input: { command }, detail: 'rule: ask bash: git push*' }, start - 6);
      run.state = 'input-required';
      run.pending = { id: 'ap-' + id, tool: 'bash', callId: 'c4', input: { command }, reason: 'rule: ask bash: git push*', requestedAt: minutesAgo(start - 6) };
      result.status = 'needs-you';
      result.pending = { id: 'ap-' + id, tool: 'bash', label: 'Run command', reason: 'rule: ask bash: git push*', effect: `Runs "${command}".`, input: { command } };
      result.next = [{ kind: 'decide', label: 'Run command' }];
      break;
    }
    case 'idle':
    case 'asleep': {
      const out = shape === 'idle'
        ? 'I reviewed **roles/cron**. It matches the manifest, with two notes:\n\n1. The role keeps `root` as the default user, as hiera does.\n2. `minute` defaults to `*`. The manifest had no default, so this is a change. I suggest `0`.'
        : 'Molecule passed for **roles/cron** on Debian 12 and Ubuntu 24.04.\n\n```\nPLAY RECAP\ninstance : ok=4 changed=3 failed=0\n```';
      add('assistant', { text: out }, start - 8);
      add('end', { text: 'completed' }, start - 8);
      run.state = 'completed';
      run.output = out;
      run.activity = null;
      result.status = 'ready';
      result.summary = out;
      result.next = [{ kind: 'reply', label: 'Reply' }];
      break;
    }
    case 'error': {
      add('note', { text: 'The run reached its limit of 40 turns.', isError: true }, start - 9);
      add('end', { text: 'failed', isError: true, detail: 'budget: turns' }, start - 9);
      run.state = 'failed';
      run.error = 'The run reached its limit of 40 turns.';
      run.activity = null;
      result.status = 'failed';
      result.error = run.error;
      result.limits = ['Stopped at the limit of 40 turns.'];
      result.next = [{ kind: 'retry', label: 'Try again' }];
      break;
    }
  }
  run.seq = items[items.length - 1].seq;
  return { run, items, result, files };
}

/** seed builds the whole state of the fake server. */
/**
 * The calls that the manager can wait on with FAKE_ASK, one per kind of
 * plan of a decision card: a bridge to open, a page to write, a task to
 * hand off, a package to install, and a tool that the page does not know.
 */
export const MANAGER_ASKS = {
  bridge_open: {
    text: 'Split the runbooks of the new roles across two writers and a reviewer.',
    tool: 'front.bridge_open',
    reason: 'rule: ask destructive',
    input: {
      title: 'Runbooks for the new roles',
      // A long goal, as the manager writes one: the card shows its start, and it names a bridge by its title and its id, and pages by their paths.
      goal: 'Write a runbook in the wiki for each Ansible role of the migration: cron, nginx, and logrotate. Each runbook says how to deploy the role, how to check it, and how to roll it back. Builds on the open bridge "Migrate the remaining Puppet modules" (br-puppet), which wrote modules/cron.md and modules/nginx.md. The reviewer reads each runbook against its role before the bridge closes, and the writers keep the house style of runbooks/ansible-style.md.',
      placement: 'queue',
      members: [
        { handle: 'writer-3', agent: 'writer', task: 'Write runbooks/cron.md and runbooks/nginx.md from the roles and the notes of the migration' },
        { handle: 'writer-4', agent: 'writer', task: 'Write runbooks/logrotate.md from the role and its molecule tests' },
        { handle: 'checker', agent: 'reviewer', task: 'Review each runbook against its role, and ask for a fix where a step is missing' },
      ],
    },
  },
  pages_write: {
    text: 'Write down the plan for the freeze in the wiki.',
    tool: 'front.pages_write',
    reason: 'rule: ask front.pages_write',
    input: {
      path: 'releases/2.4/freeze.md',
      summary: 'The plan of the freeze of 2.4',
      text: '---\ntitle: The freeze of 2.4\n---\n# The freeze of 2.4\n\nThe freeze starts on Friday at noon.\nMerge what is green by Thursday.\nTag the release on Monday, after the checks pass again.\nA change after noon on Friday needs a second reviewer.\nThe writer keeps the notes of each exception.\n',
    },
  },
  spawn_task: {
    text: 'Find out why the molecule run of nginx is slow.',
    tool: 'spawn_task',
    reason: 'rule: ask spawn_task',
    input: { agent: 'tester', input: 'Time each step of the molecule run of roles/nginx on Debian 12, find the three slowest, and say how to make each faster. Return a short table and the commands that you ran.', max_turns: 20 },
  },
  env: {
    text: 'Lint the new roles before the review.',
    tool: 'env',
    reason: 'rule: ask env: command=add',
    input: { command: 'add', manager: 'python', package: 'ansible-lint' },
  },
  create_issue: {
    text: 'File an issue for the flaky idempotence check.',
    tool: 'github.create_issue',
    reason: 'rule: ask destructive',
    input: {
      repo: 'bdubs00/govuk-puppet-migration',
      title: 'The idempotence check of roles/nginx fails one run in five',
      body: 'The second converge of molecule changes /etc/nginx/sites-available/default when the template sorts its keys in another order.',
      labels: ['flaky', 'nginx'],
      milestone: { title: '2.4', due: '2026-10-30' },
    },
  },
};

export function seed(ask = '') {
  const runs = new Map();
  const transcripts = new Map();
  const results = new Map();
  const files = new Map();
  const keep = (x) => {
    runs.set(x.run.id, x.run);
    transcripts.set(x.run.id, x.items);
    results.set(x.run.id, x.result);
    for (const [p, f] of x.files) files.set(x.run.id + '|' + p, f);
  };

  // Bridge one: five members, five presences.
  const b1 = 'br-puppet';
  const seats1 = [
    { handle: 'migrator-1', agent: 'migrator', pool: 'crew', task: 'Migrate the cron module to an Ansible role', presence: 'working' },
    { handle: 'migrator-2', agent: 'migrator', pool: 'crew', task: 'Migrate the nginx module to an Ansible role', presence: 'needs-you' },
    { handle: 'reviewer', agent: 'reviewer', pool: 'crew', task: 'Review each role against its Puppet manifest', presence: 'idle' },
    { handle: 'tester', agent: 'tester', pool: 'crew', task: 'Run molecule for each role', presence: 'asleep' },
    { handle: 'writer', agent: 'writer', pool: 'crew', task: 'Write the migration notes in the wiki', presence: 'error' },
  ];
  const members1 = seats1.map((s, i) => {
    const id = 'run-' + s.handle;
    const x = memberRun({ id, agent: s.agent, handle: s.handle, bridge: b1, task: s.task, shape: s.presence, start: 120 - i * 2 });
    keep(x);
    return { handle: s.handle, agent: s.agent, pool: s.pool, task: s.task, runs: [id], fired: false, muted: false, presence: s.presence, activity: x.run.activity || null };
  });

  // The backup keeper works on a run outside any bridge, so its one worker is busy.
  const nightly = 'run-backup-nightly';
  runs.set(nightly, { id: nightly, agent: 'backup', title: 'Check the nightly backup of jucs-k3s', state: 'running', input: 'Check the nightly backup of jucs-k3s', seq: 4, origin: 'http', principal: ALICE, metadata: {}, createdAt: minutesAgo(9), updatedAt: minutesAgo(1), member: 'default/backup-0', usage: { turns: 3, toolCalls: 2, costUSD: 0.03 }, reactions: { up: 0, down: 0, heart: 0 } });
  transcripts.set(nightly, [item(1, 9, 'user', { text: 'Check the nightly backup of jucs-k3s', who: ALICE })]);
  results.set(nightly, { runId: nightly, title: 'Check the nightly backup of jucs-k3s', agent: 'backup', status: 'working', started: minutesAgo(9), changed: minutesAgo(1), next: [] });

  // Bridge two: release notes, with a question that waits.
  const b2 = 'br-notes';
  const scribe = memberRun({ id: 'run-scribe', agent: 'scribe', handle: 'scribe', bridge: b2, task: 'Draft the release notes of 2.4 from the merged changes', shape: 'working', start: 50 });
  const schema = { type: 'object', properties: { audience: { type: 'string', title: 'Audience', enum: ['operators', 'developers', 'both'], enumNames: ['Operators', 'Developers', 'Both'] } }, required: ['audience'] };
  scribe.run.state = 'input-required';
  scribe.run.activity = null;
  scribe.run.pending = { id: 'q-scribe', tool: 'ask_user', input: { question: 'Who reads these notes first?' }, reason: 'Who reads these notes first?', schema, requestedAt: minutesAgo(12) };
  scribe.items.push(item(scribe.items.length + 1, 12, 'ask', { id: 'q-scribe', tool: 'ask_user', schema, detail: 'Who reads these notes first?' }));
  scribe.run.seq = scribe.items.length;
  scribe.result.status = 'needs-you';
  scribe.result.pending = { id: 'q-scribe', tool: 'ask_user', label: 'Answer', question: true, reason: 'Who reads these notes first?', schema };
  keep(scribe);
  const rev2 = memberRun({ id: 'run-reviewer-2', agent: 'reviewer', handle: 'reviewer-2', bridge: b2, task: 'Check each note against its pull request', shape: 'idle', start: 48 });
  keep(rev2);
  const members2 = [
    { handle: 'scribe', agent: 'scribe', pool: 'crew', task: 'Draft the release notes of 2.4 from the merged changes', runs: ['run-scribe'], fired: false, muted: false, presence: 'needs-you', activity: null },
    { handle: 'reviewer-2', agent: 'reviewer', pool: 'crew', task: 'Check each note against its pull request', runs: ['run-reviewer-2'], fired: false, muted: false, presence: 'idle', activity: null },
  ];

  const base = {
    operator: ALICE,
    state: 'open',
    placement: 'queue',
    closedAt: null,
    delegation: { approve: false, budget: false, members: false, report: true },
    caps: { maxMessages: 2000, maxFanoutPerMinute: 30, maxPairMessages: 6 },
  };
  const bridges = new Map([
    [b1, { ...base, id: b1, title: 'Migrate the remaining Puppet modules', goal: 'Migrate the Puppet modules cron and nginx to Ansible roles, review them, test them with molecule, and write the notes.', createdAt: minutesAgo(125), manager: { member: 'default/manager-0', run: 'run-manager-1' }, members: members1 }],
    [b2, { ...base, id: b2, title: 'Release notes for 2.4', goal: 'Draft the release notes of 2.4 for the people who run the fleet.', createdAt: minutesAgo(55), manager: null, members: members2 }],
  ]);

  const channels = new Map([
    [b1, channelOne(b1)],
    [b2, channelTwo(b2)],
  ]);
  const reads = new Map([
    [b1 + '|' + ALICE, 37],
    [b2 + '|' + ALICE, 5],
  ]);

  // The manager conversation of alice.
  const mItems = [
    item(1, 40, 'user', { text: 'What is the fleet doing right now?', who: ALICE }),
    item(2, 40, 'tool', { tool: 'front.fleet', callId: 'm1', input: {} }),
    item(3, 40, 'result', { tool: 'front.fleet', callId: 'm1', text: '2 pools, 4 Tasks' }),
    item(4, 39, 'assistant', { text: 'The fleet has **2 pools** and **4 Tasks**:\n\n- `crew` runs migrator, with 3 Tasks. Two are up and one sleeps.\n- `manager` runs me, on one Task.\n\nOne bridge is open: *Migrate the remaining Puppet modules*. **migrator-2** waits for you to allow a `git push`.' }),
    item(5, 39, 'end', { text: 'completed' }),
    item(6, 30, 'user', { text: 'Open a bridge for the release notes of 2.4, with scribe and a reviewer.', who: ALICE }),
    item(7, 30, 'tool', {
      tool: 'front.bridge_open',
      callId: 'm2',
      input: {
        title: 'Release notes for 2.4',
        goal: 'Draft the release notes of 2.4 for the people who run the fleet.',
        members: [
          { handle: 'scribe', agent: 'scribe', task: 'Draft the release notes of 2.4 from the merged changes' },
          { handle: 'reviewer-2', agent: 'reviewer', task: 'Check each note against its pull request' },
        ],
      },
    }),
    item(8, 30, 'ask', { id: 'ap-m2', tool: 'front.bridge_open', callId: 'm2', detail: 'rule: ask front.bridge_open' }),
    item(9, 29, 'decided', { id: 'ap-m2', text: 'allow', who: ALICE }),
    item(10, 29, 'result', { tool: 'front.bridge_open', callId: 'm2', text: `Opened the bridge br-notes "Release notes for 2.4" for ${ALICE} with 2 members, placement queue. Follow it with bridge_read (bridge br-notes).` }),
    item(11, 29, 'assistant', { text: 'The bridge is open: `br-notes`. **scribe** drafts the notes, and **reviewer-2** checks each one against its pull request. Both read `index.md` first.' }),
    item(12, 29, 'end', { text: 'completed' }),
  ];
  // With FAKE_ASK, the conversation goes on and waits for a decision on one call of the manager.
  const asked = MANAGER_ASKS[ask];
  if (asked) {
    mItems.push(
      item(13, 3, 'user', { text: asked.text, who: ALICE }),
      item(14, 2, 'tool', { tool: asked.tool, callId: 'm3', input: asked.input }),
      item(15, 2, 'ask', { id: 'ap-m3', tool: asked.tool, callId: 'm3', input: asked.input, detail: asked.reason }),
    );
  }
  const mRun = {
    id: 'run-manager-1', agent: 'manager', title: 'What is the fleet doing right now?', state: 'completed', input: 'What is the fleet doing right now?',
    output: mItems[10].text, seq: 12, origin: 'http', principal: ALICE, createdAt: minutesAgo(40), updatedAt: minutesAgo(29), member: 'default/manager-0', usage: { turns: 4, costUSD: 0.08 },
  };
  if (asked) Object.assign(mRun, { state: 'input-required', seq: 15, updatedAt: minutesAgo(2), pending: { id: 'ap-m3', tool: asked.tool, input: asked.input, reason: asked.reason, requestedAt: minutesAgo(2) } });
  runs.set(mRun.id, mRun);
  transcripts.set(mRun.id, mItems);

  // A run of the reviewer outside a bridge keeps its one worker busy, so the picker shows it as waiting for a worker.
  const style = {
    id: 'run-reviewer-style', agent: 'reviewer', title: 'Review the style guide', state: 'running', input: 'Review the style guide against the roles.', seq: 1, origin: 'http',
    principal: ALICE, createdAt: minutesAgo(6), updatedAt: minutesAgo(1), member: 'default/review-0', activity: { turn: 2, tool: 'files', phrase: 'Read runbooks/ansible-style.md', since: minutesAgo(1) },
  };
  runs.set(style.id, style);
  transcripts.set(style.id, [item(1, 6, 'user', { text: style.input, who: ALICE })]);
  results.set(style.id, { runId: style.id, title: style.title, agent: 'reviewer', status: 'working', started: style.createdAt, changed: style.updatedAt, next: [] });
  results.set(mRun.id, { runId: mRun.id, title: mRun.title, agent: 'manager', status: 'ready', summary: mRun.output, started: mRun.createdAt, changed: mRun.updatedAt, next: [{ kind: 'reply', label: 'Reply' }] });
  if (asked) Object.assign(results.get(mRun.id), { status: 'needs-you', pending: { id: 'ap-m3', tool: asked.tool, label: 'Allow', reason: asked.reason, input: asked.input }, next: [{ kind: 'decide', label: 'Allow' }] });

  return { bridges, channels, reads, runs, transcripts, results, files, pages: seedPages(), faces: seedFaces(), rules: [] };
}

/** entry builds one channel entry. */
function entry(seq, minutes, from, text, more = {}) {
  return { seq, at: minutesAgo(minutes), from, to: [], replyTo: null, text, mirrors: null, reactions: { up: [], down: [], heart: [] }, decision: null, ...more };
}
const sys = (event) => ({ from: { kind: 'system' }, event });
const agent = (handle) => ({ kind: 'agent', handle, run: 'run-' + handle });
const alice = { kind: 'person', name: ALICE, display: 'Alice' };
const bob = { kind: 'person', name: BOB, display: 'Bob' };

function channelOne(b) {
  const list = [];
  let seq = 0;
  let m = 125;
  const push = (from, text, more = {}) => {
    seq++;
    m -= 2;
    const e = entry(seq, m, from.kind ? from : from.from, text, from.kind ? more : { event: from.event, ...more });
    list.push(e);
    return e;
  };
  push(sys('opened'), 'alice opened the bridge with 5 members.');
  push(sys('started'), 'migrator-1 started: Migrate the cron module to an Ansible role.', { mirrors: { run: 'run-migrator-1', seq: 1, type: 'fw.run.queued' } });
  push(sys('started'), 'migrator-2 started: Migrate the nginx module to an Ansible role.', { mirrors: { run: 'run-migrator-2', seq: 1, type: 'fw.run.queued' } });
  push(sys('started'), 'reviewer started: Review each role against its Puppet manifest.', { mirrors: { run: 'run-reviewer', seq: 1, type: 'fw.run.queued' } });
  push(sys('started'), 'tester started: Run molecule for each role.', { mirrors: { run: 'run-tester', seq: 1, type: 'fw.run.queued' } });
  push(sys('started'), 'writer started: Write the migration notes in the wiki.', { mirrors: { run: 'run-writer', seq: 1, type: 'fw.run.queued' } });
  const kick = push(alice, 'Start with **cron** and **nginx**. Keep the variable names of hiera, so the inventory does not change. Ask before you push anything.');
  kick.reactions.up = [BOB];
  push(agent('migrator-1'), 'I read `modules/cron`. It has three classes. I map `cron::job` to `ansible.builtin.cron` with a loop over `cron_jobs`.', { replyTo: kick.seq });
  push(agent('migrator-2'), 'nginx has a template per site. I keep the templates and port them to Jinja.', { replyTo: kick.seq });
  push(agent('reviewer'), 'I will review each role when its migrator posts it. @migrator-1, post the path when the tasks file exists.', { to: ['migrator-1'] });
  push(agent('migrator-1'), '@reviewer the first cut is at `roles/cron/tasks/main.yml`:\n\n```yaml\n- name: Place the jobs of hiera\n  ansible.builtin.cron:\n    name: "{{ item.name }}"\n    job: "{{ item.command }}"\n  loop: "{{ cron_jobs }}"\n```', { to: ['reviewer'] });
  const q = push(agent('reviewer'), 'One question first.', {});
  q.text = 'reviewer asks: Should the role keep `root` as the default user of a job?';
  q.from = { kind: 'system' };
  q.event = 'asked';
  q.mirrors = { run: 'run-reviewer', seq: 4, type: 'fw.approval.requested' };
  q.decision = { run: 'run-reviewer', id: 'q-old', tool: 'ask_user', label: 'Answer', question: true, reason: 'Should the role keep root as the default user of a job?', schema: { type: 'object', properties: { keep: { type: 'boolean', title: 'Keep root' } } }, state: 'allow', decidedBy: ALICE, decidedAt: minutesAgo(100), answer: 'Yes' };
  push(sys('decided'), 'alice answered the question of reviewer: Yes.', { mirrors: { run: 'run-reviewer', seq: 5, type: 'fw.approval.decided' } });
  push(agent('reviewer'), 'Thanks. Then the role matches the manifest on the user. I still see one change: `minute` now defaults to `*`.');
  push(bob, 'Make the default `0`. A job that runs every minute by mistake is worse than one that runs once an hour.');
  push(agent('migrator-1'), 'Done: `minute` defaults to `0` now.', { replyTo: seq });
  push(sys('started'), 'tester woke up.', { mirrors: { run: 'run-tester', seq: 2, type: 'fw.turn.started' } });
  push(agent('tester'), 'molecule converge passed on Debian 12. Idempotence passed: the second run changed nothing.');
  push(agent('tester'), 'Ubuntu 24.04 passed too.\n\n| platform | converge | idempotence |\n|---|---|---|\n| debian-12 | ok | ok |\n| ubuntu-24.04 | ok | ok |');
  // A long answer: the channel keeps its first 4 KB, and the whole text waits for Show all.
  const log = longLog();
  const cut = push(agent('tester'), log.slice(0, 4096), { cut: true });
  WHOLE.set(cut, log);
  push(sys('asleep'), 'tester went to sleep.', { mirrors: { run: 'run-tester', seq: 9, type: 'fw.run.finished' } });
  const done = push(agent('reviewer'), 'I reviewed **roles/cron**. It matches the manifest, with two notes:\n\n1. The role keeps `root` as the default user, as hiera does.\n2. `minute` defaults to `0` now, as Bob asked.\n\nI approve the role.', { mirrors: { run: 'run-reviewer', seq: 12, type: 'fw.run.finished' } });
  done.reactions.up = [ALICE];
  done.reactions.heart = [ALICE];
  push(alice, 'Thanks, @reviewer. Cron is done for me.', { to: ['reviewer'] });
  push(agent('writer'), 'I started `docs/migration.md`. I will list each module with its role and the open questions.');
  push(agent('migrator-2'), 'The nginx site template uses a Puppet `each` over the upstreams. Jinja has `for`, so the port is direct.');
  push(alice, '@migrator-2 keep the old file names of the templates, so a diff against Puppet stays readable.', { to: ['migrator-2'] });
  push(agent('migrator-2'), 'Yes. The templates keep their names: `site.conf.erb` becomes `site.conf.j2`.', { replyTo: seq });
  push(agent('writer'), 'I keep the notes short. One section per module: what moved, what changed, and how to roll back.');
  push(sys('failed'), 'writer failed: The run reached its limit of 40 turns.', { mirrors: { run: 'run-writer', seq: 11, type: 'fw.run.finished' } });
  push(agent('migrator-1'), 'I also ported the `cron::purge` option. It removes jobs that hiera no longer names.');
  push(agent('reviewer'), '@migrator-1 a purge is destructive. Put it behind a variable that is false by default.', { to: ['migrator-1'] });
  push(agent('migrator-1'), 'Done: `cron_purge` is false by default, and the README of the role says what it does.', { replyTo: seq });
  push(bob, 'Nice work on cron. Who takes the `logrotate` module next?');
  push(agent('migrator-1'), 'I can take logrotate after nginx lands, so the two roles share the handler style.');
  push(alice, 'Good. Finish nginx first.');
  push(agent('migrator-2'), 'The nginx role passes `ansible-lint` with no warning. I want to push the branch `migrate/nginx` for review.');
  push(agent('reviewer'), 'I am ready to review nginx when the branch is up.');
  const card = push(sys('needs-you'), 'migrator-2 wants to run a command.', { mirrors: { run: 'run-migrator-2', seq: 11, type: 'fw.approval.requested' } });
  card.decision = { run: 'run-migrator-2', id: 'ap-run-migrator-2', tool: 'bash', label: 'Run command', reason: 'rule: ask bash: git push*', effect: 'Runs "git push origin migrate/nginx".', input: { command: 'git push origin migrate/nginx' }, state: 'pending', always: true };
  push(agent('migrator-1'), 'While nginx waits, I read `modules/logrotate`. It is small: one class and one template.');
  push(agent('tester'), 'I will test nginx when the branch is up. I go to sleep until then.');
  push(sys('asleep'), 'tester went to sleep.');
  return list;
}

function channelTwo(b) {
  void b;
  const list = [];
  let seq = 0;
  let m = 55;
  const push = (from, text, more = {}) => {
    seq++;
    m -= 4;
    const e = entry(seq, m, from.kind ? from : from.from, text, from.kind ? more : { event: from.event, ...more });
    list.push(e);
    return e;
  };
  push(sys('opened'), 'manager opened the bridge for alice, with 2 members.');
  push(sys('started'), 'scribe started: Draft the release notes of 2.4 from the merged changes.', { mirrors: { run: 'run-scribe', seq: 1, type: 'fw.run.queued' } });
  push(sys('started'), 'reviewer-2 started: Check each note against its pull request.', { mirrors: { run: 'run-reviewer-2', seq: 1, type: 'fw.run.queued' } });
  push(agent('scribe'), 'I found 23 merged pull requests since 2.3. I group them as features, fixes, and changes that need an action.');
  push(agent('reviewer-2'), 'I will check each note against its pull request when the draft is in the wiki.');
  push(agent('scribe'), 'Draft one is at `bridges/br-notes/draft.md`. Before I polish it, I need to know the audience.');
  const q = push(sys('asked'), 'scribe asks: Who reads these notes first?', { mirrors: { run: 'run-scribe', seq: 11, type: 'fw.approval.requested' } });
  q.decision = { run: 'run-scribe', id: 'q-scribe', tool: 'ask_user', label: 'Answer', question: true, reason: 'Who reads these notes first?', schema: { type: 'object', properties: { audience: { type: 'string', title: 'Audience', enum: ['operators', 'developers', 'both'], enumNames: ['Operators', 'Developers', 'Both'] } }, required: ['audience'] }, state: 'pending' };
  return list;
}

/**
 * The whole text of each entry that the channel cut at 4 KB, by the entry,
 * as the channel of the front keeps it, up to 64 KB. The key is the entry
 * itself, because the sample data renumbers its channels.
 */
export const WHOLE = new WeakMap();

/** longLog is the summary of a molecule run of every scenario of a role, long enough that the channel cuts it. */
function longLog() {
  const hosts = ['debian-12', 'ubuntu-24.04', 'rocky-9'];
  const tasks = ['Install the cron package', 'Place the jobs of hiera', 'Purge the jobs that hiera no longer names', 'Set the mail address of the jobs', 'Restart cron after a change'];
  const parts = ['The molecule log of **roles/cron**, every scenario, as the channel cannot hold it whole.'];
  for (const scenario of ['default', 'purge', 'upgrade', 'mail', 'removal']) {
    parts.push('## Scenario ' + scenario);
    for (const h of hosts) {
      parts.push('### ' + h);
      parts.push(tasks.map((t, i) => `${i + 1}. ${t}: ok, changed=${i === 1 ? 1 : 0}, in ${(0.4 + i * 0.13).toFixed(2)} s`).join('\n'));
      parts.push('Idempotence passed: the second run changed nothing. Verify passed: `crontab -l -u root` lists the jobs of hiera and no other job.');
    }
  }
  parts.push('Every scenario passed on every platform. The purge stays off by default, as the reviewer asked.');
  return parts.join('\n\n');
}

/**
 * The revision of the wiki. Each write of any page takes the next one, as
 * the bucket of the store counts, so the versions of one page grow but are
 * not consecutive.
 */
export const wiki = { rev: 0 };

/** page builds one wiki page with its versions. */
function page(path, versions) {
  return { path, versions: versions.map((v) => ({ version: ++wiki.rev, text: v.text, hash: hash(v.text), by: v.by, run: v.run, at: minutesAgo(v.m), summary: v.summary || '' })) };
}

function seedPages() {
  const pages = new Map();
  const add = (p) => pages.set(p.path, p);
  add(page('index.md', [
    { m: 600, by: ALICE, summary: 'Start the wiki', text: '---\ntitle: The wiki of the fleet\n---\n# The wiki of the fleet\n\nAgents read this page before they start. People read it to see what the fleet knows.\n\n- [How we write Ansible](runbooks/ansible-style.md)\n- [The cron module](modules/cron.md)\n- [The nginx module](modules/nginx.md)\n' },
    { m: 300, by: 'agent:writer', run: 'run-writer', summary: 'Link the plan of the Puppet bridge', text: '---\ntitle: The wiki of the fleet\n---\n# The wiki of the fleet\n\nAgents read this page before they start. People read it to see what the fleet knows.\n\n- [How we write Ansible](runbooks/ansible-style.md)\n- [The cron module](modules/cron.md)\n- [The nginx module](modules/nginx.md)\n- [The plan of the Puppet bridge](bridges/br-puppet/plan.md)\n\nEach agent keeps what people liked in `agents/<agent>/learned.md`.\n' },
  ]));
  add(page('_index.md', [{ m: 5, by: 'bossmode', summary: 'Generated', text: '# Every page\n\n- index.md\n- runbooks/ansible-style.md\n- modules/cron.md\n- modules/nginx.md\n- bridges/br-puppet/plan.md\n- agents/migrator/learned.md\n- agents/reviewer/learned.md\n' }]));
  add(page('runbooks/ansible-style.md', [
    { m: 500, by: BOB, summary: 'First rules', text: '---\ntitle: How we write Ansible\ntags: [ansible, style]\n---\n# How we write Ansible\n\n1. Every task has a `name` that says what it does.\n2. Use the fully qualified names of modules, such as `ansible.builtin.package`.\n3. A destructive option is false by default.\n' },
    { m: 200, by: 'agent:reviewer', summary: 'Add the rule about handlers', text: '---\ntitle: How we write Ansible\ntags: [ansible, style]\n---\n# How we write Ansible\n\n1. Every task has a `name` that says what it does.\n2. Use the fully qualified names of modules, such as `ansible.builtin.package`.\n3. A destructive option is false by default.\n4. A handler name starts with a verb: `Reload nginx`, not `nginx reload`.\n' },
  ]));
  add(page('modules/cron.md', [{ m: 90, by: 'agent:migrator', run: 'run-migrator-1', summary: 'Notes of the cron role', text: '---\ntitle: The cron module\ntags: [puppet, ansible]\n---\n# The cron module\n\n| Puppet | Ansible |\n|---|---|\n| `cron::job` | `ansible.builtin.cron` with a loop |\n| `cron::purge` | `cron_purge`, false by default |\n\nSee [the style guide](../runbooks/ansible-style.md).\n' }]));
  add(page('modules/nginx.md', [
    { m: 60, by: 'agent:migrator', run: 'run-migrator-2', summary: 'Notes of the nginx role', text: '---\ntitle: The nginx module\n---\n# The nginx module\n\nThe site templates keep their names: `site.conf.erb` becomes `site.conf.j2`.\n\n## Notes from the old wiki\n\nThe old wiki held raw HTML. The page shows it as text and runs nothing:\n\n<img src=x onerror="alert(1)"> <script>alert(2)</script>\n\n![a chart from another site](https://example.com/chart.png)\n\n[a link that runs code](javascript:alert(3)) and [a safe link](https://nginx.org/en/docs/).\n' },
  ]));
  add(page('bridges/br-puppet/plan.md', [{ m: 124, by: 'token', summary: 'The plan of the bridge', text: '---\ntitle: The plan of the Puppet bridge\n---\n# Migrate the remaining Puppet modules\n\n- [x] cron, by migrator-1\n- [ ] nginx, by migrator-2\n- [ ] logrotate, next\n\nThe reviewer reads each role against [the house style](../../runbooks/ansible-style.md). The tester runs molecule. The writer keeps the notes.\n' }]));
  // A runbook that an agent wrote in a folder of its own, long enough that the editor scrolls.
  const steps = Array.from({ length: 40 }, (_, i) => `${i + 1}. Drain node ${i % 3 === 0 ? 'jucs-k3s' : 'jucs-k3s-' + (i % 3)} and check the pods with \`kubectl get pods -A -o wide\`.`).join('\n');
  add(page('k3s/runbooks/upgrade.md', [{ m: 35, by: 'agent:docs-scribe', summary: 'The upgrade of k3s', text: '---\ntitle: Upgrade k3s on jucs-k3s\n---\n# Upgrade k3s on jucs-k3s\n\nThe node also runs the jucs app, so never reinstall k3s.\n\n' + steps + '\n' }]));
  // The front writes an entry per heart, the newest first, as a list of its parts.
  const learned = (agent, entries) =>
    `# What people liked from ${agent}\n\nThe front adds an entry for each heart that a person puts on a result of ${agent} in a bridge. The newest entry comes first.\n\n` +
    entries.map((e) => `## ${e.day}, bridge "Migrate the remaining Puppet modules" (br-puppet), ${e.handle}, run ${e.run}\n\n- What ${e.who} asked: ${e.asked}\n- What ${agent} did: ${e.did}\n` + (e.note ? `- The note of ${e.who}: ${e.note}\n` : '') + `- [Open the run](#run/${e.run})\n`).join('\n');
  add(page('agents/migrator/learned.md', [{ m: 400, by: 'bossmode', summary: 'A heart from alice', text: learned('migrator', [{ day: '2026-10-21', handle: 'migrator-2', run: 'run-migrator-2', who: 'alice', asked: 'Check the nginx role in check mode first.', did: 'Ran `ansible-playbook -i inventories/production/hosts.yml playbooks/site.yml --check --diff --limit webservers_frontend_eu_west_1` before the real run, and kept the diff in `bridges/br-puppet/reports/nginx-check-mode-diff-2026-10-21.txt`.' }, { day: '2026-10-20', handle: 'migrator-1', run: 'run-migrator-1', who: 'alice', asked: 'Migrate the ntp module to an Ansible role.', did: 'Kept the hiera names, so the inventory did not change.', note: 'This is the house style.' }]) }]));
  add(page('agents/reviewer/learned.md', [{ m: 20, by: 'bossmode', summary: 'A heart from alice', text: learned('reviewer', [{ day: '2026-10-21', handle: 'reviewer', run: 'run-reviewer', who: 'alice', asked: 'Review roles/cron against its manifest.', did: 'Checked the role against the manifest and named the one change of behavior.' }]) }]));
  return pages;
}

export const FLEET = {
  name: 'front-0',
  members: [
    { name: 'default/crew-0', self: false, state: 'live', lastSeen: minutesAgo(0), canForward: true, accessMode: 'static', agents: [{ name: 'migrator', role: 'owner' }, { name: 'reviewer', role: 'owner' }, { name: 'tester', role: 'operator' }], active: 2, inputRequired: 1 },
    { name: 'default/crew-1', self: false, state: 'live', lastSeen: minutesAgo(0), canForward: true, accessMode: 'static', agents: [{ name: 'writer', role: 'operator' }, { name: 'scribe', role: 'operator' }], active: 1, inputRequired: 1 },
    { name: 'default/crew-2', self: false, state: 'suspended', lastSeen: minutesAgo(14), canForward: true, accessMode: 'static', agents: [{ name: 'tester', role: 'operator' }], active: 0, inputRequired: 0 },
    { name: 'default/manager-0', self: false, state: 'live', lastSeen: minutesAgo(1), canForward: true, accessMode: 'static', agents: [{ name: 'manager', role: 'operator' }, { name: 'chat', role: 'operator' }], active: 0, inputRequired: 0 },
    { name: 'default/review-0', self: false, state: 'live', lastSeen: minutesAgo(0), canForward: true, accessMode: 'static', agents: [{ name: 'reviewer', role: 'owner' }], active: 1, inputRequired: 0 },
    { name: 'default/test-0', self: false, state: 'suspended', lastSeen: minutesAgo(30), canForward: true, accessMode: 'static', agents: [{ name: 'tester', role: 'operator' }], active: 0, inputRequired: 0 },
    { name: 'default/test-1', self: false, state: 'suspended', lastSeen: minutesAgo(30), canForward: true, accessMode: 'static', agents: [{ name: 'tester', role: 'operator' }], active: 0, inputRequired: 0 },
    { name: 'default/notes-0', self: false, state: 'live', lastSeen: minutesAgo(0), canForward: true, accessMode: 'static', agents: [{ name: 'writer', role: 'operator' }], active: 0, inputRequired: 0 },
    { name: 'default/backup-0', self: false, state: 'live', lastSeen: minutesAgo(0), canForward: true, accessMode: 'static', agents: [{ name: 'backup', role: 'operator' }], active: 1, inputRequired: 0 },
  ],
  pools: [
    { name: 'crew', atespace: 'default', agent: 'migrator', intake: 'fw.jobs.migrator', wanted: 3, actual: 3, ready: 2, hash: 'a1b2c3', generation: 4, tasks: [{ name: 'crew-0', phase: 'Running', current: true }, { name: 'crew-1', phase: 'Running', current: true }, { name: 'crew-2', phase: 'Suspended', current: true, note: '' }], gaps: [], checkedAt: minutesAgo(0) },
    { name: 'manager', atespace: 'default', agent: 'manager', intake: 'fw.jobs.manager', wanted: 1, actual: 1, ready: 1, hash: 'd4e5f6', generation: 1, tasks: [{ name: 'manager-0', phase: 'Running', current: true }], gaps: [], checkedAt: minutesAgo(0) },
    // One worker for the reviewer, busy. The picker shows it as waiting for a worker.
    { name: 'review', atespace: 'default', agent: 'reviewer', intake: 'fw.jobs.reviewer', wanted: 1, actual: 1, ready: 1, hash: 'r1', generation: 1, tasks: [{ name: 'review-0', phase: 'Running', current: true }], gaps: [], checkedAt: minutesAgo(0) },
    // Two workers for the tester and the writer, asleep and free.
    { name: 'test', atespace: 'default', agent: 'tester', intake: 'fw.jobs.tester', wanted: 2, actual: 2, ready: 2, hash: 't1', generation: 1, tasks: [{ name: 'test-0', phase: 'Suspended', current: true }, { name: 'test-1', phase: 'Suspended', current: true }], gaps: [], checkedAt: minutesAgo(0) },
    { name: 'notes', atespace: 'default', agent: 'writer', intake: 'fw.jobs.writer', wanted: 1, actual: 1, ready: 1, hash: 'w1', generation: 1, tasks: [{ name: 'notes-0', phase: 'Running', current: true }], gaps: [], checkedAt: minutesAgo(0) },
    // One worker for the backup keeper, busy with a nightly check, so the picker shows it waiting for a worker beside its long name.
    { name: 'backup', atespace: 'default', agent: 'backup', intake: 'fw.jobs.backup', wanted: 1, actual: 1, ready: 1, hash: 'b1', generation: 1, tasks: [{ name: 'backup-0', phase: 'Running', current: true }], gaps: [], checkedAt: minutesAgo(0) },
  ],
};
