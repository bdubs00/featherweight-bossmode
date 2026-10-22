// The fake routes of the skills and the tools, in the shapes of the
// backend (docs/CONTRACT.md, section 12): the catalog of the front, the
// skills that each agent can load, the text of a skill from the kernel,
// the tools of the kernel, the marketplaces, and the preview, the install,
// and the removal of an imported skill. Only an admin previews, installs,
// and removes, so these routes answer 403 unless FAKE_ADMIN=1.

import crypto from 'node:crypto';

/** The most files and bytes of an import, as the backend takes them. */
const MAX_FILES = 64;
const MAX_BYTES = 1 << 20;

const doc = (name, description, body, more = '') => `---\nname: ${name}\ndescription: ${description}\n${more}---\n\n${body}`;

/**
 * The skills of the fake. origin is local, imported, or mcp, and a skill of
 * an MCP server is named <server>/<name>. agents names the agents whose
 * profile allows the skill, which GET /v1/agents/{name}/skills answers.
 */
const SKILLS = [
  {
    name: 'ansible-style', origin: 'imported', agents: ['migrator', 'reviewer'], argumentHint: '<role>',
    description: 'Write Ansible roles the way this team writes them: handlers, defaults, and names.',
    text: doc('ansible-style', 'Write Ansible roles the way this team writes them: handlers, defaults, and names.', '# Ansible style\n\n- A handler name starts with a verb, such as `Reload nginx`.\n- Defaults live in `defaults/main.yml`, never in `vars/`.\n- Each task has a name that says what it makes true.\n', 'license: MIT\nallowed-tools: [bash, files]\nargument-hint: <role>\n'),
    files: ['checklist.md'],
  },
  {
    name: 'release-notes', origin: 'imported', agents: ['scribe'],
    description: 'Draft release notes from merged changes, grouped by who the change is for.',
    text: doc('release-notes', 'Draft release notes from merged changes, grouped by who the change is for.', '# Release notes\n\nRead the merged changes since the last tag. Group them by the people they help. One line each.\n'),
    files: [],
  },
  {
    name: 'migration-plan', origin: 'local', agents: ['migrator', 'manager'], argumentHint: '<module>',
    description: 'Split a Puppet module into the tasks of an Ansible role before any edit.',
    text: doc('migration-plan', 'Split a Puppet module into the tasks of an Ansible role before any edit.', '# Migration plan\n\n1. Read the manifests of the module.\n2. List the resources and their order.\n3. Write the plan to the wiki before you change a file.\n', 'argument-hint: <module>\n'),
    files: [],
  },
  {
    name: 'wiki-writer', origin: 'local', agents: ['writer', 'manager', 'chat'],
    description: 'Write a page of the wiki that the next person can act on.',
    text: doc('wiki-writer', 'Write a page of the wiki that the next person can act on.', '# Wiki writer\n\nShort sentences. One page per decision. Link the run that made the change.\n'),
    files: [],
  },
  {
    name: 'model-only', origin: 'local', agents: ['migrator'], userInvocable: false,
    description: 'Keep the shell history of a run short. Only a model loads it.',
    text: doc('model-only', 'Keep the shell history of a run short. Only a model loads it.', 'Use one command per step.\n', 'user-invocable: false\n'),
    files: [],
  },
  {
    name: 'docs/search-docs', origin: 'mcp', server: 'docs', agents: ['reviewer', 'writer', 'chat'], argumentHint: '<question>',
    description: 'Search the documentation server and quote the answer with its link.',
    text: doc('search-docs', 'Search the documentation server and quote the answer with its link.', 'Ask the docs server first. Quote the answer, and link it.\n', 'argument-hint: <question>\n'),
    files: [],
  },
];

/** The tools of the kernel, as GET /v1/tools lists them: each with its source and its plain phrase. */
const TOOLS = [
  { name: 'bash', description: 'Run a shell command.', source: 'builtin', text: 'Run a shell command in the workspace of the worker.' },
  { name: 'files', description: 'Read and write files.', source: 'builtin', text: 'Read, create, change, and remove files in the workspace.' },
  { name: 'web_fetch', description: 'Fetch a page.', source: 'builtin', text: 'Read a page of the web as text.' },
  { name: 'recall', description: 'Search the memory.', source: 'builtin', text: 'Search the notes and the runs of before.' },
  { name: 'memory', description: 'Keep a note.', source: 'builtin', text: 'Write a note that a later run reads.' },
  { name: 'clock', description: 'Read the time.', source: 'builtin', text: 'Read the date and the time of day.' },
  { name: 'create_issue', description: 'Open an issue.', source: 'github', text: 'Open an issue in a repository.' },
  { name: 'open_pull_request', description: 'Open a pull request.', source: 'github', text: 'Open a pull request from a branch.' },
  { name: 'list_commits', description: 'List commits.', source: 'github', text: 'List the commits of a branch.' },
  { name: 'bridge_post', description: 'Post to a bridge.', source: 'front', text: 'Post a message to the channel of a bridge.' },
  { name: 'pages_write', description: 'Write a page.', source: 'front', text: 'Write a page of the wiki.' },
  { name: 'pages_read', description: 'Read a page.', source: 'front', text: 'Read a page of the wiki.' },
  { name: 'pages_search', description: 'Search the wiki.', source: 'front', text: 'Search the pages of the wiki.' },
];

