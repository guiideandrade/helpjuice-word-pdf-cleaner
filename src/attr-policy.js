// Per-element attribute policy (SPECS.md §8).
// '*' entries apply to every element; prefix entries match by startsWith.
export const ATTR_POLICY = {
  '*':          ['id', 'lang', 'title', 'dir'],
  'a':          ['href', 'rel', 'name', 'target'],
  'img':        ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
  'ol':         ['type', 'start'],
  'ul':         [],
  'li':         [],
  'th':         ['scope', 'colspan', 'rowspan', 'headers'],
  'td':         ['colspan', 'rowspan', 'headers'],
  'table':      ['border'],
  'blockquote': ['cite'],
  'figure':     [],
  'figcaption': [],
  'caption':    [],
  'col':        ['span'],
  'colgroup':   ['span'],
  'thead':      [],
  'tbody':      [],
  'tfoot':      [],
  'tr':         [],
};

// Prefix-based allowances that apply globally.
export const ATTR_PREFIX_ALLOW = ['aria-', 'data-'];

// Schemes that are never allowed in href/src.
// data:image/svg is banned because SVG can carry inline <script>/event handlers.
export const BANNED_SCHEMES = ['javascript:', 'vbscript:', 'data:text/', 'data:application/', 'data:image/svg'];

// data: URIs with these MIME prefixes are allowed (images only).
export const ALLOWED_DATA_MIME = ['data:image/'];

export function isAttrAllowed(tagName, attrName) {
  const tag = tagName.toLowerCase();
  const attr = attrName.toLowerCase();

  // Prefix match (aria-*, data-*)
  if (ATTR_PREFIX_ALLOW.some(p => attr.startsWith(p))) return true;

  // on* handlers explicitly denied
  if (attr.startsWith('on')) return false;

  // Global allow-list
  if (ATTR_POLICY['*']?.includes(attr)) return true;

  // Per-element allow-list
  return (ATTR_POLICY[tag] ?? []).includes(attr);
}

export function isSafeUrl(value) {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  if (BANNED_SCHEMES.some(s => v.startsWith(s))) return false;
  if (v.startsWith('data:') && !ALLOWED_DATA_MIME.some(s => v.startsWith(s))) return false;
  return true;
}
