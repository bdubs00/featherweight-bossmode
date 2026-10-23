// The routes and the shapes of routines: the store of the workbench, the
// evidence of each routine, and the week of an agent. docs/CONTRACT.md,
// section 15, names them, after section 4 of docs/ROUTINES.md of the
// kernel. The lead folds these into routes.ts and types.ts after the merge.

import { call, enc, query, ApiError } from './client';

/** The standings of the workbench. Only rehearsing and live reach a profile. */
export type Standing = 'proposed' | 'rehearsing' | 'live' | 'paused' | 'retired';

/** A question of a routine: the decider answers it from the input of a run. */
export interface RoutineQuestion {
  /** choice, noul (yes or no), or score. */
  type: string;
  instructions?: string;
  /** choice: each option and what it means. score: the ordered levels. */
  criteria?: Record<string, string> | string[];
  /** The routine acts only when it is at least this sure. */
  act?: number;
  /** The answers that let it act: a list for choice and score, yes or no for noul. */
  expect?: string | string[];
  observe?: { answer?: string; tool?: string; match?: string };
}

/** A tool call of a routine. input is a template of a JSON object. */
export interface RoutineStep {
  tool: string;
  input: string;
  as?: string;
}

/** The check afterward: a read, and what its result must and must not hold. */
export interface RoutineCheck {
  tool: string;
  input: string;
  contains?: string[];
  lacks?: string[];
}

/** The body of a routine, as the kernel runs it, without its standing. */
export interface Routine {
  name: string;
  version: number;
  canary?: number;
  decider?: string;
  questions?: Record<string, RoutineQuestion>;
  steps: RoutineStep[];
  after?: RoutineCheck[];
  answer?: string;
}

/** One move of a routine: who moved it, when, to which standing, and why. */
export interface Move {
  at: string;
  by: string;
  standing: Standing;
  note?: string;
}

/** Where a routine comes from: the runs that it was made from. */
export interface RoutineSource {
  runs: number;
  from: string;
  to: string;
  proposedBy?: string;
}

/**
 * One day of the evidence, in UTC. agreed and disagreed count the runs that
 * the routine would have acted on, so agreed + disagreed + handed is decided.
 */
export interface EvidenceDay {
  day: string;
  decided: number;
  acted: number;
  agreed: number;
  disagreed: number;
  handed: number;
  applied: number;
  failed: number;
}

/** One band of how sure the routine was: the compared runs in it, and how many agreed. */
export interface Band {
  from: number;
  to: number;
  runs: number;
  agreed: number;
}

/** What the routine said and what the agent chose, for one question of a run. */
export interface Said {
  said: string;
  observed: string;
  /** How sure the routine was of its answer, where the workbench keeps it. */
  probability?: number;
}

/** One of the last disagreements: the run, the first line of its input, the answers, and the verification of its receipt. */
export interface Disagreement {
  run: string;
  input: string;
  at?: string;
  answers: Record<string, Said>;
  /** accepted, satisfied, rejected, or unknown, from the quality receipt of the run. */
  verification?: string;
}

/** A past run of the last replay, and whether the routine handled it the same way. */
export interface ReplayRun {
  run: string;
  input: string;
  same: boolean;
}

export interface Evidence {
  days: EvidenceDay[];
  /** Per question, the bands of how sure it was. */
  questions: Record<string, { bands: Band[] }>;
  disagreements: Disagreement[];
  /** The runs that came back rejected: where the routine acted, and where it agreed with the agent. */
  sentBack: { applied: number; agreed: number };
  /** The last replay over past runs, when the workbench ran one. runs is a shape that the page assumed. */
  replay?: { matched: number; total: number; at: string; runs?: ReplayRun[] } | null;
}

/** A record of the store of the workbench. The list leaves out evidence. */
export interface RoutineRecord {
  agent: string;
  routine: Routine;
  standing: Standing;
  ready: boolean;
  signedOff?: { by: string; at: string } | null;
  history: Move[];
  source?: RoutineSource | null;
  createdAt: string;
  updatedAt: string;
  evidence?: Evidence | null;
}

/** The week of an agent: its runs, by a routine, by the agent, and with a person, the cost of each, and what came back. */
export interface RoutineSummary {
  runs: number;
  byRoutine: number;
  byAgent: number;
  withPerson: number;
  /** The cost of the runs of the window, by a routine and by the agent. */
  costUSD: { routine: number; agent: number };
  sentBack: number;
}

/** The event of the bossmode stream on every change of a record or its evidence. */
export interface RoutineEvent {
  kind?: 'routine';
  agent: string;
  name: string;
}

const one = (agent: string, name: string) => '/v1/routines/' + enc(agent) + '/' + enc(name);

export const routinesApi = {
  /** list reads the routines that the caller can view, newest change first, without evidence. Without an agent, it reads every agent. */
  list: (agent?: string) => call<{ routines: RoutineRecord[] }>('/v1/routines' + query({ agent })).then((r) => (r && r.routines) || []),
  /** get reads one routine with its evidence. */
  get: (agent: string, name: string) => call<RoutineRecord>(one(agent, name)),
  /** move changes the standing of a routine. A move that the table forbids answers 409 with the allowed moves. */
  move: (agent: string, name: string, standing: Standing, note?: string) =>
    call<unknown>(one(agent, name) + '/standing', { method: 'POST', body: note ? { standing, note } : { standing } }),
  /** summary reads the week of an agent, or null where the workbench has no such route. */
  summary: async (agent: string, days = 7): Promise<RoutineSummary | null> => {
    try {
      return await call<RoutineSummary>('/v1/routines/summary' + query({ agent, days }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
};