const MARKETPLACES = [
  {
    name: 'team-skills',
    url: 'https://skills.example.com/index.json',
    kind: 'index',
    skills: [
      { name: 'ansible-style', description: 'Write Ansible roles the way this team writes them.' },
      { name: 'molecule-ci', description: 'Run molecule in CI and read its failures.' },
      { name: 'incident-notes', description: 'Keep the notes of an incident as it happens.' },
    ],
    fetchedAt: new Date().toISOString(),
  },
];

/** frontMatter reads the keys of the front matter of a SKILL.md, or null without one. */
function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(String(text || ''));
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const v = kv[2].trim();
    out[kv[1]] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean) : v === 'false' ? false : v === 'true' ? true : v;
  }
  return out;
}

const bodyOf = (text) => String(text || '').replace(/^---\n[\s\S]*?\n---\n?/, '');

/** entryOf is one skill of the catalog of the front. */
function entryOf(s) {
  const out = { name: s.name, description: s.description, origin: s.origin };
  if (s.server) out.server = s.server;
  out.uri = s.origin === 'mcp' ? `mcp://${s.server}/skills/${s.name.split('/').pop()}` : s.name + '/SKILL.md';
  return { ...out, userInvocable: s.userInvocable !== false, modelInvocable: true, argumentHint: s.argumentHint || '', arguments: [], files: s.files || [] };
}

/** refOf is one skill as the view of an agent names it. */
const refOf = (s) => (s.server ? { name: s.name, description: s.description, origin: s.origin, server: s.server } : { name: s.name, description: s.description, origin: s.origin });

/** digestOf hashes the files of a source as the backend does: each path, its length, and its bytes, in the order of the paths. */
function digestOf(files) {
  const h = crypto.createHash('sha256');
  for (const p of Object.keys(files).sort()) {
    const b = Buffer.from(files[p]);
    h.update(p).update('\0').update(String(b.length)).update('\0').update(b);
  }
  return 'sha256:' + h.digest('hex');
}

/** filesOf reads a source into the files of a skill directory, or answers a problem of its fetch. */
function filesOf(src, refuse) {
  if (src.url) {
    if (!/^https:\/\/\S+$/.test(src.url)) refuse(400, 'the address must be an https address of a SKILL.md, of the directory of a skill, or of a zip archive');
    const name = String(src.url).replace(/\/SKILL\.md$/, '').replace(/\.zip$/, '').split('/').filter(Boolean).pop() || 'skill';
    return { 'SKILL.md': doc(name, 'A skill from ' + src.url + '.', '# ' + name + '\n\nThe text of the skill at the address.\n') };
  }
  if (src.marketplace) {
    const mp = MARKETPLACES.find((x) => x.name === src.marketplace);
    const sk = mp && mp.skills.find((x) => x.name === src.name);
    if (!sk) refuse(404, `the marketplace ${src.marketplace} has no skill ${src.name}`);
    return { 'SKILL.md': doc(sk.name, sk.description, '# ' + sk.name + '\n\nThe text of the skill from the marketplace.\n', 'license: MIT\n'), 'scripts/check.sh': '#!/bin/sh\nmolecule test\n' };
  }
  if (typeof src.text === 'string') return { 'SKILL.md': src.text };
  const out = {};
  for (const f of src.files || []) out[String(f.path)] = String(f.text || '');
  return out;
}

/** recordOf names where a skill comes from, as a preview names it. */
function recordOf(src, digest, files) {
  const kind = src.url ? 'url' : src.marketplace ? 'marketplace' : typeof src.text === 'string' ? 'text' : 'files';
  const out = { kind, digest, files: Object.keys(files).sort().map((p) => ({ path: p, size: Buffer.byteLength(files[p]) })) };
  if (src.url) out.url = src.url;
  if (src.marketplace) Object.assign(out, { marketplace: src.marketplace, name: src.name });
  return out;
}

/** existing names the skill that holds a name: an imported skill can be replaced, another never. */
function existing(name) {
  const s = SKILLS.find((x) => x.name === name);
  if (!s) return null;
  return s.origin === 'imported' ? { origin: 'imported', replaceable: true, digest: s.digest || '' } : { origin: s.origin, replaceable: false };
}

