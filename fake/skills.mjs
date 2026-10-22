// The fake routes of the Skills place: the skills and the tools of the
// fleet, the marketplaces that the admin configured, and the preview and
// the install of a new skill. docs/CONTRACT.md, section 12, names the
// shapes. The backend serves the same routes from its own branch.

const SKILLS = [
  {
    name: 'ansible-style', description: 'Write Ansible roles the way this team writes them: handlers, defaults, and names.', origin: 'imported', source: 'team-skills', license: 'MIT', 'allowed-tools': ['bash', 'files'], agents: ['migrator', 'reviewer'], slash: '/ansible-style',
    text: '---\nname: ansible-style\ndescription: Write Ansible roles the way this team writes them: handlers, defaults, and names.\nlicense: MIT\nallowed-tools: [bash, files]\n---\n\n# Ansible style\n\n- A handler name starts with a verb, such as `Reload nginx`.\n- Defaults live in `defaults/main.yml`, never in `vars/`.\n- Each task has a name that says what it makes true.\n',
  },
  {
    name: 'release-notes', description: 'Draft release notes from merged changes, grouped by who the change is for.', origin: 'imported', source: 'https://skills.example.com/release-notes/SKILL.md', agents: ['scribe'], slash: '/release-notes',
    text: '---\nname: release-notes\ndescription: Draft release notes from merged changes, grouped by who the change is for.\n---\n\n# Release notes\n\nRead the merged changes since the last tag. Group them by the people they help. One line each.\n',
  },
  {
    name: 'migration-plan', description: 'Split a Puppet module into the tasks of an Ansible role before any edit.', origin: 'local', agents: ['migrator', 'manager'], slash: '/migration-plan',
    text: '---\nname: migration-plan\ndescription: Split a Puppet module into the tasks of an Ansible role before any edit.\n---\n\n# Migration plan\n\n1. Read the manifests of the module.\n2. List the resources and their order.\n3. Write the plan to the wiki before you change a file.\n',
  },
  {
    name: 'wiki-writer', description: 'Write a page of the wiki that the next person can act on.', origin: 'local', agents: ['writer', 'manager'], slash: '/wiki-writer',
    text: '---\nname: wiki-writer\ndescription: Write a page of the wiki that the next person can act on.\n---\n\n# Wiki writer\n\nShort sentences. One page per decision. Link the run that made the change.\n',
  },
  {
    name: 'search-docs', description: 'Search the documentation server and quote the answer with its link.', origin: 'server', server: 'docs', agents: ['reviewer', 'writer'], slash: '/search-docs',
    text: '---\nname: search-docs\ndescription: Search the documentation server and quote the answer with its link.\n---\n\nAsk the docs server first. Quote the answer, and link it.\n',
  },
];

const TOOLS = [
  { id: 'bash', name: 'bash', description: 'Run a shell command in the workspace of the worker.', origin: 'builtin', agents: ['migrator', 'reviewer', 'tester', 'writer'] },
  { id: 'files', name: 'files', description: 'Read, create, change, and remove files in the workspace.', origin: 'builtin', agents: ['migrator', 'reviewer', 'tester', 'writer', 'scribe'] },
  { id: 'web_fetch', name: 'web_fetch', description: 'Read a page of the web as text.', origin: 'builtin', agents: ['reviewer', 'writer'] },
  { id: 'github/create_issue', name: 'create_issue', description: 'Open an issue in a repository.', origin: 'server', server: 'github', agents: ['manager', 'reviewer'] },
  { id: 'github/open_pull_request', name: 'open_pull_request', description: 'Open a pull request from a branch.', origin: 'server', server: 'github', agents: ['migrator'] },
  { id: 'github/list_commits', name: 'list_commits', description: 'List the commits of a branch.', origin: 'server', server: 'github', agents: ['scribe'] },
  { id: 'front/bridge_post', name: 'bridge_post', description: 'Post a message to the channel of a bridge.', origin: 'server', server: 'front', agents: ['migrator', 'reviewer', 'tester', 'writer', 'manager'] },
  { id: 'front/pages_write', name: 'pages_write', description: 'Write a page of the wiki.', origin: 'server', server: 'front', agents: ['writer', 'manager'] },
];

const MARKETPLACES = [
  {
    name: 'team-skills',
    url: 'https://skills.example.com/index.json',
    skills: [
      { name: 'ansible-style', description: 'Write Ansible roles the way this team writes them.' },
      { name: 'molecule-ci', description: 'Run molecule in CI and read its failures.' },
      { name: 'incident-notes', description: 'Keep the notes of an incident as it happens.' },
    ],
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
    out[kv[1]] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean) : v;
  }
  return out;
}

