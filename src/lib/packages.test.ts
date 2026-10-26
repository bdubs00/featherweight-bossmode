import { describe, expect, it } from 'vitest';
import type { Fleet, Packages } from '../api/types';
import { addsPackages, bodyOf, keyOf, lineOf, nameProblem, normalize, poolOfAgent, requirementClause, rulesWithPackages, shouldPoll, switchWords, versionsOf, withPackages } from './packages';

const base: Packages = { pool: 'crew', available: true, on: true, ask: true, python: [{ name: 'ansible-lint' }], tools: [], applying: false, workers: [] };
const w = (task: string, state: string) => ({ task, state }) as Packages['workers'] extends (infer T)[] | undefined ? T : never;

describe('normalize', () => {
  it('makes an answer with missing or odd fields whole', () => {
    const p = normalize({ on: true, python: ['six', { name: ' pyyaml>=6 ' }, { nope: 1 }, ''], workers: [{ task: 'crew-0', state: 'odd' }, { state: 'ready' }] } as unknown as Packages, 'crew');
    expect(p).toEqual({ pool: 'crew', available: true, on: true, ask: false, python: [{ name: 'six' }, { name: 'pyyaml>=6' }], tools: [], applying: false, workers: [{ task: 'crew-0', state: 'unknown' }] });
    expect(normalize(null, 'crew').on).toBe(false);
    expect(normalize({ available: false } as Packages).available).toBe(false);
  });
});

describe('lineOf', () => {
  it('says nothing when off, with no worker, or with empty lists and no change', () => {
    expect(lineOf({ ...base, on: false, workers: [w('a', 'failed')] })).toBeNull();
    expect(lineOf({ ...base, workers: [] })).toBeNull();
    expect(lineOf({ ...base, python: [], workers: [w('a', 'ready')] })).toBeNull();
  });

  it('names a failed worker first, then the workers that take a change, then the ready count', () => {
    expect(lineOf({ ...base, applying: true, workers: [w('a', 'materializing'), { task: 'b', state: 'failed', failure: { output: 'x' } }] })).toEqual({ tone: 'red', text: 'The install failed on b.', failure: { output: 'x' } });
    expect(lineOf({ ...base, workers: [w('a', 'pending'), w('b', 'ready')] })).toEqual({ tone: 'amber', text: 'Updating on 1 of 2 workers.' });
    expect(lineOf({ ...base, workers: [w('a', 'materializing')] })!.text).toBe('Updating on 1 of 1 worker.');
    // A running worker takes a change in place, so a change never waits for an idle worker: the line says what the workers report.
    expect(lineOf({ ...base, applying: true, workers: [w('a', 'ready'), w('b', 'ready')] })).toEqual({ tone: 'green', text: 'Ready on 2 of 2 workers.' });
    expect(lineOf({ ...base, workers: [w('a', 'ready'), w('b', 'ready')] })).toEqual({ tone: 'green', text: 'Ready on 2 of 2 workers.' });
    expect(lineOf({ ...base, workers: [w('a', 'ready'), w('b', 'unknown')] })).toEqual({ tone: 'grey', text: 'Ready on 1 of 2 workers.' });
    // A worker that sleeps takes the change when it wakes, so the line waits and names no time.
    const asleep = (t: string) => t !== 'c';
    expect(lineOf({ ...base, workers: [w('a', 'pending')] }, asleep)).toEqual({ tone: 'grey', text: 'The change waits for its worker to wake up.', asleep: true });
    expect(lineOf({ ...base, workers: [w('a', 'pending'), w('b', 'pending')] }, asleep)!.text).toBe('The change waits for 2 workers to wake up.');
    expect(lineOf({ ...base, workers: [w('a', 'pending'), w('c', 'pending')] }, asleep)).toEqual({ tone: 'amber', text: 'Updating on 1 of 2 workers.' });
  });
});

describe('shouldPoll', () => {
  it('reads again while a change applies or a worker of packages that are on is not ready', () => {
    expect(shouldPoll(undefined)).toBe(false);
    expect(shouldPoll({ ...base, workers: [w('a', 'ready')] })).toBe(false);
    expect(shouldPoll({ ...base, applying: true, workers: [w('a', 'ready')] })).toBe(true);
    expect(shouldPoll({ ...base, workers: [w('a', 'ready'), w('b', 'failed')] })).toBe(true);
    expect(shouldPoll({ ...base, workers: [w('a', 'unknown')] })).toBe(true);
    expect(shouldPoll({ ...base, on: false, workers: [w('a', 'unknown')] })).toBe(false);
    expect(shouldPoll({ ...base, on: false, applying: true })).toBe(true);
  });
});

