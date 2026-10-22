// A direct conversation with a member of a bridge, and the profile of its
// agent. This first cut shows the run of the member in the main pane, as the
// run pane shows it, and the face of its agent in the details pane. Screen B
// reworks it into the conversation with the tabs Chat, Run, and Files, and
// the profile of docs/DESIGN.md, section 11.

import { useEffect } from 'preact/hooks';
import type { MemberTab } from '../lib/route';
import { useSelect } from '../state/store';
import { loadBridge } from '../state/actions';
import { attempt } from './notice';
import { RunPane } from './RunPane';
import { AgentPane } from './Fleet';
import { PaneHeader } from './primitives';

function useMember(bridge: string, handle: string) {
  const m = useSelect((s) => (s.rosters[bridge] ? s.rosters[bridge].byHandle[handle] : undefined));
  const loaded = useSelect((s) => !!s.rosters[bridge]);
  useEffect(() => {
    if (!loaded) attempt(() => loadBridge(bridge));
  }, [bridge, loaded]);
  return { m, loaded };
}

export function MemberMain({ bridge, handle }: { bridge: string; handle: string; tab: MemberTab }) {
  const { m, loaded } = useMember(bridge, handle);
  const run = m && m.runs.length ? m.runs[m.runs.length - 1] : '';
  if (!m || !run) {
    return (
      <section class="screen">
        <PaneHeader title={handle} size="title" level={1} back={{ href: '#fleet', label: 'Fleet', to: 'list' }} />
        <div class="empty">
          <p>{loaded ? handle + ' has no seat on this bridge, or no run yet.' : 'Loading the member.'}</p>
        </div>
      </section>
    );
  }
  return <RunPane bridge={bridge} runId={run} handle={handle} />;
}

export function MemberProfile({ bridge, handle }: { bridge: string; handle: string }) {
  const { m } = useMember(bridge, handle);
  if (!m) return null;
  return <AgentPane agent={m.agent} />;
}
