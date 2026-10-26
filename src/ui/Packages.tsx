// The section Packages of the profile of an agent that a pool runs. A
// person gives the workers of the agent extra software here: a Python
// package or a program, by its name. The section says package, Python
// package, and Program, and never names the tools that install them.
//
// Off, the section says that the agent uses the programs of its image, and
// an owner can turn packages on. On, an owner adds a package with one field
// and a choice of two, removes one from its list, and lets the agent ask
// for a package. Each package shows the version that a ready worker
// installed. A state line says how far the change reached the workers, and
// a fold shows the output of a failed install as it is.
//
// The section reads GET /v1/pools/{name}/packages when it opens. While a
// change reaches the workers, or a worker is not ready, it reads the route
// again every five seconds. Otherwise it reads nothing more. A front
// without packages answers 404, and the section then does not exist.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError, SigninNeeded } from '../api/client';
import type { PackageSwitch, Packages, PackagesBody } from '../api/types';
import { KIND_WORDS, POLL_MS, bodyOf, keyOf, lineOf, nameProblem, normalize, shouldPoll, versionsOf, type PackageKind } from '../lib/packages';
import { Button, Command, IconButton, Input, LineLed } from './primitives';
import { Switch } from './ChannelDialog';
import { Confirm } from './common';
import { useSelect } from '../state/store';
import { selectFacts } from '../state/reducer';
import { workersOf } from '../lib/workers';
import { Glyph } from './icons';

export const OFF_TEXT = 'This agent has only the programs that it came with.';
export const ASK_TEXT = 'The agent can ask for a package. You approve each one.';
export const NOTE_TEXT = 'Workers take a change in about a minute. Work in progress does not stop.';

const KINDS: PackageKind[] = ['python', 'tools'];

/**
 * refusalText is the sentence of a refused change. The server words a
 * refused name as one sentence that starts with the name in quotes, such
 * as "bad name;rm" holds a semicolon; ..., and the section shows it as it
 * is: the cut at the first full stop of a plain error would cut a name
 * such as ruamel.yaml. Another error keeps the words of the client.
 */
export function refusalText(e: unknown): string {
  if (!(e instanceof ApiError)) return 'The change failed. Try it again.';
  const detail = e.problem && typeof e.problem.detail === 'string' ? e.problem.detail.trim() : '';
  if (detail.startsWith('"') || detail === 'Write the name of a package.') return detail;
  return e.message;
}

/** offWords names what the workers lose when packages turn off: a few names, else a count. */
export function offWords(p: Packages): string {
  const names = [...p.python, ...p.tools].map((x) => x.name);
  if (names.length <= 3) return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  return names.slice(0, 2).join(', ') + ', and ' + (names.length - 2) + ' more packages';
}

/** Where the focus goes after a change redraws the section. */
type FocusTo = '' | 'field' | 'turn-on';

/**
 * PackagesSection is the section Packages of the profile of agent, whose
 * workers the pool runs. An owner changes it. Any other person reads it.
 */
