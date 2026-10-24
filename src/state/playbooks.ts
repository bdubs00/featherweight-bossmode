// The playbooks of the person: GET /v1/playbooks, read once when a picker
// opens and again after each save and delete. A playbook is the form of
// New bridge without a title, saved under a name. New bridge fills its form
// from one, and the action open of a duty opens a bridge from one. A front
// without the route answers 404, and the pickers then hide.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type PlaybookBody } from '../api/routes';
import { ApiError } from '../api/client';
import type { Playbook } from '../api/types';

export interface PlaybooksState {
  /** The playbooks, newest change first, or null before the first read. */
  list: Playbook[] | null;
  /** True when the front answers 404: it keeps no playbooks. */
  off: boolean;
  /** The reason the list did not load. */
  error: string;
}

const initial: PlaybooksState = { list: null, off: false, error: '' };

let state: PlaybooksState = initial;
const listeners = new Set<() => void>();

function set(next: PlaybooksState): void {
  if (next === state) return;
  state = next;
  for (const f of [...listeners]) f();
}

export const playbooks = {
  get: (): PlaybooksState => state,
  subscribe(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

/** forgetPlaybooks drops the state, for the tests. */
export function forgetPlaybooks(): void {
  state = initial;
  listing = null;
}

/** usePlaybooks reads one part of the state and redraws when it changes. */
export function usePlaybooks<T>(select: (s: PlaybooksState) => T): T {
  const [value, setValue] = useState<{ v: T }>(() => ({ v: select(state) }));
  const sel = useRef(select);
  sel.current = select;
  const last = useRef(value.v);
  last.current = value.v;
  useEffect(() => {
    const check = () => {
      const v = sel.current(state);
      if (!Object.is(v, last.current)) {
        last.current = v;
        setValue({ v });
      }
    };
    check();
    return playbooks.subscribe(check);
  }, []);
  const now = select(state);
  return Object.is(now, value.v) ? value.v : now;
}

/** newestFirst puts the playbook that changed last first, then by name. */
const newestFirst = (list: Playbook[]): Playbook[] => [...list].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.name.localeCompare(b.name));

let listing: Promise<void> | null = null;

/** loadPlaybooks reads the list. A 404 means that the front keeps no playbooks. */
export function loadPlaybooks(): Promise<void> {
  if (!listing)
    listing = api
      .playbooks()
      .then(
        (list) => set({ list: newestFirst(list), off: false, error: '' }),
        (e) => {
          if (e instanceof ApiError && (e.status === 404 || e.status === 501)) set({ list: [], off: true, error: '' });
          else set({ ...state, error: e instanceof Error ? e.message : 'The action failed. Try it again.' });
        },
      )
      .finally(() => (listing = null));
  return listing;
}

/** seatsOf reads the seats of a playbook. */
export const seatsOf = (p: Playbook): Playbook['seats'] => p.seats || [];

/** readPlaybook reads one playbook whole, with its caps and what the manager can do. */
export const readPlaybook = (name: string): Promise<Playbook> => api.playbook(name);

/** savePlaybook saves a playbook under a name, then reads the list again. A stale revision answers 409. */
export async function savePlaybook(name: string, body: PlaybookBody): Promise<Playbook> {
  const p = await api.putPlaybook(name, body);
  await loadPlaybooks();
  return p;
}

/** removePlaybook deletes a playbook and forgets it. */
export async function removePlaybook(name: string): Promise<void> {
  await api.deletePlaybook(name);
  if (state.list) set({ ...state, list: state.list.filter((p) => p.name !== name) });
}
