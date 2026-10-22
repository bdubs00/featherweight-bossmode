// The icons of the page. Each one is a small SVG of this code, never of the
// API. An icon is decoration beside a word, so a screen reader skips it.

import type { JSX } from 'preact';

export type IconName =
  | 'play' | 'hand' | 'ring' | 'moon' | 'cross' | 'slash' | 'hourglass' | 'check' | 'stop' | 'dot'
  | 'up' | 'down' | 'heart' | 'reply' | 'more' | 'back' | 'plus' | 'send' | 'feather' | 'search'
  | 'page' | 'history' | 'edit' | 'people' | 'grid' | 'spark' | 'close' | 'live' | 'lost' | 'file'
  | 'chev' | 'gear' | 'drag' | 'person' | 'bolt';

const P: Record<IconName, JSX.Element> = {
  play: <path d="M5 3.5v9l8-4.5z" fill="currentColor" />,
  hand: <path d="M8 1.8 15 14H1z M8 6v3.6 M8 11.6v.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />,
  ring: <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="2" />,
  moon: <path d="M10.8 2.2a6 6 0 1 0 3 9.3A5 5 0 0 1 10.8 2.2z" fill="currentColor" />,
  cross: <path d="M3.5 3.5l9 9m0-9-9 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />,
  slash: <g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="5.6" /><path d="M4 12 12 4" stroke-linecap="round" /></g>,
  hourglass: <path d="M4 2h8M4 14h8M5 2c0 4 6 4 6 6s-6 2-6 6M11 2c0 4-6 4-6 6s6 2 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />,
  check: <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />,
  stop: <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" />,
  dot: <circle cx="8" cy="8" r="3" fill="currentColor" />,
  up: <path d="M5.5 14H3.2a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2.3m0 7V7m0 7h6.1a1.5 1.5 0 0 0 1.5-1.2l.9-4.4A1.5 1.5 0 0 0 12.5 6.6H9.4l.5-2.7A1.6 1.6 0 0 0 8.3 2L5.5 7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />,
  down: <path d="M10.5 2h2.3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2.3m0-7v7m0-7H4.4a1.5 1.5 0 0 0-1.5 1.2L2 7.6a1.5 1.5 0 0 0 1.5 1.8h3.1l-.5 2.7A1.6 1.6 0 0 0 7.7 14l2.8-5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />,
  heart: <path d="M8 14S1.8 10.3 1.8 5.9A3.3 3.3 0 0 1 8 4.3a3.3 3.3 0 0 1 6.2 1.6C14.2 10.3 8 14 8 14z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />,
  reply: <path d="M6.5 4 2.5 8l4 4M2.8 8H10a4 4 0 0 1 4 4v1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />,
  more: <g fill="currentColor"><circle cx="3.2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="12.8" cy="8" r="1.5" /></g>,
  back: <path d="M10 2.5 4.5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />,
  chev: <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />,
  plus: <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />,
  send: <path d="M8 13V3.5M3.5 8 8 3.5 12.5 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />,
  feather: <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 2.5a4 4 0 0 0-5.7 0L3.3 7v5.7H9l4.5-4.5a4 4 0 0 0 0-5.7z" /><path d="M10.7 5.3 1.3 14.7M11.7 10H6" /></g>,
  search: <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="7" cy="7" r="4.5" /><path d="m10.4 10.4 3.6 3.6" /></g>,
  page: <path d="M4 1.8h5l3.2 3.2v9.2H4zM9 1.8V5h3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />,
  file: <path d="M4 1.8h5l3.2 3.2v9.2H4zM9 1.8V5h3.2M6 8.5h4M6 11h4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />,
  history: <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.8v2.6h2.6" /><path d="M8 5v3.2l2.2 1.4" /></g>,
  edit: <path d="M10.6 2.6l2.8 2.8-7.8 7.8H2.8v-2.8zM9 4.2l2.8 2.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />,
  people: <g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5.5" r="2.4" /><path d="M1.5 13.5c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4" /><path d="M10.8 3.4a2.3 2.3 0 0 1 0 4.4M12.2 9.7c1.3.6 2.1 1.9 2.3 3.8" stroke-linecap="round" /></g>,
  grid: <g fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1.2" /><rect x="9" y="2" width="5" height="5" rx="1.2" /><rect x="2" y="9" width="5" height="5" rx="1.2" /><rect x="9" y="9" width="5" height="5" rx="1.2" /></g>,
  spark: <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6z" fill="currentColor" />,
  close: <path d="M4 4l8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />,
  live: <g fill="currentColor"><circle cx="8" cy="8" r="2.6" /><path d="M3.6 3.6a6.2 6.2 0 0 0 0 8.8l1-1a4.8 4.8 0 0 1 0-6.8zM12.4 3.6l-1 1a4.8 4.8 0 0 1 0 6.8l1 1a6.2 6.2 0 0 0 0-8.8z" /></g>,
  lost: <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 2.5l11 11" /><path d="M5 5.3a4.8 4.8 0 0 0 0 5.4M11 10.7a4.8 4.8 0 0 0 .4-5" /></g>,
  gear: <g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6 5 5M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4" stroke-linecap="round" /></g>,
  drag: <g fill="currentColor"><circle cx="6" cy="4" r="1.2" /><circle cx="10" cy="4" r="1.2" /><circle cx="6" cy="8" r="1.2" /><circle cx="10" cy="8" r="1.2" /><circle cx="6" cy="12" r="1.2" /><circle cx="10" cy="12" r="1.2" /></g>,
  person: <g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5.5" r="2.6" /><path d="M3 14c.5-3 2.5-4.6 5-4.6s4.5 1.6 5 4.6" /></g>,
  bolt: <path d="M9 1.5 3.5 9h4L7 14.5 12.5 7h-4z" fill="currentColor" />,
};

export function Icon({ name, class: cls }: { name: IconName; class?: string }) {
  return (
    <svg class={'ic' + (cls ? ' ' + cls : '')} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {P[name]}
    </svg>
  );
}
