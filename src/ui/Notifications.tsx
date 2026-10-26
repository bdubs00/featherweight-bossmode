// Where to reach me, the dialog of the account menu: the places where the
// front reaches the person while the page is closed. Each place is a
// channel of one kind, such as ntfy, Slack, an app, or an agent, with three
// switches, Send a test, Edit, and Remove. Add a place offers the kinds that
// the front serves. The quiet hours stay one setting of the person, in the
// time zone of the browser.
//
// The reason of the front that nothing goes out shows above the list. An
// empty list says it in its own words instead.
//
// Save writes the switches and the quiet hours. Add place, Save in a place,
// and Remove write the whole list at once, as it stands. Send a test saves
// a change first, then says what happened to that place. docs/CONTRACT.md,
// section 16, names the routes.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError, browserZone, oneSentence } from '../api/client';
import type { NotifyChannel, NotifyRead, NotifySend } from '../api/types';
import { KIND_ORDER, MAX_CHANNELS, kindName, masked, notifyBodyOf, notifyFormOf, notifyProblems, placeLine, problemTexts, quietError, testWords, type NotifyForm, type NotifyProblems } from '../lib/notifications';
import { zoneWords, zonesOf } from '../lib/duties';
import { useSelect } from '../state/store';
import { ChannelDialog, SendSwitches, Switch, type SaveOutcome } from './ChannelDialog';
import { Confirm } from './common';
import { Button, Field, Input, LineLed } from './primitives';

/** messageOf is the sentence of a failed call. */
function messageOf(e: unknown): string {
  if (e instanceof ApiError && e.problem && typeof e.problem.error === 'string' && e.problem.error.trim()) return oneSentence(e.problem.error);
  return e instanceof Error && e.message ? e.message : 'The action failed. Try it again.';
}

/** The state of the read of the settings. */
type Load = 'loading' | 'ready' | 'none' | 'failed';

/** What Send a test said for one place. */
type Tested = { busy: boolean; ok: boolean; words: string };

/** What a write did: the settings after it, or the problems of a 400 by the index of the list that it sent, or the reason in words. */
type Wrote = { ok: true; read: NotifyRead } | { ok: false; problems?: NotifyProblems; message?: string };

const NONE: NotifyProblems = { top: [], quiet: [], channels: {} };

/** labeled lists the problems of a write in words. A problem of a place follows its name, for a list that the dialog does not show as it was sent. */
function labeled(p: NotifyProblems, sent: NotifyChannel[], skip = -1): string[] {
  const named = Object.entries(p.channels)
    .filter(([k]) => Number(k) !== skip)
    .flatMap(([k, v]) => problemTexts(v).map((t) => ((sent[Number(k)] && sent[Number(k)].label) || 'A place') + ': ' + t));
  return [...p.top, ...p.quiet.map((t) => 'Quiet hours: ' + t), ...named];
}

