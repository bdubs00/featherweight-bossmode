// The run of a seat: the result first (the title, the status, the failure,
// the answer, what it did, the limits, and the reactions), and the files
// that it changed with a viewer, and the pages of the wiki that it wrote.
// The member conversation shows these on its tabs Run and Files. The run
// pane of a bridge shows the result and the conversation of the run in the
// details pane. A failure shows as one plain line with the message of the
// provider, the key Seat again, and the whole error behind Details. A read
// of a run goes to its worker and wakes a worker that sleeps, so these
// views read only when the person opens them, and say so in place when the
// read wakes the worker.
//
// The server hands a message of a bridge to a seat with a header that
// names the bridge and the sender, such as [bridge "Notes" 01m5...]
// @reviewer from operator:. The conversation of a run shows the words of
// the sender without that header, under the name of the sender.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { FileView, Item, Member, ReactionKind, Result, Run } from '../api/types';
import type { TranscriptState } from './Conversation';
import { store, useSelect } from '../state/store';
import { runStatus } from '../lib/presence';
import { awakeFor, seatPresence, statusOf } from '../lib/status';
import { selectFacts } from '../state/reducer';
import { hrefOf } from '../lib/route';
import { plainError, providerMessage } from '../lib/runerror';
import { pagesWritten, stepWords } from '../lib/steps';
import { commandOf, decisionTitle } from '../lib/words';
import { whoName, type Me } from '../lib/lines';
import { pageName } from '../lib/pagepath';
import { noteLost } from '../state/actions';
import { newestRun } from '../state/people';
import { attempt, showError } from './notice';
import { Confirm, Light, Markdown, When } from './common';
import { Button, Chip, Command, IconButton, Mark, PaneHeader, ReactionChip } from './primitives';
import { Phrase } from './Roster';
import { SeatAgainKey } from './SeatAgain';
import { Conversation, useTranscript } from './Conversation';
import { HeartNote } from './Thread';
import { Icon } from './icons';

/**
 * useResult reads the result of a run, and reads it again when the run
 * changes its state, its decision, or its answer. With load false, it
 * reads nothing, because a read goes to the worker of the run and wakes
 * it. A view passes false for a run of a sleeping worker that the person
 * did not ask for, and keeps the result that it read before.
 */
