// The run of a member in the pane, as /ui shows a run: the result first
// (the title, the status, the decision that waits, the answer, the files,
// what it did, and the limits), then the conversation.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { FileView, ReactionKind, Result } from '../api/types';
import { store, useSelect } from '../state/store';
import { runStatus, presenceOf } from '../lib/presence';
import { hrefOf } from '../lib/route';
import { attempt, showError } from './notice';
import { Back, Confirm, Face, Light, Markdown, When } from './common';
import { Conversation, useTranscript } from './Conversation';
import { Icon } from './icons';

function FileBox({ run, path, onClose }: { run: string; path: string; onClose: () => void }) {
  const [f, setF] = useState<FileView | null>(null);
  useEffect(() => {
    api.file(run, path).then(setF).catch(showError);
  }, [run, path]);
  return (
    <div class="filebox">
      <header>
        <b>{path}</b>
        <button type="button" class="icon-btn" aria-label="Close the file" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {!f ? (
        <p class="empty">Loading the file.</p>
      ) : f.gone ? (
        <p class="empty">The file does not exist now.</p>
      ) : f.binary || f.large || f.text === undefined ? (
        <p class="empty">This file is not text, or it is too large to show here.</p>
      ) : (
        <pre class="lines">
          {f.text.split('\n').map((l) => (
            <span>{l + '\n'}</span>
          ))}
        </pre>
      )}
      {f && f.cut && <p class="why">The view shows the first part of the file.</p>}
    </div>
  );
}

/** ResultThumbs records a reaction on the result of the run (K2). */
function ResultThumbs({ run, seq }: { run: string; seq: number }) {
  const counts = useSelect((s) => (s.runs[run] && s.runs[run].reactions) || {});
  const [done, setDone] = useState<string>('');
  const [heart, setHeart] = useState(false);
  const [note, setNote] = useState('');
  const send = async (k: ReactionKind, n?: string) => {
    let receipt = false;
    const ok = await attempt(async () => {
      const r = await api.reactRun(run, seq, k, n);
      receipt = r.receipt;
    });
    if (ok) setDone(k === 'heart' ? 'You hearted this result.' : receipt ? 'Your thumb counts as a quality receipt.' : 'Your thumb is on the run.');
  };
  return (
    <div class="result-thumbs">
      <span class="lbl">Was this useful?</span>
      <div class="reacts open inline" role="group" aria-label="Reactions on the result">
        {(['up', 'down'] as ReactionKind[]).map((k) => (
          <button type="button" class="icon-btn" aria-label={k === 'up' ? 'Thumb up: accept the result' : 'Thumb down: reject the result'} onClick={() => send(k)}>
            <Icon name={k} />
            {counts[k] ? <span class="n">{counts[k]}</span> : null}
          </button>
        ))}
        <button type="button" class="icon-btn" aria-label="Heart" aria-expanded={heart} onClick={() => setHeart(!heart)}>
          <Icon name="heart" />
          {counts.heart ? <span class="n">{counts.heart}</span> : null}
        </button>
      </div>
      {heart && (
        <form
          class="heart-note"
          onSubmit={(e) => {
            e.preventDefault();
            setHeart(false);
            send('heart', note.trim() || undefined);
            setNote('');
          }}
        >
          <label>
            <span>What made this useful? The note is optional.</span>
            <textarea value={note} maxLength={1024} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
          </label>
          <div class="do">
            <button type="button" class="btn small" onClick={() => setHeart(false)}>
              Cancel
            </button>
            <button type="submit" class="btn small primary">
              Save heart
            </button>
          </div>
        </form>
      )}
      {done && (
        <p class="why" role="status">
          {done}
        </p>
      )}
    </div>
  );
}

