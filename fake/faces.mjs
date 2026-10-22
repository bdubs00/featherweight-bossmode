// The faces of the fake server. An identicon is a symmetric pattern from the
// hash of the name, in the accent color of the page, as section 4.9 of the
// plan says. Two agents also have a face that a person drew.

import crypto from 'node:crypto';

/** identicon draws a 5 by 5 symmetric pattern from the hash of a name. */
export function identicon(name) {
  const h = crypto.createHash('sha256').update(String(name)).digest();
  const cells = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (h[y * 3 + x] % 2 === 0) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  }
  const rects = cells.map(([x, y]) => `<rect x="${6 + x * 10}" y="${6 + y * 10}" width="10" height="10"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 62" width="62" height="62"><title>${escapeXml(name)}</title><rect width="62" height="62" rx="31" fill="#dceafb"/><g fill="#0066cc">${rects}</g></svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

/** A fox with glasses, for the reviewer. */
export const FOX = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>A fox with glasses</title><circle cx="32" cy="32" r="32" fill="#fde7d4"/><polygon points="12,14 26,24 18,34" fill="#e8742a"/><polygon points="52,14 38,24 46,34" fill="#e8742a"/><path d="M14 30 Q32 12 50 30 L44 46 Q32 56 20 46 Z" fill="#f08a3c"/><path d="M22 40 Q32 52 42 40 L36 48 Q32 51 28 48 Z" fill="#fff"/><circle cx="32" cy="45" r="2.5" fill="#3b2a20"/><circle cx="25" cy="33" r="5" fill="none" stroke="#3b2a20" stroke-width="2"/><circle cx="39" cy="33" r="5" fill="none" stroke="#3b2a20" stroke-width="2"/><line x1="30" y1="33" x2="34" y2="33" stroke="#3b2a20" stroke-width="2"/><circle cx="25" cy="33" r="1.6" fill="#3b2a20"/><circle cx="39" cy="33" r="1.6" fill="#3b2a20"/></svg>`;

/** A calm face with a tie, for the manager. */
export const MANAGER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>The manager</title><circle cx="32" cy="32" r="32" fill="#e6e1fa"/><circle cx="32" cy="27" r="13" fill="#5b4bc4"/><circle cx="27" cy="25" r="2" fill="#fff"/><circle cx="37" cy="25" r="2" fill="#fff"/><path d="M26 31 Q32 36 38 31" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M16 60 Q32 40 48 60 Z" fill="#5b4bc4"/><polygon points="32,44 29,48 32,58 35,48" fill="#f2c94c"/></svg>`;

/**
 * checkSvg applies a short form of the rules of section 6.3. The real
 * sanitizer parses the SVG and writes it again. The fake only refuses what
 * the rules remove, so the page shows the reason of a refusal.
 */
export function checkSvg(text) {
  if (Buffer.byteLength(text) > 32 * 1024) return 'The face holds more than 32 KB.';
  const t = text.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
  if (!/^<svg[\s>]/.test(t)) return 'The face is not an SVG document.';
  const rules = [
    [/<script/i, 'The face holds a script element.'],
    [/<foreignObject/i, 'The face holds a foreignObject element.'],
    [/<(use|image|a)[\s>/]/i, 'The face holds a use, image, or link element.'],
    [/\son[a-z]+\s*=/i, 'The face holds an event attribute.'],
    [/\s(xlink:)?href\s*=/i, 'The face holds an href attribute.'],
    [/url\(|@import|expression\(/i, 'The face holds a style with url, import, or expression.'],
    [/<!ENTITY|<!DOCTYPE/i, 'The face holds an entity or a document type.'],
    [/<\?(?!xml)/i, 'The face holds a processing instruction.'],
  ];
  for (const [re, why] of rules) if (re.test(t)) return why;
  return '';
}