export function useResult(runId: string, load = true): Result | null {
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const [res, setRes] = useState<Result | null>(null);
  useEffect(() => {
    setRes(null);
  }, [runId]);
  useEffect(() => {
    // A run that the fleet does not hold shows no result and raises no notice.
    if (load && runId && !store.get().runs[runId])
      api
        .run(runId)
        .then((r) => store.dispatch({ type: 'run', run: r }))
        .catch((e) => noteLost(runId, e));
  }, [runId, load]);
  const key = run ? run.state + '|' + (run.pending ? run.pending.id : '') + '|' + (run.output || '').length : '';
  useEffect(() => {
    if (!runId || !load) return;
    let live = true;
    api
      .result(runId)
      .then((r) => live && setRes(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [runId, key, load]);
  return res;
}

/** The header of a message that the server hands to a seat: the bridge, its id, who it goes to, and the sender. */
const ENVELOPE = /^\[bridge "(?:[^"\\]|\\.)*" [0-9a-z]+\] (?:to everyone|@\S+(?: @\S+)*) from (\S+): /i;

/** The words that the server puts before an answer of a person to a question of the seat. */
const ANSWERED = /^Answer to your question in entry \d+: /;

/** The name of the person in the header of the server. */
const OPERATOR = 'operator';

/**
 * bridgeWords reads a message that the server handed to a seat: the words
 * of the sender without the header, and the sender, "" for the person. It
 * returns null for a message without the header.
 */
export function bridgeWords(text: string): { text: string; from: string } | null {
  const m = ENVELOPE.exec(text);
  if (!m) return null;
  const from = m[1].toLowerCase() === OPERATOR ? '' : m[1];
  return { text: text.slice(m[0].length).replace(ANSWERED, ''), from };
}

/** plainItems shows each message of a bridge in a transcript as its sender wrote it, under the name of the sender. */
export function plainItems(items: Item[]): Item[] {
  let changed = false;
  const out = items.map((it) => {
    if (it.kind !== 'user' || !it.text) return it;
    const w = bridgeWords(it.text);
    if (!w) return it;
    changed = true;
    return w.from ? { ...it, text: w.text, who: w.from } : { ...it, text: w.text };
  });
  return changed ? out : items;
}

/**
 * endOf is when a run ended: the time that the server names, else the time
 * of the last end of a turn in its transcript. updatedAt is no end, because
 * a later reaction or note moves it. It is "" while the page knows neither.
 */
export function endOf(run: Pick<Run, 'endedAt'>, items?: Item[]): string {
  if (run.endedAt) return run.endedAt;
  const end = items ? [...items].reverse().find((x) => x.kind === 'end') : undefined;
  return end ? end.time : '';
}

/** RunTimes says when a run started, and when it ended, for a run that ended and whose end the page knows. */
function RunTimes({ run, items }: { run: Run; items?: Item[] }) {
  const ended = run.state === 'completed' || run.state === 'failed' || run.state === 'canceled';
  const end = ended ? endOf(run, items) : '';
  return (
    <span class="run-times">
      started <When at={run.createdAt} />
      {end && (
        <>
          , ended <When at={end} />
        </>
      )}
    </span>
  );
}

/** A line of What it did: its words, the mark at its end, and whether it failed. */
export interface DidLine {
  words: string;
  mark: 'Done' | 'Error' | 'No result' | 'Denied';
  err: boolean;
}

/** wanted words a call that a person denied: Wanted to run git push: you denied it. */
function wanted(ask: Item, decided: Item, me: Me): string {
  const by = whoName(decided.who, me);
  const who = by === 'You' ? 'you' : by;
  const cmd = commandOf(ask.input);
  if (cmd) return 'Wanted to run ' + cmd + ': ' + who + ' denied it';
  const t = decisionTitle('\u0000', { run: '', id: ask.id || '', tool: ask.tool || '', input: ask.input, label: '', state: 'deny', always: false })
    .replace(/^\u0000 wants to /, 'Wanted to ')
    .replace(/^\u0000 wants /, 'Wanted ')
    .replace(/^\u0000 asks for your decision$/, 'Asked for a decision');
  return t + ': ' + who + ' denied it';
}

/**
 * didLines are the lines of What it did: each step of the result, in the
 * words of the page, and each call that a person denied, which never ran.
 * A question to the person reads Asked you: and its first line. A call of
 * a step that a person denied reads as denied, not as an error. items is
 * the transcript, which holds the inputs of the calls and the decisions.
 */
export function didLines(steps: { seq: number; tool: string; text: string; isError?: boolean; done: boolean }[], items: Item[], me: Me): DidLine[] {
  const asks = new Map<string, Item>();
  for (const x of items) if (x.kind === 'ask' && x.id) asks.set(x.id, x);
  // The calls that a person denied, by their call id.
  const denied = new Map<string, { ask: Item; decided: Item }>();
  const loose: { seq: number; ask: Item; decided: Item }[] = [];
  for (const x of items) {
    if (x.kind !== 'decided' || x.text !== 'deny' || !x.id) continue;
    const ask = asks.get(x.id);
    if (!ask) continue;
    if (ask.callId) denied.set(ask.callId, { ask, decided: x });
    else loose.push({ seq: x.seq, ask, decided: x });
  }
  // Each step takes the call of its tool in order, as the transcript holds them.
  const calls = new Map<string, Item[]>();
  for (const x of items) {
    if (x.kind !== 'tool' || !x.tool) continue;
    const l = calls.get(x.tool) || [];
    l.push(x);
    calls.set(x.tool, l);
  }
  const callOf: (Item | undefined)[] = new Array(steps.length).fill(undefined);
  for (let i = steps.length - 1; i >= 0; i--) {
    const l = calls.get(steps[i].tool);
    if (l && l.length) callOf[i] = l.pop();
  }
  const out: { seq: number; line: DidLine }[] = [];
  const shown = new Set<string>();
  steps.forEach((st, i) => {
    const call = callOf[i];
    const d = call && call.callId ? denied.get(call.callId) : undefined;
    if (d && call && call.callId) {
      shown.add(call.callId);
      out.push({ seq: st.seq, line: { words: wanted(d.ask, d.decided, me), mark: 'Denied', err: false } });
      return;
    }
    out.push({ seq: st.seq, line: { words: stepWords(st.tool, call ? call.input : undefined, st.text), mark: st.isError ? 'Error' : st.done ? 'Done' : 'No result', err: !!st.isError } });
  });
  // A denied call that no step names joins at the time of its decision.
  for (const [callId, d] of denied) if (!shown.has(callId)) loose.push({ seq: d.decided.seq, ask: d.ask, decided: d.decided });
  for (const l of loose) out.push({ seq: l.seq, line: { words: wanted(l.ask, l.decided, me), mark: 'Denied', err: false } });
  return out.sort((a, b) => a.seq - b.seq).map((x) => x.line);
}

/** WakeNote says in place that a read of a run wakes its worker. */
export function WakeNote() {
  return <p class="run-note wake-note">This read wakes the worker.</p>;
}

/** The failure of a run for a person: the plain line, the message of the provider, and the whole error. */
export interface Failure {
  line: string;
  said: string;
  raw: string;
}

/**
 * failureOf reads why a run stopped. The error of the result, else of the
 * run, gives the plain line. A limit of the result that says where the run
 * stopped, such as "Stopped at the limit of 40 turns.", stands for a
 * limit of the budget, because it holds the number.
 */
export function failureOf(run: Pick<Run, 'error'> | undefined, res: Pick<Result, 'error' | 'limits'> | null | undefined): Failure {
  const raw = ((res && res.error) || (run && run.error) || '').trim();
  const stop = res && res.limits ? res.limits.find((l) => /^Stopped\b/.test(l)) : undefined;
  const line = stop ? stop.replace(/\.$/, '') : plainError(raw);
  return { line, said: providerMessage(raw), raw };
}

/** FailureView is the failure of a run: the plain line, the message of the provider, the way back, and the whole error behind Details. */
function FailureView({ id, f, again }: { id: string; f: Failure; again?: { bridge: string; m: Member } }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [id]);
  const rawId = 'raw-' + id;
  // Details holds the whole error only where the plain line leaves part of it out.
  const more = f.raw && f.raw !== f.line && f.raw !== f.said;
  return (
    <div class="run-fail">
      {f.line && <p class="run-fail-line">{f.line}</p>}
      {f.said && f.said !== f.line && <p class="run-fail-said">{f.said}</p>}
      {(again || more) && (
        <div class="run-fail-keys">
          {again && <SeatAgainKey bridge={again.bridge} m={again.m} />}
          {more && (
            <Button kind="quiet" size="s" class="run-fail-more" aria-expanded={open} aria-controls={rawId} onClick={() => setOpen(!open)}>
              Details
            </Button>
          )}
        </div>
      )}
      {more && open && (
        <div id={rawId}>
          <Command class="run-fail-raw">{f.raw}</Command>
        </div>
      )}
    </div>
  );
}

/** FileBox shows one file that a run changed, as numbered lines of text. */
function FileBox({ run, path, onClose }: { run: string; path: string; onClose: () => void }) {
  const [f, setF] = useState<FileView | null>(null);
  useEffect(() => {
    setF(null);
    api.file(run, path).then(setF).catch(showError);
  }, [run, path]);
  return (
    <div class="filebox">
      <header>
        <b class="clip">{path}</b>
        <IconButton icon="close" label="Close the file" onClick={onClose} />
      </header>
      {!f ? (
        <p class="filebox-note">Loading the file.</p>
      ) : f.gone ? (
        <p class="filebox-note">The file does not exist now.</p>
      ) : f.binary || f.large || f.text === undefined ? (
        <p class="filebox-note">This file is not text, or it is too large to show.</p>
      ) : (
        <pre class="lines">
          {f.text.split('\n').map((l) => (
            <span>{l + '\n'}</span>
          ))}
        </pre>
      )}
      {f && f.cut && <p class="filebox-note">The first part of the file.</p>}
    </div>
  );
}

/**
 * FilesView lists the files that a run changed, and opens one in place.
 * The pages of the wiki that the run wrote follow, as links to the Wiki,
 * because to a person they are files of the work too. items is the
 * transcript of the run, which holds the writes of the pages. wakes says
 * that the read wakes the worker of the run. gone says that no worker
 * holds the run now, so no result comes.
 */
export function FilesView({ runId, result, items, wakes, gone, archived }: { runId: string; result: Result | null; items?: Item[]; wakes?: boolean; gone?: boolean; archived?: boolean }) {
  const [file, setFile] = useState('');
  useEffect(() => setFile(''), [runId]);
  const files = (result && result.files) || [];
  const pages = useMemo(() => pagesWritten(items || []), [items]);
  if (!result && gone) return <p class="run-note">This run is gone.</p>;
  if (!result)
    return wakes ? (
      <div class="files-view">
        <WakeNote />
        <p class="run-note">Loading the conversation.</p>
      </div>
    ) : (
      <p class="run-note">Loading the conversation.</p>
    );
  return (
    <div class="files-view">
      {wakes && !archived && <WakeNote />}
      {archived && files.length > 0 && <p class="run-note">{FILES_ARCHIVED}</p>}
      {files.length === 0 && pages.length === 0 && <p class="run-note">No files changed in this run.</p>}
      {files.length > 0 && (
        <div class="files" role="list">
          {files.map((f) => (
            <div role="listitem">
              <button type="button" class={'file' + (f.op === 'deleted' ? ' gone' : '') + (file === f.path ? ' on' : '')} aria-expanded={file === f.path} disabled={archived} onClick={() => setFile(file === f.path ? '' : f.path)}>
                <Icon name="file" />
                <span class="fn">
                  <b>{f.path.split('/').pop()}</b>
                  <small>{f.path}</small>
                </span>
                <span class="fo">{f.op}</span>
              </button>
            </div>
          ))}
        </div>
      )}
      {file && <FileBox run={runId} path={file} onClose={() => setFile('')} />}
      {pages.length > 0 && (
        <section class="run-sec run-pages" aria-labelledby={'pages-' + runId}>
          <div class="run-sec-head">
            <h4 class="t-sub" id={'pages-' + runId}>
              Wiki pages
            </h4>
            <Chip label={pages.length === 1 ? '1 page' : pages.length + ' pages'}>{pages.length}</Chip>
          </div>
          <div class="files" role="list">
            {pages.map((p) => (
              <div role="listitem">
                <a class="file" href={hrefOf({ place: 'pages', path: p, mode: 'read' })}>
                  <Icon name="page" />
                  <span class="fn">
                    <b>{pageName(p)}</b>
                    <small>{p}</small>
                  </span>
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** filesCount is the count of the tab Files: the files that a run changed and the pages of the wiki that it wrote. */
export function filesCount(result: Result | null, items: Item[] | undefined): number {
  return ((result && result.files) || []).length + pagesWritten(items || []).length;
}

/** ResultReactions records a reaction on the result of the run (K2), with the seq of its fw.run.finished. */
function ResultReactions({ run, seq }: { run: string; seq: number }) {
  const counts = useSelect((s) => (s.runs[run] && s.runs[run].reactions) || {});
  const [done, setDone] = useState('');
  const [heart, setHeart] = useState(false);
  const send = async (k: ReactionKind, n?: string) => {
    const ok = await attempt(async () => {
      const r = await api.reactRun(run, seq, k, n);
      if (r && typeof r.id === 'string') store.dispatch({ type: 'run', run: r });
    });
    if (ok) setDone(k === 'heart' ? 'Heart recorded.' : 'Thumb recorded.');
  };
  return (
    <div class="run-react">
      <div class="run-react-keys" role="group" aria-label="Reactions on the result">
        <ReactionChip kind="up" count={counts.up || 0} names="Thumb up: accept the result" onClick={() => send('up')} />
        <ReactionChip kind="down" count={counts.down || 0} names="Thumb down: reject the result" onClick={() => send('down')} />
        <ReactionChip kind="heart" count={counts.heart || 0} names="Heart" onClick={() => setHeart(!heart)} />
        {done && (
          <span class="run-note" role="status">
            {done}
          </span>
        )}
      </div>
      {heart && (
        <HeartNote
          onCancel={() => setHeart(false)}
          onSave={(note) => {
            setHeart(false);
            send('heart', note || undefined);
          }}
        />
      )}
    </div>
  );
}

/** StopKey stops a run that works, after the dialog asks. The seat stays. */
export function StopKey({ runId, who }: { runId: string; who: string }) {
  const run = useSelect((s) => s.runs[runId]);
  const [ask, setAsk] = useState(false);
  const ended = !run || ['completed', 'failed', 'canceled'].includes(run.state);
  if (ended) return null;
  return (
    <>
      <Button size="s" kind="danger" onClick={() => setAsk(true)}>
        Stop
      </Button>
      {ask && (
        <Confirm
          title={'Stop ' + who + '?'}
          confirm="Stop"
          danger
          onCancel={() => setAsk(false)}
          onConfirm={async () => {
            const ok = await attempt(() => api.cancel(runId));
            if (ok) setAsk(false);
          }}
        >
          <p>The seat stays. A message starts a new turn.</p>
        </Confirm>
      )}
    </>
  );
}

/**
 * RunView is the result of a run: the title, the status, the failure, the
 * answer, what it did, the limits, and the reactions. bridge and member
 * name the seat of the run, so a failure of its newest run offers Seat
 * again. items is the transcript of the run, which gives the targets of
 * the steps. wakes says that the read wakes the worker of the run.
 */
/** RUN_ARCHIVED is the line of a run that the front reads from its archive. */
export const RUN_ARCHIVED = 'This run is from a worker that was replaced. You can read it, and it changes nothing now.';

/** FILES_ARCHIVED is the line of the files of such a run, which were on the disk of that worker. */
export const FILES_ARCHIVED = 'The files of this run were on a worker that was replaced, so they do not open. The pages of the wiki stay.';

export function RunView({ runId, result, bridge, member, who, items, endSeq, gone, archived, wakes }: { runId: string; result: Result | null; bridge?: string; member?: Member; who: string; items?: Item[]; endSeq?: number; gone?: boolean; archived?: boolean; wakes?: boolean }) {
  const run = useSelect((s) => s.runs[runId]);
  const presence = useSelect((s) => (member ? seatPresence(selectFacts(s), member) : ''));
  const res = result;
  const phrase = member && presence === 'working' && member.activity ? member.activity.phrase : '';
  const ended = !!run && (run.state === 'failed' || run.state === 'canceled');
  const canceled = !!run && run.state === 'canceled';
  // A stopped run says it in its status, so only a failure has a line.
  const fail = useMemo(() => (ended || (res && res.error) ? { ...failureOf(run, res), ...(canceled ? { line: '', said: '', raw: '' } : {}) } : null), [ended, canceled, run && run.error, res]);
  // Seat again starts the seat anew, so it shows only for the newest run of a seat that is not fired.
  const again = bridge && member && !member.fired && ended && newestRun(member) === runId ? { bridge, m: member } : undefined;
  const steps = res ? res.steps : undefined;
  const me = useSelect((s) => (s.me ? s.me.principal : null));
  const did = useMemo(() => (res ? didLines(steps || [], items || [], me) : []), [res, steps, items, me]);
  return (
    <div class="run-view">
      <div class="run-head">
        <h3 class="t-heading">{(res && res.title) || (run && run.title) || 'The run'}</h3>
        {!gone && !archived && <StopKey runId={runId} who={who} />}
      </div>
      {wakes && !gone && !archived && <WakeNote />}
      {gone && <p class="run-note">This run is gone.</p>}
      {archived && !gone && <p class="run-note">{RUN_ARCHIVED}</p>}
      <p class="run-status">
        {run && <Light light={runStatus(run)} />}
        {run && <RunTimes run={run} items={items} />}
        {phrase && <span class="clip">{phrase}</span>}
      </p>
      {fail && (fail.line || again) && <FailureView id={runId} f={fail} again={again} />}
      {res && res.summary && <Markdown text={res.summary} class="run-summary" refs />}
      {did.length > 0 && (
        <section class="run-sec" aria-labelledby={'did-' + runId}>
          <div class="run-sec-head">
            <h4 class="t-sub" id={'did-' + runId}>
              What it did
            </h4>
            <Chip label={did.length === 1 ? '1 step' : did.length + ' steps'}>{did.length}</Chip>
          </div>
          <ol class="run-steps">
            {did.map((l) => (
              <li class={l.err ? 'err' : l.mark === 'Denied' ? 'denied' : ''}>
                <span>
                  <Phrase text={l.words} />
                </span>
                <small>{l.mark}</small>
              </li>
            ))}
          </ol>
        </section>
      )}
      {res && res.limits && res.limits.length > 0 && (
        <ul class="run-limits">
          {res.limits.map((l) => (
            <li>{l}</li>
          ))}
        </ul>
      )}
      {run && run.state === 'completed' && endSeq ? <ResultReactions run={runId} seq={endSeq} /> : null}
    </div>
  );
}

/** RunPane is the run of a member in the details pane of a bridge: the result, then the conversation of the run. */
export function RunPane({ bridge, runId, handle }: { bridge: string; runId: string; handle?: string }) {
  const run = useSelect((s) => s.runs[runId]);
  // The address names the seat, or the roster names the seat that holds the run.
  const member = useSelect((s) => {
    const r = s.rosters[bridge];
    if (!r) return undefined;
    if (handle) return r.byHandle[handle];
    const h = r.order.find((x) => r.byHandle[x] && r.byHandle[x].runs.includes(runId));
    return h ? r.byHandle[h] : undefined;
  });
  // The person opened the run, so the pane reads it, and says so when the read wakes its worker.
  const res = useResult(runId);
  const t = useTranscript(runId);
  const archived = !!((res && res.archived) || (run && run.archived));
  const wakes = useSelect((s) => awakeFor(selectFacts(s), s.runs[runId]) === false) && !archived;
  const seatLight = useSelect((s) => (member ? statusOf(selectFacts(s), { seat: member }) : null));
  const light = seatLight || (run ? runStatus(run) : null);
  const who = handle || (member ? member.handle : run ? run.agent : 'the agent');
  const end = [...t.items].reverse().find((x) => x.kind === 'end');
  // The messages of the bridge read as their senders wrote them.
  const items = useMemo(() => plainItems(t.items), [t.items]);
  const plain: TranscriptState = useMemo(() => ({ ...t, items }), [t, items]);
  return (
    <section class="screen runpane" aria-labelledby="run-title">
      <PaneHeader
        id="run-title"
        title={who}
        focusable
        back={{ href: hrefOf({ place: 'bridge', id: bridge, pane: 'roster' }), label: 'Members', to: 'here' }}
        lead={run ? <Mark agent={run.agent} size={32} halo={light ? { tone: light.tone, word: light.word } : undefined} label={who} /> : undefined}
      />
      <div class="scroll">
        <RunView runId={runId} result={res} bridge={bridge} member={member} who={who} items={t.items} endSeq={end ? end.seq : undefined} gone={t.gone} archived={archived} wakes={wakes} />
        {filesCount(res, t.items) > 0 && <FilesView runId={runId} result={res} items={t.items} gone={t.gone} archived={archived} />}
        <Conversation run={run} result={res} t={plain} agentLabel={who} />
      </div>
    </section>
  );
}
