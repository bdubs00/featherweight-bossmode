import { describe, expect, it } from 'vitest';
import type { Fleet, Packages } from '../api/types';
import { bodyOf, keyOf, lineOf, nameProblem, normalize, poolOfAgent, shouldPoll, versionsOf } from './packages';

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
  it('refuses what the kernel refuses, and a package in the list already', () => {
    expect(nameProblem(base, 'python', '  ')).toBe('Write the name of a package.');
    expect(nameProblem(base, 'python', '-e .')).toBe('A package name cannot start with a dash.');
    expect(nameProblem(base, 'python', 'six\u0007')).toBe('A package name cannot hold a control character.');
    expect(nameProblem(base, 'python', 'x'.repeat(201))).toBe('A package name holds 200 characters at most.');
    expect(nameProblem(base, 'python', 'ANSIBLE-LINT')).toBe('ANSIBLE-LINT is in the list already.');
    expect(nameProblem(base, 'tools', 'ansible-lint')).toBe('');
    expect(nameProblem({ ...base, tools: Array.from({ length: 100 }, (_, i) => ({ name: 'p' + i })) }, 'tools', 'jq')).toBe('A list holds 100 packages at most.');
    expect(nameProblem(base, 'python', 'pyyaml>=6')).toBe('');
    expect(nameProblem(base, 'python', 'requests[socks]>=2.31,<3')).toBe('');
    // A space, a marker after ;, or an address is no name of a package.
    expect(nameProblem(base, 'python', 'bad name;rm')).toBe('That is not the name of a Python package. Write a name such as pyyaml, with a version such as >=6 when you need one.');
    expect(nameProblem(base, 'python', 'https://example.com/x.whl')).toMatch(/^That is not the name of a Python package/);
    expect(nameProblem(base, 'tools', 'conda-forge::ripgrep=14.1')).toBe('');
    expect(nameProblem(base, 'tools', 'rm -rf')).toBe('That is not the name of a program. Write a name such as jq, with a version such as =1.7 when you need one.');
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
