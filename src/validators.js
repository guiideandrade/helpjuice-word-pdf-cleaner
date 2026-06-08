// Read-only validation pass — runs after all transforms (SPECS.md §2).
// Returns an array of Finding objects; never mutates the DOM.
//
// Finding shape:
// { rule, severity, category, message, nodes, autofixable, autofix?, fixOptions?, needsInput? }
//
// fixOptions: [{ label, fix }] — renders multiple fix buttons instead of one.
// needsInput: true — report.js renders an <input> whose value is passed to applyAutofix.

const POOR_ANCHOR_TEXTS = [
  'click here', 'here', 'read more', 'more', 'link', 'this link',
  'click', 'go here', 'learn more',
];

// ─── Individual rule functions ────────────────────────────────────────────────

function imgMissingAlt(doc) {
  const bad = Array.from(doc.querySelectorAll('img')).filter(img => !img.hasAttribute('alt'));
  if (!bad.length) return null;
  return {
    rule: 'img-missing-alt',
    severity: 'high',
    category: 'seo',
    message: `${bad.length} image(s) missing alt text`,
    nodes: bad,
    autofixable: true,
    // Two fix paths: author confirms decorative (alt="") vs. needs description (placeholder).
    fixOptions: [
      { label: 'Mark decorative (alt="")', fix: 'mark-decorative' },
      { label: 'Add placeholder', fix: 'add-placeholder-alt' },
    ],
  };
}

function imgLocalSrc(doc) {
  const bad = Array.from(doc.querySelectorAll('img[src]')).filter(img => {
    const src = img.getAttribute('src') || '';
    return src.startsWith('file://') || /^[A-Za-z]:\\/.test(src) || src.startsWith('\\\\');
  });
  if (!bad.length) return null;
  return {
    rule: 'img-local-src',
    severity: 'high',
    category: 'html',
    message: `${bad.length} image(s) have local file paths (file:// or C:\\) — re-upload required`,
    nodes: bad,
    autofixable: false,
  };
}

function imgDataUri(doc) {
  const bad = Array.from(doc.querySelectorAll('img[src]')).filter(img =>
    (img.getAttribute('src') || '').startsWith('data:image/')
  );
  if (!bad.length) return null;
  const bytes = bad.reduce((sum, img) => sum + Math.round(img.getAttribute('src').length * 0.75), 0);
  const kb = Math.round(bytes / 1024);
  return {
    rule: 'img-data-uri',
    severity: 'medium',
    category: 'performance',
    message: `${bad.length} image(s) embedded as data URIs (~${kb} KB) — consider hosting separately`,
    nodes: bad,
    autofixable: false,
  };
}

// AUDIT §1.4 — Word exports pixel values that may reflect document DPI/zoom, not target layout.
function imgFixedDimensions(doc) {
  const bad = Array.from(doc.querySelectorAll('img[width], img[height]'));
  if (!bad.length) return null;
  return {
    rule: 'img-fixed-dimensions',
    severity: 'low',
    category: 'performance',
    message: `${bad.length} image(s) have fixed width/height attributes from Word — verify they match your KB layout, or remove them to scale fluidly`,
    nodes: bad,
    autofixable: true,
    autofix: 'strip-dimensions',
  };
}

function headingSkippedLevel(doc) {
  const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const skips = [];
  for (let i = 1; i < headings.length; i++) {
    const prev = parseInt(headings[i - 1].tagName[1]);
    const cur = parseInt(headings[i].tagName[1]);
    if (cur - prev > 1) skips.push(headings[i]);
  }
  if (!skips.length) return null;
  return {
    rule: 'heading-skipped-level',
    severity: 'medium',
    category: 'seo',
    message: `${skips.length} heading(s) skip a level (e.g. H2→H4) — fix for SEO hierarchy`,
    nodes: skips,
    autofixable: false,
  };
}

