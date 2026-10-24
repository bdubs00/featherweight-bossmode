import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { BossConfig, Run } from '../api/types';
import { store } from '../state/store';
import { forgetManagerRun } from '../state/actions';
import { parseRoute } from '../lib/route';
import { askOfRun } from '../lib/duties';
import { ChatMain, forgetChat } from './Chat';
import { Manager } from './Manager';
import { AgentChat } from './Fleet';
import { click, fakeApi, mount, settle, unmountAll } from './testkit-c';

const T = '2026-10-22T09:00:00Z';
const ME = 'alice@example.com';
const CONFIG: BossConfig = { manager: { agent: 'manager', member: 'default/manager-0', run: 'run-m' }, placement: 'queue', maxMembers: 16, chat: { agent: 'chat', member: 'default/manager-0' } };
const runOf = (id: string, agent: string, input?: string): Run => ({ id, agent, state: 'completed', seq: 3, input, principal: ME, createdAt: T, updatedAt: T, member: 'default/manager-0' });
const transcript = (r: Run, text: string) => ({ run: r, items: [{ seq: 1, time: T, kind: 'user', text, who: ME }, { seq: 2, time: T, kind: 'assistant', text: 'Done.' }], next: 0, prev: 0 });

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  forgetChat();
  forgetManagerRun();
  sessionStorage.clear();
  location.hash = '';
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: ME, name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'config', config: CONFIG });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

/** makeDuty opens the menu More of a header and picks Make this a duty. */
function makeDuty(el: HTMLElement): void {
  click(el.querySelector('.pane-head button[aria-label="More"]'));
  click([...el.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === 'Make this a duty'));
}

describe('Make this a duty', () => {
  it('takes the first message of the person in a conversation', () => {
    expect(askOfRun({ input: '  Rotate the logs.  ' }, [])).toBe('Rotate the logs.');
    expect(askOfRun({}, [{ kind: 'assistant', text: 'Hi.' }, { kind: 'user', text: ' ' }, { kind: 'user', text: 'Check the disks.' }])).toBe('Check the disks.');
    expect(askOfRun(undefined, [])).toBe('');
  });

  it('opens New duty from a quick chat with its agent and its first message', async () => {
    const r = runOf('run-chat-1', 'chat', 'Summarize the notes of today.');
    api = fakeApi({ 'GET /v1/runs/run-chat-1': r, 'GET /v1/runs/run-chat-1/transcript': transcript(r, r.input!), 'GET /v1/runs/run-chat-1/result': { runId: r.id, status: 'ready' } });
    act(() => store.dispatch({ type: 'run', run: r }));
    const el = mount(<ChatMain run="run-chat-1" />);
    await settle();
    makeDuty(el);
    expect(parseRoute(location.hash)).toEqual({ place: 'duties', fresh: true, seed: { agent: 'chat', act: 'ask', message: 'Summarize the notes of today.' } });
  });

  it('opens New duty from the manager that asks the manager the same again', async () => {
    const r = runOf('run-m', 'manager');
    api = fakeApi({ 'GET /v1/runs/run-m': r, 'GET /v1/runs/run-m/transcript': transcript(r, 'Check the nightly backups and tell me what failed.'), 'GET /v1/runs/run-m/result': { runId: 'run-m', status: 'ready' }, 'GET /v1/tools': { tools: [] } });
    const el = mount(<Manager />);
    await settle();
    makeDuty(el);
    expect(parseRoute(location.hash)).toEqual({ place: 'duties', fresh: true, seed: { agent: 'manager', act: 'manager', message: 'Check the nightly backups and tell me what failed.' } });
  });

  it('opens New duty from a conversation with an agent of the fleet', async () => {
    const r = runOf('run-b', 'backup', 'Restore last night into the scratch cluster.');
    sessionStorage.setItem('fw.bossmode.agentrun.backup', 'run-b');
    api = fakeApi({ 'GET /v1/runs/run-b': r, 'GET /v1/runs/run-b/transcript': transcript(r, r.input!), 'GET /v1/runs/run-b/result': { runId: 'run-b', status: 'ready' } });
    act(() => store.dispatch({ type: 'run', run: r }));
    const el = mount(<AgentChat agent="backup" />);
    await settle();
    makeDuty(el);
    expect(parseRoute(location.hash)).toEqual({ place: 'duties', fresh: true, seed: { agent: 'backup', act: 'ask', message: 'Restore last night into the scratch cluster.' } });
  });

  it('offers no key before a conversation exists', async () => {
    sessionStorage.clear();
    act(() => store.dispatch({ type: 'config', config: { ...CONFIG, manager: { ...CONFIG.manager!, run: '' } } }));
    api = fakeApi({});
    const el = mount(<AgentChat agent="backup" />);
    await settle();
    expect(el.querySelector('.pane-head button[aria-label="More"]')).toBeNull();
  });
});
