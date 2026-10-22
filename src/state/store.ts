// The store holds the state and tells the components when it changes. A
// component reads one part of the state through useSelect, and it redraws
// only when that part is a new object.

import { useEffect, useRef, useState } from 'preact/hooks';
import { initialState, reduce, type Action, type State } from './reducer';

type Listener = () => void;

export interface Store {
  get(): State;
  dispatch(a: Action): void;
  subscribe(f: Listener): () => void;
}

export function createStore(init: State = initialState): Store {
  let state = init;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    dispatch(a) {
      const next = reduce(state, a);
      if (next === state) return;
      state = next;
      for (const f of [...listeners]) f();
    },
    subscribe(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
  };
}

/** The store of the page. */
export const store = createStore();

/** useSelect reads one part of the state and redraws when it changes. */
export function useSelect<T>(select: (s: State) => T): T {
  const [value, setValue] = useState<{ v: T }>(() => ({ v: select(store.get()) }));
  const sel = useRef(select);
  sel.current = select;
  const last = useRef(value.v);
  last.current = value.v;
  useEffect(() => {
    const check = () => {
      const v = sel.current(store.get());
      if (!Object.is(v, last.current)) {
        last.current = v;
        setValue({ v });
      }
    };
    check();
    return store.subscribe(check);
  }, []);
  // A new selector, such as for another bridge, reads at once.
  const now = select(store.get());
  return Object.is(now, value.v) ? value.v : now;
}
