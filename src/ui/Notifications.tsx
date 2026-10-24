// Notifications, the dialog of the account menu: where the front sends
// what needs the person while the page is closed, by ntfy. It holds the
// server, which the front fills when it is empty, the topic, a token that
// the page writes and never reads, three switches, and quiet hours in the
// time zone of the browser. Send a test saves a change first, then says
// what happened. docs/CONTRACT.md, section 16, names the routes.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError, browserZone, oneSentence } from '../api/client';
import type { NotifyRead } from '../api/types';
import { notifyBodyOf, notifyErrors, notifyFormOf, notifyProblems, type NotifyErrors, type NotifyForm, type NotifySlot } from '../lib/notifications';
import { zoneWords, zonesOf } from '../lib/duties';
import { Confirm } from './common';
import { Button, Field, Help, Input, LineLed } from './primitives';

/** messageOf is the sentence of a failed call. A failed test names its reason in error. */
function messageOf(e: unknown): string {
  if (e instanceof ApiError && e.problem && typeof e.problem.error === 'string' && e.problem.error.trim()) return oneSentence(e.problem.error);
  return e instanceof Error && e.message ? e.message : 'The action failed. Try it again.';
}

/** The state of the read of the settings. */
type Load = 'loading' | 'ready' | 'none' | 'failed';

/** What Send a test said. */
type Tested = { ok: boolean; words: string } | null;

