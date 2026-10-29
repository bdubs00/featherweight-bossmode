// The sidebar of the chat-first page: the name of the workspace with the
// grid of the other places and New channel, the filters All, Unread, and
// Jobs, the Manager pinned on top, Needs you, and the channels. The open
// channel lists its agents. A phone shows the sidebar as its home screen.

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Duty, Run } from '../../api/types';
import { useSelect } from '../../state/store';
import { managerRunOf, membersOf, selectFacts } from '../../state/reducer';
import { useDuties } from '../../state/duties';
import { dutyTitle, nextShort } from '../../lib/duties';
import { themeOf } from '../../lib/theme';
import { useManagerUnread } from '../Manager';
import { Glyph, Icon } from '../icons';
import { Led, Mark } from '../primitives';
import { Pop } from './Pop';
import { agentCount, channelRow, shortTime, sortChannels, type ChannelRow } from './channels';
import { agentNameOf, useNeeds, useNeedsCount } from './data';
import { chatHref, streamKey, type ChatRoute } from './route';
import type { NeedRow } from './needs';

export type Filter = 'all' | 'unread' | 'jobs';

/** The rows of Needs you that show before More, so the channels stay in sight. */
export const NEEDS_SHOWN = 4;

const FILTER_KEY = 'fw.bossmode.side.filter';

function readFilter(): Filter {
  try {
    const v = sessionStorage.getItem(FILTER_KEY);
    return v === 'unread' || v === 'jobs' ? v : 'all';
  } catch {
    return 'all';
  }
}