function headingEmpty(doc) {
  const bad = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .filter(h => !(h.textContent || '').trim());
  if (!bad.length) return null;
  return {
    rule: 'heading-empty',
    severity: 'medium',
    category: 'html',
    message: `${bad.length} empty heading(s)`,
    nodes: bad,
    autofixable: true,
    autofix: 'remove',
  };
}

function headingH1InBody(doc) {
  const bad = Array.from(doc.querySelectorAll('h1'));
  if (!bad.length) return null;
  return {
    rule: 'heading-h1-in-body',
    severity: 'medium',
    category: 'seo',
    message: `${bad.length} H1 in body — Helpjuice renders the article title as H1; demote to H2`,
    nodes: bad,
    autofixable: true,
    autofix: 'demote-h1',
  };
}

// (Removed link-external-no-rel validator: the fixLinks transform unconditionally
// adds rel="noopener noreferrer" to every external link in-pipeline, so this rule
// could never fire. The fixLinks guarantee is covered by a test instead.)

function linkJsOrDataHref(doc) {
  const bad = Array.from(doc.querySelectorAll('a[href]')).filter(a => {
    const h = (a.getAttribute('href') || '').trim().toLowerCase();
    return h.startsWith('javascript:') || h.startsWith('vbscript:') || h.startsWith('data:');
  });
  if (!bad.length) return null;
  return {
    rule: 'link-js-or-data-href',
    severity: 'high',
    category: 'security',
    message: `${bad.length} link(s) with dangerous href scheme (javascript:/data:/vbscript:)`,
    nodes: bad,
    autofixable: true,
    autofix: 'strip-href',
  };
}

function linkEmptyHref(doc) {
  const bad = Array.from(doc.querySelectorAll('a')).filter(a => {
    const href = a.getAttribute('href');
    return href !== null && !href.trim();
  });
  if (!bad.length) return null;
  return {
    rule: 'link-empty-href',
    severity: 'low',
    category: 'html',
    message: `${bad.length} anchor(s) with empty href`,
    nodes: bad,
    autofixable: true,
    autofix: 'unwrap',
  };
}

function linkPoorAnchorText(doc) {
  const bad = Array.from(doc.querySelectorAll('a')).filter(a => {
    const text = (a.textContent || '').trim().toLowerCase();
    return !text || POOR_ANCHOR_TEXTS.includes(text);
  });
  if (!bad.length) return null;
  return {
    rule: 'link-poor-anchor-text',
    severity: 'medium',
    category: 'seo',
    message: `${bad.length} link(s) have poor anchor text ("click here", empty, etc.)`,
    nodes: bad,
    autofixable: false,
  };
}

function deprecatedElement(doc) {
  const DEPRECATED = ['font', 'center', 'big', 'small', 'tt', 'strike', 's'];
  const bad = Array.from(doc.querySelectorAll(DEPRECATED.join(',')));
  if (!bad.length) return null;
  const byTag = {};
  bad.forEach(el => { byTag[el.tagName.toLowerCase()] = (byTag[el.tagName.toLowerCase()] || 0) + 1; });
  const summary = Object.entries(byTag).map(([t, n]) => `${n}×<${t}>`).join(', ');
  return {
    rule: 'deprecated-element',
    severity: 'medium',
    category: 'html',
    message: `Deprecated elements still present: ${summary}`,
    nodes: bad,
    autofixable: true,
    autofix: 'unwrap-deprecated',
  };
}

function presentationalBoldItalic(doc) {
  const bad = Array.from(doc.querySelectorAll('b, i'));
  if (!bad.length) return null;
  return {
    rule: 'presentational-bold-italic',
    severity: 'medium',
    category: 'seo',
    message: `${bad.length} presentational <b>/<i> element(s) — convert to <strong>/<em>`,
    nodes: bad,
    autofixable: true,
    autofix: 'semantic-convert',
  };
}

