// Today: the short view that a wide window opens on when nothing waits for
// the person. It says what needs you, what works now, and what finished
// since your last visit, each as a row that opens its place.

import { useMemo } from 'preact/hooks';
import type { WorkCard } from '../../api/types';
import { useSelect } from '../../state/store';
import { clock, dayWords } from '../../lib/words';
import { costText } from '../../lib/cost';
import { Glyph } from '../icons';
import { Led, Mark } from '../primitives';
import { agentNameOf, useBoard, useNeeds } from './data';
import { oneLine } from './needs';
import { chatHref } from './route';
import { shortTime } from './channels';

const VISIT_KEY = 'fw.bossmode.lastVisit';

/** The moment of the last visit before this page load, read once: the finished work after it is news. */
let lastVisit: string | null = null;

/** sinceLastVisit reads the last visit of this browser once per page load and keeps this one. A first visit counts the last day. */
export function sinceLastVisit(now = new Date()): string {
  if (lastVisit !== null) return lastVisit;
  let before = '';
  try {
    before = localStorage.getItem(VISIT_KEY) || '';
    localStorage.setItem(VISIT_KEY, now.toISOString());
  } catch {
    // A browser without storage counts the last day.
  }
  lastVisit = before || new Date(now.getTime() - 86400000).toISOString();
  return lastVisit;
}

/** hrefOfCard opens the place of a task: its channel, its run, or its job. */
function hrefOfCard(c: WorkCard): string {
  if (c.links.bridge) return chatHref({ view: 'channel', id: c.links.bridge, tab: 'posts' });
  if (c.links.run) return chatHref({ view: 'run', id: c.links.run });
  if (c.links.duty) return chatHref({ view: 'job', name: c.links.duty });
  return '#';
}

const VERDICT: Record<string, { word: string; tone: 'green' | 'red' | 'grey' }> = {
  accepted: { word: 'accepted', tone: 'green' },
  checked: { word: 'passed its checks', tone: 'green' },
  'sent-back': { word: 'sent back', tone: 'red' },
  unchecked: { word: 'unchecked', tone: 'grey' },
  'let-go': { word: 'let go', tone: 'grey' },
};

function CardRow({ c, meta }: { c: WorkCard; meta: preact.ComponentChildren }) {
  const faces = useSelect((s) => s.faces);
  const agent = c.agents[0] || '';
  return (
    <li>
      <a class="cf-today-row" href={hrefOfCard(c)}>
        {agent ? <Mark agent={agent} size={32} /> : <span class="cf-chan-hash">#</span>}
        <span class="cf-today-main">
          <strong>{c.summary ? oneLine(c.summary) : c.title}</strong>
          <span class="cf-today-meta">
            {[c.summary && c.summary.trim() !== c.title.trim() ? c.title : '', agent ? agentNameOf({ faces }, agent) : ''].filter(Boolean).join(' · ')}{' '}
            {meta}
          </span>
        </span>
      </a>
    </li>
  );
}

export function TodayView() {
  const board = useBoard();
  const needs = useNeeds();
  const since = sinceLastVisit();
  const cards = (board && board.cards) || [];
  const working = cards.filter((c) => c.stage === 'working');
  const finished = useMemo(() => cards.filter((c) => c.stage === 'done' && (c.ended || c.since) > since).sort((a, b) => ((b.ended || b.since) > (a.ended || a.since) ? 1 : -1)), [cards, since]);
  return (
    <section class="cf-view cf-today" aria-labelledby="cf-today-title">
      <header class="cf-head">
        <a class="cf-back" href="#" aria-label="Back">
          <Glyph name="back" size={20} />
        </a>
        <div class="cf-titles">
          <h1 class="cf-title" id="cf-today-title">
            Today
          </h1>
          <p class="cf-topic">
            Since your last visit, {dayWords(since) === 'Today' ? 'today' : dayWords(since)} at {clock(since)}
          </p>
        </div>
      </header>
      <div class="scroll cf-stream">
        <div class="cf-stream-in cf-list-in">
          {!board && <p class="cf-post-quiet">Loading the work.</p>}
          <section class="cf-asec">
            <h2 class="cf-asec-head">Needs you</h2>
            {needs.length === 0 ? <p class="cf-post-quiet">Nothing waits for you.</p> : null}
            <ul class="cf-today-list">
              {needs.slice(0, 5).map((r) => (
                <li>
                  <a class="cf-today-row" href={r.href}>
                    {r.agent ? <Mark agent={r.agent} size={32} /> : <span class="cf-chan-hash">!</span>}
                    <span class="cf-today-main">
                      <strong>{r.head}</strong>
                      <span class="cf-today-meta">{r.line}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section class="cf-asec">
            <h2 class="cf-asec-head">Working now</h2>
            {board && working.length === 0 && <p class="cf-post-quiet">No agent works on a task now.</p>}
            <ul class="cf-today-list">
              {working.map((c) => (
                <CardRow c={c} meta={<Led tone="green" word={'since ' + shortTime(c.opened)} />} />
              ))}
            </ul>
          </section>
          <section class="cf-asec">
            <h2 class="cf-asec-head">Finished since your last visit</h2>
            {board && finished.length === 0 && <p class="cf-post-quiet">Nothing finished since then.</p>}
            <ul class="cf-today-list">
              {finished.slice(0, 12).map((c) => {
                const v = VERDICT[c.verdict || 'unchecked'] || VERDICT.unchecked;
                return (
                  <CardRow
                    c={c}
                    meta={
                      <>
                        {' '}
                        <Led tone={v.tone} word={v.word} still /> {shortTime(c.ended || c.since)}
                        {c.costUSD > 0 ? ' · ' + costText(c.costUSD) : ''}
                      </>
                    }
                  />
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}
