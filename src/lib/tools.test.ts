import { describe, expect, it } from 'vitest';
import type { Tool } from '../api/types';
import { abilitiesOf, phraseOf, ruleText, rulesWords, summaryOf } from './tools';

const CATALOG: Tool[] = [
  { name: 'bash', description: 'Run a shell command.', source: 'builtin', text: 'Run shell commands' },
  { name: 'files', description: 'Read and write files.', source: 'builtin', text: 'Read and change files in the workspace' },
  { name: 'clock', description: 'Read the time.', source: 'builtin', text: 'Read the time' },
  { name: 'create_issue', description: 'Open an issue. It takes a title.', source: 'github' },
  { name: 'playbook', source: 'ansible', text: 'Run a playbook' },
  { name: 'adhoc', source: 'ansible', text: 'Run one module on hosts' },
];

describe('abilitiesOf', () => {
  it('names each tool by the phrase of the catalog, with its raw name kept', () => {
    const a = abilitiesOf(['bash', 'files'], CATALOG);
    expect(a.map((x) => x.text)).toEqual(['Run shell commands', 'Read and change files in the workspace']);
    expect(a.map((x) => x.names)).toEqual([['bash'], ['files']]);
  });

  it('makes the tools of the wiki one ability, and the tools of the bridges another', () => {
    const a = abilitiesOf(['bash', 'front.bridge_read', 'front.bridge_post', 'front.pages_list', 'front.pages_read', 'front.pages_write', 'front.pages_search', 'front.pages_history'], CATALOG);
    expect(a.map((x) => x.text)).toEqual(['Run shell commands', 'Read and post in bridges', 'Read and write the wiki']);
    expect(a[2].names).toHaveLength(5);
    expect(a[2].noun).toBe('the wiki');
  });

  it('words a family by what its tools do', () => {
    expect(abilitiesOf(['front.pages_read', 'front.pages_search'], CATALOG)[0].text).toBe('Read the wiki');
    expect(abilitiesOf(['front.pages_*'], CATALOG)[0].text).toBe('Read and write the wiki');
    expect(abilitiesOf(['front.bridge_read'], CATALOG)[0].text).toBe('Read bridges');
  });

  it('names a whole server once, as a glob or by the name of a source of the catalog', () => {
    expect(abilitiesOf(['ansible.*'], CATALOG).map((x) => x.text)).toEqual(['Use the tools of ansible']);
    expect(abilitiesOf(['github'], CATALOG).map((x) => x.text)).toEqual(['Use the tools of github']);
  });

  it('takes the first sentence of a description without a phrase, the words of the kernel without the catalog, and the name last', () => {
    expect(phraseOf(CATALOG, 'github.create_issue')).toBe('Open an issue');
    expect(phraseOf(null, 'recall')).toBe('Search its memory');
    expect(phraseOf(null, 'mystery')).toBe('mystery');
    expect(phraseOf([{ name: 'web_fetch', text: 'Read a page of the web as text.' }], 'web_fetch')).toBe('Read a page of the web as text');
  });
});

describe('summaryOf', () => {
  it('sums up what a chat can use in a few words', () => {
    const a = abilitiesOf(['files', 'recall', 'memory', 'clock', 'front.pages_list', 'front.pages_read', 'front.pages_write'], null);
    expect(summaryOf(a, 2)).toBe('Can use files, memory, the time, the wiki, and 2 skills');
  });

  it('counts the tools without a short noun', () => {
    expect(summaryOf(abilitiesOf(['files', 'github.create_issue'], CATALOG), 0)).toBe('Can use files and 1 more tool');
    expect(summaryOf(abilitiesOf(['github.create_issue'], CATALOG), 1)).toBe('Can use 1 tool and 1 skill');
    expect(summaryOf([], 0)).toBe('Can use no tool');
  });
});

describe('ruleText', () => {
  it('says a rule as a person reads it', () => {
    expect(ruleText('bash: git push*', CATALOG)).toBe('Asks before git push');
    expect(ruleText('ansible.playbook: check=false', CATALOG)).toBe('Asks before a real Ansible run');
    expect(ruleText('destructive', CATALOG)).toBe('Asks before a tool that changes things');
    expect(ruleText('default', CATALOG)).toBe('Asks first');
    expect(ruleText('files: /etc/*', CATALOG)).toBe('Asks before it touches /etc/');
    expect(ruleText('github.create_issue: repo=infra', CATALOG)).toBe('Asks first when repo is infra');
    expect(ruleText('front.pages_write', CATALOG)).toBe('Asks first: write the wiki');
  });

  it('gives one line per meaning, with every pattern that gives it', () => {
    const r = rulesWords(['bash: git push*', 'ansible.playbook: check=false', 'ansible.adhoc: check=false'], CATALOG);
    expect(r).toEqual([
      { text: 'Asks before git push', raw: ['bash: git push*'] },
      { text: 'Asks before a real Ansible run', raw: ['ansible.playbook: check=false', 'ansible.adhoc: check=false'] },
    ]);
  });
});
