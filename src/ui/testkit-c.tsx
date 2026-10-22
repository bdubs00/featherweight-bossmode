// The kit of the tests of screen C: a fake fetch that answers from a table
// of routes and records each call, and a mount that draws a screen in the
// document. Only the tests import this file.

import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { setFetch, type FetchLike } from '../api/client';

export interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

export interface Answer {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A function of a route gets the call and its number for that route, from 1. */
export type RouteFn = (call: Call, n: number) => Answer | Promise<Answer>;

/** A route answers a value as JSON with 200, or an Answer that a function returns. */
export type Route = RouteFn | object | string | number | boolean | null;

/**
 * fakeApi answers each call from the table. A key is "METHOD /path", with
 * the query when the route needs it, such as "PUT /v1/agents/x?dryRun=true".
 * A call that no key matches answers 404.
 */
export function fakeApi(table: Record<string, Route>): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const counts = new Map<string, number>();
  const old: FetchLike = setFetch(async (input, init) => {
    const url = new URL(String(input), 'http://page.test');
    const method = (init && init.method) || 'GET';
    const raw = init && typeof init.body === 'string' ? init.body : '';
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    const call: Call = { method, path: url.pathname + url.search, body, headers: (init && (init.headers as Record<string, string>)) || {} };
    calls.push(call);
    const key = [method + ' ' + url.pathname + url.search, method + ' ' + url.pathname].find((k) => k in table);
    if (!key) return new Response(JSON.stringify({ detail: 'no route ' + url.pathname }), { status: 404, headers: { 'Content-Type': 'application/problem+json' } });
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    const r = table[key];
    const a: Answer = typeof r === 'function' ? await (r as RouteFn)(call, n) : { body: r };
    const status = a.status || 200;
    if (status === 204) return new Response(null, { status });
    return new Response(a.body === undefined ? '' : JSON.stringify(a.body), { status, headers: { 'Content-Type': 'application/json', ...(a.headers || {}) } });
  });
  return { calls, restore: () => setFetch(old) };
}

/** problem is the answer of a refusal, with the reason in detail. */
export const problem = (status: number, detail: string): Answer => ({ status, body: { detail } });

let boxes: HTMLElement[] = [];

/** mount draws a node in a new box of the document. */
export function mount(node: ComponentChildren): HTMLElement {
  const b = document.createElement('div');
  boxes.push(b);
  document.body.appendChild(b);
  act(() => render(node, b));
  return b;
}

/** unmountAll removes every box that mount drew. */
export function unmountAll(): void {
  for (const b of boxes) {
    act(() => render(null, b));
    b.remove();
  }
  boxes = [];
}

/** settle lets the pending promises and the redraws of a screen run. */
export async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/** typeIn puts a value in a field and sends the input event. */
export function typeIn(el: Element | null, value: string): void {
  if (!el) throw new Error('no field');
  act(() => {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** click presses a key. */
export function click(el: Element | null | undefined): void {
  if (!el) throw new Error('no key');
  act(() => (el as HTMLElement).click());
}

/** keyNamed finds the key whose text is the name. */
export function keyNamed(root: ParentNode, name: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('button, a.key')].find((b) => b.textContent!.trim() === name);
}

/** fieldOf finds the control of a field by its label. */
export function fieldOf(root: ParentNode, label: string): HTMLInputElement | null {
  const f = [...root.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')!.textContent === label);
  return f ? (f.querySelector('input, textarea, select') as HTMLInputElement | null) : null;
}
