// One task that sits in no channel: a run of a job, or a one-off run. The
// stream is its conversation, with the steps folded, the decision that waits
// as a card, and the answer. A result to sign off ends with Looks right and
// Needs work. The composer follows up the run. The pane at the right says
// who did it, for whom, what it cost, and its verdict.

import { useEffect } from 'preact/hooks';
import { api } from '../../api/routes';
import { useSelect } from '../../state/store';
import { loadRunOnce } from '../../state/actions';
import { DUTY_KEY } from '../../state/inbox';
import { dutyLabel } from '../../lib/duties';
import { chatTitle, works } from '../../lib/chat';
import { costText } from '../../lib/cost';
import { attempt } from '../notice';
import { Empty, Markdown } from '../common';
import { Conversation, useTranscript, usePoll } from '../Conversation';
import { useResult } from '../RunPane';
import { ResultKeys } from '../ResultKeys';
import { Composer } from '../Composer';
import { Msg } from '../Thread';
import { Glyph } from '../icons';
import { Led, Mark } from '../primitives';
import { useBoard, reloadBoard, agentNameOf } from './data';
import { chatHref } from './route';
import type { Status } from './channels';

/** stateWords says the state of a run in the words of the stream. */
export function stateWords(state: string): Status {
  switch (state) {
    case 'queued':
      return { word: 'starting', tone: 'grey' };
    case 'running':
      return { word: 'working', tone: 'green' };
    case 'input-required':
      return { word: 'needs you', tone: 'amber' };
    case 'completed':
      return { word: 'done', tone: 'grey' };
    case 'failed':
      return { word: 'stopped', tone: 'red' };
    case 'canceled':
      return { word: 'canceled', tone: 'grey' };
  }
  return { word: state.replace(/-/g, ' '), tone: 'grey' };
}

export function RunView({ id }: { id: string }) {
  useEffect(() => {
    loadRunOnce(id).catch(() => {});
  }, [id]);
  const run = useSelect((s) => s.runs[id]);
  const lost = useSelect((s) => !!s.lost[id]);
  const name = useSelect((s) => (run ? agentNameOf(s, run.agent) : ''));
  const res = useResult(id);
  const t = useTranscript(id);
  usePoll(id);
  const board = useBoard();
  const card = board ? board.cards.find((c) => c.links.run === id || (c.links.runs || []).includes(id)) : undefined;
  if (!run) {
    return (
      <section class="cf-view">
        <header class="cf-head">
          <a class="cf-back" href="#" aria-label="Back">
            <Glyph name="back" size={20} />
          </a>
          <h1 class="cf-title">Task</h1>
        </header>
        <Empty>{lost ? 'This run is gone.' : 'Loading the task.'}</Empty>
      </section>
    );
  }
  const title = chatTitle(run);
  const answered = t.items.some((x) => x.kind === 'assistant');
  const toCheck = !!card && card.stage === 'review' && card.next === 'you';
  const st = stateWords(run.state);
  return (
    <section class="cf-view cf-run" aria-labelledby="cf-run-title">
      <header class="cf-head">
        <a class="cf-back" href="#" aria-label="Back">
          <Glyph name="back" size={20} />
        </a>
        <Mark agent={run.agent} size={32} />
        <h1 class="cf-title" id="cf-run-title" title={title}>
          {title}
        </h1>
        <Led tone={st.tone} word={st.word} still={st.tone === 'amber' ? undefined : true} />
        <span class="grow" />
        <a class="cf-members-key" href={chatHref({ view: 'run', id, about: true })}>
          About
        </a>
      </header>
      <div class="scroll cf-stream">
        <div class="cf-stream-in">
          <Conversation run={run} result={res} t={t} agentLabel={name} />
          {!t.loading && !answered && run.output && (
            <div class="thread">
              <Msg face={<Mark agent={run.agent} size={32} />} name={name} at={run.endedAt || run.updatedAt}>
                <Markdown text={run.output} refs />
              </Msg>
            </div>
          )}
          {toCheck && (
            <div class="cf-signoff">
              <p class="cf-signoff-head">Ready to sign off</p>
              <ResultKeys run={id} title={title} primary onDone={reloadBoard} />
            </div>
          )}
        </div>
      </div>
      {!run.archived && (!run.can || run.can.operate) && (
        <Composer
          draft={'run:' + id}
          label={'Reply to ' + name}
          placeholder={works(run) ? name + ' is working. Your reply waits for its turn.' : 'Reply to ' + name}
          onSend={async (text) => attempt(() => api.sendRun(id, text))}
        />
      )}
    </section>
  );
}

export function RunSide({ id }: { id: string }) {
  const run = useSelect((s) => s.runs[id]);
  const name = useSelect((s) => (run ? agentNameOf(s, run.agent) : ''));
  const board = useBoard();
  if (!run) return null;
  const card = board ? board.cards.find((c) => c.links.run === id || (c.links.runs || []).includes(id)) : undefined;
  const duty = (run.metadata && run.metadata[DUTY_KEY]) || '';
  const u = run.usage || {};
  return (
    <section class="cf-members" aria-labelledby="cf-run-about">
      <header class="cf-head cf-head-right">
        <a class="cf-back" href={chatHref({ view: 'run', id })} aria-label="Back to the task">
          <Glyph name="back" size={20} />
        </a>
        <h2 class="cf-title cf-title-s" id="cf-run-about">
          About this task
        </h2>
      </header>
      <div class="cf-members-scroll">
        <section class="cf-msec">
          <dl class="cf-facts">
            <dt>Agent</dt>
            <dd>
              <a href={chatHref({ view: 'agent', name: run.agent })}>{name}</a>
            </dd>
            {duty && (
              <>
                <dt>Job</dt>
                <dd>
                  <a href={chatHref({ view: 'job', name: duty })}>{dutyLabel(duty)}</a>
                </dd>
              </>
            )}
            {card && card.from.display && (
              <>
                <dt>Asked by</dt>
                <dd>{card.from.display}</dd>
              </>
            )}
            {typeof u.toolCalls === 'number' && (
              <>
                <dt>Steps</dt>
                <dd>{u.toolCalls}</dd>
              </>
            )}
            {typeof u.costUSD === 'number' && (
              <>
                <dt>Cost</dt>
                <dd>{costText(u.costUSD)}</dd>
              </>
            )}
            {card && card.verdict && (
              <>
                <dt>Verdict</dt>
                <dd>{card.verdict === 'checked' ? 'passed its checks' : card.verdict.replace(/-/g, ' ')}</dd>
              </>
            )}
          </dl>
        </section>
      </div>
    </section>
  );
}
