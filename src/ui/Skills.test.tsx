import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import type { SkillsList, Whoami } from '../api/types';
import { catalogOf, skillGroups, toolGroups } from '../lib/catalog';
import { callOf, SkillActions, SkillList, SkillMain, forgetTools } from './Skills';
import { closeAddSkill, openAddSkill } from './AddSkill';
import { click, fakeApi, fieldOf, keyNamed, mount, problem, settle, typeIn, unmountAll } from './testkit-c';

/** The catalog as the backend answers it: the skills, with no agent and no tool. */
const CONTRACT: SkillsList = {
  skills: [
    { name: 'release-notes', description: 'Draft release notes.', origin: 'imported', userInvocable: true },
    { name: 'ansible-style', description: 'Write roles.', origin: 'imported', userInvocable: true },
    { name: 'wiki-writer', description: 'Write a page.', origin: 'local' },
    { name: 'docs/search-docs', description: 'Search the docs.', origin: 'mcp', server: 'docs' },
  ],
};

/** The capabilities of GET /v1/tools of the kernel. */
const TOOLS = { tools: [{ name: 'bash', text: 'Run a command.', source: 'builtin' }, { name: 'create_issue', text: 'Open an issue.', source: 'github' }] };

const ADMIN: Whoami = { principal: { subject: 'alice@example.com' }, roles: {}, admin: true, canCreate: true };

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  forgetTools();
  act(() => {
    store.dispatch({ type: 'me', me: ADMIN });
    store.dispatch({ type: 'skills', skills: CONTRACT });
  });
});
afterEach(() => {
  closeAddSkill();
  unmountAll();
  if (api) api.restore();
});

describe('the catalog', () => {
  it('groups the skills by origin: Imported, Local, then one group per server', () => {
    const c = catalogOf(CONTRACT, TOOLS.tools);
    expect(skillGroups(c.skills).map((g) => [g.title, g.items.map((s) => s.name)])).toEqual([
      ['Imported', ['ansible-style', 'release-notes']],
      ['Local', ['wiki-writer']],
      ['docs', ['docs/search-docs']],
    ]);
    expect(toolGroups(c.tools).map((g) => g.title)).toEqual(['Built in', 'github']);
  });

  it('reads the backend shape: an empty origin is local, and another origin names a server', () => {
    const c = catalogOf({
      skills: [
        { name: 'a', description: '', origin: '', userInvocable: true },
        { name: 'b', description: '', origin: 'imported', userInvocable: false },
        { name: 'github/triage', description: '', origin: 'github' },
        { name: 'docs/quote', description: '', origin: 'mcp', server: 'docs' },
      ] as never,
      tools: [],
    });
    expect(skillGroups(c.skills).map((g) => g.title)).toEqual(['Imported', 'Local', 'docs', 'github']);
    expect(c.skills.find((s) => s.name === 'a')!.slash).toBe('/a');
    expect(c.skills.find((s) => s.name === 'b')!.slash).toBe('');
  });

  it('reads the tools of GET /v1/tools when the catalog holds none', async () => {
    act(() => store.dispatch({ type: 'skills', skills: { skills: CONTRACT.skills, tools: [] } }));
    api = fakeApi({ 'GET /v1/tools': { tools: [{ name: 'bash', description: 'x', text: 'Runs a shell command.', source: 'builtin' }, { name: 'search', description: 'y', text: 'Searches.', source: 'docs' }] }, 'GET /v1/agents': { agents: [] } });
    const el = mount(<SkillList />);
    await settle();
    const heads = [...el.querySelectorAll('.group-head span:first-child')].map((x) => x.textContent);
    expect(heads).toEqual(['Imported', 'Local', 'docs', 'Built in', 'docs']);
    expect(el.textContent).toContain('Runs a shell command.');
  });
});

