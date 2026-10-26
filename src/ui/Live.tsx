// The live answer of a one-on-one view: the hook that opens the live
// stream of a run while it works, and the quiet line at the end of the
// thread. The pending answer grows as the model writes it and gives its
// place to the real item once the view holds it. The bubble has no cursor
// and no motion: only its text grows, so reduced motion changes nothing.
// docs/CONTRACT.md, section 7.6, names the stream.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { NO_LIVE, liveStep, liveText, openLive, settle, type LiveView } from '../api/live';
import { store } from '../state/store';
import { Quiet } from './Thread';

export interface LiveAnswer {
  /** The text of the answer that the model writes now, or "". */
  text: string;
  /** The tool that the model calls now, or "". */
  tool: string;
  /** True after a 429: the view reads the run with its poll alone. */
  busy: boolean;
}

export interface LiveInput {
  /** True while the run works, or while an answer to the person is on its way. */
  working: boolean;
  /** The seq of the run, so a run that went idle opens the stream again once it moves. */
  seq: number;
  /** The newest seq that the view holds: the last item of a transcript, or the last entry of a channel. */
  mark: number;
  /** The seqs of the real items of an answer that the view holds. */
  answers: number[];
  /** True for a view that shows only the final answer, such as the Chat tab of a seat. */
  dropPreamble?: boolean;
}

/** refresh reads the run again, so the view fetches the new items of its answer sooner than the poll. */
function refresh(runId: string): void {
  api
    .run(runId)
    .then((r) => store.dispatch({ type: 'run', run: r }))
    .catch(() => {
      // The poll or the stream brings the run later.
    });
}

/**
 * useLiveAnswer opens the live stream of a run while it works and gives
 * the pending answer. The stream stops on idle and opens again when the
 * run moves; it stops for good on a 429, which the view then shows, and on
 * another error answer. It closes with the view.
 */
export function useLiveAnswer(runId: string, p: LiveInput): LiveAnswer {
  const [view, setView] = useState<LiveView>(NO_LIVE);
  const [busy, setBusy] = useState(false);
  const [rest, setRest] = useState<{ run: string; seq: number } | null>(null);
  const [gone, setGone] = useState('');
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    setView(NO_LIVE);
    setBusy(false);
    setRest(null);
    setGone('');
  }, [runId]);

  const resting = !!rest && rest.run === runId && rest.seq === p.seq;
  const active = !!runId && p.working && !busy && gone !== runId && !resting;

  useEffect(() => {
    if (!active) return;
    const h = openLive({
      run: runId,
      working: () => latest.current.working,
      onEvent: (e) => {
        const cur = latest.current;
        setView((v) => liveStep(v, e, cur.mark, cur.dropPreamble));
        if (e.kind === 'done') refresh(runId);
      },
      onEnd: (why) => {
        if (why === 'busy') setBusy(true);
        else if (why === 'gone') setGone(runId);
        else if (why === 'idle' || why === 'ended') {
          setRest({ run: runId, seq: latest.current.seq });
          refresh(runId);
        }
      },
    });
    return () => h.close();
  }, [runId, active]);

  // The real items replace the pending answer as they arrive.
  const key = p.answers.join(',');
  useEffect(() => {
    setView((v) => settle(v, p.answers));
  }, [key]);

  return { text: liveText(view), tool: view.tool, busy: busy && p.working };
}

/** toolWord names a tool as the step lines name it, without the prefix of the front. */
export const toolWord = (name: string): string => name.replace(/^front\./, '');

/** LiveLines is the quiet line after a pending answer while the live view is busy. The typing line names the tool that the model calls (Typing.tsx). */
export function LiveLines({ live }: { live: LiveAnswer }) {
  return live.busy ? <Quiet>Live view is busy</Quiet> : null;
}
