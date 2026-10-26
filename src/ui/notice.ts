// The one notice of the page: a sentence about a failed action, shown in
// an alert until the person dismisses it or the next action works. A
// short sentence about an action that worked, such as Saved the playbook
// weekly-patching., takes the same place for a few seconds, as a status.
// A failed action takes its place. While the pointer rests on the notice,
// or the focus sits in it, it stays; it goes SAID_MS after both leave. A
// sentence can carry Undo, as Denied.
// does while a decision of a key waits to go out; a failed action hides it
// and leaves its Undo, which shows again when the failure is dismissed.

import { useEffect, useState } from 'preact/hooks';
import { ApiError, SigninNeeded } from '../api/client';
import { holdFocus } from './keys';

let text = '';
let said = '';
/** The link of the sentence about an action that worked, such as See the playbook, or null. */
let saidLink: SaidLink | null = null;
let undo: (() => void) | null = null;
let saidTimer: ReturnType<typeof setTimeout> | null = null;
/** True while the pointer rests on the notice or the focus sits in it, so it stays. */
let held = false;
/** How long the sentence that shows stays after the person leaves it. */
let saidFor = 0;
const listeners = new Set<() => void>();

/** How long the sentence of an action that worked stays, in milliseconds. */
export const SAID_MS = 6000;

const tell = () => {
  for (const f of [...listeners]) f();
};

/** showError shows the sentence of an error. A 401 has its own screen. */
export function showError(e: unknown): void {
  if (e instanceof SigninNeeded) return;
  if (e instanceof DOMException && e.name === 'AbortError') return;
  console.error(e);
  text = e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : 'The action failed. Try it again.';
  // A sentence with Undo outlives the failure, so the person can still take the action back.
  if (!undo) clearSaid();
  tell();
}

/** A link beside the sentence about an action that worked: its words and its address. */
export interface SaidLink {
  label: string;
  href: string;
}

/** showSaid shows a short sentence about an action that worked, for SAID_MS, or until the person dismisses it. link leads to what the action made. */
export function showSaid(words: string, link?: SaidLink): void {
  if (saidTimer) clearTimeout(saidTimer);
  said = words;
  saidLink = link || null;
  undo = null;
  saidFor = SAID_MS;
  saidTimer = held ? null : setTimeout(clearSaid, SAID_MS);
  tell();
}

/** showUndo shows a short sentence with the key Undo for ms, such as Denied. while a decision waits to go out. Undo runs onUndo. */
export function showUndo(words: string, onUndo: () => void, ms: number): void {
  if (saidTimer) clearTimeout(saidTimer);
  said = words;
  saidLink = null;
  undo = onUndo;
  saidFor = ms;
  saidTimer = held ? null : setTimeout(clearSaid, ms);
  tell();
}

/**
 * holdSaid keeps the sentence that shows while the person reads it: the
 * pointer rests on the notice or the focus sits in it. With false, the
 * sentence goes after its time again, from that moment.
 */
export function holdSaid(on: boolean): void {
  held = on;
  if (saidTimer) clearTimeout(saidTimer);
  saidTimer = null;
  if (!on && said) saidTimer = setTimeout(clearSaid, saidFor || SAID_MS);
}

/** undoSaid takes back the action of the sentence that shows, and hides it. */
export function undoSaid(): void {
  const f = undo;
  clearSaid();
  if (f) f();
}

/** dropUndo hides the sentence of onUndo, once the action that it can take back went out. */
export function dropUndo(onUndo: () => void): void {
  if (undo === onUndo) clearSaid();
}

/** currentSaid is the sentence about an action that worked, or "" when none shows. */
export function currentSaid(): string {
  return said;
}

/** currentSaidLink is the link of that sentence, or null. */
export function currentSaidLink(): SaidLink | null {
  return said ? saidLink : null;
}

/** clearSaid hides the sentence about an action that worked. */
export function clearSaid(): void {
  if (saidTimer) clearTimeout(saidTimer);
  saidTimer = null;
  held = false;
  undo = null;
  saidLink = null;
  if (!said) return;
  said = '';
  tell();
}

/** currentNotice is the sentence that the notice shows, or "" when it is hidden. */
export function currentNotice(): string {
  return text;
}

/** clearNotice hides the notice. */
export function clearNotice(): void {
  if (!text) return;
  text = '';
  tell();
}

export function useNotice(): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return text;
}

/** useSaid reads the sentence about an action that worked, and redraws when it changes. */
export function useSaid(): string {
  useNotice();
  return said;
}

/** useUndo tells whether the sentence that shows carries Undo. */
export function useUndo(): boolean {
  useNotice();
  return !!undo;
}

/**
 * attempt runs an action and shows its error. It returns true when the
 * action worked. An action that removes the key that held the focus gives
 * the focus a home nearby, so it never falls to the page (holdFocus).
 */
export async function attempt(f: () => Promise<unknown>): Promise<boolean> {
  const after = holdFocus();
  try {
    await f();
    clearNotice();
    return true;
  } catch (e) {
    showError(e);
    return false;
  } finally {
    after();
  }
}
