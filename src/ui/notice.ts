// The one notice of the page: a sentence about a failed action, shown in
// an alert until the person dismisses it or the next action works.

import { useEffect, useState } from 'preact/hooks';
import { ApiError, SigninNeeded } from '../api/client';

let text = '';
const listeners = new Set<() => void>();

const tell = () => {
  for (const f of [...listeners]) f();
};

/** showError shows the sentence of an error. A 401 has its own screen. */
export function showError(e: unknown): void {
  if (e instanceof SigninNeeded) return;
  if (e instanceof DOMException && e.name === 'AbortError') return;
  console.error(e);
  text = e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : 'Something failed.';
  tell();
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

/** attempt runs an action and shows its error. It returns true when the action worked. */
export async function attempt(f: () => Promise<unknown>): Promise<boolean> {
  try {
    await f();
    clearNotice();
    return true;
  } catch (e) {
    showError(e);
    return false;
  }
}
