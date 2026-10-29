// The checks of done of a run, as its newest pass left them: whether they
// passed, a line for a pass that ran after the run stopped at a limit of
// its budget, such as Checked after its limit of tool calls, and each
// check with its result. A run without a definition of done shows nothing.

import type { Run } from '../api/types';
import { atLimitWords, checkName, passWords, resultWords } from '../lib/done';
import { useDoneLimit } from '../state/donepass';

/** DonePass says the newest pass of the checks of done of a run. */
export function DonePass({ run }: { run: Run }) {
  const limit = useDoneLimit(run);
  const d = run.done;
  if (!d) return null;
  const head = passWords(d);
  const checks = d.checks || [];
  return (
    <div class="done-pass">
      {head && <p class="done-pass-head">{head}.</p>}
      {limit && <p class="done-pass-limit">{atLimitWords(limit)}.</p>}
      {checks.length > 0 && (
        <ul class="done-pass-checks">
          {checks.map((r) => (
            <li class={r.passed ? '' : 'failed'}>
              {checkName(r)}: {resultWords(r)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