describe('the Skills place', () => {
  it('lists the groups with their counts, and each row with a name and a description', async () => {
    api = fakeApi({ 'GET /v1/tools': TOOLS, 'GET /v1/agents': { agents: [] } });
    const el = mount(<SkillList />);
    await settle();
    const groups = [...el.querySelectorAll('.group-head')].map((g) => g.textContent);
    expect(groups).toEqual(['Imported2', 'Local1', 'docs1', 'Built in1', 'github1']);
    expect(el.querySelector('.srow')!.textContent).toBe('ansible-styleWrite roles.');
  });

  it('reads the skills of each agent of the fleet while the place is open, and forgets them when it closes', async () => {
    // The agents of the fleet: a pool runs the migrator, and its worker holds the scribe too. A member outside
    // the pools holds the profiles of its own process, such as paybot, whose skills the front cannot answer.
    act(() => {
      store.dispatch({ type: 'agents', agents: [{ name: 'default', role: 'owner' }] });
      store.dispatch({
        type: 'fleet',
        fleet: {
          name: 'front-0',
          members: [
            { name: 'default/crew-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [{ name: 'migrator', role: 'owner' }, { name: 'scribe', role: 'operator' }], active: 0, inputRequired: 0 },
            { name: 'default/lab-0', state: 'quiet', lastSeen: '', canForward: true, accessMode: '', agents: [{ name: 'paybot', role: 'operator' }], active: 0, inputRequired: 0 },
          ],
          pools: [{ name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }] }],
        },
      });
    });
    api = fakeApi({
      'GET /v1/tools': TOOLS,
      'GET /v1/agents/migrator/skills': { agent: 'migrator', allowlist: ['ansible-*'], skills: [{ name: 'ansible-style', description: '', origin: 'imported' }] },
      'GET /v1/agents/scribe/skills': { agent: 'scribe', allowlist: null, skills: [{ name: 'ansible-style', description: '', origin: 'imported' }, { name: 'release-notes', description: '', origin: 'imported' }] },
    });
    const el = mount(<SkillList />);
    await settle();
    // paybot loads no skill, and the page never asks the front for it.
    expect(store.get().agentSkills).toEqual({ migrator: ['ansible-style'], scribe: ['ansible-style', 'release-notes'], paybot: [] });
    expect(api.calls.some((c) => c.path.includes('/agents/paybot'))).toBe(false);
    expect(el.querySelector('.srow')).toBeTruthy();
    unmountAll();
    expect(store.get().agentSkills).toEqual({});
  });

  it('shows the text of a skill, how to call it, and the agents that can load it', async () => {
    act(() => {
      store.dispatch({ type: 'agent-skills', agent: 'migrator', skills: ['ansible-style'] });
      store.dispatch({ type: 'agent-skills', agent: 'reviewer', skills: ['ansible-style', 'wiki-writer'] });
    });
    api = fakeApi({ 'GET /v1/skills/ansible-style': { name: 'ansible-style', description: 'Write roles.', origin: 'local', body: '---\nname: ansible-style\ndescription: Write roles.\nlicense: MIT\nallowed-tools: [bash, files]\nargument-hint: <role>\n---\n\n# Ansible style\n\n<script>bad()</script>Handlers start with a verb.\n', files: ['scripts/lint.sh'] } });
    const el = mount(<SkillMain item={{ kind: 'skill', id: 'ansible-style' }} />);
    await settle();
    // The front matter is for the agent. A person reads how to call the skill, and nothing else of it.
    expect(el.querySelector('.fm')).toBeNull();
    expect(el.querySelector('.skill-call')!.textContent).toBe('/ansible-style <role>');
    expect(el.textContent).not.toContain('allowed-tools');
    expect(el.querySelector('.skill-text h1')!.textContent).toBe('Ansible style');
    expect(el.querySelector('.skill-text script')).toBeNull();
    expect([...el.querySelectorAll('.loaders li')].map((x) => x.textContent)).toEqual(['migrator', 'reviewer']);
  });

  it('opens the first skill where two panes show, and says nothing twice', async () => {
    const wide = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      api = fakeApi({ 'GET /v1/skills/ansible-style': { name: 'ansible-style', description: 'Write roles.', origin: 'imported', body: 'Text.', files: [] } });
      location.hash = '#skills';
      mount(<SkillMain />);
      await settle();
      expect(location.hash).toBe('#skills/skill/ansible-style');
      // With nothing picked, the details pane holds Add skill alone, and never the list again.
      const el = mount(<SkillActions />);
      expect(el.querySelector('.imported')).toBeNull();
      expect(keyNamed(el, 'Add skill')).toBeTruthy();
    } finally {
      window.matchMedia = wide;
    }
  });

  it('says how to call a skill: the slash command and the hint of its arguments, and nothing for a skill that only a model loads', () => {
    const doc = { frontMatter: [['argument-hint', '[from text]'], ['user-invocable', 'true']] as [string, string][], body: '', files: [] };
    expect(callOf({ slash: '/proxmox-ops', argumentHint: '[task]' }, doc)).toBe('/proxmox-ops [task]');
    expect(callOf({ slash: '/proxmox-ops', argumentHint: '' }, doc)).toBe('/proxmox-ops [from text]');
    expect(callOf({ slash: '/notes', argumentHint: '' }, null)).toBe('/notes');
    expect(callOf({ slash: '', argumentHint: '<x>' }, doc)).toBe('');
  });

  it('reads the text of a skill of a server from the kernel, with its name escaped', async () => {
    api = fakeApi({ 'GET /v1/skills/docs%2Fsearch-docs': { name: 'docs/search-docs', description: 'Search the docs.', origin: 'mcp', server: 'docs', body: 'From the kernel.', files: [] } });
    const el = mount(<SkillMain item={{ kind: 'skill', id: 'docs/search-docs' }} />);
    await settle();
    expect(el.querySelector('.skill-text')!.textContent!.trim()).toBe('From the kernel.');
  });

  it('offers Add skill and Remove to an admin only, and Copy to everyone', () => {
    api = fakeApi({});
    let el = mount(<SkillActions item={{ kind: 'skill', id: 'ansible-style' }} />);
    expect(keyNamed(el, 'Add skill')).toBeTruthy();
    expect(keyNamed(el, 'Remove')).toBeTruthy();
    expect(keyNamed(el, 'Copy /ansible-style')).toBeTruthy();
    unmountAll();
    act(() => store.dispatch({ type: 'me', me: { ...ADMIN, admin: false } }));
    el = mount(<SkillActions item={{ kind: 'skill', id: 'ansible-style' }} />);
    expect(keyNamed(el, 'Add skill')).toBeUndefined();
    expect(keyNamed(el, 'Remove')).toBeUndefined();
    expect(keyNamed(el, 'Copy /ansible-style')).toBeTruthy();
  });

  it('removes an imported skill after Confirm', async () => {
    api = fakeApi({ 'DELETE /v1/bossmode/skills/ansible-style': () => ({ status: 204 }), 'GET /v1/bossmode/skills': CONTRACT });
    const el = mount(<SkillActions item={{ kind: 'skill', id: 'ansible-style' }} />);
    click(keyNamed(el, 'Remove'));
    expect(document.querySelector('dialog.confirm h2')!.textContent).toBe('Remove ansible-style?');
    click(keyNamed(document, 'Remove ansible-style'));
    await settle();
    expect(api.calls.map((c) => c.method + ' ' + c.path)).toContain('DELETE /v1/bossmode/skills/ansible-style');
  });
});

