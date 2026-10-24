// ChannelDialog is the dialog of one place of Where to reach me: Add a
// place and Edit. Add a place offers the kinds that the front serves, each
// with one line in words, then the short form of the kind. A write-only
// field shows Saved with Replace, and Remove where the place can do without
// it, and never its value. The key of the dialog saves the whole list, and
// a problem of the front shows beside its field.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { ChannelKind, NotifyChannel, NotifyRead } from '../api/types';
import { canSeat } from '../lib/agents';
import { KINDS, channelErrors, channelFormOf, channelOf, kindName, offeredKinds, secretOf, secretOpen, type ChannelErrors, type ChannelForm, type ChannelSlot, type Secret } from '../lib/notifications';
import { selectAgents } from '../state/agents';
import { useSelect } from '../state/store';
import { Confirm } from './common';
import { Button, Choices, Field, Help, Input, TextArea } from './primitives';

/** What a save of the list did: saved, or the problems of this place by field and the rest at the top. */
export interface SaveOutcome {
  ok: boolean;
  problems?: Partial<Record<ChannelSlot, string[]>>;
  top?: string[];
}

/** Switch is a checkbox with the role of a switch, in a row with its label. */
export function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label class="check">
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span>{label}</span>
    </label>
  );
}

/** SendSwitches are the three switches of a place: questions, failures, and a daily digest. */
export function SendSwitches({ f, onChange, disabled }: { f: { questions: boolean; failures: boolean; digest: boolean }; onChange: (p: Partial<{ questions: boolean; failures: boolean; digest: boolean }>) => void; disabled?: boolean }) {
  return (
    <>
      <Switch label="Questions" on={f.questions} disabled={disabled} onChange={(questions) => onChange({ questions })} />
      <Switch label="Failures" on={f.failures} disabled={disabled} onChange={(failures) => onChange({ failures })} />
      <Switch label="A daily digest" on={f.digest} disabled={disabled} onChange={(digest) => onChange({ digest })} />
    </>
  );
}

/** The name that a new place of each kind suggests. */
const LABEL_HINT: Record<ChannelKind, string> = {
  ntfy: 'My phone',
  slack: 'Ops room',
  discord: 'Team server',
  teams: 'Ops team',
  webhook: 'Home Assistant',
  email: 'Work mail',
  agent: 'Signal',
  shared: 'Ops room',
};

/** Where a person finds the address of a kind. No link: the place of the setting in the other app. */
const WHERE: Partial<Record<ChannelKind, string>> = {
  slack: 'In Slack, add the app Incoming Webhooks to the channel, then copy the address that it gives you.',
  discord: 'In Discord, open the settings of the channel, then Integrations, then Webhooks. Make one and copy its address.',
  teams: 'In Teams, add the workflow that posts to a channel when a webhook request is received, then copy its address.',
  webhook: 'The app that takes the post gives the address, such as an automation of Home Assistant or a flow of n8n.',
};

/** The placeholder of the address of each kind. */
const URL_HINT: Partial<Record<ChannelKind, string>> = {
  slack: 'https://hooks.slack.com/services/…',
  discord: 'https://discord.com/api/webhooks/…',
  teams: 'https://…',
  webhook: 'https://…',
};

/**
 * WriteOnly is a field that the page writes and never reads. With a saved
 * value it shows Saved, Replace, and Remove for an optional field. After
 * Remove, the saved value goes on save, and Keep it brings it back.
 */
