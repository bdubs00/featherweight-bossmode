// LogoWell is the 44-pixel square at the top of the app bar, for the logo of
// the organization that runs the platform. Until the theme names a logo, it
// shows a dashed edge and a neutral mark, so the place reads as empty and
// not as broken.

import { Glyph } from '../icons';

export function LogoWell({ src, name, href = '#' }: { src?: string; name?: string; href?: string }) {
  return (
    <a class="logo-well" href={href} aria-label={(name || 'bossmode') + ', home'} title={name || 'bossmode'}>
      <span class={'well' + (src ? ' has-logo' : '')}>{src ? <img src={src} alt="" draggable={false} /> : <Glyph name="logo" size={22} />}</span>
    </a>
  );
}
