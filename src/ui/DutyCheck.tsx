// Check first, the section of the editor of a duty that looks before the
// duty wakes the model. Write the check for me asks the agent for a check
// from the words of the person: the call takes up to two minutes, so the
// section says how long it waits and offers Cancel. The fields by hand
// look at an address, with a secret of the front that may go to its host,
// or call a tool of the agent, picked from its profile, with its input as
// names and values. The filters keep some items, each a field, a test, and
// a value. Nobody types a secret, a regex, or code. GET /v1/duties/options
// names what the front serves, and the section offers nothing else. A tool
// shows by what it does, and its name stays out of sight unless two tools
// say the same.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import type { CheckFirst as CheckRecord, CheckFound, DutyOptions, DutyRecord } from '../api/types';
import {
  WHERE_TESTS,
  checkFormOf,
  checkOf,
  checkTools,
  checkWords,
  elapsedWords,
  emptyCheck,
  foundWords,
  hasCheck,
  itemWords,
  problemsBy,
  secretsFor,
  splitProblem,
  toolName,
  type CheckForm,
  type WhereRow,
  type WhereTest,
} from '../lib/duties';
import { phraseOf } from '../lib/tools';
import { useProfile } from '../state/profiles';
import { useToolCatalog } from '../state/tools';
import { Glyph } from './icons';
import { Button, Choices, Field, Help, IconButton, Input, TextArea } from './primitives';

/** messageOf is the sentence of a failed call. */
const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'The action failed. Try it again.');

/** reasonOf is the whole reason of a refusal of Write the check: its error, else its detail, with a capital and a period. */
function reasonOf(e: unknown): string {
  const p = e instanceof ApiError ? e.problem : null;
  const r = p && typeof p.error === 'string' && p.error.trim() ? p.error.trim() : p && typeof p.detail === 'string' && p.detail.trim() ? p.detail.trim() : '';
  if (!r) return messageOf(e);
  const s = r[0].toUpperCase() + r.slice(1);
  return /[.!?]$/.test(s) ? s : s + '.';
}

/** What the agent tried, from a 422 of Write the check: the record that it wrote and its readback, which the page shows and does not take. */
interface TriedRecord {
  checkFirst: CheckRecord | null;
  readback: string;
}

/** The words of the looks that the front can serve. */
const LOOKS: { id: 'http' | 'tool'; label: string }[] = [
  { id: 'http', label: 'A website or API' },
  { id: 'tool', label: 'A tool of the agent' },
];

export interface CheckProps {
  check: CheckForm;
  onChange: (c: CheckForm) => void;
  /** The agent of the duty, which writes the check and holds its tools. */
  agent: string;
  agentName: string;
  /** The name of the duty in the route of a dry run, for Try the check. */
  pathName: string;
  /** The name of the duty in the route of Write the check: new for a duty that is not saved yet. */
  writeName: string;
  /** The record of the whole form, for Try the check. */
  record: () => DutyRecord;
  /** What the front serves now. */
  options: DutyOptions;
  /** The errors of the form: the count of items and the filters. */
  error?: string;
  whereError?: string;
  /** The problems of the front that concern the check. */
  problems?: string[];
  /** Gets the problems of Write the check that concern the agent, which show under the agent picker. */
  onAgentProblems?: (list: string[]) => void;
  open: boolean;
  onToggle: (open: boolean) => void;
}

/**
 * toolChoices names each tool of a choice by what it does. A tool without
 * a phrase keeps its name, without the prefix of the server, and two tools
 * that say the same add their names, so a person tells them apart.
 */
export function toolChoices(tools: string[], phrase: (t: string) => string): [string, string][] {
  const said = tools.map((t) => {
    const p = phrase(t);
    return p && p !== t ? p : toolName(t);
  });
  return tools.map((t, i) => [t, said.filter((x) => x === said[i]).length > 1 && said[i] !== toolName(t) ? said[i] + ' (' + toolName(t) + ')' : said[i]]);
}

