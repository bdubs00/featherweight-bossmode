import { describe, expect, it } from 'vitest';
import { costParts, costText } from './cost';

describe('costText', () => {
  it('never says $0.00 for a cost below one cent', () => {
    expect(costText(0.0042)).toBe('under $0.01');
    expect(costParts(0.0042)).toEqual({ lead: 'under', n: '$0.01' });
  });

  it('shows cents from one cent up, and $0.00 for no cost', () => {
    expect(costText(0.01)).toBe('$0.01');
    expect(costText(0.144)).toBe('$0.14');
    expect(costText(12.5)).toBe('$12.50');
    expect(costText(0)).toBe('$0.00');
  });
});
