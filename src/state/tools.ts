// The catalog of tools of the front, GET /v1/tools, read once per page load
// and shared by every screen that names a tool in plain words: the profile
// of an agent, a new chat, and This chat. A workbench without the route
// gives an empty catalog, and the page then falls back to the words of
// src/lib/tools.ts.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Tool } from '../api/types';

let cache: Tool[] | null = null;
let read: Promise<Tool[]> | null = null;

/** loadToolCatalog reads the catalog once. A failed read gives an empty catalog. */
export function loadToolCatalog(): Promise<Tool[]> {
  if (cache) return Promise.resolve(cache);
  if (!read) read = api.tools().then((t) => (cache = t || []), () => (cache = []));
  return read;
}

/** forgetToolCatalog drops the catalog, for the tests. */
export function forgetToolCatalog(): void {
  cache = null;
  read = null;
}

/** useToolCatalog is the catalog of tools, or null while it loads. */
export function useToolCatalog(): Tool[] | null {
  const [tools, setTools] = useState<Tool[] | null>(cache);
  useEffect(() => {
    if (tools) return;
    let live = true;
    loadToolCatalog().then((t) => live && setTools(t));
    return () => {
      live = false;
    };
  }, []);
  return tools;
}
