import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { Fleet, NotifyChannel, NotifyRead, NotifySettings, Whoami } from '../api/types';
import type { Route as Address } from '../lib/route';
import { store } from '../state/store';
import shellCss from '../styles/shell.css?raw';
import { Shell } from './Shell';
import { Notifications } from './Notifications';
import { click, fakeApi, fieldOf, keyNamed, mount, settle, typeIn, unmountAll, type Call } from './testkit-c';

const ALICE: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true };
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const SEND = { questions: true, failures: true, digest: false };
const PHONE: NotifyChannel = { id: 'phone', kind: 'ntfy', label: 'My phone', send: SEND, ntfy: { server: '', topic: 'alice-fw-8f3k', token: 'set' } };
const HA: NotifyChannel = { id: 'ha', kind: 'webhook', label: 'Home Assistant', send: { questions: true, failures: false, digest: true }, url: 'set', secret: 'set' };
const ALL = ['ntfy', 'slack', 'discord', 'teams', 'webhook', 'email', 'agent', 'shared'];
const READ: NotifyRead = {
  channels: [PHONE, HA],
  quietHours: { from: '', to: '', timeZone: ZONE },
  offered: ALL.map((kind) => ({ kind, label: kind })),
  shared: [{ name: 'ops-room', kind: 'slack', label: 'Ops room' }],
  off: '',
  serverDefault: 'https://ntfy.example.org',
};

/** fleetOf is a fleet whose pools run the agents named. */
const fleetOf = (agents: string[]): Fleet => ({
  name: 'front-0',
  members: [],
  pools: agents.map((agent) => ({ name: agent, atespace: 'default', agent, intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [] })),
});

