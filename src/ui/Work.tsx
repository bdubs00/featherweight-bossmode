// The Work place: the door on top (Door.tsx), and under it the board of the
// work, one card per task, from the request to its end. The board has six
// lanes in the order of the flow: Coming up, Working, Needs you, Stopped,
// To check, and Done. A line on top says where the next move is the
// person's, and each part of it takes the focus to its lane. A lane head
// counts its cards and says how long the oldest one waits. A card says what
// it is, who asked, why it stands where it stands, and since when. A card
// whose next move is the person's says Your move, and a card that the
// manager decides says Manager decides. A done card says its verdict:
// accepted, checked, sent back, or unchecked. Done shows its newest cards
// and the key Show all. A card To check offers Looks right and Needs work.
// The card opens the place that holds the work: for a decision or a result
// of the person, the card in Activity that ends it. Each lane is one stop
// of the Tab key, and the arrows move between its cards. The board reads
// GET /v1/work again every 30 seconds, after a stream event, and after a
// start at the door, so a card moves without a reload.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { WorkBoard, WorkCard, WorkStage, WorkVerdict } from '../api/types';
import { list, personName, since } from '../lib/words';
import { nextShort, titleOfName } from '../lib/duties';
import { hrefOf } from '../lib/route';
import { store, useSelect } from '../state/store';
import { useDutyLabel } from '../state/duties';
import { Door } from './Door';
import { ResultKeys } from './ResultKeys';
import { focusLost, smooth, useRoving } from './keys';
import { Button, Chip, Led, PaneHeader } from './primitives';
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

/** The tag of a card whose next move is the person's or the manager's. A card of the person is no tag: the tag says whose move it is. */
export const NEXT: Record<string, string> = {
  you: 'Your move',
  manager: 'Manager decides',
};

/** The parts of the line on top: the lanes where the next move is the person's, in the order of attention, then Working. */
/** A result to check waits for the person, so its light is amber here, as in Activity and on the count of the app bar. */
const GLANCE: { stage: WorkStage; words: (n: number) => string; mine: boolean; tone: Tone }[] = [
  { stage: 'needs-you', words: (n) => (n === 1 ? '1 task needs you' : n + ' tasks need you'), mine: true, tone: 'amber' },
  { stage: 'review', words: (n) => (n === 1 ? '1 result to check' : n + ' results to check'), mine: true, tone: 'amber' },
  { stage: 'stopped', words: (n) => n + ' stopped', mine: true, tone: 'red' },
  { stage: 'working', words: (n) => n + ' working', mine: false, tone: 'green' },
];

/** How many done cards Done shows before Show all. */
export const DONE_SHOWN = 5;

/**
 * hrefOfCard is the place that a card opens. A decision or a result whose
 * next move is the person's opens its card in Activity, which ends it with
 * a key. Else the card opens its bridge, its duty or its run of a duty,
 * Activity for a card that needs a person, or its conversation.
 */
export function hrefOfCard(c: WorkCard): string {
  const run = c.links.run;
  if (c.next === 'you' && run && !c.links.bridge) {
    if (c.stage === 'needs-you' && c.links.approval) return hrefOf({ place: 'activity', item: 'd:' + run + '/' + c.links.approval });
    if (c.stage === 'review') return hrefOf({ place: 'activity', item: 'v:' + run });
  }
  if (c.links.bridge) return '#bridge/' + encodeURIComponent(c.links.bridge);
  if (c.links.duty) return '#duties/' + encodeURIComponent(c.links.duty) + (run && c.stage !== 'needs-you' ? '/run/' + encodeURIComponent(run) : '');
  if (c.stage === 'needs-you') return '#activity';
  if (run) return '#chat/' + encodeURIComponent(run);
  return '#work';
}

/** isMe reports whether the name of a person on a card is the person who reads the board. */
const isMe = (name: string, me: string) => !!me && (name === me || (!name.includes('@') && name === personName(me)));

