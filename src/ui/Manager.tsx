// The conversation of the person with the manager. It opens the newest
// manager run of the caller, from GET /v1/bossmode. The first message
// starts a run on the manager Task, which sleeps between messages, so the
// status says waking until the first answer arrives. A run of the front
// sends no event on the stream, so the screen reads the run every 3 seconds
// while the conversation is open and the run works or an answer is on its
// way, and reads the new items of the transcript when the run moves. A /
// at the start of a message opens the menu of the skills, and a slash
// command goes to POST /v1/bossmode/runs/{id}/skill.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { make } from '../api/make';
import type { Item, Result, Run } from '../api/types';
import { store, useSelect } from '../state/store';
import { askManager, ended, setManagerRun, useManagerRun } from '../state/manager';
import { personName } from '../lib/words';
import { attempt, showError } from './notice';
import { Avatar } from './common';
import { Button, Help, Led, Mark, PaneHeader } from './primitives';
import { Composer } from './Composer';
import { DecisionCard } from './Decision';
import { useCatalog } from './Skills';
import { Thread, decisionOf, threadOf } from './Thread';

/** The time between two reads of a run of the front. */
export const POLL_MS = 3000;

/** busy reports whether a run works: it waits for a worker, runs, sleeps between steps, or waits for a decision. */
const busy = (state: string | undefined) => state === 'queued' || state === 'running' || state === 'suspended' || state === 'input-required';

export interface ThreadState {
  items: Item[];
  loading: boolean;
}

/**
 * useRunThread reads the transcript of a run and follows it. When poll is
 * true, it reads the run every POLL_MS, because a run of the front sends
 * no event on the stream. When the run moves past the last item, it reads
 * the items after it.
 */
