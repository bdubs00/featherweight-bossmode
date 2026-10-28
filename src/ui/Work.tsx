// The Work place: the door on top (Door.tsx), and under it the board of the
// work, one card per task, from the request to its end. The board has six
// lanes in the order of the flow: Coming up, Working, Needs you, Stopped,
// To check, and Done. A lane head counts its cards and says how long the
// oldest one waits. A card says what it is, who asked, why it stands where
// it stands, and since when. A card whose next move is the person's says
// Yours, and a card that the manager decides says Manager. A done card
// says its verdict: accepted, checked, sent back, or unchecked. A card To
// check offers Looks right and Needs work. The title of a card opens the
// place that holds the work. The board reads GET /v1/work again every 30
// seconds, after a stream event, and after a start at the door, so a card
// moves without a reload.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { WorkBoard, WorkCard, WorkStage, WorkVerdict } from '../api/types';
import { since } from '../lib/words';
import { store } from '../state/store';
import { Empty } from './common';
import { Door } from './Door';
import { ResultKeys } from './ResultKeys';
import { Chip, Led, PaneHeader } from './primitives';
import type { Tone } from '../lib/presence';

/** The words and the light of each lane (docs/CONTRACT.md, section 19). */
export const LANES: Record<WorkStage, { word: string; tone: Tone }> = {
  waiting: { word: 'Coming up', tone: 'grey' },
  working: { word: 'Working', tone: 'green' },
  'needs-you': { word: 'Needs you', tone: 'amber' },
  stopped: { word: 'Stopped', tone: 'red' },
  review: { word: 'To check', tone: 'grey' },
  done: { word: 'Done', tone: 'grey' },
};

/** The words and the light of each verdict of a done card. */
export const VERDICTS: Record<WorkVerdict, { word: string; tone: Tone }> = {
  accepted: { word: 'accepted', tone: 'green' },
  checked: { word: 'checked', tone: 'green' },
  'sent-back': { word: 'sent back', tone: 'red' },
  unchecked: { word: 'unchecked', tone: 'grey' },
};

/** The word of each kind of card. */
export const KINDS: Record<WorkCard['kind'], string> = {
  conversation: 'Chat',
  bridge: 'Team',
  duty: 'Duty',
  job: 'Batch',
  event: 'Event',
};

/** hrefOfCard is the place that a card opens: its bridge, its duty, a decision in Activity, or its conversation. */
export function hrefOfCard(c: WorkCard): string {
  if (c.links.bridge) return '#bridge/' + encodeURIComponent(c.links.bridge);
  if (c.links.duty) return '#duties/' + encodeURIComponent(c.links.duty) + (c.links.run && c.stage !== 'needs-you' ? '/run/' + encodeURIComponent(c.links.run) : '');
  if (c.stage === 'needs-you') return '#activity';
  if (c.links.run) return '#chat/' + encodeURIComponent(c.links.run);
  return '#work';
}

/** fromWords says who asked for a card, in a few words. */
export function fromWords(c: WorkCard): string {
  const f = c.from || { kind: '' };
  const name = f.name || '';
  switch (f.kind) {
    case 'duty':
    case 'app':
      return name;
    default:
      if (f.via === 'manager') return 'Manager for ' + name;
      if (f.via === 'mcp') return name + ' in an MCP client';
      return name;
  }
}

/** The time between two reads of the board, in milliseconds. */
const EVERY = 30_000;

/** useBoard reads the board, again at every interval, after a change of the store, and when again changes. */
function useBoard(all: boolean, again: number): { board: WorkBoard | null; failed: boolean; reload: () => void } {
  const [board, setBoard] = useState<WorkBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    let timer = 0;
    let last = 0;
    const load = () => {
      last = Date.now();
      api.work({ all }).then(
        (b) => {
          if (!live) return;
          setBoard(b);
          setFailed(false);
        },
        () => live && setFailed(true),
      );
    };
    load();
    const every = window.setInterval(load, EVERY);
    // A stream event changes the store. The board follows it, at most once in two seconds.
    const off = store.subscribe(() => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        if (Date.now() - last > 2000) load();
      }, 2000);
    });
    return () => {
      live = false;
      window.clearInterval(every);
      if (timer) window.clearTimeout(timer);
      off();
    };
  }, [all, again, n]);
  return { board, failed, reload: () => setN((x) => x + 1) };
}