/** ToolPick is the choice of a tool of the agent, from its profile, each tool by what it does. */
function ToolPick({ agent, value, onChange }: { agent: string; value: string; onChange: (tool: string) => void }) {
  const profile = useProfile(agent);
  const catalog = useToolCatalog();
  const tools = useMemo(() => {
    // A profile without a list of tools has every tool of the catalog.
    const list = checkTools(profile ? profile.tools : [], catalog);
    return value && !list.includes(value) ? [value, ...list] : list;
  }, [profile, catalog, value]);
  const choices = useMemo(() => toolChoices(tools, (t) => phraseOf(catalog, t)), [tools, catalog]);
  if (!agent) return <p class="t-meta">Pick the agent first. Its tools show here.</p>;
  return (
    <Field label="Tool">
      <select class="recess" value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        <option value="">{profile === undefined ? 'Loading the tools' : tools.length ? 'Pick a tool' : 'This agent has no tool to call'}</option>
        {choices.map(([t, w]) => (
          <option value={t} title={toolName(t)}>
            {w}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** SecretPick is the choice of a secret of the front for an address: only the secrets that may go to its host, and the one that the check names. */
function SecretPick({ options, url, value, onChange }: { options: DutyOptions; url: string; value: string; onChange: (secret: string) => void }) {
  const fit = secretsFor(options.secrets, url).map((s) => s.name);
  const names = value && !fit.includes(value) ? [...fit, value] : fit;
  return (
    <Field
      label={
        <>
          Secret{' '}
          <Help label="What the secret is">A setting of the server that holds the token of the address. The page never sees the token. Only the secrets for the host of the address show.</Help>
        </>
      }
      class="narrow"
    >
      <select class="recess" value={value} disabled={names.length === 0} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        <option value="">No secret</option>
        {names.map((n) => (
          <option value={n}>{fit.includes(n) ? n : n + ', not for this address'}</option>
        ))}
      </select>
    </Field>
  );
}

/** Filters are the filters of a check: each a field of an item, a test, and a value, with Add a filter. */
function Filters({ rows, onChange, error }: { rows: WhereRow[]; onChange: (rows: WhereRow[]) => void; error?: string }) {
  const set = (i: number, p: Partial<WhereRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div class="duty-input" role="group" aria-label="Keep the items where">
      <span class="field-label">Keep the items where</span>
      {rows.map((r, i) => (
        <div class="duty-filter-row">
          <Input aria-label={'Field of filter ' + (i + 1)} value={r.field} spellcheck={false} placeholder="priority" onInput={(e) => set(i, { field: (e.target as HTMLInputElement).value })} />
          <select class="recess" aria-label={'Test of filter ' + (i + 1)} value={r.test} onChange={(e) => set(i, { test: (e.target as HTMLSelectElement).value as WhereTest })}>
            {WHERE_TESTS.map(([t, w]) => (
              <option value={t}>{w}</option>
            ))}
          </select>
          <Input aria-label={'Value of filter ' + (i + 1)} value={r.text} spellcheck={false} placeholder={r.test === 'oneOf' ? '1, 2' : '1'} onInput={(e) => set(i, { text: (e.target as HTMLInputElement).value })} />
          <IconButton icon="close" label={'Remove filter ' + (i + 1)} onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="s" kind="quiet" icon="plus" onClick={() => onChange([...rows, { field: '', test: 'is', text: '' }])}>
        Add a filter
      </Button>
      {error && (
        <span class="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** The fields of a check by hand: what to look at, where the list is, what makes an item new, the filters, and when the agent wakes. */
function CheckFields({ check, onChange, agent, options, error, whereError }: Pick<CheckProps, 'check' | 'onChange' | 'agent' | 'options' | 'error' | 'whereError'>) {
  const set = (p: Partial<CheckForm>) => onChange({ ...check, ...p });
  // The looks that the front serves, and the look of this check, so a change keeps it.
  const looks = LOOKS.filter((l) => options.looks.includes(l.id) || l.id === check.look);
  return (
    <>
      {looks.length > 1 && <Choices name="duty-look" legend="Look at" value={check.look} options={looks} onChange={(look) => set({ look })} />}
      {check.look === 'http' ? (
        <div class="field-row">
          <Field label="Address">
            <Input type="url" value={check.url} spellcheck={false} placeholder="https://example.com/api/queue" onInput={(e) => set({ url: (e.target as HTMLInputElement).value })} />
          </Field>
          <SecretPick options={options} url={check.url} value={check.secret} onChange={(secret) => set({ secret })} />
        </div>
      ) : (
        <>
          <ToolPick agent={agent} value={check.tool} onChange={(tool) => set({ tool })} />
          <div class="duty-input" role="group" aria-label="What the tool gets">
            <span class="field-label">What the tool gets</span>
            {check.input.map((r, i) => (
              <div class="duty-input-row">
                <Input aria-label={'Name ' + (i + 1)} value={r.name} spellcheck={false} placeholder="query" onInput={(e) => set({ input: check.input.map((x, j) => (j === i ? { ...x, name: (e.target as HTMLInputElement).value } : x)) })} />
                <Input aria-label={'Value ' + (i + 1)} value={r.text} spellcheck={false} placeholder="priority<=2" onInput={(e) => set({ input: check.input.map((x, j) => (j === i ? { ...x, text: (e.target as HTMLInputElement).value } : x)) })} />
                <IconButton icon="close" label={'Remove value ' + (i + 1)} onClick={() => set({ input: check.input.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="s" kind="quiet" icon="plus" onClick={() => set({ input: [...check.input, { name: '', text: '' }] })}>
              Add a value
            </Button>
          </div>
        </>
      )}
      <div class="field-row">
        <Field
          label={
            <>
              Where the list is{' '}
              <Help label="How to name the list">The place of the list in the answer, with a dot between the names, such as result.records. Leave it empty to take the whole answer as the list.</Help>
            </>
          }
        >
          <Input value={check.items} spellcheck={false} placeholder="The whole answer" onInput={(e) => set({ items: (e.target as HTMLInputElement).value })} />
        </Field>
        <Field
          label={
            <>
              What makes an item new{' '}
              <Help label="How to name the field">The field of an item that no other item shares, such as number or id. Leave it empty to compare whole items.</Help>
            </>
          }
        >
          <Input value={check.key} spellcheck={false} placeholder="The whole item" onInput={(e) => set({ key: (e.target as HTMLInputElement).value })} />
        </Field>
      </div>
      <Filters rows={check.where} onChange={(where) => set({ where })} error={whereError} />
      <Choices
        name="duty-wake"
        legend="Wake the agent"
        value={check.wake}
        options={[
          { id: 'new', label: 'For new items' },
          { id: 'any', label: 'For any item' },
          { id: 'atLeast', label: 'At a count' },
        ]}
        onChange={(wake) => set({ wake })}
      />
      {check.wake === 'atLeast' && (
        <Field label="How many items" error={error} class="duty-narrow">
          <Input type="number" min={1} inputMode="numeric" value={check.count} invalid={!!error} onInput={(e) => set({ count: (e.target as HTMLInputElement).value })} />
        </Field>
      )}
    </>
  );
}

/** What Try the check found, or why it failed. */
type Tried = { found: CheckFound } | { error: string } | null;

/**
 * CheckFirst is the check before the duty wakes the agent, closed by
 * default. Write the check for me asks the agent for one from the words of
 * the person. The key stays off until the editor has an agent. Where the
 * front has no such route, the key goes and the fields by hand show. Try
 * the check runs it once and says what it finds now.
 */
export function CheckFirst(p: CheckProps) {
  const { check, onChange, agent, agentName, pathName, writeName, record, options, open, onToggle } = p;
  const [words, setWords] = useState('');
  const [writer, setWriter] = useState(true);
  const [writing, setWriting] = useState(false);
  const [waited, setWaited] = useState(0);
  const [wrote, setWrote] = useState('');
  const [writeError, setWriteError] = useState('');
  const [stopped, setStopped] = useState(false);
  const [attempted, setAttempted] = useState<TriedRecord | null>(null);
  const [manual, setManual] = useState(() => hasCheck(check));
  const [tried, setTried] = useState<Tried>(null);
  const [trying, setTrying] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const on = hasCheck(check);
  // The call takes up to two minutes, so the section counts the seconds.
  useEffect(() => {
    if (!writing) return;
    setWaited(0);
    const t = setInterval(() => setWaited((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [writing]);
  // A section that leaves stops the call that it started.
  useEffect(() => () => abort.current?.abort(), []);
  const write = async () => {
    if (!words.trim()) {
      setWriteError('Write what the agent waits for.');
      return;
    }
    if (!agent) return;
    const ctl = new AbortController();
    abort.current = ctl;
    setWriting(true);
    setWriteError('');
    setStopped(false);
    setAttempted(null);
    if (p.onAgentProblems) p.onAgentProblems([]);
    try {
      const w = await api.writeCheck(writeName, words.trim(), agent, ctl.signal);
      onChange(checkFormOf(w.checkFirst));
      setWrote(w.readback || '');
      setTried(w.check ? { found: w.check } : null);
      setManual(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setStopped(true);
      else if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
        // The front has no route that writes a check: the fields by hand take its place.
        setWriter(false);
        setManual(true);
      } else if (e instanceof ApiError && e.status === 504) setWriteError(agentName + ' did not answer within two minutes. Try again, or set the check up by hand.');
      else if (e instanceof ApiError && e.status === 422) {
        // The agent could not write a check that works. A record that it wrote shows as it is, so the person sees what it tried.
        setWriteError(reasonOf(e));
        const pr = e.problem || {};
        const record = pr.checkFirst && typeof pr.checkFirst === 'object' ? (pr.checkFirst as CheckRecord) : null;
        const readback = typeof pr.readback === 'string' ? pr.readback : '';
        if (record || readback) setAttempted({ checkFirst: record, readback });
      } else if (e instanceof ApiError && e.status === 400 && e.problem && Array.isArray(e.problem.problems) && e.problem.problems.length) {
        // A problem of the words shows under the words, and one of the agent under the agent picker.
        const by = problemsBy(e.problem.problems as unknown[], (path) => (path === 'agent' || path.startsWith('agent.') ? 'agent' : 'words'));
        setWriteError([...(by.words || []), ...(by.top || [])].join(' '));
        if (by.agent && p.onAgentProblems) p.onAgentProblems(by.agent);
      } else setWriteError(messageOf(e));
    }
    if (abort.current === ctl) abort.current = null;
    setWriting(false);
  };
  const cancel = () => {
    if (abort.current) abort.current.abort();
  };
  const tryCheck = async () => {
    setTrying(true);
    try {
      const a = await api.dryRunDuty(pathName, record(), true);
      if (a.check) setTried({ found: a.check });
      else setTried({ error: (a.problems || []).map((x) => splitProblem(x).text).filter(Boolean)[0] || 'No check ran.' });
    } catch (e) {
      setTried({ error: messageOf(e) });
    }
    setTrying(false);
  };
  const written = checkOf(check);
  // A change by hand makes the readback of the agent and the last try stale.
  const change = (c: CheckForm) => {
    setWrote('');
    setTried(null);
    onChange(c);
  };
  const problems = p.problems || [];
  const catalog = useToolCatalog();
  const toolWords = (t: string) => phraseOf(catalog, t);
  return (
    <details class="advanced duty-check" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary>
        <Glyph name="back" size={16} />
        Check first
      </summary>
      <div class="advanced-body">
        {writer && (
          <div class="duty-write">
            <Field label="Wake the agent only when" error={writeError}>
              <TextArea rows={2} value={words} invalid={!!writeError} placeholder="there is a new P1 or P2 in the Platform Ops queue" onInput={(e) => setWords((e.target as HTMLTextAreaElement).value)} />
            </Field>
            <div class="duty-actions">
              <Button size="s" disabled={writing || !agent} aria-describedby={!agent ? 'duty-write-hint' : undefined} onClick={write}>
                Write the check for me
              </Button>
              {writing && (
                <Button size="s" kind="quiet" onClick={cancel}>
                  Cancel
                </Button>
              )}
              {!manual && !writing && (
                <Button size="s" kind="quiet" onClick={() => setManual(true)}>
                  Set it up by hand
                </Button>
              )}
            </div>
            {!agent && (
              <p class="t-meta" id="duty-write-hint">
                Pick the agent first. It writes the check.
              </p>
            )}
            {writing && (
              <div class="duty-wait" role="status">
                <p>{agentName} writes the check, then tries it once. This can take up to two minutes.</p>
                <p class="t-meta">{elapsedWords(waited)}</p>
              </div>
            )}
            {stopped && !writing && (
              <p class="t-meta" role="status">
                Stopped. The check did not change.
              </p>
            )}
            {attempted && !writing && (
              <div class="duty-tried">
                <p class="t-meta">What {agentName} tried</p>
                <p class="duty-readback">{attempted.readback || (attempted.checkFirst && attempted.checkFirst.look ? checkWords(attempted.checkFirst, agentName, toolWords) : '')}</p>
              </div>
            )}
          </div>
        )}
        {(manual || !writer) && <CheckFields check={check} onChange={change} agent={agent} options={options} error={p.error} whereError={p.whereError} />}
        {on && written && <p class="duty-readback">{wrote || checkWords(written, agentName, toolWords)}</p>}
        {problems.length > 0 && (
          <ul class="duty-problems" role="alert">
            {problems.map((x) => (
              <li>{x}</li>
            ))}
          </ul>
        )}
        {(manual || !writer) && (
          <div class="duty-actions">
            <Button size="s" disabled={!on || trying} onClick={tryCheck}>
              Try the check
            </Button>
            {on && (
              <Button size="s" kind="quiet" onClick={() => change(emptyCheck())}>
                Remove the check
              </Button>
            )}
          </div>
        )}
        {tried && 'found' in tried && (
          <div class="duty-found" role="status">
            <p>{foundWords(tried.found, agentName)}</p>
            {tried.found.found && tried.found.found.length > 0 && (
              <ul class="duty-items">
                {tried.found.found.slice(0, 20).map((it) => (
                  <li>{itemWords(it, check.key)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {tried && 'error' in tried && (
          <p class="field-error" role="alert">
            {tried.error}
          </p>
        )}
      </div>
    </details>
  );
}
