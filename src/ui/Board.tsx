// The board, at #board: one light per member, grouped by bridge, for a
// fleet too large for a list. A light is a 12-pixel target, 44 on touch,
// with the handle in its tooltip and its status for a screen reader. A
// click opens the member. A status strip on each group heading counts the
// statuses of the group, and a segment of the strip filters the board to
// that status.

import { useMemo, useState } from 'preact/hooks';
import { filterStatus, stripOf, type PeopleGroup, type PersonRow } from '../state/people';
import { useRoving } from './keys';
import { usePeople } from './Fleet';
import { Led, PaneHeader } from './primitives';

/** Strip is the status strip of a group: one segment per status, as wide as its count. */
export function Strip({ rows, title, active, onPick }: { rows: PersonRow[]; title: string; active: string; onPick: (word: string) => void }) {
  const segs = stripOf(rows);
  if (!segs.length) return null;
  return (
    <div class="strip" role="group" aria-label={'Statuses of ' + title}>
      {segs.map((s) => (
        <button
          type="button"
          class={'strip-seg tone-' + s.tone}
          style={{ flexGrow: s.count }}
          aria-pressed={active === s.word}
          aria-label={s.count + ' ' + s.word}
          title={s.count + ' ' + s.word}
          onClick={() => onPick(active === s.word ? '' : s.word)}
        />
      ))}
    </div>
  );
}

/** BoardLight is one member: a light that opens it. */
function BoardLight({ r }: { r: PersonRow }) {
  const tone = r.light ? r.light.tone : 'grey';
  const word = r.light ? r.light.word : r.task;
  return (
    <a class="board-light" href={r.href} title={r.handle} data-item>
      <span class="sr">{r.handle + ', '}</span>
      <Led tone={tone} word={word} struck={r.light ? r.light.struck : false} quiet label={r.handle} />
    </a>
  );
}

function Group({ g, all, active, onPick }: { g: PeopleGroup; all: PeopleGroup | undefined; active: string; onPick: (w: string) => void }) {
  return (
    <section class="board-group" aria-labelledby={'bg-' + (g.key || 'none')}>
      <div class="board-head">
        {g.href ? (
          <a class="people-title clip" id={'bg-' + (g.key || 'none')} href={g.href}>
            {g.title}
          </a>
        ) : (
          <span class="people-title muted clip" id={'bg-' + (g.key || 'none')}>
            {g.title}
          </span>
        )}
        <span class="people-count" aria-label={g.rows.length === 1 ? '1 member' : g.rows.length + ' members'}>
          {g.rows.length}
        </span>
        <Strip rows={all ? all.rows : g.rows} title={g.title} active={active} onPick={onPick} />
      </div>
      <div class="board-lights" role="list">
        {g.rows.map((r) => (
          <span role="listitem">
            <BoardLight r={r} />
          </span>
        ))}
      </div>
    </section>
  );
}

export function Board() {
  const { groups, loaded } = usePeople();
  const [status, setStatus] = useState('');
  const shown = useMemo(() => filterStatus(groups, status), [groups, status]);
  const byKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);
  const lights = useRoving<HTMLDivElement>();
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <section class="screen board" aria-labelledby="board-title">
      <PaneHeader
        id="board-title"
        title="Board"
        size="title"
        level={1}
        back={{ href: '#fleet', label: 'Fleet', to: 'list' }}
        count={loaded ? total : undefined}
        countLabel={total === 1 ? '1 member' : total + ' members'}
      >
        {status && <Led tone={(groups.flatMap((g) => g.rows).find((r) => r.light && r.light.word === status)?.light?.tone) || 'grey'} word={status} />}
      </PaneHeader>
      <div class="scroll pad" ref={lights}>
        {shown.map((g) => (
          <Group g={g} all={byKey.get(g.key)} active={status} onPick={setStatus} />
        ))}
        {!loaded && <p class="people-note">Loading the members.</p>}
      </div>
    </section>
  );
}
