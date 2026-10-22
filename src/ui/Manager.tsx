// The conversation of the operator with the manager. The first message
// starts a run on the manager Task, which sleeps between messages, so the
// first answer waits for the Task to wake: the page says "Waking the
// manager" until then. Later messages are follow-ups of the same run.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Result } from '../api/types';
import { store, useSelect } from '../state/store';
import { attempt, showError } from './notice';
import { Back, Empty, Face } from './common';
import { Composer } from './Composer';
import { Conversation, useTranscript } from './Conversation';
import { Icon } from './icons';

export function Manager() {
  const config = useSelect((s) => s.config);
  const manager = config ? config.manager : null;
  const [runId, setRunId] = useState(manager ? manager.run : '');
  const [sent, setSent] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const t = useTranscript(runId);

  useEffect(() => {
    if (manager && manager.run && !runId) setRunId(manager.run);
  }, [manager && manager.run]);

  // The decision of the manager reads its label from the result.
  const pendingId = run && run.pending ? run.pending.id : '';
  useEffect(() => {
    setRes(null);
    if (!runId || !pendingId) return;
    api.result(runId).then(setRes).catch(showError);
  }, [runId, pendingId]);

  // The sent text shows until the transcript holds it.
  const users = useMemo(() => t.items.filter((x) => x.kind === 'user'), [t.items]);
  useEffect(() => {
    if (sent && users.some((u) => u.text === sent)) setSent('');
  }, [users.length]);

  const lastUser = t.items.map((x) => x.kind).lastIndexOf('user');
  const answered = lastUser >= 0 && t.items.slice(lastUser + 1).some((x) => x.kind === 'assistant' || x.kind === 'end');
  const stopped = !!run && ['failed', 'canceled'].includes(run.state);
  const waiting = !!run && !t.loading && (!!sent || (lastUser >= 0 && !answered)) && !stopped && run.state !== 'input-required';
  const waking = waiting && (run!.state === 'queued' || run!.state === 'suspended') && users.length <= 1;

  if (!manager) {
    return (
      <section class="screen manager" aria-labelledby="manager-title">
        <header class="bar">
          <Back narrow label="Bridges" href="#" />
          <div class="title">
            <h1 id="manager-title">Manager</h1>
          </div>
        </header>
        <div class="scroll">
          <Empty>This workbench has no manager. An operator sets the profile of the manager in workbench.bossmode.manager.</Empty>
        </div>
      </section>
    );
  }

  const send = async (text: string): Promise<boolean> => {
    setSent(text);
    const ok = await attempt(async () => {
      if (!runId || stopped) {
        const r = await api.start(manager.member, { agent: manager.agent, input: text });
        store.dispatch({ type: 'run', run: r });
        setRunId(r.id);
      } else {
        await api.sendRun(runId, text);
      }
    });
    if (!ok) setSent('');
    return ok;
  };

  return (
    <section class="screen manager" aria-labelledby="manager-title">
      <header class="bar">
        <Back narrow label="Bridges" href="#" />
        <div class="title with-face">
          <Face agent={manager.agent} size={32} />
          <div>
            <h1 id="manager-title">Manager</h1>
            <p class="goal">It reads the fleet, opens bridges, and decides only what you delegate.</p>
          </div>
        </div>
        <div class="end">
          <button type="button" class="btn small" disabled={!runId} onClick={() => setRunId('')}>
            <Icon name="plus" /> New conversation
          </button>
        </div>
      </header>
      <div class="scroll talk">
        {!runId && !sent && <Empty>Ask the manager about the fleet, or ask it to open a bridge. The first answer takes a few seconds, because its Task wakes for it.</Empty>}
        {runId && <Conversation run={run} result={res} t={t} agentLabel="manager" />}
        {sent && !users.some((u) => u.text === sent) && <div class="bubble mine sending">{sent}</div>}
        {(waiting || (sent && !runId)) && (
          <p class="cap waiting" role="status">
            {waking || !runId ? (
              <>
                <Icon name="moon" /> Waking the manager. Its Task sleeps between messages, so the first answer takes a few seconds.
              </>
            ) : (
              <>
                <span class="typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {run && run.activity && run.activity.phrase ? 'The manager works: ' + run.activity.phrase + '.' : 'The manager works on an answer.'}
              </>
            )}
          </p>
        )}
        {stopped && <p class="cap err">This conversation stopped. Your next message starts a new one.</p>}
      </div>
      <Composer draft="manager" label="Message to the manager" placeholder="Ask the manager" onSend={(text) => send(text)} />
    </section>
  );
}