export function PackagesSection({ agent, pool, owner, onSwitch }: { agent: string; pool: string; owner: boolean; onSwitch?: (sw: PackageSwitch) => void }) {
  // undefined while the first read runs, null when the section does not exist.
  const [p, setP] = useState<Packages | null | undefined>(undefined);
  // The reason of a refused change, and the reason why the name in the field does not work. The section shows one sentence.
  const [error, setError] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PackageKind>('python');
  // Each read and each change takes a number. A read whose number is old answers too late, so the section drops it.
  const gen = useRef(0);
  const live = useRef(true);
  // The keys stay enabled during a change, so the focus stays on them. This flag turns away a second change until the first one answers.
  const saving = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const turnOnKey = useRef<HTMLButtonElement>(null);
  const focusTo = useRef<FocusTo>('');
  const [askOff, setAskOff] = useState(false);
  // The workers that sleep, by name: a change reaches them only when they wake.
  const facts = useSelect(selectFacts);
  const sleeping = new Set(
    workersOf(facts, agent)
      .workers.filter((w) => w.phase === 'Suspended')
      .map((w) => w.name),
  );

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The read on open, and again at each tick of the refresh.
  useEffect(() => {
    const my = ++gen.current;
    api.getPackages(pool).then(
      (v) => {
        if (live.current && my === gen.current) setP(normalize(v, pool));
      },
      () => {
        // A front without packages, or a person who cannot read them, gets no section. A failed refresh keeps what the section shows.
        if (live.current && my === gen.current) setP((old) => (old === undefined ? null : old));
      },
    );
  }, [pool, tick]);

  // The profile words what the agent can do from the switch, so it hears each switch that the section reads or sets.
  const on = !!p && p.available !== false && p.on;
  const ask = !!p && p.ask;
  useEffect(() => {
    if (p && p.available !== false && onSwitch) onSwitch({ on, ask });
  }, [!!p, on, ask]);

  // The refresh: a read every POLL_MS while the change reaches the workers. A change in progress holds it.
  const poll = !busy && shouldPoll(p);
  useEffect(() => {
    if (!poll) return;
    const t = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => clearTimeout(t);
  }, [poll, p, tick]);

  // The focus goes back into the section after a change removes the control that had it.
  useEffect(() => {
    const to = focusTo.current;
    focusTo.current = '';
    if (to === 'field' && field.current) field.current.focus();
    if (to === 'turn-on' && turnOnKey.current) turnOnKey.current.focus();
  });

  if (!p || p.available === false) return null;

  /** save replaces the setting with one change, and shows the answer, or the reason of a refusal in one sentence. */
  const save = async (change: Partial<PackagesBody>, then: FocusTo = ''): Promise<boolean> => {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError('');
    setProblem('');
    // A read that is still on its way answers the state before this change.
    gen.current++;
    try {
      const v = await api.putPackages(pool, { ...bodyOf(p), ...change });
      if (!live.current) return true;
      focusTo.current = then;
      setP(normalize(v, pool));
      return true;
    } catch (e) {
      if (live.current && !(e instanceof SigninNeeded)) setError(refusalText(e));
      return false;
    } finally {
      saving.current = false;
      if (live.current) setBusy(false);
    }
  };

  const add = async (e: Event) => {
    e.preventDefault();
    if (saving.current) return;
    const why = nameProblem(p, kind, name);
    if (why) {
      setProblem(why);
      return;
    }
    const added = name.trim();
    if (await save({ [kind]: [...p[kind].map((x) => x.name), added] }, 'field')) setName('');
  };

  const remove = (k: PackageKind, item: string) => save({ [k]: p[k].filter((x) => x.name !== item).map((x) => x.name) }, 'field');

  const line = lineOf(p, (task) => sleeping.has(task) || sleeping.has(task.slice(task.lastIndexOf('/') + 1)));
  const output = line && line.failure ? line.failure.output || line.failure.error || '' : '';
  const id = 'packages-' + agent;
  const any = p.python.length > 0 || p.tools.length > 0;
  return (
    <section class="prof-sec pkgs" aria-labelledby={id} aria-busy={busy ? 'true' : undefined}>
      <div class="prof-sec-head">
        <h3 class="t-sub" id={id}>
          Packages
        </h3>
        <span class="grow" />
        {owner && p.on && (
          // Off drops every package from the workers, so a list that holds some asks first.
          <Button size="s" kind="quiet" class="pkgs-off-key" onClick={() => (any ? setAskOff(true) : save({ on: false }, 'turn-on'))}>
            Turn off
          </Button>
        )}
      </div>
      {!p.on ? (
        <div class="pkgs-off">
          <p>{OFF_TEXT}</p>
          {owner && (
            <Button ref={turnOnKey} size="s" onClick={() => save({ on: true, ask: true }, 'field')}>
              Turn on packages
            </Button>
          )}
        </div>
      ) : (
        <>
          {owner && (
            <form class="pkgs-add" onSubmit={add}>
              <div class="pkgs-add-row">
                <Input
                  ref={field}
                  aria-label="Package name"
                  placeholder="such as ansible-lint"
                  autoComplete="off"
                  spellcheck={false}
                  value={name}
                  invalid={!!(problem || error)}
                  aria-describedby={problem || error ? id + '-error' : undefined}
                  onInput={(e) => {
                    setName((e.target as HTMLInputElement).value);
                    setProblem('');
                  }}
                />
                <Button type="submit">Add</Button>
              </div>
              {/* A refusal of a name sits under the field that holds it. */}
              {(problem || error) && (
                <p class="field-error pkgs-error" id={id + '-error'} role="alert">
                  {problem || error}
                </p>
              )}
              <div class="pkgs-kind" role="radiogroup" aria-label="Kind of package">
                {KINDS.map((k) => (
                  <label class="check">
                    <input type="radio" name={id + '-kind'} value={k} checked={kind === k} onChange={() => setKind(k)} />
                    <span>{KIND_WORDS[k].one}</span>
                  </label>
                ))}
              </div>
            </form>
          )}
          {KINDS.map((k) => {
            if (p[k].length === 0) return null;
            const versions = versionsOf(p, k);
            return (
              <div class="pkgs-list">
                <h4 class="pkgs-list-head" id={id + '-' + k}>
                  {KIND_WORDS[k].many}
                </h4>
                <ul aria-labelledby={id + '-' + k}>
                  {p[k].map((x) => {
                    const version = versions.get(keyOf(x.name));
                    return (
                      <li>
                        <span class="pkgs-name">
                          {x.name}
                          {version && <span class="pkgs-version">{version}</span>}
                        </span>
                        {owner && <IconButton icon="close" label={'Remove ' + x.name} onClick={() => remove(k, x.name)} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {line && (
            <p class="pkgs-state" role="status">
              <LineLed tone={line.tone} />
              <span>{line.text}</span>
            </p>
          )}
          {output && (
            <details class="advanced pkgs-fold">
              <summary>
                <Glyph name="back" size={16} />
                Show the output
              </summary>
              <Command class="pkgs-output">{output}</Command>
            </details>
          )}
          {(any || p.applying) && !(line && line.asleep) && <p class="pkgs-note">{NOTE_TEXT}</p>}
          <Switch label={ASK_TEXT} on={p.ask} disabled={!owner} onChange={(ask) => save({ ask })} />
        </>
      )}
      {askOff && (
        <Confirm
          title="Turn off packages?"
          confirm="Turn off"
          danger
          busy={busy}
          onCancel={() => setAskOff(false)}
          onConfirm={async () => {
            await save({ on: false }, 'turn-on');
            setAskOff(false);
          }}
        >
          <p>
            The workers of {agent} lose {offWords(p)}.
          </p>
        </Confirm>
      )}
      {(problem || error) && !(p.on && owner) && (
        <p class="field-error pkgs-error" id={id + '-error'} role="alert">
          {problem || error}
        </p>
      )}
    </section>
  );
}