/** previewOf checks a source and answers what an install will write. Nothing is installed. */
function previewOf(src, refuse) {
  const files = filesOf(src, refuse);
  const problems = [];
  const add = (code, text, blocks, path) => problems.push(path ? { code, path, text, blocks } : { code, text, blocks });
  const paths = Object.keys(files);
  const size = paths.reduce((n, p) => n + Buffer.byteLength(files[p]), 0);
  if (paths.length > MAX_FILES) add('too-many-files', `the skill holds ${paths.length} files, and an import takes at most ${MAX_FILES}`, true);
  if (size > MAX_BYTES) add('too-large', `the skill holds ${size} bytes, and an import takes at most ${MAX_BYTES}`, true);
  for (const p of paths) if (p.split('/').some((x) => x.startsWith('.'))) add('hidden', 'the import leaves out a hidden file', false, p);
  const main = files['SKILL.md'];
  const fm = main === undefined ? null : frontMatter(main);
  if (main === undefined) add('no-skill-file', 'the source holds no SKILL.md at its top', true);
  else if (!fm) add('front-matter', 'the SKILL.md has no front matter', true);
  const name = fm && typeof fm.name === 'string' ? fm.name : '';
  const description = fm && typeof fm.description === 'string' ? fm.description : '';
  if (fm && !name) add('name-missing', 'the front matter of the SKILL.md has no name', true);
  else if (name && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) add('name-invalid', `the name ${name} is not lower-case letters, digits, and dashes`, true);
  const exists = name ? existing(name) : null;
  if (exists) add('name-exists', exists.replaceable ? `an imported skill has the name ${name}; an install with replace takes its place` : `a skill of the configuration has the name ${name}, and an import never replaces it`, true);
  const digest = digestOf(files);
  const installable = !problems.some((p) => p.blocks && !(p.code === 'name-exists' && exists && exists.replaceable));
  const entry = entryOf({ name, description, origin: 'imported', argumentHint: fm && fm['argument-hint'] ? String(fm['argument-hint']) : '', userInvocable: !(fm && fm['user-invocable'] === false), files: paths.filter((p) => p !== 'SKILL.md') });
  // The keys in the order of the backend.
  return {
    name,
    description,
    frontMatter: fm || {},
    entry,
    body: bodyOf(main),
    files: paths.sort().map((p) => ({ path: p, size: Buffer.byteLength(files[p]) })),
    digest,
    source: recordOf(src, digest, files),
    exists,
    problems,
    installable,
    files_: files,
  };
}

/** sourceOf reads the source fields of a body: exactly one of url, marketplace with name, text, and files. */
function sourceOf(body, refuse, extra = []) {
  for (const k of Object.keys(body)) if (!['url', 'marketplace', 'name', 'text', 'files', ...extra].includes(k)) refuse(400, `json: unknown field "${k}"`);
  const n = ['url', 'marketplace', 'text', 'files'].filter((k) => body[k] !== undefined).length;
  if (n !== 1) refuse(400, 'a source names exactly one of url, marketplace with name, text, and files');
  if (body.marketplace !== undefined && !body.name) refuse(400, 'a skill of a marketplace needs name');
  if (body.files !== undefined && (!Array.isArray(body.files) || body.files.some((f) => !f || typeof f.path !== 'string'))) refuse(400, 'files is a list of {path, text}');
  return body;
}