function WriteOnly(props: { label: ComponentChildren; noun: string; value: Secret; onChange: (s: Secret) => void; optional?: boolean; type?: string; placeholder?: string; error?: string }) {
  const { label, noun, value, onChange, optional, error } = props;
  if (!secretOpen(value))
    return (
      <div class={'field notify-saved' + (error ? ' bad' : '')} role="group" aria-label={noun[0].toUpperCase() + noun.slice(1)}>
        <span class="field-label">{label}</span>
        <span class="notify-saved-row">
          <span>Saved</span>
          <Button size="s" kind="quiet" aria-label={'Replace the ' + noun} onClick={() => onChange({ ...value, replacing: true, typed: '' })}>
            Replace
          </Button>
          {optional && (
            <Button size="s" kind="quiet" aria-label={'Remove the ' + noun} onClick={() => onChange({ ...value, removed: true, typed: '' })}>
              Remove
            </Button>
          )}
        </span>
        {error && (
          <span class="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  return (
    <>
      <Field label={label} error={error}>
        <Input
          type={props.type || 'password'}
          value={value.typed}
          spellcheck={false}
          autocomplete="off"
          invalid={!!error}
          placeholder={value.had && !value.removed ? 'A new ' + noun : props.placeholder}
          onInput={(e) => onChange({ ...value, typed: (e.target as HTMLInputElement).value })}
        />
      </Field>
      {value.had && (
        <p class="notify-token">
          <span class="t-meta">{value.removed ? 'The saved ' + noun + ' goes when you save.' : 'The saved ' + noun + ' stays until you write a new one.'}</span>
          <Button size="s" kind="quiet" onClick={() => onChange(secretOf('set'))}>
            Keep it
          </Button>
        </p>
      )}
    </>
  );
}

/** Said lists problems of the front that name no field of this form. */
function Said({ list }: { list?: string[] }) {
  if (!list || !list.length) return null;
  return (
    <ul class="duty-problems" role="alert">
      {list.map((x) => (
        <li>{x}</li>
      ))}
    </ul>
  );
}

export function ChannelDialog({
  read,
  base,
  problems,
  onSave,
  onCancel,
}: {
  read: NotifyRead;
  /** The place that the person edits, or null for Add a place. */
  base: NotifyChannel | null;
  /** The problems of this place from the last save of the list. */
  problems?: Partial<Record<ChannelSlot, string[]>>;
  onSave: (c: NotifyChannel) => Promise<SaveOutcome>;
  onCancel: () => void;
}) {
  const [f, setF] = useState<ChannelForm>(() => channelFormOf(base));
  const [errors, setErrors] = useState<ChannelErrors>({});
  const [said, setSaid] = useState<Partial<Record<ChannelSlot, string[]>>>(problems || {});
  const [top, setTop] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const kinds = useMemo(() => offeredKinds(read), [read]);
  const agents = useSelect(selectAgents);
  const faces = useSelect((s) => s.faces);
  const runnable = useMemo(() => {
    const names = (agents || []).filter(canSeat).map((a) => a.name);
    if (f.agent && !names.includes(f.agent)) names.push(f.agent);
    return names;
  }, [agents, f.agent]);
  const shared = read.shared || [];

  const set = (p: Partial<ChannelForm>) => {
    setF((x) => ({ ...x, ...p }));
    setErrors({});
    setSaid({});
    setTop([]);
  };
  const err = (slot: ChannelSlot): string | undefined => errors[slot] || (said[slot] && said[slot]!.length ? said[slot]!.join(' ') : undefined);

  const save = async () => {
    const errs = channelErrors(f, read.serverDefault);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setBusy(true);
    const r = await onSave(channelOf(f, base));
    // A saved place closes the dialog, so only a refusal changes it.
    if (r.ok || !live.current) return;
    setBusy(false);
    setSaid(r.problems || {});
    setTop(r.top || []);
  };

  const kind = f.kind;
  const sharedPick = (name: string) => {
    const s = shared.find((x) => x.name === name);
    // A shared channel names the place, unless the person named it.
    set(s && !f.label.trim() ? { shared: name, label: s.label } : { shared: name });
  };

  return (
    <Confirm title={base ? 'Edit ' + base.label : 'Add a place'} confirm={base ? 'Save' : 'Add place'} busy={busy || (!base && !kinds.length)} class="notify-dialog channel-dialog" onCancel={onCancel} onConfirm={save}>
      <div class="notify-form">
        <Said list={[...top, ...(said.row || [])]} />
        {base ? (
          <p class="t-meta">{kindName(base.kind, read)}</p>
        ) : kinds.length ? (
          <Choices<ChannelKind | ''>
            name="notify-kind"
            legend="What kind of place"
            value={kind}
            options={kinds.map((k) => ({ id: k, label: KINDS[k].name, meta: KINDS[k].about }))}
            error={err('kind')}
            onChange={(k) => set({ kind: k })}
          />
        ) : (
          <p>This workbench offers no place yet. Ask an admin.</p>
        )}
        {kind && (
          <>
            {kind === 'shared' && (
              <Field label="Channel" error={err('shared')}>
                <select class="recess" value={f.shared} aria-invalid={err('shared') ? true : undefined} onChange={(e) => sharedPick((e.target as HTMLSelectElement).value)}>
                  <option value="">Pick a channel</option>
                  {shared.map((s) => (
                    <option value={s.name}>{s.label}</option>
                  ))}
                  {f.shared && !shared.some((s) => s.name === f.shared) && <option value={f.shared}>{f.shared + ', no longer shared'}</option>}
                </select>
              </Field>
            )}
            <Field label="Name" error={err('label')}>
              <Input value={f.label} maxLength={80} invalid={!!err('label')} placeholder={LABEL_HINT[kind]} onInput={(e) => set({ label: (e.target as HTMLInputElement).value })} />
            </Field>
            {kind === 'ntfy' && (
              <>
                <Field label="Server" error={err('server')}>
                  <Input type="url" value={f.server} spellcheck={false} invalid={!!err('server')} placeholder={read.serverDefault || 'https://ntfy.sh'} onInput={(e) => set({ server: (e.target as HTMLInputElement).value })} />
                </Field>
                <Field
                  label={
                    <>
                      Topic <Help label="What the topic is">The name that the ntfy app on your phone follows. Pick a name that is hard to guess.</Help>
                    </>
                  }
                  error={err('topic')}
                >
                  <Input value={f.topic} spellcheck={false} autocomplete="off" invalid={!!err('topic')} placeholder="alice-duties" onInput={(e) => set({ topic: (e.target as HTMLInputElement).value })} />
                </Field>
                <WriteOnly label="Token" noun="token" optional value={f.token} placeholder="Optional" error={err('token')} onChange={(token) => set({ token })} />
              </>
            )}
            {(kind === 'slack' || kind === 'discord' || kind === 'teams' || kind === 'webhook') && (
              <WriteOnly
                label={
                  <>
                    Address <Help label="Where to find it">{WHERE[kind]}</Help>
                  </>
                }
                noun="address"
                type="url"
                value={f.url}
                placeholder={URL_HINT[kind]}
                error={err('url')}
                onChange={(url) => set({ url })}
              />
            )}
            {kind === 'webhook' && (
              <>
                <WriteOnly label="Secret" noun="secret" optional value={f.secret} placeholder="Optional" error={err('secret')} onChange={(secret) => set({ secret })} />
                <p class="t-meta notify-sign">
                  With a secret, each post carries the header <code>X-Featherweight-Signature</code>. It holds <code>sha256=</code> and the HMAC of the body, keyed by the secret.
                </p>
              </>
            )}
            {kind === 'email' && (
              <Field label="Email address" error={err('to')}>
                <Input type="email" value={f.to} spellcheck={false} invalid={!!err('to')} placeholder="you@example.com" onInput={(e) => set({ to: (e.target as HTMLInputElement).value })} />
              </Field>
            )}
            {kind === 'agent' && (
              <>
                <Field label="Agent" error={err('agent')}>
                  <select class="recess" value={f.agent} aria-invalid={err('agent') ? true : undefined} onChange={(e) => set({ agent: (e.target as HTMLSelectElement).value })}>
                    <option value="">{runnable.length ? 'Pick an agent' : 'No agent that you can run'}</option>
                    {runnable.map((n) => (
                      <option value={n}>{(faces[n] && faces[n].displayName) || n}</option>
                    ))}
                  </select>
                </Field>
                <Field label="How should it reach you?" error={err('how')}>
                  <TextArea rows={3} value={f.how} invalid={!!err('how')} placeholder="Send it to me on Signal." onInput={(e) => set({ how: (e.target as HTMLTextAreaElement).value })} />
                </Field>
                <Field label="The most a message can cost" error={err('cost')}>
                  <span class="duty-money">
                    <span aria-hidden="true">$</span>
                    <Input inputMode="decimal" value={f.cost} invalid={!!err('cost')} placeholder="0.02" onInput={(e) => set({ cost: (e.target as HTMLInputElement).value })} />
                  </span>
                </Field>
              </>
            )}
            <fieldset>
              <legend>Tell me about</legend>
              <SendSwitches f={f} onChange={set} />
              {err('send') && (
                <span class="field-error" role="alert">
                  {err('send')}
                </span>
              )}
            </fieldset>
          </>
        )}
      </div>
    </Confirm>
  );
}
