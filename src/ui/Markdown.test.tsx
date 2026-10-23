import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { Markdown } from './common';
import { StepText } from './Thread';
import { bridge, fakeFetch, mount, unmountAll } from './testkit-b';

afterEach(unmountAll);

describe('the links of a message', () => {
  it('names a known bridge by its title and opens it, and leaves the text of the wiki alone', () => {
    act(() => store.dispatch({ type: 'bridges', bridges: [bridge('01m5kpw79kyq9j8nbpnhvtwm95', 'Release notes for 2.4')] }));
    const el = mount(<Markdown text="The bridge is open: `01m5kpw79kyq9j8nbpnhvtwm95`." refs />);
    const a = el.querySelector('a')!;
    expect(a.textContent).toBe('Release notes for 2.4');
    expect(a.getAttribute('href')).toBe('#bridge/01m5kpw79kyq9j8nbpnhvtwm95');
    // A page of the wiki is no message: it keeps the id as code.
    expect(mount(<Markdown text="`01m5kpw79kyq9j8nbpnhvtwm95`" />).querySelector('a')).toBeNull();
  });

  it('reads the list of the wiki once, and then links the paths of the pages that it holds', async () => {
    const f = fakeFetch([['GET', /^\/v1\/pages$/, () => ({ pages: [{ path: 'k3s/runbook.md', title: 'R', version: 1, by: 'x', at: '', size: 1, hash: 'h' }] })]]);
    try {
      const el = mount(<Markdown text="See `k3s/runbook.md` and `docs/other.md`." refs />);
      mount(<Markdown text="Also `k3s/runbook.md`." refs />);
      await vi.waitFor(() => expect(el.querySelector('a')).not.toBeNull());
      expect(f.calls.filter((c) => c.path === '/v1/pages').length).toBe(1);
      const a = el.querySelector('a')!;
      expect(a.getAttribute('href')).toBe('#pages/k3s/runbook.md');
      expect(a.querySelector('code')!.textContent).toBe('k3s/runbook.md');
      expect(el.querySelectorAll('a').length).toBe(1);
    } finally {
      f.restore();
    }
  });
});

describe('the line of a step', () => {
  it('links the bridge that a call opened, with the title that the page knows, else the title of the call', () => {
    const step = { key: 's', at: '', text: 'Opened the bridge', bridge: 'br-new', target: 'Runbooks', worded: true };
    expect(mount(<StepText step={step} />).querySelector('a')!.textContent).toBe('Runbooks');
    act(() => store.dispatch({ type: 'bridges', bridges: [bridge('br-new', 'Runbooks for the new roles')] }));
    const a = mount(<StepText step={step} />).querySelector('a')!;
    expect([a.textContent, a.getAttribute('href')]).toEqual(['Runbooks for the new roles', '#bridge/br-new']);
  });

  it('says a failure in its words, and adds Error only to a step whose words do not say it', () => {
    expect(mount(<StepText step={{ key: 's', at: '', text: 'Did not open the bridge', target: 'Runbooks', isError: true, worded: true }} />).textContent).toBe('Did not open the bridge Runbooks');
    expect(mount(<StepText step={{ key: 's', at: '', text: 'Used recall', isError: true }} />).textContent).toBe('Used recall Error');
  });
});
