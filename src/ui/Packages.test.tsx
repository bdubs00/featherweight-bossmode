import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { BossConfig, Packages, PackageWorker } from '../api/types';
import { store } from '../state/store';
import { forgetProfiles } from '../state/profiles';
import { forgetQueued } from '../state/queued';
import { Profile, forgetProfileReads } from './Profile';
import { ASK_TEXT, NOTE_TEXT, OFF_TEXT, PackagesSection } from './Packages';
import { fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';

const CONFIG: BossConfig = { manager: null, placement: 'queue', maxMembers: 16, packages: true };

const ready = (task: string): PackageWorker => ({ task, state: 'ready', at: '', installed: { python: [{ name: 'ansible-lint', version: '24.9.2' }], tools: [] } });

/** The packages of crew, the pool of migrator: on, with one Python package and one program, ready on both workers. */
const ON: Packages = {
  pool: 'crew',
  available: true,
  on: true,
  ask: true,
  python: [{ name: 'ansible-lint', by: 'alice@example.com', at: '', agent: 'migrator', run: 'run-1' }],
  tools: [{ name: 'iproute2', by: 'alice@example.com', at: '' }],
  applying: false,
  workers: [ready('crew-0'), ready('crew-1')],
};
const OFF: Packages = { pool: 'crew', available: true, on: false, ask: false, python: [], tools: [], applying: false, workers: [] };
const EMPTY: Packages = { ...ON, python: [], tools: [] };

let calls: Call[] = [];
let restore = () => {};
/** The answer of GET, which a test changes, and the answer of PUT, which echoes the body by default. */
let answer: Packages = ON;
let putAnswer: (body: unknown) => unknown = (b) => ({ ...answer, ...(b as object), python: ((b as Packages).python as unknown as string[]).map((name) => ({ name })), tools: ((b as Packages).tools as unknown as string[]).map((name) => ({ name })) });

const serve = () => {
  restore();
  const f = fakeFetch([
    ['GET', /^\/v1\/pools\/crew\/packages$/, () => answer],
    ['PUT', /^\/v1\/pools\/crew\/packages$/, (b) => putAnswer(b)],
    ['GET', /^\/v1\/pools\/crew$/, () => ({ name: 'crew', wanted: 2, actual: 2, ready: 2, tasks: [], gaps: [] })],
    ['GET', /^\/v1\/bossmode\/agents\/[^/]+\/today$/, () => ({ runs: 0, decisions: 0 })],
  ]);
  calls = f.calls;
  restore = f.restore;
};

beforeEach(() => {
  forgetProfiles();
  forgetProfileReads();
  forgetQueued();
  answer = ON;
  putAnswer = (b) => ({ ...answer, ...(b as object), python: ((b as Packages).python as unknown as string[]).map((name) => ({ name })), tools: ((b as Packages).tools as unknown as string[]).map((name) => ({ name })) });
  serve();
  seedFleet();
  act(() => store.dispatch({ type: 'config', config: CONFIG }));
});

afterEach(() => {
  unmountAll();
  restore();
  restore = () => {};
  act(() => store.dispatch({ type: 'config', config: null }));
});

const reads = () => calls.filter((c) => c.method === 'GET' && c.path === '/v1/pools/crew/packages').length;
const puts = () => calls.filter((c) => c.method === 'PUT');
const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const typeIn = (input: HTMLInputElement, v: string) =>
  act(() => {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
const submit = (el: HTMLElement) =>
  act(() => {
    (el.querySelector('form.pkgs-add') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
const section = async (owner = true) => {
  const el = mount(<PackagesSection agent="migrator" pool="crew" owner={owner} />);
  await vi.waitFor(() => expect(el.querySelector('section.pkgs')).not.toBeNull());
  return el;
};

describe('the section Packages on the profile', () => {
  it('sits after Workers on the profile of an agent that a pool runs', async () => {
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelector('section.pkgs')).not.toBeNull());
    const heads = [...el.querySelectorAll('.prof-sec h3')].map((h) => h.textContent);
    expect(heads.indexOf('Packages')).toBe(heads.indexOf('Workers') + 1);
    expect(calls.some((c) => c.path === '/v1/pools/crew/packages')).toBe(true);
  });

  it('does not exist when the deployment has no package mirror, and reads nothing', async () => {
    act(() => store.dispatch({ type: 'config', config: { ...CONFIG, packages: false } }));
    const el = mount(<Profile agent="migrator" />);
    await vi.waitFor(() => expect(el.querySelector('.workers')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    expect(el.querySelector('section.pkgs')).toBeNull();
    expect(calls.some((c) => c.path.endsWith('/packages'))).toBe(false);
  });

  it('does not exist for an older front whose settings leave packages out', async () => {
    act(() => store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16 } }));
    const el = mount(<Profile agent="migrator" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(el.querySelector('section.pkgs')).toBeNull();
    expect(calls.some((c) => c.path.endsWith('/packages'))).toBe(false);
  });

  it('does not exist for an agent that no pool runs', async () => {
    const el = mount(<Profile agent="reviewer" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(el.querySelector('section.pkgs')).toBeNull();
    expect(calls.some((c) => c.path.endsWith('/packages'))).toBe(false);
  });

  it('finds the pool through the field pool of the agent list', async () => {
    act(() => store.dispatch({ type: 'agents', agents: [{ name: 'reviewer', role: 'owner', pool: 'crew' }] }));
    const el = mount(<Profile agent="reviewer" />);
    await vi.waitFor(() => expect(el.querySelector('section.pkgs')).not.toBeNull());
    expect(calls.some((c) => c.path === '/v1/pools/crew/packages')).toBe(true);
  });

  it('does not exist when the route answers 404 or says that packages are not available', async () => {
    restore();
    const f = fakeFetch([]);
    restore = f.restore;
    const gone = mount(<PackagesSection agent="migrator" pool="crew" owner />);
    await vi.waitFor(() => expect(f.calls.length).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(gone.querySelector('section.pkgs')).toBeNull();
    answer = { ...ON, available: false };
    serve();
    const off = mount(<PackagesSection agent="migrator" pool="crew" owner />);
    await vi.waitFor(() => expect(reads()).toBe(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(off.querySelector('section.pkgs')).toBeNull();
  });
});

describe('the states of the section', () => {
  it('says one line and offers Turn on packages when off, and turns them on', async () => {
    answer = OFF;
    const el = await section();
    expect(el.querySelector('.pkgs-off p')!.textContent).toBe(OFF_TEXT);
    expect(el.querySelector('form.pkgs-add')).toBeNull();
    expect(button(el, 'Turn off')).toBeUndefined();
    act(() => button(el, 'Turn on packages')!.click());
    await vi.waitFor(() => expect(el.querySelector('form.pkgs-add')).not.toBeNull());
    // Turn on lets the agent ask for a package, whatever the setting held while off.
    expect(puts()[0]).toEqual({ method: 'PUT', path: '/v1/pools/crew/packages', body: { on: true, ask: true, python: [], tools: [] } });
    expect((el.querySelector('input[role="switch"]') as HTMLInputElement).checked).toBe(true);
    // The focus goes to the field of the add row, which took the place of the key.
    expect(document.activeElement).toBe(el.querySelector('form.pkgs-add input[aria-label="Package name"]'));
  });

  it('shows the add row and the switch when on and empty, with no list, no state line, and no note', async () => {
    answer = EMPTY;
    const el = await section();
    const field = el.querySelector('form.pkgs-add input[aria-label="Package name"]') as HTMLInputElement;
    expect(field.getAttribute('placeholder')).toBe('such as ansible-lint');
    const kinds = [...el.querySelectorAll('.pkgs-kind[role="radiogroup"] label')];
    expect(el.querySelector('.pkgs-kind')!.getAttribute('aria-label')).toBe('Kind of package');
    expect(kinds.map((k) => k.textContent)).toEqual(['Python package', 'Program']);
    expect((kinds[0].querySelector('input') as HTMLInputElement).checked).toBe(true);
    expect(button(el, 'Add')).toBeDefined();
    const sw = el.querySelector('input[role="switch"]') as HTMLInputElement;
    expect(sw.closest('label')!.textContent).toBe(ASK_TEXT);
    expect(sw.checked).toBe(true);
    expect(el.querySelector('.pkgs-list')).toBeNull();
    expect(el.querySelector('.pkgs-state')).toBeNull();
    expect(el.querySelector('.pkgs-note')).toBeNull();
    expect(button(el, 'Turn off')).toBeDefined();
  });

  it('shows the two lists with a remove key per package, the state, and the note when on with packages', async () => {
    const el = await section();
    const lists = [...el.querySelectorAll('.pkgs-list')];
    expect(lists.map((l) => l.querySelector('h4')!.textContent)).toEqual(['Python packages', 'Programs']);
    // A ready worker names the version that it installed, after the name. iproute2 has no version on a ready worker.
    expect(lists.map((l) => [...l.querySelectorAll('.pkgs-name')].map((x) => x.textContent))).toEqual([['ansible-lint24.9.2'], ['iproute2']]);
    expect(el.querySelector('.pkgs-name .pkgs-version')!.textContent).toBe('24.9.2');
    expect([...el.querySelectorAll('.pkgs-list button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Remove ansible-lint', 'Remove iproute2']);
    expect(el.querySelector('.pkgs-state')!.textContent).toBe('Ready on 2 of 2 workers.');
    expect(el.querySelector('.pkgs-state')!.getAttribute('role')).toBe('status');
    expect(el.querySelector('.pkgs-state .led-green')).not.toBeNull();
    expect(el.querySelector('.pkgs-note')!.textContent).toBe(NOTE_TEXT);
    expect(el.querySelector('details.pkgs-fold')).toBeNull();
  });

  it('says how many workers take a change, and names no version of a worker that is not ready', async () => {
    answer = { ...ON, applying: true, workers: [{ task: 'crew-0', state: 'pending', installed: { python: [{ name: 'ansible-lint', version: '1.0' }] } }, { task: 'crew-1', state: 'materializing' }] };
    const el = await section();
    expect(el.querySelector('.pkgs-state')!.textContent).toBe('Updating on 2 of 2 workers.');
    expect(el.querySelector('.pkgs-version')).toBeNull();
    expect(el.querySelector('.pkgs-state .led-amber')).not.toBeNull();
  });

  it('names the worker whose install failed, with a fold of the output as it is', async () => {
    const output = '  × No solution found when resolving dependencies:\n  ╰─▶ Because does-not-exist was not found <here>.\n';
    answer = { ...ON, workers: [ready('crew-0'), { task: 'crew-1', state: 'failed', failure: { step: 'python', error: 'the install failed', output } }] };
    const el = await section();
    expect(el.querySelector('.pkgs-state')!.textContent).toBe('The install failed on crew-1.');
    expect(el.querySelector('.pkgs-state .led-red')).not.toBeNull();
    const fold = el.querySelector('details.pkgs-fold') as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(fold.querySelector('summary')!.textContent).toBe('Show the output');
    expect(fold.querySelector('pre.pkgs-output')!.textContent).toBe(output);
  });

  it('accepts an answer with missing fields', async () => {
    answer = { pool: 'crew', on: true } as unknown as Packages;
    const el = await section();
    expect(el.querySelector('form.pkgs-add')).not.toBeNull();
    expect(el.querySelector('.pkgs-list')).toBeNull();
    expect((el.querySelector('input[role="switch"]') as HTMLInputElement).checked).toBe(false);
  });

  it('never names the tools, the registries, or the files of an environment', async () => {
    answer = { ...ON, workers: [{ task: 'crew-0', state: 'failed', failure: { output: 'boom' } }] };
    const el = await section();
    const words = el.textContent!.toLowerCase();
    for (const w of ['uv', 'pixi', 'conda', 'pypi', 'lock', 'manifest', 'egress', 'mirror', 'pool']) expect(words).not.toMatch(new RegExp('\\b' + w + '\\b'));
  });

  it('shows the state and the lists to a person who is not an owner, with no key that changes them', async () => {
    const el = await section(false);
    expect(el.querySelector('form.pkgs-add')).toBeNull();
    expect(el.querySelectorAll('.pkgs-list button').length).toBe(0);
    expect(button(el, 'Turn off')).toBeUndefined();
    expect((el.querySelector('input[role="switch"]') as HTMLInputElement).disabled).toBe(true);
    expect(el.querySelector('.pkgs-state')!.textContent).toBe('Ready on 2 of 2 workers.');
    answer = OFF;
    const off = await section(false);
    expect(off.querySelectorAll('section.pkgs')[0].textContent).toContain(OFF_TEXT);
    expect(button(off, 'Turn on packages')).toBeUndefined();
  });
});

describe('a change of the packages', () => {
  it('adds a program from the add row, empties the field, and keeps the focus there', async () => {
    const el = await section();
    const field = el.querySelector('form.pkgs-add input') as HTMLInputElement;
    field.focus();
    typeIn(field, '  nodejs>=22 ');
    act(() => (el.querySelectorAll('.pkgs-kind input')[1] as HTMLInputElement).click());
    submit(el);
    await vi.waitFor(() => expect(puts().length).toBe(1));
    expect(puts()[0].body).toEqual({ on: true, ask: true, python: ['ansible-lint'], tools: ['iproute2', 'nodejs>=22'] });
    await vi.waitFor(() => expect(field.value).toBe(''));
    expect([...el.querySelectorAll('.pkgs-list')][1].textContent).toContain('nodejs>=22');
    expect(document.activeElement).toBe(field);
  });

  it('adds with the key Add, as a Python package by default', async () => {
    const el = await section();
    typeIn(el.querySelector('form.pkgs-add input') as HTMLInputElement, 'yamllint');
    act(() => button(el, 'Add')!.click());
    await vi.waitFor(() => expect(puts().length).toBe(1));
    expect(puts()[0].body).toEqual({ on: true, ask: true, python: ['ansible-lint', 'yamllint'], tools: ['iproute2'] });
  });

  it('refuses an empty name, a name with a dash first, and a name in the list already, without a call', async () => {
    const el = await section();
    const field = el.querySelector('form.pkgs-add input') as HTMLInputElement;
    const said = () => el.querySelector('.pkgs-error')!.textContent;
    submit(el);
    expect(said()).toBe('Write the name of a package.');
    typeIn(field, '--pre');
    expect(el.querySelector('.pkgs-error')).toBeNull();
    submit(el);
    expect(said()).toBe('A package name cannot start with a dash.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(el.querySelector('.pkgs-error')!.id);
    typeIn(field, 'Ansible-Lint');
    submit(el);
    expect(said()).toBe('Ansible-Lint is in the list already.');
    expect(puts().length).toBe(0);
  });

  it('removes a package with its key', async () => {
    const el = await section();
    act(() => (el.querySelector('button[aria-label="Remove iproute2"]') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(puts().length).toBe(1));
    expect(puts()[0].body).toEqual({ on: true, ask: true, python: ['ansible-lint'], tools: [] });
    await vi.waitFor(() => expect(el.querySelectorAll('.pkgs-list').length).toBe(1));
    expect(el.querySelector('.pkgs-list h4')!.textContent).toBe('Python packages');
  });

  it('changes the switch, and turns packages off with the small key', async () => {
    const el = await section();
    act(() => (el.querySelector('input[role="switch"]') as HTMLInputElement).click());
    await vi.waitFor(() => expect(puts().length).toBe(1));
    expect(puts()[0].body).toEqual({ on: true, ask: false, python: ['ansible-lint'], tools: ['iproute2'] });
    await vi.waitFor(() => expect((el.querySelector('input[role="switch"]') as HTMLInputElement).checked).toBe(false));
    act(() => button(el, 'Turn off')!.click());
    await vi.waitFor(() => expect(puts().length).toBe(2));
    expect(puts()[1].body).toEqual({ on: false, ask: false, python: ['ansible-lint'], tools: ['iproute2'] });
    await vi.waitFor(() => expect(el.querySelector('.pkgs-off')).not.toBeNull());
    expect(document.activeElement).toBe(button(el, 'Turn on packages'));
  });

  it('shows a refusal of the front as one sentence in the section, and keeps the packages', async () => {
    putAnswer = () => new Response(JSON.stringify({ status: 400, detail: 'packages: the package nope starts with a dash' }), { status: 400, headers: { 'Content-Type': 'application/problem+json' } });
    const el = await section();
    typeIn(el.querySelector('form.pkgs-add input') as HTMLInputElement, 'nope');
    submit(el);
    await vi.waitFor(() => expect(el.querySelector('.pkgs-error')).not.toBeNull());
    expect(el.querySelector('.pkgs-error')!.textContent).toBe('The package nope starts with a dash.');
    expect(el.querySelector('.pkgs-error')!.getAttribute('role')).toBe('alert');
    expect((el.querySelector('form.pkgs-add input') as HTMLInputElement).value).toBe('nope');
    expect([...el.querySelectorAll('.pkgs-name')].map((x) => x.firstChild!.textContent)).toEqual(['ansible-lint', 'iproute2']);
  });
});

describe('a Python package that the index does not know', () => {
  it('shows the sentence of the front as it is, and keeps the name in the field', async () => {
    putAnswer = () => new Response(JSON.stringify({ status: 400, detail: 'There is no Python package named does-not-exist-2.' }), { status: 400, headers: { 'Content-Type': 'application/problem+json' } });
    const el = await section();
    typeIn(el.querySelector('form.pkgs-add input') as HTMLInputElement, 'does-not-exist-2');
    submit(el);
    await vi.waitFor(() => expect(el.querySelector('.pkgs-error')).not.toBeNull());
    expect(el.querySelector('.pkgs-error')!.textContent).toBe('There is no Python package named does-not-exist-2.');
    expect((el.querySelector('form.pkgs-add input') as HTMLInputElement).value).toBe('does-not-exist-2');
  });
});

describe('the refresh of the section', () => {
  // The body of an answer arrives on a real turn of the event loop, so the clock moves in steps, with a real wait after each step.
  const later = (globalThis as unknown as { setImmediate: (f: () => void) => void }).setImmediate;
  const flush = () =>
    act(async () => {
      for (let i = 0; i < 4; i++) await new Promise<void>((r) => later(r));
    });
  const tick = async (ms: number) => {
    for (let t = 0; t < ms; t += 250) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(Math.min(250, ms - t));
      });
      await flush();
    }
  };

  it('reads the route on open only while every worker is ready and nothing changes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      mount(<PackagesSection agent="migrator" pool="crew" owner />);
      await tick(10);
      expect(reads()).toBe(1);
      await tick(60_000);
      expect(reads()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads the route every 5 seconds while a change reaches the workers, and stops once they are ready', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      answer = { ...ON, applying: true, workers: [ready('crew-0'), { task: 'crew-1', state: 'materializing' }] };
      const el = mount(<PackagesSection agent="migrator" pool="crew" owner />);
      await tick(10);
      expect(reads()).toBe(1);
      await tick(4900);
      expect(reads()).toBe(1);
      await tick(200);
      expect(reads()).toBe(2);
      answer = ON;
      await tick(5100);
      expect(reads()).toBe(3);
      expect(el.querySelector('.pkgs-state')!.textContent).toBe('Ready on 2 of 2 workers.');
      await tick(60_000);
      expect(reads()).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads again while a worker is not ready, also when nothing applies', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      answer = { ...ON, workers: [ready('crew-0'), { task: 'crew-1', state: 'unknown' }] };
      mount(<PackagesSection agent="migrator" pool="crew" owner />);
      await tick(10);
      await tick(10_100);
      expect(reads()).toBe(3);
      // The worker reports ready, and the reads stop.
      answer = ON;
      await tick(5000);
      const before = reads();
      await tick(60_000);
      expect(reads()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts to read again after a change of the person, from the answer of the change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      putAnswer = (b) => ({ ...ON, ...(b as object), python: [{ name: 'ansible-lint' }], tools: [], applying: true });
      const el = mount(<PackagesSection agent="migrator" pool="crew" owner />);
      await tick(10);
      expect(reads()).toBe(1);
      act(() => (el.querySelector('button[aria-label="Remove iproute2"]') as HTMLButtonElement).click());
      await tick(10);
      expect(el.querySelector('.pkgs-note')!.textContent).toBe(NOTE_TEXT);
      await tick(5000);
      expect(reads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
