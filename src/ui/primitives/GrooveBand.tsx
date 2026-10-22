// GrooveBand is the one ornament of the page: an 8-pixel band of fine
// horizontal grooves, a 1-pixel line every 4 pixels, under the header of a
// pane or a card. It marks where a surface starts, as the grip of a panel.

export function GrooveBand({ on = 'paper' }: { on?: 'paper' | 'card' }) {
  return <div class={'groove groove-' + on} aria-hidden="true" />;
}