function tableNoHeaders(doc) {
  const bad = Array.from(doc.querySelectorAll('table')).filter(t => !t.querySelector('th'));
  if (!bad.length) return null;
  return {
    rule: 'table-no-headers',
    severity: 'medium',
    category: 'a11y',
    message: `${bad.length} table(s) have no header cells (<th>)`,
    nodes: bad,
    autofixable: false,
  };
}

function tableNoCaption(doc) {
  const bad = Array.from(doc.querySelectorAll('table')).filter(t => !t.querySelector('caption'));
  if (!bad.length) return null;
  return {
    rule: 'table-no-caption',
    severity: 'medium',
    category: 'a11y',
    message: `${bad.length} table(s) have no caption — describe what the table contains`,
    nodes: bad,
    autofixable: true,
    autofix: 'add-caption',
    needsInput: true,
    inputPlaceholder: bad.length === 1 ? 'Enter caption text...' : 'Caption text (applied to all tables)...',
  };
}

function pInsideLi(doc) {
  const bad = Array.from(doc.querySelectorAll('li > p'));
  if (!bad.length) return null;
  return {
    rule: 'p-inside-li',
    severity: 'low',
    category: 'html',
    message: `${bad.length} <p> element(s) directly inside <li>`,
    nodes: bad,
    autofixable: true,
    autofix: 'unwrap',
  };
}

function doubleBrAsParagraph(doc) {
  const bad = Array.from(doc.querySelectorAll('br')).filter(br => {
    const next = br.nextSibling;
    return next && next.nodeType === 1 && next.tagName === 'BR';
  });
  if (!bad.length) return null;
  return {
    rule: 'double-br-as-paragraph',
    severity: 'medium',
    category: 'html',
    message: `${bad.length} double-<br> sequence(s) used as paragraph breaks`,
    nodes: bad,
    autofixable: true,
    autofix: 'br-to-p',
  };
}

// AUDIT §4.4 — <u> in HTML5 means "unarticulated annotation", not visual underline.
// Word uses it purely for styling; it looks like a link but is not one.
function uVisualUnderline(doc) {
  const bad = Array.from(doc.querySelectorAll('u'));
  if (!bad.length) return null;
  return {
    rule: 'u-visual-underline',
    severity: 'low',
    category: 'a11y',
    message: `${bad.length} <u> element(s) — HTML5 <u> means "annotation", not underline; Word uses it purely for styling, which can be mistaken for a link by readers`,
    nodes: bad,
    autofixable: false,
  };
}

// ─── Auto-fix implementations ─────────────────────────────────────────────────
export const AUTOFIXES = {
  // img-missing-alt: two paths selected by the user in the report panel
  'mark-decorative':    (nodes) => nodes.forEach(n => n.setAttribute('alt', '')),
  'add-placeholder-alt':(nodes) => nodes.forEach(n => n.setAttribute('alt', '[describe this image]')),

  'remove':             (nodes) => nodes.forEach(n => n.remove()),
  'demote-h1':          (nodes, doc) => nodes.forEach(n => {
    const h2 = doc.createElement('h2');
    h2.innerHTML = n.innerHTML;
    n.replaceWith(h2);
  }),
  'strip-href':         (nodes) => nodes.forEach(a => a.removeAttribute('href')),
  // Q4: remove Word's fixed pixel dimensions so images scale fluidly to the KB's CSS.
  'strip-dimensions':   (nodes) => nodes.forEach(n => { n.removeAttribute('width'); n.removeAttribute('height'); }),
  'unwrap':             (nodes) => nodes.forEach(n => {
    const parent = n.parentNode;
    if (!parent) return;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    n.remove();
  }),
  'semantic-convert':   (nodes, doc) => nodes.forEach(n => {
    const tag = n.tagName.toLowerCase() === 'b' ? 'strong' : 'em';
    const el = doc.createElement(tag);
    el.innerHTML = n.innerHTML;
    n.replaceWith(el);
  }),
  'unwrap-deprecated':  (nodes) => nodes.forEach(n => {
    const parent = n.parentNode;
    if (!parent) return;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    n.remove();
  }),
  'br-to-p':            (nodes, doc) => nodes.forEach(br => {
    if (!br.parentNode) return;
    const next = br.nextSibling;
    if (next && next.nodeType === 1 && next.tagName === 'BR') next.remove();
    const p = doc.createElement('p');
    p.innerHTML = '<br>';
    br.parentNode.replaceChild(p, br);
  }),
  // inputValue is the caption text typed by the user in the report panel input field.
  'add-caption':        (nodes, doc, inputValue) => nodes.forEach(table => {
    if (table.querySelector('caption')) return;
    const caption = doc.createElement('caption');
    caption.textContent = (inputValue || '').trim() || 'Table';
    table.insertBefore(caption, table.firstChild);
  }),
};