describe('Add skill', () => {
  const PREVIEW = {
    name: 'ansible-style',
    description: 'Write roles.',
    frontMatter: { name: 'ansible-style', description: 'Write roles.', license: 'MIT', 'allowed-tools': ['bash', 'files'] },
    body: '# Ansible style\n\nHandlers start with a verb.',
    files: [
      { path: 'SKILL.md', size: 230 },
      { path: 'scripts/lint.sh', size: 2048 },
    ],
    problems: [{ code: 'binary', path: 'logo.png', text: 'The import leaves out a binary file.', blocks: false }],
    exists: { origin: 'imported', replaceable: true },
    installable: true,
    digest: 'sha256:5eed',
  };

  const openChooser = () => {
    act(() => openAddSkill());
    return mount(<SkillMain item={{ kind: 'skill', id: 'ansible-style' }} />);
  };

  it('opens the chooser from the address #skills/add', () => {
    api = fakeApi({ 'GET /v1/bossmode/marketplaces': { marketplaces: [] } });
    const el = mount(<SkillMain add />);
    expect(el.querySelector('h1')!.textContent).toBe('Add skill');
  });

  it('offers the four avenues', () => {
    api = fakeApi({ 'GET /v1/bossmode/marketplaces': { marketplaces: [] } });
    const el = openChooser();
    expect(el.querySelector('h1')!.textContent).toBe('Add skill');
    expect([...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['From a marketplace', 'From an address', 'Paste a SKILL.md', 'Upload files']);
  });

  it('previews a pasted SKILL.md with its front matter, body, files, and problems, and replaces the imported skill of that name', async () => {
    api = fakeApi({
      'POST /v1/bossmode/skills/preview': PREVIEW,
      'POST /v1/bossmode/skills': () => ({ status: 200, body: { skill: { name: 'ansible-style' }, replaced: true } }),
      'GET /v1/bossmode/skills': CONTRACT,
    });
    const el = openChooser();
    click([...el.querySelectorAll('[role="tab"]')][2]);
    typeIn(fieldOf(el, 'SKILL.md'), '---\nname: ansible-style\n---\n');
    click(keyNamed(el, 'Preview'));
    await settle();
    expect(api.calls.find((c) => c.path === '/v1/bossmode/skills/preview')!.body).toEqual({ text: '---\nname: ansible-style\n---\n' });
    const pv = el.querySelector('.preview')!;
    // The one sentence about what an install does sits behind its question mark.
    click(pv.querySelector('.help-key'));
    expect(pv.querySelector('[role="note"]')!.textContent).toBe('An installed skill is instructions for every agent of a profile that allows it.');
    expect([...pv.querySelectorAll('.fm li')].map((x) => x.textContent)).toEqual(['licenseMIT', 'allowed-toolsbash, files']);
    expect(pv.querySelector('.preview-body h1')!.textContent).toBe('Ansible style');
    expect([...pv.querySelectorAll('.file-list li')].map((x) => x.textContent)).toEqual(['SKILL.md230 B', 'scripts/lint.sh2.0 KB']);
    expect(pv.querySelector('.problems')!.textContent).toContain('The import leaves out a binary file.');
    expect(pv.textContent).toContain('replaces ansible-style');
    click(keyNamed(pv, 'Install'));
    await settle();
    const install = api.calls.find((c) => c.method === 'POST' && c.path === '/v1/bossmode/skills')!;
    expect(install.body).toEqual({ text: '---\nname: ansible-style\n---\n', replace: true, digest: 'sha256:5eed' });
    expect(location.hash).toBe('#skills/skill/ansible-style');
  });

  it('meets a 409 on install and replaces only when the person asks', async () => {
    let n = 0;
    api = fakeApi({
      'POST /v1/bossmode/skills/preview': { ...PREVIEW, name: 'molecule-ci', exists: null, problems: [] },
      'POST /v1/bossmode/skills': () => (++n === 1 ? problem(409, 'skills: a skill named molecule-ci exists: an imported skill holds the name.') : { status: 200, body: { skill: { name: 'molecule-ci' }, replaced: true } }),
      'GET /v1/bossmode/skills': CONTRACT,
    });
    const el = openChooser();
    click([...el.querySelectorAll('[role="tab"]')][1]);
    typeIn(fieldOf(el, 'Address'), 'https://skills.test/molecule-ci/SKILL.md');
    click(keyNamed(el, 'Preview'));
    await settle();
    click(keyNamed(el, 'Install'));
    await settle();
    const posts = () => api.calls.filter((c) => c.method === 'POST' && c.path === '/v1/bossmode/skills');
    expect(posts()[0].body).toEqual({ url: 'https://skills.test/molecule-ci/SKILL.md', digest: 'sha256:5eed' });
    expect(el.querySelector('.preview [role="alert"]')!.textContent).toBe('A skill named molecule-ci exists: an imported skill holds the name.');
    click(keyNamed(el, 'Replace molecule-ci'));
    await settle();
    expect(posts()[1].body).toEqual({ url: 'https://skills.test/molecule-ci/SKILL.md', replace: true, digest: 'sha256:5eed' });
  });

  it('blocks Install when a problem blocks', async () => {
    api = fakeApi({ 'POST /v1/bossmode/skills/preview': { ...PREVIEW, problems: [{ code: 'name-missing', text: 'The front matter has no name.', blocks: true }], installable: false } });
    const el = openChooser();
    click([...el.querySelectorAll('[role="tab"]')][2]);
    typeIn(fieldOf(el, 'SKILL.md'), 'no front matter');
    click(keyNamed(el, 'Preview'));
    await settle();
    expect((keyNamed(el, 'Install') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('.problems .status')!.textContent).toBe('blocks');
  });

  it('picks a skill of a marketplace, previews it, and installs it with the digest of the preview', async () => {
    api = fakeApi({
      'GET /v1/bossmode/marketplaces': { marketplaces: [{ name: 'team-skills', url: 'https://x.test', skills: [{ name: 'molecule-ci', description: 'Run molecule.' }] }] },
      'POST /v1/bossmode/skills/preview': { ...PREVIEW, name: 'molecule-ci', description: 'Run molecule.', frontMatter: { name: 'molecule-ci', description: 'Run molecule.' }, body: 'Body.', exists: null, problems: null },
      'POST /v1/bossmode/skills': () => ({ status: 201, body: { skill: { name: 'molecule-ci' }, replaced: false } }),
      'GET /v1/bossmode/skills': CONTRACT,
    });
    const el = openChooser();
    await settle();
    click([...el.querySelectorAll('.markets button')].find((b) => b.textContent!.startsWith('molecule-ci')));
    await settle();
    expect(api.calls.filter((c) => c.path === '/v1/bossmode/skills/preview').map((c) => c.body)).toEqual([{ marketplace: 'team-skills', name: 'molecule-ci' }]);
    expect(el.querySelector('.preview-body')!.textContent!.trim()).toBe('Body.');
    click(keyNamed(el, 'Install'));
    await settle();
    expect(api.calls.find((c) => c.method === 'POST' && c.path === '/v1/bossmode/skills')!.body).toEqual({ marketplace: 'team-skills', name: 'molecule-ci', digest: 'sha256:5eed' });
  });

  it('asks for a new preview when the files changed since the preview, and offers no Replace', async () => {
    api = fakeApi({
      'POST /v1/bossmode/skills/preview': { ...PREVIEW, name: 'molecule-ci', exists: null, problems: [] },
      'POST /v1/bossmode/skills': () => problem(409, 'the preview had the digest sha256:5eed, and the source now gives sha256:0ther; read the preview again'),
    });
    const el = openChooser();
    click([...el.querySelectorAll('[role="tab"]')][1]);
    typeIn(fieldOf(el, 'Address'), 'https://skills.test/molecule-ci/SKILL.md');
    click(keyNamed(el, 'Preview'));
    await settle();
    click(keyNamed(el, 'Install'));
    await settle();
    expect(keyNamed(el, 'Replace molecule-ci')).toBeUndefined();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('read the preview again');
  });
});
