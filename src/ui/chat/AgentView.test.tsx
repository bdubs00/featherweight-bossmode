// The agent view of the chat-first page names the person who wrote a note,
// made an entry of the journal, or turned the switch. A write of the
// static token, by person:token, reads Admin token.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../../state/store';
import { forgetDuties } from '../../state/duties';
import { forgetAgents } from '../../state/agents';
import { fakeApi, mount, settle, unmountAll } from '../testkit-c';
import { forgetChatData } from './data';
import { AgentView } from './AgentView';

let api: ReturnType<typeof fakeApi> | null = null;

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();

beforeEach(() => {
  forgetDuties();
  forgetAgents();
  forgetChatData();
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'token', kind: 'token' }, roles: { triage: 'owner' }, admin: true, canCreate: true } });
    store.dispatch({ type: 'agents', agents: [{ name: 'triage', role: 'owner' }] });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
  api = null;
});

describe('the agent view', () => {
  it('names a write of the static token Admin token: a note, an entry of the journal, an undo, and the switch', async () => {
    api = fakeApi({
      'GET /v1/knowhow/journal?agent=triage&limit=10': {
        entries: [
          { id: 'j1', at: at(5), agent: 'triage', what: 'undone', subject: { note: 'gotchas/vpn.md', scope: 'agent' }, why: 'A person took back a change of the note gotchas/vpn.md (learned).', by: 'person:token' },
          { id: 'j2', at: at(9), agent: 'triage', what: 'learned', subject: { note: 'gotchas/vpn.md', scope: 'agent' }, why: 'Three runs failed on the short name.', by: 'review' },
          { id: 'j3', at: at(12), agent: 'triage', what: 'learned', subject: { note: 'gotchas/dns.md', scope: 'agent' }, why: 'The agent wrote this note in a run.', by: 'agent' },
        ],
      },
      'GET /v1/knowhow/notes?agent=triage': { notes: [{ agent: 'triage', scope: { kind: 'agent' }, name: 'gotchas/vpn.md', hash: 'h', state: 'checked', description: 'The portal needs its full name.', by: 'person:token', at: at(5), uses: 1, sources: 1 }] },
      'GET /v1/knowhow/settings/triage': { agent: 'triage', askFirst: true, by: 'person:token', at: at(3) },
      'GET /v1/routines': { routines: [] },
    });
    const el = mount(<AgentView name="triage" />);
    await settle();
    const rows = [...el.querySelectorAll('.cf-asec')].find((s) => s.querySelector('h2')!.textContent === 'What it learned')!.querySelectorAll('.cf-alist li');
    expect(rows[0].textContent).toContain('by Admin token, ');
    expect(rows[1].textContent).toContain('by the after-work review, ');
    // The agent itself goes without saying on its own page.
    expect(rows[2].textContent).not.toContain(' by ');
    expect(el.querySelector('.cf-notes li')!.textContent).toContain('by Admin token');
    expect(el.querySelector('.cf-switch-by')!.textContent).toMatch(/^Turned on by Admin token, /);
    expect(el.textContent).not.toContain('person:token');
  });
});