/** Clock is the mark of a channel or a row that repeats on a schedule. */
export function Clock({ label }: { label?: string }) {
  return (
    <svg class="cf-clock" viewBox="0 0 16 16" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

/**
 * The other places of the page, behind the grid. The Library holds the wiki,
 * the files, and the skills, and its key sits in the top bar. The theme
 * sits in the menu of the account. What an agent learned shows on the agent.
 */
const PLACES = [
  { label: 'Results', href: '#results' },
  { label: 'Agents', href: '#agents' },
  { label: 'Settings', href: '#settings' },
];

/** managerStatus says what the Manager does now, in the words of the row. */
function managerStatus(run: Run | undefined): { word: string; tone: 'green' | 'amber' | 'grey' } {
  if (!run) return { word: 'idle', tone: 'grey' };
  if (run.state === 'input-required') return { word: 'needs you', tone: 'amber' };
  if (run.state === 'running' || run.state === 'queued') {
    const p = run.activity && run.activity.phrase ? run.activity.phrase : 'working';
    return { word: p.charAt(0).toLowerCase() + p.slice(1), tone: 'green' };
  }
  return { word: 'idle', tone: 'grey' };
}

function ManagerRow({ current }: { current: boolean }) {
  const agent = useSelect((s) => (s.config && s.config.manager ? s.config.manager.agent : ''));
  const run = useSelect((s) => {
    const id = managerRunOf(s);
    return id ? s.runs[id] : undefined;
  });
  const name = useSelect((s) => (agent ? agentNameOf(s, agent) : 'Manager'));
  const unread = useManagerUnread().size;
  if (!agent) return null;
  const st = managerStatus(run);
  return (
    <a class={'cf-row cf-pin' + (current ? ' on' : '') + (unread ? ' unread' : '')} href={chatHref({ view: 'manager' })} aria-current={current ? 'page' : undefined}>
      <Mark agent={agent} size={36} ink />
      <span class="cf-row-main">
        <span class="cf-row-top">
          <span class="cf-row-title">{name}</span>
          <span class="cf-row-time">{run ? shortTime(run.updatedAt) : ''}</span>
        </span>
        <span class="cf-row-sub">
          <Led tone={st.tone} word={st.word} still={st.tone === 'amber' ? undefined : true} />
          {unread > 0 && <span class="cf-badge">{unread}</span>}
        </span>
      </span>
    </a>
  );
}

function NeedRowView({ r, current }: { r: NeedRow; current: boolean }) {
  return (
    <a class={'cf-row cf-need' + (current ? ' on' : '')} href={r.href} title={r.head + (r.line ? ': ' + r.line : '')} aria-current={current ? 'page' : undefined}>
      {r.agent ? <Mark agent={r.agent} size={36} /> : <span class="cf-need-ic">!</span>}
      <span class="cf-row-main">
        <span class="cf-row-top">
          <span class="cf-row-title">{r.head}</span>
          <span class="cf-row-time">{shortTime(r.at)}</span>
        </span>
        <span class="cf-row-sub">
          <span class="cf-row-line">{r.line}</span>
          <span class="cf-need-dot" aria-hidden="true" />
        </span>
      </span>
    </a>
  );
}

function ChannelRowView({ c, current, open, agent }: { c: ChannelRow; current: boolean; open: boolean; agent: string }) {
  const href = chatHref({ view: 'channel', id: c.id, tab: 'posts' });
  const sub = c.open ? [agentCount(c.agents.length), c.people].filter(Boolean).join(' · ') : '';
  return (
    <>
      <a class={'cf-row cf-chan' + (current ? ' on' : '') + (c.unread ? ' unread' : '')} href={href} aria-current={current ? 'page' : undefined} title={c.title}>
        {c.face ? <Mark agent={c.face} size={36} /> : <span class="cf-chan-hash">#</span>}
        <span class="cf-row-main">
          <span class="cf-row-top">
            <span class="cf-row-title">
              {open && c.agents.length > 0 && <Glyph name="back" size={12} class="cf-chev" />}
              <span class="cf-row-name">{c.title}</span>
              {c.repeats && <Clock label="Repeats on a schedule" />}
            </span>
            <span class="cf-row-time">{shortTime(c.at)}</span>
          </span>
          <span class="cf-row-sub">
            <span class="cf-row-line">
              <Led tone={c.status.tone} word={c.status.word} still={c.status.tone === 'amber' ? undefined : true} />
              {sub && <span class="cf-row-more"> · {sub}</span>}
            </span>
            {c.unread > 0 && <span class="cf-badge">{c.unread > 99 ? '99+' : c.unread}</span>}
          </span>
        </span>
      </a>
      {open && c.agents.length > 0 && (
        <ul class="cf-chan-agents" aria-label={'Agents of ' + c.title}>
          {c.agents.map((a) => (
            <li>
              <a href={chatHref({ view: 'agent', name: a.agent })} class={'cf-sub' + (agent === a.agent ? ' on' : '')} aria-current={agent === a.agent ? 'page' : undefined}>
                <Mark agent={a.agent} size={20} />
                <span class="cf-sub-name">{a.handle}</span>
                <Led tone={a.status.tone} word={a.status.word} still={a.status.tone === 'amber' ? undefined : true} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** lastWords says the last result of a job in one or two words. */
export function lastWords(d: Duty): string {
  const r = d.state && d.state.lastRun;
  if (!r) return 'no run yet';
  const v = (r as { verdict?: string }).verdict;
  if (v === 'accepted') return 'last accepted';
  if (v === 'sent-back') return 'last sent back';
  if (r.state === 'completed') return 'last done';
  if (r.state === 'failed') return 'last failed';
  if (r.state === 'retrying') return 'trying again';
  if (r.state === 'running' || r.state === 'queued') return 'running';
  if (r.state === 'input-required') return 'needs you';
  return r.state ? 'last ' + r.state.replace(/-/g, ' ') : '';
}

function JobRow({ d, current }: { d: Duty; current: boolean }) {
  const name = useSelect((s) => agentNameOf(s, d.agent));
  const next = d.paused ? 'paused' : d.next && d.next[0] ? 'next ' + nextShort(d.next[0]) : '';
  const at = d.state && d.state.lastRun ? d.state.lastRun.at : '';
  return (
    <a class={'cf-row cf-job' + (current ? ' on' : '')} href={chatHref({ view: 'job', name: d.name })} aria-current={current ? 'page' : undefined} title={dutyTitle(d)}>
      <Mark agent={d.agent} size={36} />
      <span class="cf-row-main">
        <span class="cf-row-top">
          <span class="cf-row-title">
            <span class="cf-row-name">{dutyTitle(d)}</span>
            <Clock />
          </span>
          <span class="cf-row-time">{at ? shortTime(at) : ''}</span>
        </span>
        <span class="cf-row-sub">
          <span class="cf-row-line">{[name, next, lastWords(d)].filter(Boolean).join(' · ')}</span>
        </span>
      </span>
    </a>
  );
}

/** useChannelRows builds the rows of the channels, open and closed. */
export function useChannelRows(): { open: ChannelRow[]; closed: ChannelRow[]; loaded: boolean } {
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const facts = useSelect(selectFacts);
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const list = useDuties((s) => s.list);
  return useMemo(() => {
    const rows = bridges.order.map((id) => bridges.byId[id]).map((b) => channelRow(b, rosters[b.id] ? membersOf(rosters[b.id]) : null, facts, me, list));
    return { open: sortChannels(rows.filter((r) => r.open)), closed: sortChannels(rows.filter((r) => !r.open)), loaded: bridges.loaded };
  }, [bridges, rosters, facts, me, list]);
}

/** The channel that the person opened last, so its agents stay listed while one of them shows. */
let lastChannel = '';

export function Sidebar({ route }: { route: ChatRoute | null }) {
  const [filter, setFilter] = useState<Filter>(readFilter);
  const [closedOpen, setClosedOpen] = useState(false);
  const [allNeeds, setAllNeeds] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, filter);
    } catch {
      // A browser without storage starts on All.
    }
  }, [filter]);
  const config = useSelect((s) => s.config);
  const name = themeOf(config).name || 'Bossmode';
  const needs = useNeeds();
  const needsCount = useNeedsCount();
  const { open, closed, loaded } = useChannelRows();
  const managerUnread = useManagerUnread().size;
  const duties = useDuties((s) => s.list);
  const key = route ? streamKey(route) : '';
  if (route && route.view === 'channel') lastChannel = route.id;
  // The open channel lists its agents, and so does the channel of the agent that shows.
  const agent = route && route.view === 'agent' ? route.name : '';
  // An agent keeps the channel that the person opened last when it works there, else the first open channel where it works.
  const agentChannel = agent ? (open.find((c) => c.id === lastChannel && c.agents.some((x) => x.agent === agent)) || open.find((c) => c.agents.some((x) => x.agent === agent))) : undefined;
  const expanded = route && route.view === 'channel' ? route.id : agentChannel ? agentChannel.id : '';
  const here = typeof location !== 'undefined' ? location.hash : '';
  const unreadChannels = open.filter((c) => c.unread > 0);
  const unreadCount = unreadChannels.length + (managerUnread ? 1 : 0);
  const pills: [Filter, string, number][] = [
    ['all', 'All', 0],
    ['unread', 'Unread', unreadCount],
    ['jobs', 'Jobs', 0],
  ];
  const jobs = useMemo(() => [...(duties || [])].sort((a, b) => dutyTitle(a).localeCompare(dutyTitle(b))), [duties]);
  return (
    <nav class="cf-side-in" aria-label="Channels">
      <div class="cf-side-head">
        <h2 class="cf-ws">{name}</h2>
        <Pop label="Other places" keyClass="cf-icon-key" keyBody={<Icon name="grid" />} items={PLACES} />
      </div>
      <div class="cf-pills" role="group" aria-label="Show">
        {pills.map(([f, label, n]) => (
          <button type="button" class={'cf-pill' + (filter === f ? ' on' : '')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
            {n > 0 && <span class="cf-pill-n">{n}</span>}
          </button>
        ))}
      </div>
      <div class="cf-side-scroll">
        {filter === 'jobs' ? (
          <section class="cf-sec" aria-labelledby="cf-jobs-h">
            <h3 class="cf-sec-head" id="cf-jobs-h">
              <span>Jobs</span>
              <span class="cf-sec-n">{jobs.length}</span>
            </h3>
            {duties === null && <p class="cf-side-note">Loading the jobs.</p>}
            {duties !== null && jobs.length === 0 && <p class="cf-side-note">No job repeats yet. Ask the Manager for work that repeats.</p>}
            {jobs.map((d) => (
              <JobRow d={d} current={key === 'j:' + d.name} />
            ))}
          </section>
        ) : (
          <>
            {(filter === 'all' || managerUnread > 0) && <ManagerRow current={!!route && route.view === 'manager'} />}
            {filter === 'all' && (needs.length > 0 || needsCount > 0) && (
              <section class="cf-sec cf-needs" aria-labelledby="cf-needs-h">
                <h3 class="cf-sec-head" id="cf-needs-h">
                  <span>Needs you</span>
                  <span class="cf-sec-n">{needsCount}</span>
                </h3>
                {(allNeeds ? needs : needs.slice(0, NEEDS_SHOWN)).map((r) => (
                  <NeedRowView r={r} current={here === r.href} />
                ))}
                {needs.length > NEEDS_SHOWN && (
                  <button type="button" class="cf-closed-key cf-more-needs" aria-expanded={allNeeds} onClick={() => setAllNeeds(!allNeeds)}>
                    {allNeeds ? 'Show fewer' : needs.length - NEEDS_SHOWN + ' more need you'}
                  </button>
                )}
              </section>
            )}
            <section class="cf-sec" aria-labelledby="cf-chans-h">
              <h3 class="cf-sec-head" id="cf-chans-h">
                <span>Channels</span>
                <span class="cf-sec-n">{filter === 'unread' ? unreadChannels.length + ' unread' : open.length + ' open'}</span>
              </h3>
              {!loaded && <p class="cf-side-note">Loading the channels.</p>}
              {loaded && open.length === 0 && filter === 'all' && <p class="cf-side-note">No channel is open. Ask the Manager for work, and it opens one.</p>}
              {loaded && filter === 'unread' && unreadCount === 0 && <p class="cf-side-note">Nothing unread.</p>}
              {(filter === 'unread' ? unreadChannels : open).map((c) => (
                <ChannelRowView c={c} current={key === 'c:' + c.id} open={expanded === c.id} agent={agent} />
              ))}
              {filter === 'all' && closed.length > 0 && (
                <>
                  <button type="button" class="cf-closed-key" aria-expanded={closedOpen} onClick={() => setClosedOpen(!closedOpen)}>
                    {closed.length === 1 ? '1 closed channel' : closed.length + ' closed channels'}
                  </button>
                  {closedOpen && closed.map((c) => <ChannelRowView c={c} current={key === 'c:' + c.id} open={expanded === c.id} agent={agent} />)}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </nav>
  );
}

/** useNeedsCount is the count of Needs you: the one count of the front, as the title of the tab and the badge of the older places show it. */
export { useNeedsCount };