export function register({ on, refuse, readJson, admin, AGENTS }) {
  const mayImport = () => {
    if (!admin()) refuse(403, 'an import of a skill needs the admin role of the process (access.admins), because every agent whose profile allows the skill reads it');
  };
  const allowlistOf = (agent) => SKILLS.filter((s) => s.agents.includes(agent)).map((s) => s.name);

  on('GET', '/v1/bossmode/skills', () => ({ skills: SKILLS.map(entryOf) }));
  on('GET', '/v1/skills', () => ({ skills: SKILLS.map((s) => ({ ...refOf(s), origin: s.origin === 'mcp' ? 'mcp' : 'local' })) }));
  on('GET', '/v1/skills/(.+)', (c, n) => {
    const name = decodeURIComponent(n);
    const s = SKILLS.find((x) => x.name === name);
    if (!s) refuse(404, 'no skill has the name ' + JSON.stringify(name));
    const e = entryOf(s);
    return { name: s.name, description: s.description, origin: s.origin === 'mcp' ? 'mcp' : 'local', ...(s.server ? { server: s.server } : {}), uri: e.uri, body: s.text, files: s.files || [] };
  });
  on('GET', '/v1/agents/([^/]+)/skills', (c, a) => {
    const agent = decodeURIComponent(a);
    if (!AGENTS.some((x) => x.name === agent)) refuse(404, `no agent ${agent}`);
    return { agent, allowlist: allowlistOf(agent), skills: SKILLS.filter((s) => s.agents.includes(agent)).map(refOf) };
  });
  on('GET', '/v1/tools', () => ({ tools: TOOLS.map((t) => ({ ...t, inputSchema: { type: 'object' } })) }));

  on('GET', '/v1/bossmode/marketplaces', () => {
    mayImport();
    return { marketplaces: MARKETPLACES };
  });

  on('POST', '/v1/bossmode/skills/preview', async (c) => {
    mayImport();
    const src = sourceOf(await readJson(c.req), refuse);
    const { files_: _f, ...p } = previewOf(src, refuse);
    return p;
  });

  on('POST', '/v1/bossmode/skills', async (c) => {
    mayImport();
    const body = await readJson(c.req);
    const src = sourceOf(body, refuse, ['replace', 'digest']);
    const fetched = src.url !== undefined || src.marketplace !== undefined;
    const digest = String(body.digest || '').trim();
    if (fetched && !digest) refuse(400, 'an install from a URL or a marketplace needs digest, the digest of the preview that you read');
    const p = previewOf(src, refuse);
    if (digest && digest !== p.digest) refuse(409, `the preview had the digest ${digest}, and the source now gives ${p.digest}; read the preview again`);
    if (p.exists && (!body.replace || !p.exists.replaceable)) refuse(409, p.exists.replaceable ? `an imported skill has the name ${p.name}; an install with replace takes its place` : `a skill of the configuration has the name ${p.name}, and an import never replaces it`);
    const blocking = p.problems.filter((x) => x.blocks && x.code !== 'name-exists');
    if (blocking.some((x) => x.code === 'too-large' || x.code === 'too-many-files')) refuse(413, blocking.map((x) => x.text).join('; '));
    if (blocking.length) refuse(400, blocking.map((x) => x.text).join('; '));
    const replaced = !!p.exists;
    const i = SKILLS.findIndex((x) => x.name === p.name);
    const skill = { name: p.name, description: p.description, origin: 'imported', agents: [], argumentHint: p.entry.argumentHint, userInvocable: p.entry.userInvocable, text: p.files_['SKILL.md'], files: p.entry.files, digest: p.digest };
    if (i >= 0) {
      skill.agents = SKILLS[i].agents;
      SKILLS[i] = skill;
    } else SKILLS.push(skill);
    const { files_: _f, ...preview } = p;
    c.status = replaced ? 200 : 201;
    c.headers.Location = '/v1/bossmode/skills';
    return { skill: entryOf(skill), replaced, preview: { ...preview, exists: p.exists } };
  });

  on('DELETE', '/v1/bossmode/skills/([^/]+)', (c, n) => {
    mayImport();
    const name = decodeURIComponent(n);
    const i = SKILLS.findIndex((x) => x.name === name);
    if (i < 0) refuse(404, `no skill ${name}`);
    if (SKILLS[i].origin !== 'imported') refuse(409, `${name} is ${SKILLS[i].origin === 'local' ? 'a skill of the configuration' : 'a skill of the server ' + SKILLS[i].server}, and only an imported skill can be removed`);
    SKILLS.splice(i, 1);
    c.status = 204;
    return undefined;
  });
}

/** toolsOfAgent names the tools of the profile of an agent in the fake: tool names, and the names of whole servers. */
export const TOOLS_OF = {
  migrator: ['bash', 'files', 'github'],
  reviewer: ['bash', 'files', 'web_fetch', 'create_issue'],
  tester: ['bash', 'files'],
  writer: ['files', 'web_fetch', 'pages_write'],
  scribe: ['files', 'list_commits'],
  manager: ['front'],
  chat: ['files', 'recall', 'memory', 'clock', 'front.pages_*'],
};

/** toolNames are the names of the tools of GET /v1/tools. */
export const toolNames = () => TOOLS.map((t) => t.name);

/**
 * givesTool reports whether the tool list of a profile gives a tool of the
 * catalog: by its name, its server, or a glob such as front.pages_*.
 */
export function givesTool(list, name) {
  const t = TOOLS.find((x) => x.name === name);
  const source = t ? t.source : '';
  const glob = (p, s) => new RegExp('^' + p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(s);
  return list.some((p) => p === name || (source && source !== 'builtin' && (p === source || glob(p, source + '.' + name))) || glob(p, name));
}

/** allowlistOf names the skills of the profile of an agent in the fake. */
export const allowlistOf = (agent) => SKILLS.filter((s) => s.agents.includes(agent)).map((s) => s.name);
