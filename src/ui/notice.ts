// The one notice of the page: a sentence about a failed action, shown in
// an alert until the person dismisses it or the next action works. A
// short sentence about an action that worked, such as Saved the playbook
// weekly-patching., takes the same place for a few seconds, as a status.
// A failed action takes its place.

import { useEffect, useState } from 'preact/hooks';
import { ApiError, SigninNeeded } from '../api/client';
import { holdFocus } from './keys';

let text = '';
let said = '';
let saidTimer: ReturnType<typeof setTimeout> | null = null;
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
  clearSaid();
  tell();
}

/** showSaid shows a short sentence about an action that worked, for SAID_MS, or until the person dismisses it. */
export function showSaid(words: string): void {
  if (saidTimer) clearTimeout(saidTimer);
  said = words;
  saidTimer = setTimeout(clearSaid, SAID_MS);
  tell();
}

/** currentSaid is the sentence about an action that worked, or "" when none shows. */
export function currentSaid(): string {
  return said;
}

/** clearSaid hides the sentence about an action that worked. */
export function clearSaid(): void {
  if (saidTimer) clearTimeout(saidTimer);
  saidTimer = null;
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