describe('nameProblem', () => {
  it('refuses what the server refuses, in its sentence, and a package in the list already', () => {
    expect(nameProblem(base, 'python', '  ')).toBe('Write the name of a package.');
    expect(nameProblem(base, 'python', '-e .')).toBe('"-e ." starts with a dash.');
    expect(nameProblem(base, 'python', 'six\u0007')).toBe('"six\\u0007" holds a control character.');
    expect(nameProblem(base, 'python', 'x'.repeat(201))).toBe('"' + 'x'.repeat(201) + '" is longer than 200 characters.');
    expect(nameProblem(base, 'python', 'bad name;rm')).toBe('"bad name;rm" holds a semicolon; a condition after a semicolon is not available, so write the name and the version alone, such as pyyaml>=6.');
    expect(nameProblem(base, 'python', 'bad name')).toBe('"bad name" holds a space inside the name.');
    expect(nameProblem(base, 'tools', 'walk tool')).toBe('"walk tool" is not a program: write a conda name with an optional version and build, such as jq, nodejs>=22, or nodejs 22.*.');
    expect(nameProblem(base, 'tools', 'conda-forge::jq')).toBe('"conda-forge::jq" names a channel; a channel is not available, so name a package of conda-forge, such as jq.');
    expect(nameProblem(base, 'python', 'ANSIBLE-LINT')).toBe('ANSIBLE-LINT is in the list already.');
    expect(nameProblem(base, 'tools', 'ansible-lint')).toBe('');
    expect(nameProblem({ ...base, tools: Array.from({ length: 100 }, (_, i) => ({ name: 'p' + i })) }, 'tools', 'jq')).toBe('A list holds 100 packages at most.');
  });
});

// The cases of pkglist_test.go of the kernel, so the page and the server refuse the same names.
describe('requirementClause', () => {
  it('takes a name of PEP 508 with extras and versions for Python', () => {
    for (const ok of ['six', 'PyYAML', 'ruamel.yaml', 'zope_interface', 'a', 'a1', 'pyyaml>=6', 'pyyaml >= 6', 'pyyaml>=6,<7', 'pyyaml >=6, <7', 'pyyaml (>=6)', 'pyyaml~=6.0', 'pyyaml===6.0.1', 'pyyaml!=5.*', 'torch==2.4.0+cpu', 'pkg==1.0.post1', 'pkg==1!2.0', 'ansible-lint[yaml]==24.9.2', 'requests[socks, security]>=2', 'requests [socks]', 'a'.repeat(200)])
      expect([ok, requirementClause('python', ok)]).toEqual([ok, '']);
    const bad: Record<string, string> = {
      '': 'is empty',
      '--index-url=http://evil': 'starts with a dash',
      'pyyaml\n--pre': 'control character',
      'a\tb': 'control character',
      ['a'.repeat(201)]: 'longer than 200',
      'bad name;rm': 'holds a semicolon',
      "six; python_version > '3'": 'holds a quote',
      'six; sys_platform == linux': 'holds a semicolon',
      'requests @ https://e.org/r.whl': 'names a URL',
      'git+https://e.org/r.git': 'names a URL',
      'bad name': 'holds a space inside the name',
      'six"': 'holds a quote',
      'six`': 'holds a quote',
      '>=6': 'is not a Python package',
      'six-': 'is not a Python package',
      '.six': 'is not a Python package',
      'six>': 'is not a Python package',
      'six>=6 7': 'is not a Python package',
      'six[': 'is not a Python package',
      'six[a,]': 'is not a Python package',
      'six(>=6': 'is not a Python package',
      'six>=6)': 'is not a Python package',
      'six=6': 'is not a Python package',
      'six>=6$': 'is not a Python package',
      'six\\': 'is not a Python package',
      'pyyaml\n]': 'control character',
    };
    for (const [req, want] of Object.entries(bad)) expect([req, requirementClause('python', req)]).toEqual([req, expect.stringContaining(want)]);
  });

  it('takes a conda name with a version and a build for a program, and no channel', () => {
    for (const ok of ['jq', 'nodejs>=22', 'nodejs 22.*', 'nodejs  >=22,<23', 'openssl 3.* *_0', 'python_abi', 'nodejs==22.1.0=h123_0', 'ripgrep 14.1|14.2', 'a'.repeat(200)])
      expect([ok, requirementClause('tools', ok)]).toEqual([ok, '']);
    const bad: Record<string, string> = {
      'conda-forge::jq': 'names a channel',
      "jq[version='>=1.7']": 'holds a quote',
      'jq[version=1.7]': 'is not a program',
      _libgcc_mutex: 'is not a program',
      'jq 1.7 h1 extra': 'is not a program',
      'jq;rm': 'is not a program',
      'walk tool': 'is not a program',
      'jq 1.7 h$1': 'is not a program',
      'jq/1.7': 'is not a program',
      'jq\r': 'control character',
    };
    for (const [req, want] of Object.entries(bad)) expect([req, requirementClause('tools', req)]).toEqual([req, expect.stringContaining(want)]);
  });

  it('never passes a quote, a backslash, or a line break, which a manifest of TOML cannot hold', () => {
    for (const kind of ['python', 'tools'] as const) for (const req of ['a"b', "a'b", 'a\\b', 'a\nb', 'a\rb', 'a\u2028b']) expect([kind, req, requirementClause(kind, req) !== '']).toEqual([kind, req, true]);
  });
});