export function RunPane({ bridge, runId, handle }: { bridge: string; runId: string; handle?: string }) {
  const run = useSelect((s) => s.runs[runId]);
  const member = useSelect((s) => (handle && s.rosters[bridge] ? s.rosters[bridge].byHandle[handle] : undefined));
  const [res, setRes] = useState<Result | null>(null);
  const [file, setFile] = useState('');
  const [stop, setStop] = useState(false);
  const t = useTranscript(runId);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setRes(null);
    setFile('');
    if (!store.get().runs[runId]) api.run(runId).then((r) => store.dispatch({ type: 'run', run: r })).catch(showError);
    if (heading.current) heading.current.focus();
  }, [runId]);

  // The result follows the run: a new state or a new decision reads it again.
  const key = run ? run.state + '|' + (run.pending ? run.pending.id : '') + '|' + (run.output || '').length : '';
  useEffect(() => {
    if (!runId) return;
    let live = true;
    api
      .result(runId)
      .then((r) => live && setRes(r))
      .catch(showError);
    return () => {
      live = false;
    };
  }, [runId, key]);

  const light = member ? presenceOf(member.presence) : run ? runStatus(run) : null;
  const ended = run && ['completed', 'failed', 'canceled'].includes(run.state);
  const endSeq = [...t.items].reverse().find((x) => x.kind === 'end');
  const who = handle || (run ? run.agent : 'the agent');
  return (
    <section class="screen runpane" aria-labelledby="run-title">
      <header class="bar">
        <Back label="Roster" href={hrefOf({ place: 'bridge', id: bridge, pane: 'roster' })} />
        <div class="title with-face">
          {run && <Face agent={run.agent} size={32} />}
          <div>
            <h2 id="run-title" tabIndex={-1} ref={heading}>
              {who}
            </h2>
            <p class="goal">{light && <Light light={light} />}</p>
          </div>
        </div>
        <div class="end">
          {run && !ended && (
            <button type="button" class="btn small danger" onClick={() => setStop(true)}>
              Stop
            </button>
          )}
        </div>
      </header>
      <div class="scroll">
        <div class="result">
          <h3 class="work">{(res && res.title) || (run && run.title) || 'The run'}</h3>
          <p class="status">
            {run && <Light light={runStatus(run)} />}
            {run && (
              <>
                {' · started '}
                <When at={run.createdAt} />
              </>
            )}
            {member && member.activity && member.activity.phrase && member.presence === 'working' ? ' · ' + member.activity.phrase : ''}
          </p>
          {res && res.error && <p class="err-note">{res.error}</p>}
          {res && res.summary && <Markdown text={res.summary} class="summary" />}
          {res && res.files && res.files.length > 0 && (
            <>
              <p class="lbl">Files</p>
              <div class="files">
                {res.files.map((f) => (
                  <button type="button" class={'file' + (f.op === 'deleted' ? ' gone' : '')} aria-expanded={file === f.path} onClick={() => setFile(file === f.path ? '' : f.path)}>
                    <Icon name="file" />
                    <span class="fn">
                      <b>{f.path.split('/').pop()}</b>
                      <small>{f.path}</small>
                    </span>
                    <span class="fo">{f.op}</span>
                  </button>
                ))}
              </div>
              {file && <FileBox run={runId} path={file} onClose={() => setFile('')} />}
            </>
          )}
          {res && res.steps && res.steps.length > 0 && (
            <details class="did">
              <summary>
                <Icon name="chev" />
                <b>What it did</b> <span>{res.steps.length} steps</span>
              </summary>
              <ol>
                {res.steps.map((s) => (
                  <li class={s.isError ? 'err' : ''}>
                    <span>{s.text}</span>
                    <small>{s.isError ? 'Error' : s.done ? 'Done' : 'No result'}</small>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {res && res.limits && res.limits.length > 0 && (
            <ul class="limits">
              {res.limits.map((l) => (
                <li>{l}</li>
              ))}
            </ul>
          )}
          {run && run.state === 'completed' && endSeq && <ResultThumbs run={runId} seq={endSeq.seq} />}
        </div>
        <h3 class="sec">Conversation</h3>
        <Conversation run={run} result={res} t={t} agentLabel={who} />
      </div>
      {stop && run && (
        <Confirm
          title={'Stop the run of ' + who + '?'}
          confirm="Stop the run"
          danger
          onCancel={() => setStop(false)}
          onConfirm={async () => {
            const ok = await attempt(() => api.cancel(runId));
            if (ok) setStop(false);
          }}
        >
          <p>The run stops now. The seat stays on the roster, and a message to it starts a new turn.</p>
        </Confirm>
      )}
    </section>
  );
}
