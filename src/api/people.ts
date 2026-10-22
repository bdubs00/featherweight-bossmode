// The routes and the shapes that screen B adds: the workers of an agent,
// the counts of its day, a direct message with a skill, and a skill in a
// run. The lead folds them into routes.ts and types.ts after the merge
// (docs/DESIGN.md, section 11.1, rule 4).

import { ApiError, call, enc } from './client';
import type { Entry, Skill } from './types';

/** One worker of an agent, as GET /v1/pools/{name} reports it. */
export interface PoolTask {
  name: string;
  /** Running, Suspended, Pending, Failed, or Terminating. */
  phase: string;
  note?: string;
  /** False for a worker that runs an old setup. */
  current?: boolean;
}

/**
 * The workers of one agent, from GET /v1/pools/{name}. The page never says
 * pool: the profile shows Workers and Keep. wanted is Keep.
 */
export interface PoolView {
  name: string;
  agent?: string;
  wanted: number;
  actual: number;
  ready: number;
  tasks: PoolTask[];
  gaps?: string[];
  source?: string;
  template?: string;
}

/** The counts of the day of an agent, from GET /v1/bossmode/agents/{agent}/today. */
export interface Today {
  runs: number;
  costUSD?: number;
  decisions: number;
}

/** A skill as the slash menu reads it. userInvocable and argumentHint come from the front matter. */
export interface SlashSkill extends Skill {
  userInvocable?: boolean;
  'user-invocable'?: boolean;
  argumentHint?: string;
  'argument-hint'?: string;
}

/** A slash command of a composer, as POST bodies carry it. */
export interface SkillCall {
  name: string;
  args: string;
}

/**
 * poolName is the name of the pool of an agent: the name in lower case,
 * with a hyphen for each character that is not a letter or a digit.
 */
export function poolName(agent: string): string {
  return String(agent || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
}

const pool = (name: string) => '/v1/pools/' + enc(name);

/** orNull answers null for a 404, so a missing thing is an empty state and not an error. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export const peopleApi = {
  /** The workers of an agent, or null when the agent has none. */
  pool: (agent: string) => orNull(call<PoolView>(pool(poolName(agent)))),
  /** setKeep changes the number of workers that an agent keeps. Only an owner can. */
  setKeep: (agent: string, replicas: number) => call<PoolView>(pool(poolName(agent)), { method: 'PATCH', body: { replicas } }),
  /** removeWorkers removes every worker of an agent. */
  removeWorkers: (agent: string) => call<null>(pool(poolName(agent)), { method: 'DELETE' }),
  /** The counts of the day of an agent, or null where the workbench has no such route. */
  today: (agent: string) => orNull(call<Today>('/v1/bossmode/agents/' + enc(agent) + '/today')),
  /**
   * direct sends a direct message to one seat of a bridge. A slash command
   * goes as skill, with the text as the person wrote it.
   */
  direct: (bridge: string, handle: string, text: string, skill?: SkillCall | null, replyTo?: number) => {
    const body: Record<string, unknown> = { text, to: [handle] };
    if (skill) body.skill = skill;
    if (replyTo) body.replyTo = replyTo;
    return call<Entry>('/v1/bridges/' + enc(bridge) + '/messages', { method: 'POST', body });
  },
  /** runSkill runs a skill in a run of a one-on-one conversation. */
  runSkill: (run: string, s: SkillCall) => call<unknown>('/v1/bossmode/runs/' + enc(run) + '/skill', { method: 'POST', body: { name: s.name, args: s.args } }),
};