describe('bodyOf and poolOfAgent', () => {
  it('names the packages of the body by their names', () => {
    expect(bodyOf({ ...base, tools: [{ name: 'jq', by: 'alice' }] })).toEqual({ on: true, ask: true, python: ['ansible-lint'], tools: ['jq'] });
  });

  it('finds the pool in the agent list first, then in the profile, then in the fleet, and none for a profile of the front', () => {
    const fleet = { name: 'f', members: [], pools: [{ name: 'crew', agent: 'migrator' }] } as unknown as Fleet;
    expect(poolOfAgent({ name: 'migrator', role: '', pool: 'lab-pool' }, { name: 'migrator', role: '', pool: 'other' }, fleet, 'migrator')).toBe('lab-pool');
    expect(poolOfAgent({ name: 'migrator', role: '' }, { name: 'migrator', role: '', pool: 'other' }, fleet, 'migrator')).toBe('other');
    expect(poolOfAgent(undefined, undefined, fleet, 'migrator')).toBe('crew');
    expect(poolOfAgent(undefined, null, fleet, 'reviewer')).toBe('');
    expect(poolOfAgent({ name: 'default', role: 'owner', front: true }, null, { ...fleet, pools: [{ name: 'd', agent: 'default' }] } as unknown as Fleet, 'default')).toBe('');
  });
});

describe('versionsOf', () => {
  it('names the version of each package from the workers that are ready, by the key of its name', () => {
    const p: Packages = {
      ...base,
      workers: [
        { task: 'a', state: 'materializing', installed: { python: [{ name: 'ansible-lint', version: '1.0' }] } },
        { task: 'b', state: 'ready', installed: { python: [{ name: 'Ansible_Lint', version: '24.9.2' }, { name: 'PyYAML', version: '6.0.2' }], tools: [{ name: 'iproute2', version: '6.11' }] } },
        { task: 'c', state: 'ready', installed: { python: [{ name: 'ansible-lint', version: '24.9.1' }, { name: 'six' }] } },
      ],
    };
    const py = versionsOf(p, 'python');
    expect(py.get(keyOf('ansible-lint'))).toBe('24.9.2');
    expect(py.get(keyOf('pyyaml>=6'))).toBe('6.0.2');
    expect(py.has(keyOf('six'))).toBe(false);
    expect(versionsOf(p, 'tools').get(keyOf('iproute2'))).toBe('6.11');
    expect(versionsOf({ ...base, workers: undefined }, 'python').size).toBe(0);
    expect(keyOf(' Zope.Interface[docs] ~= 5 ')).toBe('zope-interface');
  });
});

describe('the switch of the packages', () => {
  it('leaves out adding packages and its rules unless packages are on and the agent may ask, and trusts the tools without a switch', () => {
    const abilities = [{ names: ['bash'] }, { names: ['env'] }, { names: ['builtin.env'] }];
    const rules = ['bash: git push*', 'env: command=add', 'env: command=remove'];
    expect(addsPackages(undefined)).toBe(true);
    expect(withPackages(abilities, null)).toEqual(abilities);
    expect(withPackages(abilities, { on: true, ask: true })).toEqual(abilities);
    expect(withPackages(abilities, { on: false, ask: true })).toEqual([{ names: ['bash'] }]);
    expect(withPackages(abilities, { on: true, ask: false })).toEqual([{ names: ['bash'] }]);
    expect(rulesWithPackages(rules, { on: false, ask: false })).toEqual(['bash: git push*']);
    expect(rulesWithPackages(rules, { on: true, ask: true })).toEqual(rules);
    expect(switchWords({ on: true, ask: false })).toBe('Packages are on. You add each package on its profile.');
  });
});
