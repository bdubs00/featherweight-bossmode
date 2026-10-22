// The conversation of the person with the manager. GET /v1/bossmode names
// the newest manager run of the caller, and the page follows it until the
// person starts a new conversation, or until a screen such as the new
// bridge asks the manager something. Screen C owns this file. The lead
// folds it into the store after the merge.

import { useEffect, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import { api } from '../api/routes';
import type { BossConfig } from '../api/types';
import { store } from './store';

/** The run that the person picked: null follows the settings, "" is a new conversation. */
let picked: string | null = null;
const listeners = new Set<() => void>();

/** managerRunOf is the run of the conversation: the one that the person picked, else the one of the settings. */
export function managerRunOf(config: BossConfig | null | undefined): string {
  if (picked !== null) return picked;
  return config && config.manager ? config.manager.run : '';
}

/** setManagerRun opens a conversation, or a new one with "". */
export function setManagerRun(id: string): void {
  picked = id;
  for (const f of [...listeners]) f();
}

/** forgetManagerRun follows the settings again, for the tests and a sign-out. */
export function forgetManagerRun(): void {
  picked = null;
  for (const f of [...listeners]) f();
}

/** useManagerRun returns the run of the conversation and redraws when it changes. */
export function useManagerRun(config: BossConfig | null | undefined): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return managerRunOf(config);
}

/** ended reports whether a run takes no more messages, so the next one starts a new conversation. */
export function ended(state: string | undefined): boolean {
  return state === 'failed' || state === 'canceled';
}

/**
 * askManager sends a message to the manager: a follow-up of the
 * conversation, or the first message of a new run when there is none or
 * the last one ended. It returns the run.
 */
export async function askManager(text: string): Promise<string> {
  const s = store.get();
  const m = s.config && s.config.manager;
  if (!m) throw new Error('No manager is set up.');
  const id = managerRunOf(s.config);
  const run = id ? s.runs[id] : undefined;
  if (id && !ended(run && run.state)) {
    try {
      await api.sendRun(id, text);
      return id;
    } catch (e) {
      // A run that ended since the page read it refuses the message, and
      // the message starts a new conversation.
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
    }
  }
  const r = await api.start(m.member, { agent: m.agent, input: text });
  store.dispatch({ type: 'run', run: r });
  setManagerRun(r.id);
  return r.id;
}
