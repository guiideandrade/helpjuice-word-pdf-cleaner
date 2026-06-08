// Read-only validation pass — runs after all transforms (SPECS.md §2).
// Returns an array of Finding objects; never mutates the DOM.
//
// Finding shape:
// { rule, severity, category, message, nodes, autofixable }

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
    autofix: 'add-empty-alt',
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

function linkExternalNoRel(doc) {
  const bad = Array.from(doc.querySelectorAll('a[href]')).filter(a => {
    const href = a.getAttribute('href') || '';
    const isExt = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');
    if (!isExt) return false;
    const rel = (a.getAttribute('rel') || '').split(/\s+/);
    return !rel.includes('noopener') || !rel.includes('noreferrer');
  });
  if (!bad.length) return null;
  return {
    rule: 'link-external-no-rel',
    severity: 'high',
    category: 'security',
    message: `${bad.length} external link(s) missing rel="noopener noreferrer"`,
    nodes: bad,
    autofixable: true,
    autofix: 'add-rel',
  };
}

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
  const DEPRECATED = ['font', 'center', 'big', 'small', 'tt', 'strike', 's', 'u'];
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
    message: `${bad.length} table(s) have no caption`,
    nodes: bad,
    autofixable: false,
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
  // Find adjacent <br> pairs that act as paragraph breaks
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

// ─── Auto-fix implementations ─────────────────────────────────────────────────
export const AUTOFIXES = {
  'add-empty-alt': (nodes) => nodes.forEach(n => n.setAttribute('alt', '')),
  'remove': (nodes) => nodes.forEach(n => n.remove()),
  'demote-h1': (nodes, doc) => nodes.forEach(n => {
    const h2 = doc.createElement('h2');
    h2.innerHTML = n.innerHTML;
    n.replaceWith(h2);
  }),
  'add-rel': (nodes) => nodes.forEach(a => {
    const rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
    if (!rel.includes('noopener')) rel.push('noopener');
    if (!rel.includes('noreferrer')) rel.push('noreferrer');
    a.setAttribute('rel', rel.join(' '));
  }),
  'strip-href': (nodes) => nodes.forEach(a => a.removeAttribute('href')),
  'unwrap': (nodes) => nodes.forEach(n => {
    const parent = n.parentNode;
    if (!parent) return;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    n.remove();
  }),
  'semantic-convert': (nodes, doc) => nodes.forEach(n => {
    const tag = n.tagName.toLowerCase() === 'b' ? 'strong' : 'em';
    const el = doc.createElement(tag);
    el.innerHTML = n.innerHTML;
    n.replaceWith(el);
  }),
  'unwrap-deprecated': (nodes) => nodes.forEach(n => {
    const parent = n.parentNode;
    if (!parent) return;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    n.remove();
  }),
  'br-to-p': (nodes, doc) => nodes.forEach(br => {
    if (!br.parentNode) return;
    const next = br.nextSibling;
    if (next && next.nodeType === 1 && next.tagName === 'BR') next.remove();
    const p = doc.createElement('p');
    p.innerHTML = '<br>';
    br.parentNode.replaceChild(p, br);
  }),
};

// ─── Run all validators ────────────────────────────────────────────────────────
const RULES = [
  imgMissingAlt,
  imgLocalSrc,
  imgDataUri,
  headingSkippedLevel,
  headingEmpty,
  headingH1InBody,
  linkExternalNoRel,
  linkJsOrDataHref,
  linkEmptyHref,
  linkPoorAnchorText,
  deprecatedElement,
  presentationalBoldItalic,
  tableNoHeaders,
  tableNoCaption,
  pInsideLi,
  doubleBrAsParagraph,
];

export function validate(doc) {
  return RULES.map(fn => fn(doc)).filter(Boolean);
}

export function applyAutofix(finding, doc) {
  const fixFn = AUTOFIXES[finding.autofix];
  if (!fixFn) return false;
  fixFn(finding.nodes, doc);
  return true;
}