export function useRunThread(runId: string, poll: boolean): ThreadState {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const last = useRef(0);
  const reading = useRef(false);

  useEffect(() => {
    let live = true;
    setItems([]);
    last.current = 0;
    if (!runId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .transcript(runId, { limit: 200 })
      .then((t) => {
        if (!live) return;
        setItems(t.items);
        last.current = t.items.length ? t.items[t.items.length - 1].seq : 0;
        store.dispatch({ type: 'run', run: t.run });
      })
      .catch(showError)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [runId]);

  // The run moved: read the items after the last one.
  const seq = run ? run.seq : 0;
  useEffect(() => {
    if (!runId || loading || reading.current || seq <= last.current) return;
    reading.current = true;
    api
      .transcript(runId, { from: last.current + 1, limit: 500 })
      .then((t) => {
        const fresh = t.items.filter((x) => x.seq > last.current);
        if (fresh.length) {
          last.current = fresh[fresh.length - 1].seq;
          setItems((old) => [...old, ...fresh]);
        }
      })
      .catch(showError)
      .finally(() => {
        reading.current = false;
      });
  }, [runId, seq, loading]);

  // The poll: a run of the front sends no event on the stream.
  useEffect(() => {
    if (!runId || !poll) return;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      api
        .run(runId)
        .then((r: Run) => store.dispatch({ type: 'run', run: r }))
        .catch(() => {
          // A missed read costs one tick. The next one tries again.
        });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [runId, poll]);

  return { items, loading };
}

/** slashOf splits a slash command into the name of the skill and its arguments, or null for a plain message. */
export function slashOf(text: string, names: string[]): { name: string; args: string } | null {
  const m = /^\/([A-Za-z0-9._/-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m || !names.includes(m[1])) return null;
  return { name: m[1], args: (m[2] || '').trim() };
}

function NoManager() {
  return (
    <section class="screen manager" aria-labelledby="manager-title">
      <PaneHeader id="manager-title" title="Manager" size="title" level={1} back={{ href: '#', label: 'Bridges', to: 'list' }} />
      <div class="empty center">
        <p>
          No manager is set up.{' '}
          <Help label="Where the manager is set up">
            The setting <code>workbench.bossmode.manager</code> names the agent of the manager.
          </Help>
        </p>
      </div>
    </section>
  );
}

export function Manager() {
  const config = useSelect((s) => s.config);
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const manager = config ? config.manager : null;
  const runId = useManagerRun(config);
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const cat = useCatalog();
  const [sent, setSent] = useState<{ text: string; run: string; users: number } | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const users = useRef(0);

  const stopped = !!run && ended(run.state);
  // The poll runs while the conversation is open and the run works, or
  // while an answer to the person is on its way.
  const t = useRunThread(runId, !!runId && (busy(run && run.state) || !!sent || !run));
  const userCount = useMemo(() => t.items.filter((x) => x.kind === 'user').length, [t.items]);
  users.current = userCount;

  // The sent text shows until the transcript holds a new message of the person.
  useEffect(() => {
    if (sent && (sent.run === runId ? userCount > sent.users : userCount > 0)) setSent(null);
  }, [userCount, runId]);

  // The decision of the manager reads its label from the result.
  const pendingId = run && run.pending ? run.pending.id : '';
  useEffect(() => {
    setRes(null);
    if (!runId || !pendingId) return;
    api.result(runId).then(setRes).catch(showError);
  }, [runId, pendingId]);

  const commands = useMemo(() => (cat ? cat.skills.filter((s) => s.slash).map((s) => ({ name: s.slash.slice(1), description: s.description })) : []), [cat]);
  const entries = useMemo(() => threadOf(t.items, manager ? manager.agent : 'manager'), [t.items, manager && manager.agent]);

  if (!manager) return <NoManager />;

  const lastUser = t.items.map((x) => x.kind).lastIndexOf('user');
  const answered = lastUser >= 0 && t.items.slice(lastUser + 1).some((x) => x.kind === 'assistant' || x.kind === 'ask' || (x.kind === 'end' && !!x.isError));
  const waiting = !stopped && (!!sent || (lastUser >= 0 && !answered)) && !(run && run.state === 'input-required');
  // The Task of the manager sleeps between messages, so the first answer waits for it to wake.
  const waking = waiting && (!run || run.state === 'queued' || run.state === 'suspended') && !t.items.some((x) => x.kind === 'assistant');
  const pending = run ? decisionOf(run, res) : null;

  const send = async (text: string): Promise<boolean> => {
    setSent({ text, run: runId, users: users.current });
    const slash = runId && !stopped ? slashOf(text, commands.map((c) => c.name)) : null;
    const ok = await attempt(async () => {
      if (slash) {
        const r = await make.sendSkill(runId, slash.name, slash.args);
        if (r && r.id) store.dispatch({ type: 'run', run: r });
      } else {
        await askManager(text);
      }
    });
    if (!ok) setSent(null);
    return ok;
  };

  const tail = (
    <>
      {sent && (
        <article class="tmsg sending">
          <Avatar subject={me} size={32} />
          <div>
            <header class="tmsg-who">
              <b class="t-sub">{personName(me)}</b>
            </header>
            <p class="plain">{sent.text}</p>
          </div>
        </article>
      )}
      {waiting && (
        <div class="tmsg" role="status">
          <Mark agent={manager.agent} size={32} />
          <div class="tmsg-who">
            <b class="t-sub">{manager.agent}</b>
            {waking ? (
              <Led tone="grey" word="waking" label="Waking the manager" />
            ) : (
              <>
                <Led tone="green" word="working" />
                {run && run.activity && run.activity.phrase && <span class="t-meta">{run.activity.phrase}</span>}
              </>
            )}
          </div>
        </div>
      )}
      {stopped && (
        <p class="tline">
          <Led tone="grey" word="Stopped. Your next message starts a new conversation." />
        </p>
      )}
    </>
  );

  return (
    <section class="screen manager" aria-labelledby="manager-title">
      <PaneHeader
        id="manager-title"
        title="Manager"
        size="title"
        level={1}
        back={{ href: '#', label: 'Bridges', to: 'list' }}
        lead={<Mark agent={manager.agent} size={36} />}
        actions={
          <Button size="s" disabled={!runId && !sent} onClick={() => setManagerRun('')}>
            New conversation
          </Button>
        }
      />
      <div class="scroll talk">
        {!runId && !sent && <p class="thread-empty">Ask about the fleet, or ask for a bridge.</p>}
        {runId && t.loading && <p class="thread-empty">Loading the conversation.</p>}
        {(runId || sent) && !t.loading && (
          <Thread
            entries={entries}
            agent={manager.agent}
            me={me}
            card={(id) => (pending && pending.id === id ? <DecisionCard d={pending} who={manager.agent} /> : null)}
            tail={
              <>
                {pending && !t.items.some((x) => x.kind === 'ask' && x.id === pending.id) && <DecisionCard d={pending} who={manager.agent} />}
                {tail}
              </>
            }
          />
        )}
      </div>
      <Composer draft="manager" label="Message to the manager" placeholder="Ask the manager" commands={commands} onSend={(text) => send(text)} />
    </section>
  );
}