const previews = new Map();
let previewN = 0;

export function register({ on, refuse, readJson }) {
  const only = (body, keys) => {
    for (const k of Object.keys(body)) if (!keys.includes(k)) refuse(400, `unknown field ${k}`);
  };
  const meta = ({ text: _t, ...rest }) => rest;

  on('GET', '/v1/bossmode/skills', () => ({ skills: SKILLS.map(meta), tools: TOOLS }));
  on('GET', '/v1/bossmode/marketplaces', () => ({ marketplaces: MARKETPLACES }));

  on('POST', '/v1/bossmode/skills/preview', async (c) => {
    const body = await readJson(c.req);
    only(body, ['source']);
    const src = body.source || {};
    let text = '';
    let source = '';
    if (src.kind === 'marketplace') {
      const mp = MARKETPLACES.find((x) => x.name === src.marketplace);
      const sk = mp && mp.skills.find((x) => x.name === src.skill);
      if (!sk) refuse(404, `no skill ${src.skill} in the marketplace ${src.marketplace}`);
      text = `---\nname: ${sk.name}\ndescription: ${sk.description}\n---\n\n# ${sk.name}\n\nThe text of the skill from the marketplace.\n`;
      source = mp.name;
    } else if (src.kind === 'url') {
      if (!/^https:\/\/[^\s]+\/SKILL\.md$/.test(String(src.url || ''))) refuse(422, 'the address must be an https address of a SKILL.md');
      const name = String(src.url).split('/').slice(-2, -1)[0] || 'skill';
      text = `---\nname: ${name}\ndescription: A skill from ${src.url}.\n---\n\n# ${name}\n`;
      source = src.url;
    } else if (src.kind === 'text') {
      text = String(src.text || '');
      source = 'pasted';
    } else if (src.kind === 'files') {
      const files = Array.isArray(src.files) ? src.files : [];
      const main = files.find((f) => /(^|\/)SKILL\.md$/.test(String(f.path)));
      if (!main) refuse(422, 'the files hold no SKILL.md');
      text = String(main.text || '');
      source = 'uploaded';
    } else {
      refuse(400, 'source.kind must be marketplace, url, text, or files');
    }
    const fm = frontMatter(text);
    if (!fm) refuse(422, 'the SKILL.md has no front matter');
    if (!fm.name) refuse(422, 'the front matter of the SKILL.md has no name');
    if (!fm.description) refuse(422, 'the front matter of the SKILL.md has no description');
    if (SKILLS.some((s) => s.name === fm.name)) refuse(409, `a skill named ${fm.name} exists already`);
    const token = 'pv-' + ++previewN;
    const skill = { name: fm.name, description: fm.description, origin: 'imported', source, agents: [], slash: '/' + fm.name, ...(fm.license ? { license: fm.license } : {}), ...(fm['allowed-tools'] ? { 'allowed-tools': fm['allowed-tools'] } : {}) };
    previews.set(token, { skill, text });
    return { token, skill, text, files: [{ path: 'SKILL.md', size: Buffer.byteLength(text) }] };
  });

  on('POST', '/v1/bossmode/skills/install', async (c) => {
    const body = await readJson(c.req);
    only(body, ['token']);
    const p = previews.get(String(body.token || ''));
    if (!p) refuse(404, 'no preview with this token: preview the skill again');
    previews.delete(body.token);
    if (SKILLS.some((s) => s.name === p.skill.name)) refuse(409, `a skill named ${p.skill.name} exists already`);
    SKILLS.push({ ...p.skill, text: p.text });
    c.status = 201;
    return p.skill;
  });

  on('GET', '/v1/bossmode/skills/([^/]+)', (c, n) => {
    const s = SKILLS.find((x) => x.name === decodeURIComponent(n));
    if (!s) refuse(404, `no skill ${decodeURIComponent(n)}`);
    return { ...s, files: [{ path: 'SKILL.md', size: Buffer.byteLength(s.text) }] };
  });

  on('DELETE', '/v1/bossmode/skills/([^/]+)', (c, n) => {
    const name = decodeURIComponent(n);
    const i = SKILLS.findIndex((x) => x.name === name);
    if (i < 0) refuse(404, `no skill ${name}`);
    if (SKILLS[i].origin !== 'imported') refuse(409, `${name} is ${SKILLS[i].origin === 'local' ? 'a local skill of the configuration' : 'a skill of the server ' + SKILLS[i].server}, so only an imported skill can be removed`);
    SKILLS.splice(i, 1);
    c.status = 204;
    return '';
  });
}