/** Switch is a checkbox with the role of a switch, in a row with its label. */
function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label class="check">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Notifications({ onClose }: { onClose: () => void }) {
  const zone = useMemo(browserZone, []);
  const [load, setLoad] = useState<Load>('loading');
  const [failed, setFailed] = useState('');
  const [read, setRead] = useState<NotifyRead | null>(null);
  const [f, setF] = useState<NotifyForm>(() => notifyFormOf(null, zone));
  const [errors, setErrors] = useState<NotifyErrors>({});
  const [problems, setProblems] = useState<Partial<Record<NotifySlot | 'top', string[]>>>({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<Tested>(null);
  useEffect(() => {
    let live = true;
    api
      .notifications()
      .then((r) => {
        if (!live) return;
        setRead(r);
        setF(notifyFormOf(r, zone));
        setLoad('ready');
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) setLoad('none');
        else {
          setFailed(messageOf(e));
          setLoad('failed');
        }
      });
    return () => {
      live = false;
    };
  }, []);
  const set = (p: Partial<NotifyForm>) => {
    setF((x) => ({ ...x, ...p }));
    setErrors({});
    setProblems({});
    setTested(null);
  };
  const dirty = !!read && JSON.stringify(notifyBodyOf(f)) !== JSON.stringify(notifyBodyOf(notifyFormOf(read, zone)));

  /** put saves the settings. It answers false and shows why when it cannot. */
  const put = async (): Promise<boolean> => {
    const errs = notifyErrors(f);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return false;
    }
    try {
      const body = notifyBodyOf(f);
      const r = await api.putNotifications(body);
      // The answer reads as a read does. A front that answers no settings keeps what the page sent, with a token as set.
      const next: NotifyRead = r && r.ntfy ? r : { ...body, ntfy: { ...body.ntfy, token: body.ntfy.token ? 'set' : '' }, serverDefault: read?.serverDefault, off: read?.off };
      setRead(next);
      setF(notifyFormOf(next, zone));
      return true;
    } catch (e) {
      const ps = e instanceof ApiError && e.problem && Array.isArray(e.problem.problems) ? (e.problem.problems as unknown[]) : null;
      setProblems(ps && ps.length ? notifyProblems(ps) : { top: [messageOf(e)] });
      return false;
    }
  };
  const save = async () => {
    setBusy(true);
    const ok = await put();
    setBusy(false);
    if (ok) onClose();
  };
  const test = async () => {
    setTesting(true);
    setTested(null);
    if (dirty && !(await put())) {
      setTesting(false);
      return;
    }
    try {
      const r = await api.testNotification();
      setTested(r && r.sent ? { ok: true, words: 'Sent. Look for it on your phone.' } : { ok: false, words: 'The front sent nothing. Check the topic and the server.' });
    } catch (e) {
      setTested({ ok: false, words: 'The test failed. ' + messageOf(e) });
    }
    setTesting(false);
  };
  const err = (slot: NotifySlot, own?: string) => own || (problems[slot] && problems[slot]!.length ? problems[slot]!.join(' ') : undefined);
  const ready = load === 'ready';
  return (
    <Confirm title="Notifications" confirm="Save" busy={busy || !ready} class="notify-dialog" onCancel={onClose} onConfirm={save}>
      {load === 'loading' && <p>Loading your settings.</p>}
      {load === 'none' && <p>This workbench sends no notifications.</p>}
      {load === 'failed' && <p role="alert">{failed}</p>}
      {ready && (
        <div class="notify-form">
          {read && read.off && (
            <p class="notify-off" role="status">
              <LineLed tone="grey" /> {read.off}
            </p>
          )}
          {problems.top && (
            <ul class="duty-problems" role="alert">
              {problems.top.map((x) => (
                <li>{x}</li>
              ))}
            </ul>
          )}
          <Field label="Server" error={err('server', errors.server)}>
            <Input type="url" value={f.server} spellcheck={false} invalid={!!err('server', errors.server)} placeholder={(read && read.serverDefault) || 'https://ntfy.sh'} onInput={(e) => set({ server: (e.target as HTMLInputElement).value })} />
          </Field>
          <Field
            label={
              <>
                Topic <Help label="What the topic is">The name that the ntfy app on your phone follows. Pick a name that is hard to guess.</Help>
              </>
            }
            error={err('topic', errors.topic)}
          >
            <Input value={f.topic} spellcheck={false} autocomplete="off" invalid={!!err('topic', errors.topic)} placeholder="alice-duties" onInput={(e) => set({ topic: (e.target as HTMLInputElement).value })} />
          </Field>
          {f.saved ? (
            <div class="notify-token">
              <span>A token is saved.</span>
              <Button size="s" kind="quiet" onClick={() => set({ saved: false, token: '' })}>
                Remove
              </Button>
            </div>
          ) : (
            <Field label="Token" error={err('token')}>
              <Input type="password" value={f.token} spellcheck={false} autocomplete="off" placeholder="Optional" onInput={(e) => set({ token: (e.target as HTMLInputElement).value })} />
            </Field>
          )}
          {!f.saved && read && read.ntfy && read.ntfy.token === 'set' && (
            <p class="notify-token">
              <span class="t-meta">The saved token goes when you save.</span>
              <Button size="s" kind="quiet" onClick={() => set({ saved: true, token: '' })}>
                Keep it
              </Button>
            </p>
          )}
          <fieldset>
            <legend>Tell me about</legend>
            <Switch label="Questions" on={f.questions} onChange={(questions) => set({ questions })} />
            <Switch label="Failures" on={f.failures} onChange={(failures) => set({ failures })} />
            <Switch label="A daily digest" on={f.digest} onChange={(digest) => set({ digest })} />
            {problems.send && (
              <span class="field-error" role="alert">
                {problems.send.join(' ')}
              </span>
            )}
          </fieldset>
          <fieldset>
            <legend>Quiet hours</legend>
            <Switch label="Hold notifications at night" on={f.quiet} onChange={(quiet) => set({ quiet })} />
            {f.quiet && (
              <>
                <div class="field-row">
                  <Field label="From">
                    <Input type="time" step={60} value={f.from} onInput={(e) => set({ from: (e.target as HTMLInputElement).value })} />
                  </Field>
                  <Field label="To">
                    <Input type="time" step={60} value={f.to} onInput={(e) => set({ to: (e.target as HTMLInputElement).value })} />
                  </Field>
                </div>
                <Field label="Time zone">
                  <select class="recess" value={f.timeZone} onChange={(e) => set({ timeZone: (e.target as HTMLSelectElement).value })}>
                    {zonesOf([zone, f.timeZone]).map((z) => (
                      <option value={z}>{zoneWords(z) + (z === zone ? ', your time' : '')}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {err('quiet', errors.quiet) && (
              <span class="field-error" role="alert">
                {err('quiet', errors.quiet)}
              </span>
            )}
          </fieldset>
          <div class="notify-test">
            <Button size="s" disabled={testing || busy} onClick={test}>
              Send a test
            </Button>
            {testing && <span class="t-meta">Sending.</span>}
          </div>
          {tested && (
            <p class={tested.ok ? 'notify-said' : 'notify-said field-error'} role="status">
              {tested.words}
            </p>
          )}
        </div>
      )}
    </Confirm>
  );
}