function CardView({ c, now, onDecided }: { c: WorkCard; now: number; onDecided: () => void }) {
  const lane = LANES[c.stage];
  const total = c.parts && c.parts.total > 1 ? c.parts.total : 0;
  const verdict = c.stage === 'done' && c.verdict ? VERDICTS[c.verdict] : null;
  const run = c.links.run;
  return (
    <div class={'work-card' + (c.stage === 'needs-you' ? ' need' : '') + (c.lost ? ' lost' : '')} role="listitem" data-item>
      <span class="work-card-head">
        <span class="work-kind">{KINDS[c.kind] || c.kind}</span>
        {c.next === 'you' && <span class="work-yours">Yours</span>}
        {c.next === 'manager' && <span class="work-yours">Manager</span>}
        {c.lost && <span class="work-lost">Lost</span>}
        <time class="work-age" dateTime={c.since} title={new Date(c.since).toLocaleString()}>
          {since(c.since, now)}
        </time>
      </span>
      <a class="work-title clip2" href={hrefOfCard(c)} aria-label={c.title + ', ' + (verdict ? verdict.word : lane.word) + (c.reason ? ', ' + c.reason : '')}>
        {c.title}
      </a>
      {c.reason && <span class="work-reason clip2">{c.reason}</span>}
      <span class="work-meta">
        {verdict && <Led tone={verdict.tone} word={verdict.word} still />}
        <span class="clip">{fromWords(c)}</span>
        {total > 0 && <span>{total + (c.kind === 'bridge' ? ' agents' : ' parts')}</span>}
      </span>
      {c.stage === 'review' && run && <ResultKeys run={run} title={c.title} size="s" onDone={onDecided} />}
    </div>
  );
}

function LaneView({ stage, cards, count, oldest, now, onDecided }: { stage: WorkStage; cards: WorkCard[]; count: number; oldest?: string; now: number; onDecided: () => void }) {
  const lane = LANES[stage];
  const id = 'lane-' + stage;
  return (
    <section class={'work-lane lane-' + stage} aria-labelledby={id}>
      <header class="work-lane-head">
        <h3 id={id}>
          <Led tone={lane.tone} word={lane.word} still={stage !== 'needs-you'} />
        </h3>
        <Chip tone={stage === 'needs-you' && count > 0 ? 'amber' : 'plain'} label={count === 1 ? '1 task' : count + ' tasks'}>
          {count}
        </Chip>
        {oldest && stage !== 'done' && stage !== 'working' && (
          <time class="work-oldest" dateTime={oldest} title={'The oldest since ' + new Date(oldest).toLocaleString()}>
            {since(oldest, now)}
          </time>
        )}
      </header>
      <div class="work-cards" role="list">
        {cards.map((c) => (
          <CardView key={c.id} c={c} now={now} onDecided={onDecided} />
        ))}
      </div>
    </section>
  );
}

/** WorkBoardView is the board of six lanes. onDecided reads the board again after Looks right or Needs work. */
export function WorkBoardView({ board, failed, onDecided }: { board: WorkBoard | null; failed: boolean; onDecided: () => void }) {
  const now = Date.now();
  if (failed && !board) return <Empty>The board did not load.</Empty>;
  if (!board) return <p class="t-meta work-loading">Loading the board.</p>;
  return (
    <div class="work-board">
      {board.lanes.map((l) => (
        <LaneView key={l.stage} stage={l.stage} count={l.count} oldest={l.oldest} cards={board.cards.filter((c) => c.stage === l.stage)} now={now} onDecided={onDecided} />
      ))}
    </div>
  );
}

/** Work is the place Work: the door, then the board. The header counts the open tasks. */
export function Work() {
  const [all, setAll] = useState(false);
  const [again, setAgain] = useState(0);
  const { board, failed, reload } = useBoard(all, again);
  const open = board ? board.lanes.filter((l) => l.stage !== 'done').reduce((n, l) => n + l.count, 0) : 0;
  return (
    <section class="screen work" aria-labelledby="work-title">
      <PaneHeader
        id="work-title"
        title="Work"
        size="title"
        level={1}
        focusable
        count={board ? open : undefined}
        countLabel={open === 1 ? '1 open task' : open + ' open tasks'}
        actions={
          <button type="button" class="board-only" aria-pressed={all} onClick={() => setAll(!all)}>
            Everyone
          </button>
        }
      />
      <div class="scroll pad work-body">
        <Door onStarted={() => setAgain((n) => n + 1)} />
        <section class="work-board-sec" aria-label="The board">
          <WorkBoardView board={board} failed={failed} onDecided={reload} />
        </section>
      </div>
    </section>
  );
}
