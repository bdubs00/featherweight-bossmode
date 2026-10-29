// The Work place: the door on top (Door.tsx), and under it the board of the
// work, one card per task, from the request to its end. The board has six
// lanes in the order of the flow: Coming up, Working, Needs you, Stopped,
// To check, and Done. A line on top says where the next move is the
// person's, and each part of it takes the focus to its lane. A lane head
// counts its cards and says how long the oldest one waits. A card says what
// it is, who asked, why it stands where it stands, and since when. A card
// whose next move is the person's says Your move, and a card that the
// manager decides says Manager decides. A done card says its verdict:
// accepted, checked, sent back, unchecked, or let go. To check and Done
// show their newest cards first, and Done shows its newest cards and the
// key Show all. Its head counts the done tasks as Results does: a canceled
// card and a card that was let go are no done task. The line on top also
// names the notes of Know-how that wait for the person, the third part of
// the one count of the work that needs the person. A card To check offers Looks right and
// Needs work, also a team, whose check goes to its bridge. A stopped card
// offers Let it go to the person whose move it is and to an owner of its
// agent: the card then ends in Done. A person shows by the name beside the
// subject, so a subject that is an id never shows.
// The card opens the place that holds the work: for a decision or a result
// of the person, the card in Activity that ends it. Each lane is one stop
// of the Tab key: ArrowUp and ArrowDown move between its cards, and
// ArrowLeft and ArrowRight move to the lane before or after. The board reads
// GET /v1/work again every 30 seconds, after a stream event, and after a
// start at the door, so a card moves without a reload.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Whoami, WorkBoard, WorkCard, WorkStage, WorkVerdict } from '../api/types';
import { list, personName, since } from '../lib/words';
import { nextShort, titleOfName } from '../lib/duties';
import { hrefOf } from '../lib/route';
import { store, useSelect } from '../state/store';
import { useDutyLabel } from '../state/duties';
import { Door, mayStartWork, type Started } from './Door';
import { ResultKeys } from './ResultKeys';
import { attempt, showSaid } from './notice';
import { focusLost, holdFocus, smooth, useRoving } from './keys';
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
  // A person let a stopped card go: the board shows the word, and Results does not count it.
  'let-go': { word: 'let go', tone: 'grey' },
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
  // The words of the lane: a team to check holds no one result, so the line says to check, as the lane does.
  { stage: 'review', words: (n) => n + ' to check', mine: true, tone: 'amber' },
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

/** isMe reports whether the name of a person on a card is the person who reads the board. A card can name the person by the subject or by the name of the sign-in, such as alice or alice@quillwork.example. */
const isMe = (name: string, me: string[]) => me.some((m) => !!m && (name === m || (!name.includes('@') && name === personName(m))));

/** fromWords says who asked for a card, in a few words. The person who reads the board, by any of the names in me, is You. */
export function fromWords(c: WorkCard, me: string | string[] = []): string {
  const mine_ = typeof me === 'string' ? [me] : me;
  const f = c.from || { kind: '' };
  const name = f.name || '';
  switch (f.kind) {
    case 'duty':
    case 'app':
      return name;
    default: {
      const mine = f.kind === 'person' && isMe(name, mine_);
      // The name beside the subject, so a subject that is an id never shows.
      const who = mine ? 'You' : f.kind === 'person' ? f.display || personName(name) : name;
      if (f.via === 'manager') return 'Manager for ' + (mine ? 'you' : who);
      if (f.via === 'mcp') return who + ' in an MCP client';
      return who;
    }
  }
}

/** labelOfCard is the name of the link of a card for a screen reader: the title, the stage or the verdict, whose move it is, lost, and why. */
export function labelOfCard(c: WorkCard): string {
  const verdict = c.stage === 'done' && c.verdict ? VERDICTS[c.verdict].word : '';
  // A title that ends in a comma or a colon would read as two stops, as in reviewed,, To check.
  const parts = [c.title.replace(/[\s,;:]+$/, ''), verdict || LANES[c.stage].word];
  if (c.next && NEXT[c.next]) parts.push(NEXT[c.next].toLowerCase());
  if (c.lost) parts.push('lost');
  if (c.reason) parts.push(c.reason);
  return parts.join(', ');
}

/**
 * mayLetGo reports whether the person can let a stopped card go: the person
 * whose move it is, an admin, and an owner of an agent of the card, as the
 * front decides it (docs/CONTRACT.md, section 19).
 */
export function mayLetGo(c: WorkCard, me: Pick<Whoami, 'admin' | 'roles'> | null | undefined): boolean {
  if (c.stage !== 'stopped') return false;
  if (c.next === 'you') return true;
  if (!me) return false;
  return !!me.admin || c.agents.some((a) => !!me.roles && me.roles[a] === 'owner');
}