/** echo answers a write with what it sent, as a read answers it: the write-only fields as set, and an id for a new place. */
const echo = (c: Call) => {
  const b = c.body as NotifySettings;
  const channels = b.channels.map((x, i) => {
    const y: NotifyChannel = { ...x, id: x.id || 'new-' + i };
    if (y.url !== undefined) y.url = y.url ? 'set' : '';
    if (y.secret !== undefined) y.secret = y.secret ? 'set' : '';
    if (y.ntfy) y.ntfy = { ...y.ntfy, token: y.ntfy.token ? 'set' : '' };
    return y;
  });
  return { body: { ...READ, ...b, channels } };
};

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  act(() => {
    store.dispatch({ type: 'me', me: ALICE });
    store.dispatch({ type: 'fleet', fleet: fleetOf(['relay', 'watcher']) });
    store.dispatch({ type: 'agents', agents: [{ name: 'relay', role: 'owner' }, { name: 'watcher', role: 'viewer' }] });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

const dialogs = () => [...document.querySelectorAll('dialog.confirm')] as HTMLDialogElement[];
const outer = () => dialogs().find((d) => d.querySelector('h2')!.textContent === 'Where to reach me')!;
const place = () => document.querySelector('dialog.channel-dialog') as HTMLDialogElement;
const asking = () => dialogs().find((d) => d.querySelector('h2')!.textContent!.startsWith('Remove '))!;
const rows = () => [...outer().querySelectorAll('li.notify-place')] as HTMLElement[];
const row = (label: string) => rows().find((r) => r.querySelector('.t-sub')!.textContent === label)!;
const sw = (root: ParentNode, label: string) => [...root.querySelectorAll('label.check')].find((l) => l.textContent === label)!.querySelector('input') as HTMLInputElement;
const field = (root: ParentNode, label: string) => [...root.querySelectorAll('.field')].find((l) => l.querySelector('.field-label')!.textContent!.startsWith(label)) as HTMLElement | undefined;
const control = (root: ParentNode, label: string) => field(root, label)!.querySelector('input, textarea, select') as HTMLInputElement;
const puts = () => api.calls.filter((c) => c.method === 'PUT');
const put = () => puts().pop()!;
const pick = (kind: string) => click([...place().querySelectorAll('input[type="radio"]')].find((r) => (r as HTMLInputElement).value === kind));

async function open(read: object = READ, more: Record<string, unknown> = {}) {
  api = fakeApi({ 'GET /v1/notifications': read, 'PUT /v1/notifications': echo, ...(more as object) } as never);
  mount(<Notifications onClose={() => {}} />);
  await settle();
}

/** shellAt draws the shell of an address, with a list and a main pane, as the page draws Activity. */
const shellAt = (route: Address) => <Shell route={route} list={<p>list</p>} main={<p>main</p>} details={null} onSignOut={() => {}} />;

/** reach opens Where to reach me from the account menu of a shell. */
function reach(el: HTMLElement): HTMLButtonElement {
  const key = el.querySelector('.account-key') as HTMLButtonElement;
  click(key);
  const item = [...el.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === 'Where to reach me') as HTMLElement;
  expect(item).toBeTruthy();
  click(item);
  return key;
}

/**
 * hiddenOnPhone names each rule of a narrow window that hides an element or
 * an element that holds it: each selector of shell.css under the width of
 * a phone whose rule says display: none.
 */
function hiddenOnPhone(el: Element): string[] {
  const at = shellCss.indexOf('@media (max-width: 799px) {');
  expect(at).toBeGreaterThan(-1);
  let depth = 0;
  let end = at;
  for (let i = shellCss.indexOf('{', at); i < shellCss.length; i++) {
    if (shellCss[i] === '{') depth++;
    else if (shellCss[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const block = shellCss.slice(shellCss.indexOf('{', at) + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const m of block.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/display:\s*none/.test(m[2])) continue;
    for (const sel of m[1].split(',').map((x) => x.trim())) if (el.closest(sel)) out.push(sel);
  }
  return out;
}

describe('the account menu', () => {
  it('opens Where to reach me in a dialog, and gives the focus back to the account key when it closes', async () => {
    api = fakeApi({ 'GET /v1/notifications': READ });
    const el = mount(shellAt({ place: 'home' }));
    const key = reach(el);
    await settle();
    expect(el.querySelector('.menu-account')).toBeNull();
    expect(outer()).toBeTruthy();
    // The dialog names itself by its own title.
    expect(document.getElementById(outer().getAttribute('aria-labelledby')!)!.textContent).toBe('Where to reach me');
    expect(document.activeElement!.textContent).toBe('Cancel');
    click(keyNamed(outer(), 'Cancel'));
    await settle();
    expect(dialogs()).toEqual([]);
    expect(document.activeElement).toBe(key);
  });

  it('keeps Where to reach me open, with its draft, when the window crosses the width of a phone', async () => {
    api = fakeApi({ 'GET /v1/notifications': READ });
    // A wide window shows the app bar beside the main pane of an item.
    const el = mount(shellAt({ place: 'activity', item: 'k' }));
    expect(el.querySelector('.shell')!.getAttribute('data-show')).toBe('main');
    reach(el);
    await settle();
    click(sw(outer(), 'Hold notifications at night'));
    const dialog = outer();
    // A phone hides the app bar beside the main pane. The dialog sits outside it, so it stays in sight.
    expect(el.querySelector('.appbar')!.contains(dialog)).toBe(false);
    expect(hiddenOnPhone(dialog)).toEqual([]);
    // The phone goes back to the list and on to the item again. The same dialog keeps the draft.
    for (const route of [{ place: 'activity' }, { place: 'activity', item: 'k' }] as Address[]) {
      act(() => render(shellAt(route), el));
      expect(outer()).toBe(dialog);
      expect(sw(dialog, 'Hold notifications at night').checked).toBe(true);
      expect(hiddenOnPhone(dialog)).toEqual([]);
    }
    expect(puts()).toEqual([]);
  });
});

describe('Where to reach me', () => {
  it('lists each place with its name, where it reaches, its three switches, and its keys, and the reason when nothing goes out', async () => {
    await open({ ...READ, off: 'No place reaches you now.' });
    expect(outer().querySelector('.notify-off')!.textContent!.trim()).toBe('No place reaches you now.');
    expect(rows().map((r) => [r.querySelector('.t-sub')!.textContent, r.querySelector('.t-meta')!.textContent])).toEqual([
      ['My phone', 'ntfy, topic alice-fw-8f3k'],
      ['Home Assistant', 'Webhook'],
    ]);
    const ha = row('Home Assistant');
    expect([sw(ha, 'Questions').checked, sw(ha, 'Failures').checked, sw(ha, 'A daily digest').checked]).toEqual([true, false, true]);
    expect(sw(ha, 'Questions').getAttribute('role')).toBe('switch');
    expect(ha.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('What goes to Home Assistant');
    expect([...ha.querySelectorAll('.notify-place-do button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Send a test to Home Assistant', 'Edit Home Assistant', 'Remove Home Assistant']);
    // The page never shows a write-only value.
    expect(outer().textContent).not.toContain('hooks');
    expect(sw(outer(), 'Hold notifications at night').checked).toBe(false);
    click(sw(outer(), 'Hold notifications at night'));
    expect((fieldOf(outer(), 'From') as HTMLInputElement).value).toBe('22:00');
    expect((fieldOf(outer(), 'Time zone') as unknown as HTMLSelectElement).value).toBe(ZONE);
  });

  it('says that nothing goes out until the person adds a place, and that Activity shows what needs them', async () => {
    await open({ ...READ, channels: [], off: 'No place reaches you yet.' });
    expect(outer().querySelector('.notify-places')).toBeNull();
    // The empty list says it in its own words, so the reason of the front stays out.
    expect(outer().querySelector('.notify-off')).toBeNull();
    expect(outer().querySelector('.notify-empty')!.textContent).toBe('Nothing goes out until you add a place. Activity always shows what needs you.');
    expect(keyNamed(outer(), 'Add a place')).toBeTruthy();
  });

  it('saves the switches and the quiet hours with the write-only fields kept as set, and closes', async () => {
    let closed = false;
    api = fakeApi({ 'GET /v1/notifications': READ, 'PUT /v1/notifications': echo });
    mount(<Notifications onClose={() => (closed = true)} />);
    await settle();
    click(sw(row('My phone'), 'A daily digest'));
    click(sw(outer(), 'Hold notifications at night'));
    typeIn(fieldOf(outer(), 'To'), '06:30');
    click(keyNamed(outer(), 'Save'));
    await settle();
    expect(put().body).toEqual({
      channels: [{ ...PHONE, send: { ...SEND, digest: true } }, HA],
      quietHours: { from: '22:00', to: '06:30', timeZone: ZONE },
    } satisfies NotifySettings);
    expect(closed).toBe(true);
  });

  it('closes on Save with no change and writes nothing', async () => {
    let closed = false;
    api = fakeApi({ 'GET /v1/notifications': READ, 'PUT /v1/notifications': echo });
    mount(<Notifications onClose={() => (closed = true)} />);
    await settle();
    click(keyNamed(outer(), 'Save'));
    await settle();
    expect(puts()).toEqual([]);
    expect(closed).toBe(true);
  });

  it('shows a problem of a place under its row and beside its field in Edit, and one with no path at the top', async () => {
    await open(READ, { 'PUT /v1/notifications': () => ({ status: 400, body: { detail: 'bad', problems: ['channels[1].url: The front cannot reach this address.', 'Too many changes today.'] } }) });
    click(sw(row('Home Assistant'), 'Failures'));
    click(keyNamed(outer(), 'Save'));
    await settle();
    expect(outer().querySelector('.notify-form > .duty-problems')!.textContent).toBe('Too many changes today.');
    expect(row('Home Assistant').querySelector('.duty-problems')!.textContent).toBe('The front cannot reach this address.');
    expect(row('My phone').querySelector('.duty-problems')).toBeNull();
    click(keyNamed(row('Home Assistant'), 'Edit'));
    await settle();
    expect(field(place(), 'Address')!.querySelector('.field-error')!.textContent).toBe('The front cannot reach this address.');
  });

  it('says why nothing can be added past ten places', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...PHONE, id: 'p' + i, label: 'Phone ' + i }));
    await open({ ...READ, channels: many });
    click(keyNamed(outer(), 'Add a place'));
    expect(place()).toBeNull();
    expect(outer().querySelector('.notify-add .field-error')!.textContent).toBe('You keep 10 places, the most there is. Remove one to add another.');
  });

  it('says so when the workbench sends no notifications', async () => {
    api = fakeApi({});
    mount(<Notifications onClose={() => {}} />);
    await settle();
    expect(outer().textContent).toContain('This workbench sends no notifications.');
    expect((keyNamed(outer(), 'Save') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Add a place', () => {
  it('offers only the kinds of the front, each with one line in words', async () => {
    await open({ ...READ, offered: [{ kind: 'webhook', label: 'Webhook' }, { kind: 'slack', label: 'Slack' }, { kind: 'pager', label: 'Pager' }] });
    click(keyNamed(outer(), 'Add a place'));
    await settle();
    expect(place().querySelector('h2')!.textContent).toBe('Add a place');
    expect(place().querySelector('legend')!.textContent).toBe('What kind of place');
    expect([...place().querySelectorAll('.choice')].map((c) => [c.querySelector('.t-sub')!.textContent, c.querySelector('.t-meta')!.textContent])).toEqual([
      ['Slack', 'A channel of your Slack workspace, through an incoming webhook.'],
      ['Webhook', 'Any app that takes a JSON post, such as Home Assistant, n8n, or Zapier.'],
    ]);
    click(keyNamed(place(), 'Add place'));
    expect(place().querySelector('.choice-set .field-error')!.textContent).toBe('Pick a kind of place.');
  });

  it('adds a Slack channel with its address, saves the list, and gives the focus back to Add a place', async () => {
    await open();
    const key = keyNamed(outer(), 'Add a place')!;
    key.focus();
    click(key);
    await settle();
    pick('slack');
    expect(field(place(), 'Address')!.querySelector('.help-key')!.getAttribute('aria-label')).toBe('Where to find it');
    click(keyNamed(place(), 'Add place'));
    await settle();
    expect(field(place(), 'Name')!.querySelector('.field-error')!.textContent).toBe('Give the place a name.');
    // The first field that is wrong takes the focus.
    expect(document.activeElement).toBe(control(place(), 'Name'));
    expect(field(place(), 'Address')!.querySelector('.field-error')!.textContent).toBe('Paste the address from Slack.');
    typeIn(control(place(), 'Name'), 'Ops room');
    typeIn(control(place(), 'Address'), 'https://hooks.slack.com/services/T0/B0/xyz');
    click(sw(place(), 'A daily digest'));
    click(keyNamed(place(), 'Add place'));
    await settle();
    expect(put().body).toEqual({
      channels: [PHONE, HA, { kind: 'slack', label: 'Ops room', send: { questions: true, failures: true, digest: true }, url: 'https://hooks.slack.com/services/T0/B0/xyz' }],
      quietHours: { from: '', to: '', timeZone: ZONE },
    });
    expect(place()).toBeNull();
    expect(row('Ops room').querySelector('.t-meta')!.textContent).toBe('Slack');
    expect(document.activeElement).toBe(keyNamed(outer(), 'Add a place'));
  });

  it('adds ntfy with the server of the front as the placeholder', async () => {
    await open();
    click(keyNamed(outer(), 'Add a place'));
    await settle();
    pick('ntfy');
    expect(control(place(), 'Server').placeholder).toBe('https://ntfy.example.org');
    expect(control(place(), 'Token').type).toBe('password');
    typeIn(control(place(), 'Name'), 'Tablet');
    typeIn(control(place(), 'Topic'), 'alice-tablet');
    click(keyNamed(place(), 'Add place'));
    await settle();
    expect((put().body as NotifySettings).channels[2]).toEqual({ kind: 'ntfy', label: 'Tablet', send: SEND, ntfy: { server: '', topic: 'alice-tablet', token: '' } });
  });

  it('adds a webhook with a secret, and names the header of the signature', async () => {
    await open();
    click(keyNamed(outer(), 'Add a place'));
    await settle();
    pick('webhook');
    expect(place().querySelector('.notify-sign')!.textContent).toBe('With a secret, each post carries the header X-Featherweight-Signature. It holds sha256= and the HMAC of the body, keyed by the secret.');
    typeIn(control(place(), 'Name'), 'n8n');
    typeIn(control(place(), 'Address'), 'https://n8n.example.com/webhook/fw');
    typeIn(control(place(), 'Secret'), 's3cret');
    click(keyNamed(place(), 'Add place'));
    await settle();
    expect((put().body as NotifySettings).channels[2]).toMatchObject({ kind: 'webhook', url: 'https://n8n.example.com/webhook/fw', secret: 's3cret' });
  });

  it('adds a place through an agent that the person can run, with a budget that the person writes', async () => {
    await open();
    click(keyNamed(outer(), 'Add a place'));
    await settle();
    pick('agent');
    const agent = control(place(), 'Agent') as unknown as HTMLSelectElement;
    expect([...agent.options].map((o) => o.textContent)).toEqual(['Pick an agent', 'relay']);
    expect(field(place(), 'How should it reach you?')).toBeTruthy();
    // No budget by default: the person writes the most a message can cost.
    expect(control(place(), 'The most a message can cost').value).toBe('');
    expect(control(place(), 'The most a message can cost').placeholder).toBe('Required, such as 0.02');
    typeIn(control(place(), 'Name'), 'Signal');
    act(() => {
      agent.value = 'relay';
      agent.dispatchEvent(new Event('change', { bubbles: true }));
    });
    typeIn(control(place(), 'How should it reach you?'), 'Send it to me on Signal.');
    click(keyNamed(place(), 'Add place'));
    expect(field(place(), 'The most a message can cost')!.querySelector('.field-error')!.textContent).toBe('A place through an agent needs a budget. Write the most a message can cost, such as 0.02.');
    expect(puts()).toEqual([]);
    typeIn(control(place(), 'The most a message can cost'), '0.02');
    click(keyNamed(place(), 'Add place'));
    await settle();
    expect((put().body as NotifySettings).channels[2]).toEqual({ kind: 'agent', label: 'Signal', send: SEND, agent: { agent: 'relay', how: 'Send it to me on Signal.', budget: { maxCostUSD: 0.02 } } });
    expect(row('Signal').querySelector('.t-meta')!.textContent).toBe('Through relay');
  });

  it('picks a shared channel by its label, which names the place', async () => {
    await open();
    click(keyNamed(outer(), 'Add a place'));
    await settle();
    pick('shared');
    const ch = control(place(), 'Channel') as unknown as HTMLSelectElement;
    expect([...ch.options].map((o) => o.textContent)).toEqual(['Pick a channel', 'Ops room']);
    act(() => {
      ch.value = 'ops-room';
      ch.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(control(place(), 'Name').value).toBe('Ops room');
    click(keyNamed(place(), 'Add place'));
    await settle();
    expect((put().body as NotifySettings).channels[2]).toEqual({ kind: 'shared', label: 'Ops room', send: SEND, shared: 'ops-room' });
    expect(row('Ops room').querySelector('.t-meta')!.textContent).toBe('Ops room, shared by an admin');
  });

  it('shows a problem of the new place beside its field, and keeps the dialog open', async () => {
    await open(READ, { 'PUT /v1/notifications': () => ({ status: 400, body: { problems: ['channels[2].email.to: The front sends no mail to this domain.', 'channels[0].ntfy.topic: That topic is taken.'] } }) });
    click(keyNamed(outer(), 'Add a place'));
    await settle();
    pick('email');
    typeIn(control(place(), 'Name'), 'Work mail');
    typeIn(control(place(), 'Email address'), 'alice@example.com');
    click(keyNamed(place(), 'Add place'));
    await settle();
    expect(field(place(), 'Email address')!.querySelector('.field-error')!.textContent).toBe('The front sends no mail to this domain.');
    // A problem of another place names that place.
    expect(place().querySelector('.notify-form > .duty-problems')!.textContent).toBe('My phone: That topic is taken.');
    expect(rows().length).toBe(2);
  });
});

describe('Edit', () => {
  it('shows a write-only field as Saved with Replace and Remove, and sends set, a new value, or nothing', async () => {
    await open();
    const key = keyNamed(row('Home Assistant'), 'Edit')!;
    key.focus();
    click(key);
    await settle();
    expect(place().querySelector('h2')!.textContent).toBe('Edit Home Assistant');
    const saved = [...place().querySelectorAll('.notify-saved')] as HTMLElement[];
    expect(saved.map((s) => s.getAttribute('aria-label'))).toEqual(['Address', 'Secret']);
    expect(saved[0].querySelector('.notify-saved-row')!.textContent).toBe('SavedReplace');
    expect(saved[1].querySelector('.notify-saved-row')!.textContent).toBe('SavedReplaceRemove');
    expect(control(place(), 'Name').value).toBe('Home Assistant');
    click(keyNamed(place(), 'Save'));
    await settle();
    expect((put().body as NotifySettings).channels[1]).toEqual(HA);
    expect(document.activeElement).toBe(keyNamed(row('Home Assistant'), 'Edit'));

    click(keyNamed(row('Home Assistant'), 'Edit'));
    await settle();
    click(keyNamed(place(), 'Replace'));
    typeIn(control(place(), 'Address'), 'https://ha.example.com/api/webhook/new');
    click(place().querySelector('[aria-label="Remove the secret"]'));
    expect(place().textContent).toContain('The saved secret goes when you save.');
    click(keyNamed(place(), 'Save'));
    await settle();
    expect((put().body as NotifySettings).channels[1]).toEqual({ ...HA, url: 'https://ha.example.com/api/webhook/new', secret: '' });
  });

  it('keeps the saved token after Remove and Keep it', async () => {
    await open();
    click(keyNamed(row('My phone'), 'Edit'));
    await settle();
    click(place().querySelector('[aria-label="Remove the token"]'));
    expect(control(place(), 'Token')).toBeTruthy();
    click(keyNamed(place(), 'Keep it'));
    expect(place().querySelector('.notify-saved')!.getAttribute('aria-label')).toBe('Token');
    click(keyNamed(place(), 'Save'));
    await settle();
    expect((put().body as NotifySettings).channels[0]).toEqual(PHONE);
  });
});

describe('Remove', () => {
  it('asks first, saves the list without the place, and gives the focus to Add a place', async () => {
    await open();
    click(keyNamed(row('Home Assistant'), 'Remove'));
    await settle();
    expect(asking().querySelector('h2')!.textContent).toBe('Remove Home Assistant?');
    expect(asking().textContent).toContain('Nothing goes to Home Assistant after this.');
    click(keyNamed(asking(), 'Remove'));
    await settle();
    expect((put().body as NotifySettings).channels).toEqual([PHONE]);
    expect(rows().length).toBe(1);
    expect(document.activeElement).toBe(keyNamed(outer(), 'Add a place'));
  });
});

describe('Send a test', () => {
  it('tests one place and says what happened under its row, and saves a change first', async () => {
    await open(READ, {
      'POST /v1/notifications/test': (c: Call) => {
        const id = (c.body as { channel: string }).channel;
        return { body: { results: [id === 'ha' ? { channel: 'ha', sent: false, error: 'the address answered 404 not found' } : { channel: id, sent: true, error: '' }] } };
      },
    });
    click(keyNamed(row('My phone'), 'Send a test'));
    await settle();
    expect(api.calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([{ channel: 'phone' }]);
    expect(puts()).toEqual([]);
    const said = row('My phone').querySelector('.notify-said')!;
    expect(said.textContent).toBe('Sent to My phone. Look for it there.');
    expect(said.getAttribute('role')).toBe('status');
    click(sw(row('Home Assistant'), 'Failures'));
    click(keyNamed(row('Home Assistant'), 'Send a test'));
    await settle();
    // The change goes first, so the test reaches the place as the person set it.
    expect(api.calls.filter((c) => c.method !== 'GET').map((c) => c.method + ' ' + c.path)).toEqual(['POST /v1/notifications/test', 'PUT /v1/notifications', 'POST /v1/notifications/test']);
    expect(row('Home Assistant').querySelector('.notify-said.field-error')!.textContent).toBe('Not sent to Home Assistant. The address answered 404 not found.');
  });

  it('says that the test failed for a refusal of the front', async () => {
    await open(READ, { 'POST /v1/notifications/test': () => ({ status: 400, body: { error: 'there is no channel phone' } }) });
    click(keyNamed(row('My phone'), 'Send a test'));
    await settle();
    expect(row('My phone').querySelector('.notify-said')!.textContent).toBe('The test failed. There is no channel phone.');
  });
});
