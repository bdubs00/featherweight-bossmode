// The value of the work, from GET /v1/value of the workbench (package
// value): what the work of the agents gave and took over a window of days.
// PUT /v1/value/estimates sets the minutes that a person takes for one
// piece of a line. The lead folds these into routes.ts and types.ts after
// the merge.

import { call, enc } from './client';

/** The windows that the route takes, in days. */
export const WINDOWS = [7, 30, 90] as const;
export type Window = (typeof WINDOWS)[number];

export interface ValueCounts {
  pieces: number;
  done: number;
  failed: number;
  stopped: number;
  open: number;
}

export interface ValueChecks {
  accepted: number;
  sentBack: number;
  unchecked: number;
}

export interface ValueEstimate {
  minutes: number;
  by: string;
  at: string;
}

export interface ValuePeriod {
  start: string;
  end: string;
  done: number;
  accepted: number;
  sentBack: number;
  unchecked: number;
  failed: number;
  usd: number;
}

export interface ValueLine {
  /** duty:<name>, source:<name>, or agent:<name>. */
  key: string;
  kind: 'duty' | 'source' | 'agent';
  name: string;
  agent: string;
  work: ValueCounts;
  checks: ValueChecks;
  actions: number;
  noPerson: number;
  medianLeadSeconds: number;
  usd: number;
  perDone: number;
  unpriced: number;
  estimate?: ValueEstimate;
  estimatedMinutes?: number;
}

export interface Value {
  days: number;
  since: string;
  until: string;
  sentence: string;
  work: ValueCounts;
  checks: ValueChecks;
  people: { actions: number; noPerson: number; reworked: number; waitSeconds: number; waitingNow: number; handled: number };
  lead: { measured: number; medianSeconds: number; waitShare: number };
  spend: { usd: number; perDone: number; failedUSD: number; coordinationUSD: number; unpriced: number; atLeast: boolean };
  estimated?: { minutes: number; lines: number; pieces: number };
  periods: ValuePeriod[];
  lines: ValueLine[];
  partial: boolean;
  unknown?: number;
}

export const valueApi = {
  get: (days: Window) => call<Value>('/v1/value?days=' + enc(days)),
  estimate: (line: string, minutes: number) => call<ValueLine>('/v1/value/estimates', { method: 'PUT', body: { line, minutes } }),
};