/** LetGo is the key of a stopped card that ends it in Done with the verdict let go. */
function LetGo({ c, onDone }: { c: WorkCard; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div class="result-keys">
      <Button
        size="s"
        aria-label={'Let it go: ' + c.title}
        aria-disabled={busy || undefined}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          const after = holdFocus();
          const ok = await attempt(() => api.letGo(c.id));
          setBusy(false);
          if (!ok) return;
          showSaid('Let go: ' + c.title + '.');
          onDone();
          after();
        }}
      >
        Let it go
      </Button>
    </div>
  );
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

function CardView({ c, now, onDecided }: { c: WorkCard; now: number; onDecided: (stage: WorkStage) => void }) {
  // A card of a duty names the duty by its title, once the page reads the duties.
  const duty = useDutyLabel(c.from && c.from.kind === 'duty' ? c.from.name || '' : '');
  const subject = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const signin = useSelect((s) => (s.me && s.me.principal ? s.me.principal.name || '' : ''));
  const faces = useSelect((s) => s.faces);
  const me = useSelect((s) => s.me);
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
        <span class="clip">{whoWords(c, duty || fromWords(c, [subject, signin]), faces)}</span>
        {total > 0 && <span>{total + (c.kind === 'bridge' ? ' agents' : ' parts')}</span>}
      </span>
      {/* Only the person whose move it is checks a result: another person, or a viewer under Everyone, reads it only.
          A team has no one result: its check goes to its bridge, which Looks right closes and Needs work keeps open with the note. */}
      {c.stage === 'review' && c.next === 'you' && (c.kind === 'bridge' ? !!c.links.bridge : !!run) && (
        <ResultKeys run={c.kind === 'bridge' ? undefined : run} bridge={c.kind === 'bridge' ? c.links.bridge : undefined} title={c.title} size="s" onDone={() => onDecided(c.stage)} />
      )}
      {mayLetGo(c, me) && <LetGo c={c} onDone={() => onDecided(c.stage)} />}
    </div>
  );
}

function LaneView({ stage, cards, count, oldest, now, onDecided, head }: { stage: WorkStage; cards: WorkCard[]; count: number; oldest?: string; now: number; onDecided: (stage: WorkStage) => void; head?: { n: number; label: string } }) {
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
          {/* An empty lane is a still grey light: a lit or breathing light says that something is there. */}
          <Led tone={count > 0 ? lane.tone : 'grey'} word={lane.word} still={stage !== 'needs-you' || count === 0} />
        </h3>
        <Chip tone={stage === 'needs-you' && count > 0 ? 'amber' : 'plain'} label={head ? head.label : count === 1 ? '1 task' : count + ' tasks'}>
          {head ? head.n : count}
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

/**
 * Glance is the line on top of Work: what waits for the person, and what
 * works. Each part takes the focus to its lane. The notes of Know-how that
 * wait for the person open what the agents learned: with the tasks of
 * Needs you and To check, they make the one count of the app bar.
 */
export function Glance({ board }: { board: WorkBoard }) {
  const parts = GLANCE.map((g) => {
    const l = board.lanes.find((x) => x.stage === g.stage);
    return { ...g, n: l ? (g.mine ? l.yours : l.count) : 0 };
  }).filter((p) => p.n > 0);
  const notes = (board.waiting && board.waiting.notes) || 0;
  const waits = parts.some((p) => p.mine) || notes > 0;
  return (
    <div class="work-glance" role="group" aria-label="At a glance">
      {!waits && <p class="t-meta">Nothing waits for you.</p>}
      {parts.map((p) => (
        <Button key={p.stage} kind="quiet" size="s" onClick={() => jumpTo(p.stage)}>
          <Led tone={p.tone} word={p.words(p.n)} still />
        </Button>
      ))}
      {notes > 0 && (
        <Button kind="quiet" size="s" href={hrefOf({ place: 'knowhow' })}>
          <Led tone="amber" word={notes === 1 ? '1 note waits for you' : notes + ' notes wait for you'} still />
        </Button>
      )}
    </div>
  );
}

/** doneWords is the head of the lane Done: the done tasks, as Results counts them, and the canceled cards and the cards that were let go beside them. */
export function doneWords(board: Pick<WorkBoard, 'done'>, cards: number): { n: number; label: string } {
  if (typeof board.done !== 'number') return { n: cards, label: cards === 1 ? '1 task' : cards + ' tasks' };
  const rest = cards - board.done;
  return { n: board.done, label: board.done + ' done' + (rest > 0 ? ', ' + rest + ' canceled or let go' : '') };
}

/** cardOfMade finds the card of what Start made: the card of its run or of its bridge, or the open card of its duty. */
export function cardOfMade(board: WorkBoard | null, made: Started['made']): WorkCard | undefined {
  if (!board) return undefined;
  const cards = board.cards;
  if (made.run) return cards.find((c) => c.links.run === made.run || (c.links.runs || []).includes(made.run!));
  if (made.bridge) return cards.find((c) => c.links.bridge === made.bridge);
  if (made.duty) return cards.find((c) => c.links.duty === made.duty && c.stage !== 'done') || cards.find((c) => c.links.duty === made.duty);
  return undefined;
}

/** Follow says where the task that Start made stands now: the word and the light of its lane or its verdict, and why. */
function Follow({ board, made }: { board: WorkBoard | null; made: Started['made'] }) {
  const c = cardOfMade(board, made);
  if (!c) return null;
  const v = c.stage === 'done' && c.verdict ? VERDICTS[c.verdict] : null;
  const lane = LANES[c.stage];
  return (
    <p class="door-now">
      <span class="t-meta">Now:</span> <Led tone={v ? v.tone : lane.tone} word={v ? lane.word + ', ' + v.word : lane.word} still />
      {c.reason && <span class="t-meta"> {c.reason}</span>}
    </p>
  );
}

/** WorkBoardView is the board of six lanes. onDecided reads the board again after Looks right, Needs work, or Let it go, with the lane of the card, and onRetry after a failed read. */
export function WorkBoardView({
  board,
  failed,
  onDecided,
  onRetry,
  mine = false,
  canStart = true,
  onEveryone,
}: {
  board: WorkBoard | null;
  failed: boolean;
  onDecided: (stage: WorkStage) => void;
  onRetry?: () => void;
  /** True when the board shows only the tasks of the person, not of everyone. */
  mine?: boolean;
  canStart?: boolean;
  onEveryone?: () => void;
}) {
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
    <>
      {board.cards.length === 0 && (
        <div class="empty work-none">
          {/* The board of the person says why it is empty, and offers the cards of everyone. */}
          <p>{mine ? 'You have no task in the last ' + (board.days === 1 ? 'day' : board.days + ' days') + '.' : board.sentence || 'No tasks yet.'}</p>
          <span class="work-none-keys">
            {canStart && (
              <Button size="s" onClick={focusDoor}>
                Say what you need done
              </Button>
            )}
            {mine && onEveryone && (
              <Button size="s" onClick={onEveryone}>
                Show the tasks of everyone
              </Button>
            )}
          </span>
        </div>
      )}
      <div class="work-board" onKeyDown={acrossLanes}>
        {board.lanes.map((l) => (
          <LaneView
            key={l.stage}
            stage={l.stage}
            count={l.count}
            oldest={l.oldest}
            cards={board.cards.filter((c) => c.stage === l.stage)}
            now={now}
            onDecided={onDecided}
            head={l.stage === 'done' ? doneWords(board, l.count) : undefined}
          />
        ))}
      </div>
    </>
  );
}

