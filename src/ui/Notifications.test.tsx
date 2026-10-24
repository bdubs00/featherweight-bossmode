import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { NotifySettings, Whoami } from '../api/types';
import { store } from '../state/store';
import { AppBar } from './Shell';
import { Notifications } from './Notifications';
import { click, fakeApi, fieldOf, keyNamed, mount, settle, typeIn, unmountAll, type Call } from './testkit-c';

const ALICE: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true };
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const READ = {
  ntfy: { server: '', topic: 'alice-duties', token: 'set' },
  send: { questions: true, failures: true, digest: false },
  quietHours: { from: '', to: '', timeZone: ZONE },
  serverDefault: 'https://ntfy.example.org',
};

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  act(() => store.dispatch({ type: 'me', me: ALICE }));
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

const dialog = () => document.querySelector('dialog.confirm') as HTMLDialogElement;
const sw = (label: string) => [...dialog().querySelectorAll('label.check')].find((l) => l.textContent === label)!.querySelector('input') as HTMLInputElement;
const put = () => api.calls.filter((c) => c.method === 'PUT').pop()!;
const field = (label: string) => [...dialog().querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')!.textContent!.startsWith(label))!;

describe('the account menu', () => {
  it('opens Notifications in a dialog, and gives the focus back to the account key when it closes', async () => {
    api = fakeApi({ 'GET /v1/notifications': READ });
    const el = mount(<AppBar route={{ place: 'home' }} onSignOut={() => {}} />);
    const key = el.querySelector('.account-key') as HTMLButtonElement;
    click(key);
    const item = [...el.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === 'Notifications') as HTMLElement;
    expect(item).toBeTruthy();
    click(item);
    await settle();
    expect(el.querySelector('.menu-account')).toBeNull();
    expect(dialog().querySelector('h2')!.textContent).toBe('Notifications');
    expect(document.activeElement!.textContent).toBe('Cancel');
    click(keyNamed(dialog(), 'Cancel'));
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(key);
  });
});

describe('Notifications', () => {
  it('shows the settings: the server of the front as the placeholder, a saved token with Remove, the switches, and quiet hours', async () => {
    api = fakeApi({ 'GET /v1/notifications': { ...READ, off: 'The front has no ntfy server yet. Write one, or ask an admin.' } });
    mount(<Notifications onClose={() => {}} />);
    await settle();
    expect(dialog().querySelector('.notify-off')!.textContent!.trim()).toBe('The front has no ntfy server yet. Write one, or ask an admin.');
    expect((fieldOf(dialog(), 'Server') as HTMLInputElement).placeholder).toBe('https://ntfy.example.org');
    expect((field('Topic').querySelector('input') as HTMLInputElement).value).toBe('alice-duties');
    expect(dialog().querySelector('.notify-token')!.textContent).toBe('A token is saved.Remove');
    expect(fieldOf(dialog(), 'Token')).toBeNull();
    expect([sw('Questions').checked, sw('Failures').checked, sw('A daily digest').checked]).toEqual([true, true, false]);
    expect(sw('Questions').getAttribute('role')).toBe('switch');
    expect(sw('Hold notifications at night').checked).toBe(false);
    expect(fieldOf(dialog(), 'From')).toBeNull();
    click(sw('Hold notifications at night'));
    expect((fieldOf(dialog(), 'From') as HTMLInputElement).value).toBe('22:00');
    expect((fieldOf(dialog(), 'Time zone') as unknown as HTMLSelectElement).value).toBe(ZONE);
  });

  it('saves a new topic, removes the token, keeps quiet hours, and closes', async () => {
    let closed = false;
    api = fakeApi({ 'GET /v1/notifications': READ, 'PUT /v1/notifications': (c: Call) => ({ body: { ...(c.body as object), serverDefault: READ.serverDefault } }) });
    mount(<Notifications onClose={() => (closed = true)} />);
    await settle();
    typeIn(field('Topic').querySelector('input'), 'alice-night');
    click(keyNamed(dialog(), 'Remove'));
    expect(fieldOf(dialog(), 'Token')).toBeTruthy();
    expect(dialog().textContent).toContain('The saved token goes when you save.');
    click(sw('A daily digest'));
    click(sw('Hold notifications at night'));
    typeIn(fieldOf(dialog(), 'To'), '06:30');
    click(keyNamed(dialog(), 'Save'));
    await settle();
    expect(put().body).toEqual({
      ntfy: { server: '', topic: 'alice-night', token: '' },
      send: { questions: true, failures: true, digest: true },
      quietHours: { from: '22:00', to: '06:30', timeZone: ZONE },
    } satisfies NotifySettings);
    expect(closed).toBe(true);
  });

  it('keeps the saved token unless the person writes a new one', async () => {
    api = fakeApi({ 'GET /v1/notifications': READ, 'PUT /v1/notifications': (c: Call) => ({ body: c.body }) });
    mount(<Notifications onClose={() => {}} />);
    await settle();
    click(keyNamed(dialog(), 'Save'));
    await settle();
    expect((put().body as NotifySettings).ntfy.token).toBe('set');
    unmountAll();
    mount(<Notifications onClose={() => {}} />);
    await settle();
    click(keyNamed(dialog(), 'Remove'));
    typeIn(fieldOf(dialog(), 'Token'), 'tk_secret');
    expect((fieldOf(dialog(), 'Token') as HTMLInputElement).type).toBe('password');
    click(keyNamed(dialog(), 'Save'));
    await settle();
    expect((put().body as NotifySettings).ntfy.token).toBe('tk_secret');
  });

  it('shows a problem of the front beside its field, and one with no path above the fields', async () => {
    api = fakeApi({ 'GET /v1/notifications': READ, 'PUT /v1/notifications': () => ({ status: 400, body: { detail: 'bad', problems: ['ntfy.server: The front cannot reach this server.', 'Too many changes today.'] } }) });
    let closed = false;
    mount(<Notifications onClose={() => (closed = true)} />);
    await settle();
    typeIn(fieldOf(dialog(), 'Server'), 'https://ntfy.lab');
    click(keyNamed(dialog(), 'Save'));
    await settle();
    expect(fieldOf(dialog(), 'Server')!.closest('label')!.querySelector('.field-error')!.textContent).toBe('The front cannot reach this server.');
    expect(dialog().querySelector('.notify-form > .duty-problems')!.textContent).toBe('Too many changes today.');
    expect(closed).toBe(false);
  });

  it('sends a test and says what happened, and saves a change first', async () => {
    let n = 0;
    api = fakeApi({
      'GET /v1/notifications': READ,
      'PUT /v1/notifications': (c: Call) => ({ body: c.body }),
      'POST /v1/notifications/test': () => (++n === 1 ? { body: { sent: true } } : { status: 502, body: { error: 'the ntfy server answered 401 unauthorized' } }),
    });
    mount(<Notifications onClose={() => {}} />);
    await settle();
    click(keyNamed(dialog(), 'Send a test'));
    await settle();
    expect(api.calls.filter((c) => c.method === 'PUT').length).toBe(0);
    expect(dialog().querySelector('.notify-said')!.textContent).toBe('Sent. Look for it on your phone.');
    typeIn(field('Topic').querySelector('input'), 'alice-new');
    click(keyNamed(dialog(), 'Send a test'));
    await settle();
    // The change goes first, so the test reaches the new topic.
    const calls = api.calls.filter((c) => c.method !== 'GET').map((c) => c.method + ' ' + c.path);
    expect(calls).toEqual(['POST /v1/notifications/test', 'PUT /v1/notifications', 'POST /v1/notifications/test']);
    const said = dialog().querySelector('.notify-said')!;
    expect(said.textContent).toBe('The test failed. The ntfy server answered 401 unauthorized.');
    expect(said.getAttribute('role')).toBe('status');
  });

  it('says so when the workbench sends no notifications', async () => {
    api = fakeApi({});
    mount(<Notifications onClose={() => {}} />);
    await settle();
    expect(dialog().textContent).toContain('This workbench sends no notifications.');
    expect((keyNamed(dialog(), 'Save') as HTMLButtonElement).disabled).toBe(true);
  });
});