/** fromWords says who asked for a card, in a few words. The person who reads the board is You. */
export function fromWords(c: WorkCard, me = ''): string {
  const f = c.from || { kind: '' };
  const name = f.name || '';
  switch (f.kind) {
    case 'duty':
    case 'app':
      return name;
    default: {
      const mine = f.kind === 'person' && isMe(name, me);
      const who = mine ? 'You' : f.kind === 'person' ? personName(name) : name;
      if (f.via === 'manager') return 'Manager for ' + (mine ? 'you' : who);
      if (f.via === 'mcp') return who + ' in an MCP client';
      return who;
    }
  }
}

/** labelOfCard is the name of the link of a card for a screen reader: the title, the stage or the verdict, whose move it is, lost, and why. */
export function labelOfCard(c: WorkCard): string {
  const verdict = c.stage === 'done' && c.verdict ? VERDICTS[c.verdict].word : '';
  const parts = [c.title, verdict || LANES[c.stage].word];
  if (c.next && NEXT[c.next]) parts.push(NEXT[c.next].toLowerCase());
  if (c.lost) parts.push('lost');
  if (c.reason) parts.push(c.reason);
  return parts.join(', ');
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

/** whoWords is the meta of a card: who asked, else the agents that do it, when who asked only repeats the title. */
function whoWords(c: WorkCard, label: string, faces: Record<string, { displayName?: string }>): string {
  if (label && label.toLowerCase() !== c.title.trim().toLowerCase()) return label;
  return list(c.agents.slice(0, 2).map((a) => (faces[a] && faces[a].displayName) || titleOfName(a)));
}

function CardView({ c, now, onDecided }: { c: WorkCard; now: number; onDecided: () => void }) {
  // A card of a duty names the duty by its title, once the page reads the duties.
  const duty = useDutyLabel(c.from && c.from.kind === 'duty' ? c.from.name || '' : '');
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const faces = useSelect((s) => s.faces);
  const total = c.parts && c.parts.total > 1 ? c.parts.total : 0;
  const verdict = c.stage === 'done' && c.verdict ? VERDICTS[c.verdict] : null;
  const run = c.links.run;
  const tag = c.next ? NEXT[c.next] : '';
  return (
    <div class={'work-card' + (c.stage === 'needs-you' ? ' need' : '') + (c.lost ? ' lost' : '')} role="listitem">
      <span class="work-card-head">
        <span class="work-kind">{KINDS[c.kind] || c.kind}</span>
        {tag && <span class="work-yours">{tag}</span>}
        {c.lost && <span class="work-lost">Lost</span>}
        <time class="work-age" dateTime={c.since} title={new Date(c.since).toLocaleString()}>
          {/* A start that comes next says when it starts, a wait or a work since when. */}
          {Date.parse(c.since) > now ? nextShort(c.since) : since(c.since, now)}
        </time>
      </span>
      <a class="work-title clip2" href={hrefOfCard(c)} aria-label={labelOfCard(c)} data-item>
        {c.title}
      </a>
      {c.reason && <span class="work-reason clip2">{c.reason}</span>}
      <span class="work-meta">
        {verdict && <Led tone={verdict.tone} word={verdict.word} still />}
        <span class="clip">{whoWords(c, duty || fromWords(c, me), faces)}</span>
        {total > 0 && <span>{total + (c.kind === 'bridge' ? ' agents' : ' parts')}</span>}
      </span>
      {c.stage === 'review' && run && <ResultKeys run={run} title={c.title} size="s" onDone={onDecided} />}
    </div>
  );
}

function LaneView({ stage, cards, count, oldest, now, onDecided }: { stage: WorkStage; cards: WorkCard[]; count: number; oldest?: string; now: number; onDecided: () => void }) {
  const lane = LANES[stage];
  const id = 'lane-' + stage;
  // The lane is one stop of the Tab key. The arrows move between its cards.
  const ref = useRoving<HTMLDivElement>();
  const [all, setAll] = useState(false);
  // Done keeps its newest cards in sight. A cut that hides one card only shows it instead.
  const cut = stage === 'done' && !all && cards.length > DONE_SHOWN + 1 ? DONE_SHOWN : cards.length;
  return (
    <section class={'work-lane lane-' + stage} aria-labelledby={id}>
      <header class="work-lane-head">
        <h3 id={id} tabIndex={-1}>
          <Led tone={lane.tone} word={lane.word} still={stage !== 'needs-you'} />
        </h3>
        <Chip tone={stage === 'needs-you' && count > 0 ? 'amber' : 'plain'} label={count === 1 ? '1 task' : count + ' tasks'}>
          {count}
        </Chip>
        {oldest && Date.parse(oldest) <= now && stage !== 'done' && stage !== 'working' && (
          <time class="work-oldest" dateTime={oldest} title={'The oldest since ' + new Date(oldest).toLocaleString()}>
            {since(oldest, now)}
          </time>
        )}
      </header>
      <div class="work-cards" role="list" ref={ref}>
        {cards.slice(0, cut).map((c) => (
          <CardView key={c.id} c={c} now={now} onDecided={onDecided} />
        ))}
      </div>
      {stage === 'done' && cards.length > DONE_SHOWN + 1 && (
        <Button kind="quiet" size="s" class="work-all" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : 'Show all ' + cards.length}
        </Button>
      )}
    </section>
  );
}

