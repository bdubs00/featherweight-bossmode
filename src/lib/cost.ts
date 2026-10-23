// The words of a cost in dollars. A cost below one cent never reads $0.00,
// because a run that cost something did not cost nothing: it reads under
// $0.01. Every figure of cost on the page takes its words from here.

/** costParts splits a cost into a quiet lead word and the figure: under and $0.01, or no lead and $0.14. */
export function costParts(usd: number): { lead: string; n: string } {
  if (!Number.isFinite(usd) || usd <= 0) return { lead: '', n: '$0.00' };
  if (usd < 0.01) return { lead: 'under', n: '$0.01' };
  return { lead: '', n: '$' + usd.toFixed(2) };
}

/** costText is a cost as one string, such as $0.14 or under $0.01. */
export function costText(usd: number): string {
  const p = costParts(usd);
  return (p.lead ? p.lead + ' ' : '') + p.n;
}
