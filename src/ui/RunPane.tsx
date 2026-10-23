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

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { FileView, Item, Member, ReactionKind, Result, Run } from '../api/types';
import { store, useSelect } from '../state/store';
import { runStatus } from '../lib/presence';
import { awakeFor, seatPresence, statusOf } from '../lib/status';
import { selectFacts } from '../state/reducer';
import { hrefOf } from '../lib/route';
import { plainError, providerMessage } from '../lib/runerror';
import { pagesWritten, stepInputs, stepWords } from '../lib/steps';
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
 * that the read wakes the worker of the run.
 */
export function FilesView({ runId, result, items, wakes }: { runId: string; result: Result | null; items?: Item[]; wakes?: boolean }) {
  const [file, setFile] = useState('');
  useEffect(() => setFile(''), [runId]);
  const files = (result && result.files) || [];
  const pages = useMemo(() => pagesWritten(items || []), [items]);
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
      {wakes && <WakeNote />}
      {files.length === 0 && pages.length === 0 && <p class="run-note">No files changed in this run.</p>}
      {files.length > 0 && (
        <div class="files" role="list">
          {files.map((f) => (
            <div role="listitem">
              <button type="button" class={'file' + (f.op === 'deleted' ? ' gone' : '') + (file === f.path ? ' on' : '')} aria-expanded={file === f.path} onClick={() => setFile(file === f.path ? '' : f.path)}>
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
export function RunView({ runId, result, bridge, member, who, items, endSeq, gone, wakes }: { runId: string; result: Result | null; bridge?: string; member?: Member; who: string; items?: Item[]; endSeq?: number; gone?: boolean; wakes?: boolean }) {
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
  const inputs = useMemo(() => stepInputs(steps || [], items || []), [steps, items]);
  return (
    <div class="run-view">
      <div class="run-head">
        <h3 class="t-heading">{(res && res.title) || (run && run.title) || 'The run'}</h3>
        {!gone && <StopKey runId={runId} who={who} />}
      </div>
      {wakes && !gone && <WakeNote />}
      {gone && <p class="run-note">This run is gone.</p>}
      <p class="run-status">
        {run && <Light light={runStatus(run)} />}
        {run && <When at={run.createdAt} />}
        {phrase && <span class="clip">{phrase}</span>}
      </p>
      {fail && (fail.line || again) && <FailureView id={runId} f={fail} again={again} />}
      {res && res.summary && <Markdown text={res.summary} class="run-summary" />}
      {res && res.steps && res.steps.length > 0 && (
        <section class="run-sec" aria-labelledby={'did-' + runId}>
          <div class="run-sec-head">
            <h4 class="t-sub" id={'did-' + runId}>
              What it did
            </h4>
            <Chip label={res.steps.length === 1 ? '1 step' : res.steps.length + ' steps'}>{res.steps.length}</Chip>
          </div>
          <ol class="run-steps">
            {res.steps.map((s, i) => (
              <li class={s.isError ? 'err' : ''}>
                <span>
                  <Phrase text={stepWords(s.tool, inputs[i], s.text)} />
                </span>
                <small>{s.isError ? 'Error' : s.done ? 'Done' : 'No result'}</small>
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
  const wakes = useSelect((s) => awakeFor(selectFacts(s), s.runs[runId]) === false);
  const seatLight = useSelect((s) => (member ? statusOf(selectFacts(s), { seat: member }) : null));
  const light = seatLight || (run ? runStatus(run) : null);
  const who = handle || (member ? member.handle : run ? run.agent : 'the agent');
  const end = [...t.items].reverse().find((x) => x.kind === 'end');
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
        <RunView runId={runId} result={res} bridge={bridge} member={member} who={who} items={t.items} endSeq={end ? end.seq : undefined} wakes={wakes} />
        {filesCount(res, t.items) > 0 && <FilesView runId={runId} result={res} items={t.items} />}
        <Conversation run={run} result={res} t={t} agentLabel={who} />
      </div>
    </section>
  );
}