/** jumpTo gives the focus to the lane of a stage: its card that holds the Tab stop, else its heading. With scroll, the lane comes to the top of the pane. */
export function jumpTo(stage: WorkStage, scroll = true): void {
  const head = document.getElementById('lane-' + stage);
  const lane = head && head.closest('.work-lane');
  if (!head || !lane) return;
  if (scroll) lane.scrollIntoView({ block: 'start', behavior: smooth() });
  const to = lane.querySelector<HTMLElement>('[data-item][tabindex="0"]') || lane.querySelector<HTMLElement>('[data-item]') || head;
  to.focus({ preventScroll: scroll });
}

/** Glance is the line on top of Work: what waits for the person, and what works. Each part takes the focus to its lane. */
export function Glance({ board }: { board: WorkBoard }) {
  const parts = GLANCE.map((g) => {
    const l = board.lanes.find((x) => x.stage === g.stage);
    return { ...g, n: l ? (g.mine ? l.yours : l.count) : 0 };
  }).filter((p) => p.n > 0);
  const waits = parts.some((p) => p.mine);
  return (
    <div class="work-glance" role="group" aria-label="At a glance">
      {!waits && <p class="t-meta">Nothing waits for you.</p>}
      {parts.map((p) => (
        <Button key={p.stage} kind="quiet" size="s" onClick={() => jumpTo(p.stage)}>
          <Led tone={p.tone} word={p.words(p.n)} still />
        </Button>
      ))}
    </div>
  );
}

/** WorkBoardView is the board of six lanes. onDecided reads the board again after Looks right or Needs work, and onRetry after a failed read. */
export function WorkBoardView({ board, failed, onDecided, onRetry }: { board: WorkBoard | null; failed: boolean; onDecided: () => void; onRetry?: () => void }) {
  const now = Date.now();
  if (failed && !board)
    return (
      <div class="empty">
        <p>The board did not load.</p>
        {onRetry && (
          <Button size="s" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  if (!board) return <p class="t-meta work-loading">Loading the board.</p>;
  return (
    <div class="work-board">
      {board.lanes.map((l) => (
        <LaneView key={l.stage} stage={l.stage} count={l.count} oldest={l.oldest} cards={board.cards.filter((c) => c.stage === l.stage)} now={now} onDecided={onDecided} />
      ))}
    </div>
  );
}

/** Work is the place Work: the line on top, the door, then the board. The header counts the open tasks. */
export function Work() {
  const [all, setAll] = useState(false);
  const [again, setAgain] = useState(0);
  const { board, failed, reload } = useBoard(all, again);
  // After Looks right or Send back, the card leaves To check. The focus then stays in that lane.
  const decided = useRef(false);
  useEffect(() => {
    if (!decided.current || !board) return;
    decided.current = false;
    if (focusLost()) jumpTo('review', false);
  }, [board]);
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
        {board && <Glance board={board} />}
        <Door onStarted={() => setAgain((n) => n + 1)} />
        <section class="work-board-sec" aria-labelledby="board-title">
          <h2 class="sr" id="board-title">
            The board
          </h2>
          <WorkBoardView
            board={board}
            failed={failed}
            onDecided={() => {
              decided.current = true;
              reload();
            }}
            onRetry={reload}
          />
        </section>
      </div>
    </section>
  );
}