/** acrossLanes moves the focus from a card to the card that holds the Tab stop of the lane before or after, with ArrowLeft and ArrowRight. A lane with no card is skipped. */
function acrossLanes(e: KeyboardEvent): void {
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target as HTMLElement;
  if (!t.matches('[data-item]')) return;
  const board = e.currentTarget as HTMLElement;
  const lanes = [...board.querySelectorAll<HTMLElement>('.work-cards')].filter((l) => l.querySelector('[data-item]'));
  const i = lanes.findIndex((l) => l.contains(t));
  const to = lanes[i + (e.key === 'ArrowRight' ? 1 : -1)];
  if (i < 0 || !to) return;
  e.preventDefault();
  const item = to.querySelector<HTMLElement>('[data-item][tabindex="0"]') || to.querySelector<HTMLElement>('[data-item]');
  if (item) item.focus();
}

/** focusDoor gives the focus to the field of the door, for a board with no task. */
function focusDoor(): void {
  const box = document.getElementById('door-words');
  if (!box) return;
  box.scrollIntoView({ block: 'center', behavior: smooth() });
  box.focus({ preventScroll: true });
}

/** Work is the place Work: the line on top, the door, then the board. The header counts the open tasks. */
export function Work() {
  // A person who can start no task, such as a sponsor, has no task of their own, so the board opens on everyone.
  const me = useSelect((s) => s.me);
  const canStart = mayStartWork(me);
  const [pick, setPick] = useState<boolean | null>(null);
  const all = pick === null ? !canStart : pick;
  const setAll = (x: boolean) => setPick(x);
  const [again, setAgain] = useState(0);
  const { board, failed, reload } = useBoard(all, again);
  // After Looks right, Send back, or Let it go, the card leaves its lane. The focus then stays in that lane.
  const decided = useRef<WorkStage | ''>('');
  useEffect(() => {
    if (!decided.current || !board) return;
    const lane = decided.current;
    decided.current = '';
    if (focusLost()) jumpTo(lane, false);
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
        {canStart ? (
          <Door onStarted={() => setAgain((n) => n + 1)} follow={(made) => <Follow board={board} made={made} />} />
        ) : (
          <p class="t-meta door-none">You can follow the work here. Only an owner or an operator of an agent can start a task.</p>
        )}
        <section class="work-board-sec" aria-labelledby="board-title">
          <h2 class="sr" id="board-title">
            The board
          </h2>
          <WorkBoardView
            board={board}
            failed={failed}
            onDecided={(stage) => {
              decided.current = stage;
              reload();
            }}
            onRetry={reload}
            mine={!all}
            canStart={canStart}
            onEveryone={() => setAll(true)}
          />
        </section>
      </div>
    </section>
  );
}
