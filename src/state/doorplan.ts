// The plan of a duty that the door hands to the editor. Change the details
// of a readback keeps the whole record of the plan here, with the cost that
// the person typed, and opens New duty with the seed from=door. The editor
// then opens on that record: the schedule, the cost, who hears of a result,
// and the check of each result, in place of the words alone. The record
// lives in the storage of the tab, so a reload keeps it. A browser without
// storage opens the editor with the agent and the words of the seed.

import type { DutyRecord } from '../api/types';

const KEY = 'fw.bossmode.duty.door';

/** keepDoorDuty keeps the record of a plan for the editor. */
export function keepDoorDuty(record: DutyRecord): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // No storage: the editor opens with the seed alone.
  }
}

/** doorDuty reads the record that the door kept, or null. */
export function doorDuty(): DutyRecord | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as DutyRecord) : null;
    return d && typeof d === 'object' && typeof d.agent === 'string' && d.when && d.do ? d : null;
  } catch {
    return null;
  }
}

/** dropDoorDuty forgets the record once the duty is saved. */
export function dropDoorDuty(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // No storage: nothing to forget.
  }
}