// ─── Run all validators ────────────────────────────────────────────────────────
const RULES = [
  imgMissingAlt,
  imgLocalSrc,
  imgDataUri,
  imgFixedDimensions,
  headingSkippedLevel,
  headingEmpty,
  headingH1InBody,
  linkJsOrDataHref,
  linkEmptyHref,
  linkPoorAnchorText,
  deprecatedElement,
  presentationalBoldItalic,
  tableNoHeaders,
  tableNoCaption,
  pInsideLi,
  doubleBrAsParagraph,
  uVisualUnderline,
];

export function validate(doc) {
  return RULES.map(fn => fn(doc)).filter(Boolean);
}

// inputValue is only used for rules with needsInput: true (currently: add-caption).
export function applyAutofix(finding, doc, inputValue) {
  const fixFn = AUTOFIXES[finding.autofix];
  if (!fixFn) return false;
  fixFn(finding.nodes, doc, inputValue);
  return true;
}

export function applyFixOption(fixKey, nodes, doc) {
  const fixFn = AUTOFIXES[fixKey];
  if (!fixFn) return false;
  fixFn(nodes, doc);
  return true;
}

// ─── Q5: block-inside-inline reflow detector (raw-input scan) ─────────────────
// Word emits invalid nesting like <b><div>text</div></b>. DOMParser silently
// reflows this into valid HTML, usually splitting the inline element, so the
// cleaned structure can differ from what was pasted. This scans the *raw* string
// (before parsing) and warns. It runs in pipeline.js, not in the DOM RULES list.
const INLINE_TAGS = new Set([
  'a', 'b', 'i', 'em', 'strong', 'u', 'span', 'small', 'sub', 'sup', 'mark',
  'abbr', 'cite', 'code', 'q', 's', 'strike', 'font', 'label', 'big', 'tt',
]);
const BLOCK_TAGS = new Set([
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table',
  'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'blockquote', 'section',
  'article', 'aside', 'header', 'footer', 'figure', 'figcaption', 'pre', 'hr',
]);
const VOID_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'col', 'area', 'base',
  'source', 'track', 'wbr',
]);

export function detectBlockInInline(rawHtml) {
  if (!rawHtml) return null;
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  const stack = [];
  let m;
  let hits = 0;
  while ((m = tagRe.exec(rawHtml))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClose = m[3] === '/' || VOID_TAGS.has(tag);
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === tag) { stack.length = i; break; }
      }
    } else if (!selfClose) {
      if (BLOCK_TAGS.has(tag) && stack.some(t => INLINE_TAGS.has(t))) hits++;
      stack.push(tag);
    }
  }
  if (!hits) return null;
  return {
    rule: 'block-inside-inline',
    severity: 'medium',
    category: 'html',
    message: `${hits} block element(s) nested inside inline element(s) in the source (e.g. <div> inside <b>). The browser silently reflows this, so the cleaned structure may differ from what you pasted — review the output.`,
    nodes: [],
    autofixable: false,
  };
}
