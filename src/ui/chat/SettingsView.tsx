// Settings: what a person sets once, in one view. Where the server reaches
// you, the connections that agents use for you, the packages of each agent
// that you own, and, for an admin, the switch that pauses every job. The
// theme stays in the menu of the account.

import { useMemo, useState } from 'preact/hooks';
import { useSelect } from '../../state/store';
import { selectAgents } from '../../state/agents';
import { pauseAll, useDuties } from '../../state/duties';
import { attempt, showSaid } from '../notice';
import { Confirm } from '../common';
import { Glyph } from '../icons';
import { Button, Led, Mark } from '../primitives';
import { agentNameOf } from './data';
import { chatHref } from './route';

function PauseJobs() {
  const paused = useDuties((s) => s.paused);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const turn = async (on: boolean) => {
    setBusy(true);
    const ok = await attempt(() => pauseAll(on));
    setBusy(false);
    setAsking(false);
    if (ok) showSaid(on ? 'Every job is paused.' : 'Every job runs again on its schedule.');
  };
  return (
    <section class="cf-set" aria-labelledby="cf-set-jobs">
      <h2 class="cf-asec-head" id="cf-set-jobs">
        Every job
      </h2>
      <p class="cf-set-line">
        {paused ? <Led tone="grey" word="Every job is paused. No job starts until you resume them." still /> : <Led tone="green" word="Jobs run on their schedules." />}
      </p>
      <Button size="s" kind={paused ? 'primary' : 'danger'} aria-disabled={busy || undefined} onClick={() => (paused ? turn(false) : setAsking(true))}>
        {paused ? 'Resume every job' : 'Pause every job'}
      </Button>
      {asking && (
        <Confirm title="Pause every job?" confirm="Pause every job" danger busy={busy} onCancel={() => setAsking(false)} onConfirm={() => turn(true)}>
          <p>No job starts until you resume them. Runs that work now finish.</p>
        </Confirm>
      )}
    </section>
  );
}

export function SettingsView({ onReach }: { onReach: () => void }) {
  const me = useSelect((s) => s.me);
  const packages = useSelect((s) => !!(s.config && s.config.packages));
  const agents = useSelect(selectAgents);
  const faces = useSelect((s) => s.faces);
  const fleet = useSelect((s) => s.fleet);
  // The packages of an agent belong to its owner, on an agent that runs on its own.
  const owned = useMemo(() => {
    const pooled = new Set(((fleet && fleet.pools) || []).map((p) => p.agent));
    return (agents || []).filter((a) => a.name !== 'default' && pooled.has(a.name) && (a.role === 'owner' || (me && me.admin)));
  }, [agents, fleet, me]);
  return (
    <section class="cf-view cf-settings" aria-labelledby="cf-settings-title">
      <header class="cf-head">
        <a class="cf-back" href="#" aria-label="Back">
          <Glyph name="back" size={20} />
        </a>
        <h1 class="cf-title" id="cf-settings-title">
          Settings
        </h1>
      </header>
      <div class="scroll cf-stream">
        <div class="cf-stream-in cf-list-in">
          <section class="cf-set" aria-labelledby="cf-set-reach">
            <h2 class="cf-asec-head" id="cf-set-reach">
              Where to reach you
            </h2>
            <p class="cf-set-line">When something needs you and the page is closed, the server tells you there: a chat channel of your team, a push to your phone, or an email.</p>
            <Button size="s" onClick={onReach}>
              Change where to reach you
            </Button>
          </section>
          <section class="cf-set" aria-labelledby="cf-set-conn">
            <h2 class="cf-asec-head" id="cf-set-conn">
              Connections
            </h2>
            <p class="cf-set-line">The services that agents use in your name, such as an issue tracker or a code host.</p>
            <Button size="s" href="/ui#connections">
              Open the connections
            </Button>
          </section>
          {packages && (
            <section class="cf-set" aria-labelledby="cf-set-pkg">
              <h2 class="cf-asec-head" id="cf-set-pkg">
                Packages
              </h2>
              <p class="cf-set-line">An agent installs only the packages that its owner allows. Each agent keeps its list in its setup.</p>
              {owned.length === 0 && <p class="cf-post-quiet">You own no agent that installs packages.</p>}
              <ul class="cf-set-agents">
                {owned.map((a) => (
                  <li>
                    <a href={chatHref({ view: 'agent', name: a.name, setup: true })}>
                      <Mark agent={a.name} size={20} />
                      <span>{agentNameOf({ faces }, a.name)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {me && me.admin && <PauseJobs />}
        </div>
      </div>
    </section>
  );
}
