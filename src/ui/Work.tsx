// The board of the work, at #work, a view of the place Activity: one card
// per piece of work, from the request to its end, in six lanes in the
// order of the flow: Waiting, Working, Needs you, Stopped, To review, and
// Done. A lane head counts its cards and says how long the oldest one
// waits. A card says what it is, who asked, why it stands where it
// stands, and since when. A card whose next move is the person's says
// Yours, and a card that the manager decides says Manager. A click opens
// the place of the card: its bridge, its duty, or its conversation. The
// board reads GET /v1/work again every 30 seconds and after a stream
// event, so a card moves without a reload.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { WorkBoard, WorkCard, WorkStage } from '../api/types';
import { since } from '../lib/words';
import { store } from '../state/store';
import { Empty } from './common';
import { Chip, Led, PaneHeader } from './primitives';
import type { Tone } from '../lib/presence';

/** The words and the light of each lane. */
export const LANES: Record<WorkStage, { word: string; tone: Tone }> = {
  waiting: { word: 'Waiting', tone: 'grey' },
  working: { word: 'Working', tone: 'green' },
  'needs-you': { word: 'Needs you', tone: 'amber' },
  stopped: { word: 'Stopped', tone: 'red' },
  review: { word: 'To review', tone: 'grey' },
  done: { word: 'Done', tone: 'grey' },
};

/** The word of each kind of card. */
export const KINDS: Record<WorkCard['kind'], string> = {
  conversation: 'Chat',
  bridge: 'Bridge',
  duty: 'Duty',
  job: 'Job',
  event: 'Event',
};

/** hrefOfCard is the place that a card opens: its bridge, its duty, a decision in Activity, or its conversation. */
export function hrefOfCard(c: WorkCard): string {
  if (c.links.bridge) return '#bridge/' + encodeURIComponent(c.links.bridge);
  if (c.links.duty) return '#duties/' + encodeURIComponent(c.links.duty);
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
      return name;
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

/** useBoard reads the board, again at every interval and after a change of the store. */
function useBoard(all: boolean): { board: WorkBoard | null; failed: boolean } {
  const [board, setBoard] = useState<WorkBoard | null>(null);
  const [failed, setFailed] = useState(false);
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
  }, [all]);
  return { board, failed };
}

function CardView({ c, now }: { c: WorkCard; now: number }) {
  const lane = LANES[c.stage];
  const total = c.parts && c.parts.total > 1 ? c.parts.total : 0;
  return (
    <a class={'work-card' + (c.stage === 'needs-you' ? ' need' : '') + (c.lost ? ' lost' : '')} href={hrefOfCard(c)} data-item role="listitem" aria-label={c.title + ', ' + lane.word + (c.reason ? ', ' + c.reason : '')}>
      <span class="work-card-head">
        <span class="work-kind">{KINDS[c.kind] || c.kind}</span>
        {c.next === 'you' && <span class="work-yours">Yours</span>}
        {c.next === 'manager' && <span class="work-yours">Manager</span>}
        {c.lost && <span class="work-lost">Lost</span>}
        <time class="work-age" dateTime={c.since} title={new Date(c.since).toLocaleString()}>
          {since(c.since, now)}
        </time>
      </span>
      <span class="work-title clip2">{c.title}</span>
      {c.reason && <span class="work-reason clip2">{c.reason}</span>}
      <span class="work-meta">
        <span class="clip">{fromWords(c)}</span>
        {total > 0 && <span>{total + (c.kind === 'bridge' ? ' seats' : ' runs')}</span>}
      </span>
    </a>
  );
}

function LaneView({ stage, cards, count, oldest, now }: { stage: WorkStage; cards: WorkCard[]; count: number; oldest?: string; now: number }) {
  const lane = LANES[stage];
  const id = 'lane-' + stage;
  return (
    <section class={'work-lane lane-' + stage} aria-labelledby={id}>
      <header class="work-lane-head">
        <h3 id={id}>
          <Led tone={lane.tone} word={lane.word} still={stage !== 'needs-you'} />
        </h3>
        <Chip tone={stage === 'needs-you' && count > 0 ? 'amber' : 'plain'} label={count === 1 ? '1 card' : count + ' cards'}>
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
          <CardView key={c.id} c={c} now={now} />
        ))}
      </div>
    </section>
  );
}

/** Work is the board of the work. */
export function Work() {
  const [all, setAll] = useState(false);
  const { board, failed } = useBoard(all);
  const now = Date.now();
  const open = board ? board.lanes.filter((l) => l.stage !== 'done').reduce((n, l) => n + l.count, 0) : 0;
  return (
    <section class="screen work" aria-labelledby="work-title">
      <PaneHeader
        id="work-title"
        title="Work"
        back={{ href: '#activity', label: 'Activity', to: 'list' }}
        count={board ? open : undefined}
        countLabel={open === 1 ? '1 open' : open + ' open'}
        actions={
          <button type="button" class="board-only" aria-pressed={all} onClick={() => setAll(!all)}>
            Everyone
          </button>
        }
      />
      <div class="scroll work-scroll">
        {failed && !board && <Empty>The board did not load.</Empty>}
        {board && (
          <div class="work-board">
            {board.lanes.map((l) => (
              <LaneView key={l.stage} stage={l.stage} count={l.count} oldest={l.oldest} cards={board.cards.filter((c) => c.stage === l.stage)} now={now} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
