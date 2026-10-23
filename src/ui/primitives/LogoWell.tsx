// LogoWell is the 44-pixel square at the top of the app bar. It shows the
// logo of the organization that runs the platform. Without a logo, it shows
// the monogram of the name of the organization, as a nameplate set into the
// chassis. Without a name, it shows the monogram of bossmode in a quiet
// ink. The well never shows a dashed edge or a picture that stands in for
// a logo, because both read as a page that is not finished.

/** monogramOf takes the first letter of each of the first two words of a name, in capitals, such as EO for Example Org. */
export function monogramOf(name: string): string {
  const words = String(name || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => [...w][0].toLocaleUpperCase())
    .join('');
}

export function LogoWell({ src, name, href = '#' }: { src?: string; name?: string; href?: string }) {
  const label = name || 'bossmode';
  const letters = monogramOf(label) || 'B';
  return (
    <a class="logo-well" href={href} aria-label={label + ', home'} title={label}>
      {src ? (
        <span class="well has-logo">
          <img src={src} alt="" draggable={false} />
        </span>
      ) : (
        <span class={'well monogram' + (name ? '' : ' quiet') + (letters.length > 1 ? ' two' : '')} aria-hidden="true">
          {letters}
        </span>
      )}
    </a>
  );
}