export function Notifications({ onClose }: { onClose: () => void }) {
  const zone = useMemo(browserZone, []);
  const [load, setLoad] = useState<Load>('loading');
  const [failed, setFailed] = useState('');
  const [read, setRead] = useState<NotifyRead | null>(null);
  const [f, setF] = useState<NotifyForm>(() => notifyFormOf(null, zone));
  const [quietErr, setQuietErr] = useState('');
  const [problems, setProblems] = useState<NotifyProblems>(NONE);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<Record<number, Tested>>({});
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [refocus, setRefocus] = useState(0);
  const addKey = useRef<HTMLButtonElement>(null);
  const faces = useSelect((s) => s.faces);
  const agentName = (a: string) => (faces[a] && faces[a].displayName) || a;
  const nameOf = (c: NotifyChannel) => c.label || kindName(c.kind, read);
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
  // A removed place takes its keys with it, so the focus goes to Add a place.
  useEffect(() => {
    if (refocus && addKey.current) addKey.current.focus();
  }, [refocus]);

  const dirty = !!read && JSON.stringify(notifyBodyOf(f)) !== JSON.stringify(notifyBodyOf(notifyFormOf(read, zone)));
  const set = (p: Partial<NotifyForm>) => {
    setF((x) => ({ ...x, ...p }));
    setQuietErr('');
    setProblems(NONE);
    setTests({});
    setFull(false);
  };
  const setSend = (i: number, p: Partial<NotifySend>) => set({ channels: f.channels.map((c, j) => (j === i ? { ...c, send: { ...c.send, ...p } } : c)) });

  /** write saves a form. A front that answers without the channels gets a read, so each place has its id. */
  const write = async (next: NotifyForm): Promise<Wrote> => {
    const body = notifyBodyOf(next);
    try {
      let r = await api.putNotifications(body);
      if (!r || !Array.isArray(r.channels)) r = await api.notifications().catch(() => ({ ...read, ...masked(body) }));
      // offered, shared, and the server of the front stay when the answer leaves them out.
      const kept: NotifyRead = { ...(read || {}), ...r };
      setRead(kept);
      setF(notifyFormOf(kept, zone));
      setProblems(NONE);
      setQuietErr('');
      setFull(false);
      return { ok: true, read: kept };
    } catch (e) {
      const ps = e instanceof ApiError && e.problem && Array.isArray(e.problem.problems) ? (e.problem.problems as unknown[]) : null;
      return ps && ps.length ? { ok: false, problems: notifyProblems(ps) } : { ok: false, message: messageOf(e) };
    }
  };
  const refused = (r: Wrote, sent?: NotifyChannel[]) => {
    if (r.ok) return;
    if (!r.problems) setProblems({ ...NONE, top: [r.message || 'The action failed. Try it again.'] });
    else setProblems(sent ? { ...NONE, top: labeled(r.problems, sent) } : r.problems);
  };

  const save = async () => {
    const qe = quietError(f);
    if (qe) {
      setQuietErr(qe);
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    setBusy(true);
    const r = await write(f);
    setBusy(false);
    if (r.ok) onClose();
    else refused(r);
  };

  /** saveChannel adds a place or changes one, and saves the list. A refusal goes back to the dialog of the place. */
  const saveChannel = async (index: number | null, c: NotifyChannel): Promise<SaveOutcome> => {
    const channels = index === null ? [...f.channels, c] : f.channels.map((x, i) => (i === index ? c : x));
    const at = index === null ? channels.length - 1 : index;
    const next = { ...f, channels };
    const qe = quietError(next);
    if (qe) return { ok: false, top: ['Quiet hours: ' + qe] };
    setBusy(true);
    const r = await write(next);
    setBusy(false);
    if (r.ok) {
      setTests({});
      setEditing(null);
      return { ok: true };
    }
    if (r.problems) return { ok: false, problems: r.problems.channels[at] || {}, top: labeled(r.problems, channels, at) };
    return { ok: false, top: [r.message || 'The action failed. Try it again.'] };
  };

  const remove = async (index: number) => {
    const channels = f.channels.filter((_, i) => i !== index);
    setBusy(true);
    const r = await write({ ...f, channels });
    setBusy(false);
    setRemoving(null);
    if (r.ok) {
      setTests({});
      setRefocus((n) => n + 1);
    } else refused(r, channels);
  };

  const test = async (i: number) => {
    const c = f.channels[i];
    const said = (t: Tested | null) =>
      setTests((x) => {
        const out = { ...x };
        if (t) out[i] = t;
        else delete out[i];
        return out;
      });
    let id = c.id || '';
    if (dirty || !id) {
      const qe = quietError(f);
      if (qe) {
        setQuietErr(qe);
        return;
      }
      said({ busy: true, ok: true, words: '' });
      const r = await write(f);
      if (!r.ok) {
        said(null);
        refused(r);
        return;
      }
      id = (r.read.channels[i] && r.read.channels[i].id) || '';
    }
    // Without an id, the test would go to every place.
    if (!id) {
      said({ busy: false, ok: false, words: 'The test failed. The server gave this place no id.' });
      return;
    }
    said({ busy: true, ok: true, words: '' });
    try {
      const results = await api.testNotification(id);
      const res = results.find((x) => x.channel === id) || (results.length === 1 ? results[0] : undefined);
      said({ busy: false, ...testWords(res, nameOf(c)) });
    } catch (e) {
      said({ busy: false, ok: false, words: 'The test failed. ' + messageOf(e) });
    }
  };

  // The keys that open a dialog stay enabled while a save runs, because a
  // dialog that closes gives the focus back to its key before the key
  // turns on again. Their actions wait for the save instead.
  const add = () => {
    if (busy) return;
    if (f.channels.length >= MAX_CHANNELS) setFull(true);
    else setEditing({ index: null });
  };

  const ready = load === 'ready' && !!read;
  const quietSaid = quietErr || (problems.quiet.length ? problems.quiet.join(' ') : '');
  const gone = removing !== null ? f.channels[removing] : undefined;
  return (
    <>
      {/* Save turns on once something changed. Cancel closes a dialog with no change. */}
      <Confirm title="Where to reach me" confirm="Save" busy={busy || !ready || !dirty} class="notify-dialog" onCancel={onClose} onConfirm={save}>
        {load === 'loading' && <p>Loading your settings.</p>}
        {load === 'none' && <p>The server sends no notifications.</p>}
        {load === 'failed' && <p role="alert">{failed}</p>}
        {ready && (
          <div class="notify-form">
            {read!.off && f.channels.length > 0 && (
              <p class="notify-off" role="status">
                <LineLed tone="grey" /> {read!.off}
              </p>
            )}
            {problems.top.length > 0 && (
              <ul class="duty-problems" role="alert">
                {problems.top.map((x) => (
                  <li>{x}</li>
                ))}
              </ul>
            )}
            {f.channels.length ? (
              <ul class="notify-places" aria-label="Your places">
                {f.channels.map((c, i) => {
                  const name = nameOf(c);
                  const said = problemTexts(problems.channels[i]);
                  const t = tests[i];
                  return (
                    <li class="notify-place">
                      <div class="notify-place-head">
                        <span class="t-sub clip">{name}</span>
                        <span class="t-meta clip">{placeLine(c, read, agentName)}</span>
                      </div>
                      <div class="notify-place-send" role="group" aria-label={'What goes to ' + name}>
                        <SendSwitches f={c.send} disabled={busy} onChange={(p) => setSend(i, p)} />
                      </div>
                      {said.length > 0 && (
                        <ul class="duty-problems" role="alert">
                          {said.map((x) => (
                            <li>{x}</li>
                          ))}
                        </ul>
                      )}
                      <div class="notify-place-do">
                        <Button size="s" disabled={busy || (!!t && t.busy)} aria-label={'Send a test to ' + name} onClick={() => test(i)}>
                          Send a test
                        </Button>
                        {(KIND_ORDER as string[]).includes(c.kind) && (
                          <Button size="s" kind="quiet" aria-label={'Edit ' + name} onClick={() => !busy && setEditing({ index: i })}>
                            Edit
                          </Button>
                        )}
                        <Button size="s" kind="quiet" aria-label={'Remove ' + name} onClick={() => !busy && setRemoving(i)}>
                          Remove
                        </Button>
                      </div>
                      {t &&
                        (t.busy ? (
                          <p class="t-meta" role="status">
                            Sending.
                          </p>
                        ) : (
                          <p class={t.ok ? 'notify-said' : 'notify-said field-error'} role="status">
                            {t.words}
                          </p>
                        ))}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p class="notify-empty">Nothing goes out until you add a place. Activity always shows what needs you.</p>
            )}
            <div class="notify-add">
              <Button ref={addKey} size="s" icon="plus" onClick={add}>
                Add a place
              </Button>
              {full && (
                <span class="field-error" role="alert">
                  You keep {MAX_CHANNELS} places, the most there is. Remove one to add another.
                </span>
              )}
            </div>
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
              {quietSaid && (
                <span class="field-error" role="alert">
                  {quietSaid}
                </span>
              )}
            </fieldset>
          </div>
        )}
      </Confirm>
      {editing && read && (
        <ChannelDialog
          read={read}
          base={editing.index === null ? null : f.channels[editing.index]}
          problems={editing.index === null ? undefined : problems.channels[editing.index]}
          onSave={(c) => saveChannel(editing.index, c)}
          onCancel={() => setEditing(null)}
        />
      )}
      {gone && (
        <Confirm title={'Remove ' + nameOf(gone) + '?'} confirm="Remove" danger busy={busy} onCancel={() => setRemoving(null)} onConfirm={() => remove(removing!)}>
          <p>Nothing goes to {nameOf(gone)} after this.</p>
        </Confirm>
      )}
    </>
  );
}
