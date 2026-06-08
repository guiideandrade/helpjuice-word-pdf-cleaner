// 14 transform passes in pipeline order (SPECS.md §10).
// Each pass returns { name, count, detail } describing what it changed.
import { isAttrAllowed, isSafeUrl } from './attr-policy.js';

// ─── Pass 1: Word namespace tags ─────────────────────────────────────────────
export function removeWordNamespaceTags(doc) {
  const NS = ['o:', 'w:', 'v:', 'm:'];
  let count = 0;
  Array.from(doc.body.getElementsByTagName('*')).forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (NS.some(ns => tag.startsWith(ns))) { el.remove(); count++; }
  });
  return { name: 'Remove Word namespace tags', count };
}

// ─── Pass 2: WordSection divs + style/script/comments ────────────────────────
export function removeWordArtifacts(doc) {
  let count = 0;

  doc.querySelectorAll('div').forEach(div => {
    const s = (div.getAttribute('style') || '').replace(/\s/g, '').toLowerCase();
    if (/page:\s*wordsection/i.test(s)) {
      const parent = div.parentNode;
      if (!parent) return;
      while (div.firstChild) parent.insertBefore(div.firstChild, div);
      div.remove();
      count++;
    }
  });

  doc.querySelectorAll('style, script').forEach(el => { el.remove(); count++; });

  const removeComments = n => {
    for (let i = n.childNodes.length - 1; i >= 0; i--) {
      const c = n.childNodes[i];
      if (c.nodeType === 8) { n.removeChild(c); count++; }
      else if (c.nodeType === 1) removeComments(c);
    }
  };
  removeComments(doc.body);

  return { name: 'Remove Word artifacts (WordSection divs, style/script, comments)', count };
}

// ─── Pass 3: Security — strip dangerous schemes + on* handlers ───────────────
export function securityStrip(doc) {
  let count = 0;
  const dangerousScheme = v => {
    if (!v) return false;
    const lower = v.trim().toLowerCase();
    return lower.startsWith('javascript:') ||
           lower.startsWith('vbscript:') ||
           lower.startsWith('data:image/svg') ||  // SVG can carry inline script
           (lower.startsWith('data:') && !lower.startsWith('data:image/'));
  };

  doc.querySelectorAll('[href],[src]').forEach(el => {
    ['href', 'src'].forEach(attr => {
      const val = el.getAttribute(attr);
      if (val && dangerousScheme(val)) { el.removeAttribute(attr); count++; }
    });
  });

  Array.from(doc.body.querySelectorAll('*')).forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.toLowerCase().startsWith('on')) { el.removeAttribute(attr.name); count++; }
    });
  });

  return { name: 'Security: strip dangerous schemes and event handlers', count };
}

// ─── Pass 4: Semantic tag conversion ─────────────────────────────────────────
const SEMANTIC_MAP = {
  b: 'strong', i: 'em',
  font: null, center: null, big: null, small: null, tt: null, strike: null, s: null,
};

export function semanticConversion(doc) {
  let count = 0;
  Object.entries(SEMANTIC_MAP).forEach(([from, to]) => {
    doc.querySelectorAll(from).forEach(el => {
      if (to) {
        const replacement = doc.createElement(to);
        Array.from(el.childNodes).forEach(c => replacement.appendChild(c.cloneNode(true)));
        el.replaceWith(replacement);
      } else {
        // deprecated element — unwrap, keep children
        const parent = el.parentNode;
        if (!parent) return;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
      }
      count++;
    });
  });
  return { name: 'Semantic tag conversion (b→strong, i→em, deprecated unwrap)', count };
}

// ─── Pass 5: Selective span unwrap ───────────────────────────────────────────
function spanHasMeaningfulAttr(span) {
  for (const attr of span.attributes) {
    const n = attr.name.toLowerCase();
    if (n === 'lang' || n.startsWith('aria-') || n.startsWith('data-') || n === 'role') return true;
    if (n === 'class') {
      // drop Word junk classes, keep others
      const val = attr.value;
      if (val && !/^(Mso|Normal|Default|Apple-)/i.test(val)) return true;
    }
  }
  return false;
}

export function selectiveSpanUnwrap(doc) {
  let count = 0;
  for (let i = 0; i < 5; i++) {
    let removed = false;
    doc.querySelectorAll('span').forEach(span => {
      if (spanHasMeaningfulAttr(span)) return;
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      span.remove();
      count++;
      removed = true;
    });
    if (!removed) break;
  }
  doc.body.normalize();
  return { name: 'Selective span unwrap (kept aria/lang/role spans)', count };
}

// ─── Pass 6: Underline normalization ─────────────────────────────────────────
export function normalizeUnderlineRuns(doc) {
  let count = 0;
  doc.querySelectorAll('u').forEach(u => {
    if (!u.parentNode) return;
    // Merge only directly-adjacent <u> runs; move children (don't flatten to text,
    // which would destroy nested markup like <u><a href>link</a></u>).
    let next = u.nextSibling;
    while (next && next.nodeType === 1 && next.tagName === 'U') {
      while (next.firstChild) u.appendChild(next.firstChild);
      const rm = next;
      next = next.nextSibling;
      rm.remove();
      count++;
    }
  });
  return { name: 'Normalize underline runs (merge adjacent <u>)', count };
}

// ─── Pass 7: Heading cleanup ──────────────────────────────────────────────────
export function cleanHeadings(doc) {
  let linksRemoved = 0;
  let emptiesRemoved = 0;
  let h1Found = 0;
  let skippedLevels = [];

  // Strip links from headings
  doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    h.querySelectorAll('a').forEach(a => {
      while (a.firstChild) a.parentNode.insertBefore(a.firstChild, a);
      a.remove();
      linksRemoved++;
    });
  });

  // Remove empty headings
  doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    if (!(h.textContent || '').trim()) { h.remove(); emptiesRemoved++; }
  });

  // Detect H1 in body (Helpjuice uses article title as H1)
  h1Found = doc.querySelectorAll('h1').length;

  // Detect skipped heading levels
  const levels = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .map(h => parseInt(h.tagName[1]));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      skippedLevels.push(`H${levels[i - 1]}→H${levels[i]}`);
    }
  }

  const detail = [
    linksRemoved && `${linksRemoved} heading link(s) stripped`,
    emptiesRemoved && `${emptiesRemoved} empty heading(s) removed`,
    h1Found && `${h1Found} H1 found in body (Helpjuice uses title as H1)`,
    skippedLevels.length && `Skipped levels: ${skippedLevels.join(', ')}`,
  ].filter(Boolean).join('; ');

  return {
    name: 'Heading cleanup (strip links, remove empties, flag H1/skipped levels)',
    count: linksRemoved + emptiesRemoved,
    detail,
    meta: { h1Found, skippedLevels },
  };
}

// ─── Pass 8: List conversion + p-in-li + br-br→p ─────────────────────────────
function getBulletLevel(text) {
  const t = text.trim();
  if (/^[•●○■▪▫◦‣⁃∙·]/.test(t)) return 1;
  // Only treat 'o' as sub-bullet if it comes from mso-list context or followed by space
  if (/^o\s/.test(t) && !/^[a-zA-Z]/.test(t.slice(2))) return 2;
  if (/^[§■]/.test(t)) return 3;
  return 0;
}

function getOrderedLevel(text) {
  const t = text.trim();
  if (/^\d+\./.test(t)) return { level: 1, type: '1' };
  if (/^[a-z]\./.test(t)) return { level: 2, type: 'a' };
  if (/^(i{1,3}|iv|v|vi{1,3}|ix|x)\./i.test(t)) return { level: 3, type: 'i' };
  return null;
}

function stripBulletPrefix(html) {
  return html.trim()
    .replace(/^(&middot;|·)\s*/i, '')
    .replace(/^[•●○■▪▫◦‣⁃∙·]\s*/, '')
    .replace(/^o\s+/, '')
    .replace(/^[§■]\s*/, '')
    .trim();
}

export function convertLists(doc) {
  let listsCreated = 0;
  const blocks = Array.from(doc.body.querySelectorAll('p, div'));
  let currentRootList = null;
  let currentRootIsOrdered = false;
  let lastLiPerLevel = { 1: null, 2: null, 3: null };
  let lastLevel = 0;

  function resetCtx() {
    currentRootList = null;
    currentRootIsOrdered = false;
    lastLiPerLevel = { 1: null, 2: null, 3: null };
    lastLevel = 0;
  }

  for (const elem of blocks) {
    if (!elem.parentNode) continue;
    const text = (elem.textContent || '').trim();
    if (!text) { resetCtx(); continue; }

    const bulletLevel = getBulletLevel(text);
    const orderedInfo = bulletLevel === 0 ? getOrderedLevel(text) : null;
    if (!bulletLevel && !orderedInfo) { resetCtx(); continue; }

    const level = bulletLevel || orderedInfo.level;
    const isOrdered = !!orderedInfo;
    const orderedType = orderedInfo?.type;
    const parent = elem.parentNode;

    if (!currentRootList || isOrdered !== currentRootIsOrdered) {
      const list = doc.createElement(isOrdered ? 'ol' : 'ul');
      if (isOrdered && orderedType) list.setAttribute('type', orderedType);
      parent.insertBefore(list, elem);
      currentRootList = list;
      currentRootIsOrdered = isOrdered;
      lastLiPerLevel = { 1: null, 2: null, 3: null };
      lastLevel = 0;
      listsCreated++;
    }

    if (level < lastLevel) {
      for (let l = level + 1; l <= 3; l++) lastLiPerLevel[l] = null;
    }
    lastLevel = level;

    let targetParent;
    if (level === 1) {
      targetParent = currentRootList;
    } else {
      const parentLi = lastLiPerLevel[level - 1] || lastLiPerLevel[1];
      if (!parentLi) {
        targetParent = currentRootList;
      } else {
        let nested = parentLi.querySelector(':scope > ul, :scope > ol');
        if (!nested) {
          nested = doc.createElement(isOrdered ? 'ol' : 'ul');
          if (isOrdered && orderedType) nested.setAttribute('type', orderedType);
          parentLi.appendChild(nested);
        }
        targetParent = nested;
      }
    }

    const li = doc.createElement('li');
    let contentHTML = elem.innerHTML.trim();
    if (bulletLevel) {
      contentHTML = stripBulletPrefix(contentHTML);
    } else if (orderedInfo) {
      contentHTML = contentHTML.replace(/^(\d+\.|[a-z]\.|(i{1,3}|iv|v|vi{1,3}|ix|x)\.)\s*/i, '');
    }
    li.innerHTML = contentHTML;
    targetParent.appendChild(li);
    lastLiPerLevel[level] = li;
    elem.remove();
  }

  // Unwrap <p> inside <li>
  let pInLi = 0;
  doc.querySelectorAll('li > p').forEach(p => {
    const li = p.parentNode;
    while (p.firstChild) li.insertBefore(p.firstChild, p);
    p.remove();
    pInLi++;
  });

  // Double-<br> paragraph breaks are surfaced by the `double-br-as-paragraph`
  // validator with a one-click `br-to-p` autofix. We deliberately do NOT collapse
  // them here — silently deleting both <br>s merged adjacent lines with no break.

  return {
    name: 'List conversion, p-in-li unwrap',
    count: listsCreated,
    detail: [
      listsCreated && `${listsCreated} list(s) created`,
      pInLi && `${pInLi} <p>-in-<li> unwrapped`,
    ].filter(Boolean).join('; '),
  };
}

// ─── Pass 9: Table accessibility ─────────────────────────────────────────────
export function fixTables(doc) {
  let count = 0;

  doc.querySelectorAll('table').forEach(tbl => {
    // Set border-style:solid (v1 behavior carried over)
    tbl.style.borderStyle = 'solid';

    // Promote first row of <td>s to <th scope="col"> when no <th> exists
    if (!tbl.querySelector('th')) {
      const firstRow = tbl.querySelector('tr');
      if (firstRow) {
        Array.from(firstRow.querySelectorAll('td')).forEach(td => {
          const th = doc.createElement('th');
          th.setAttribute('scope', 'col');
          th.innerHTML = td.innerHTML;
          Array.from(td.attributes).forEach(a => {
            if (a.name !== 'scope') th.setAttribute(a.name, a.value);
          });
          td.replaceWith(th);
          count++;
        });
        // Wrap in thead if not already
        if (!firstRow.parentElement?.matches('thead')) {
          const thead = doc.createElement('thead');
          firstRow.parentNode.insertBefore(thead, firstRow);
          thead.appendChild(firstRow);
          count++;
        }
      }
    }

    // Add border to td elements
    tbl.querySelectorAll('td').forEach(td => { td.style.borderStyle = 'solid'; });
  });

  return { name: 'Table accessibility (thead promotion, border-style)', count };
}

// ─── Pass 10: Images ──────────────────────────────────────────────────────────
export function fixImages(doc) {
  let unwrapped = 0;
  let decorated = 0;

  // Unwrap single-image tables → <figure> + <figcaption>
  const candidates = [
    ...doc.querySelectorAll('table'),
    ...doc.querySelectorAll('figure.table'),
  ];
  candidates.forEach(container => {
    if (!container.parentNode) return;
    const imgs = container.querySelectorAll('img');
    if (imgs.length !== 1) return;

    // Check for caption text
    let captionText = '';
    const altCompact = (imgs[0].getAttribute('alt') || '').replace(/\s/g, '');
    container.querySelectorAll('td, th, caption').forEach(cell => {
      const raw = (cell.textContent || '').trim();
      const compact = raw.replace(/\s/g, '');
      if (compact && compact !== altCompact) captionText = raw;
    });

    const imgClone = imgs[0].cloneNode(true);
    if (captionText) {
      const figure = doc.createElement('figure');
      figure.appendChild(imgClone);
      const figcaption = doc.createElement('figcaption');
      figcaption.textContent = captionText;
      figure.appendChild(figcaption);
      container.parentNode.replaceChild(figure, container);
    } else {
      container.parentNode.replaceChild(imgClone, container);
    }
    unwrapped++;
  });

  // Add loading="lazy" decoding="async" to all images
  doc.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
    decorated++;
  });

  return {
    name: 'Image fixes (single-image table → figure, loading/decoding attrs)',
    count: unwrapped + decorated,
    detail: [
      unwrapped && `${unwrapped} image table(s) unwrapped`,
      decorated && `${decorated} image(s) got loading/decoding attrs`,
    ].filter(Boolean).join('; '),
  };
}

// ─── Pass 11: Per-element attribute policy ────────────────────────────────────
export function applyAttrPolicy(doc) {
  let count = 0;
  doc.body.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const n = attr.name.toLowerCase();
      // Validate href/src schemes regardless of element
      if ((n === 'href' || n === 'src') && !isSafeUrl(attr.value)) {
        el.removeAttribute(attr.name);
        count++;
        return;
      }
      if (!isAttrAllowed(el.tagName, n)) {
        el.removeAttribute(attr.name);
        count++;
      }
    });
  });
  return { name: 'Apply per-element attribute policy', count };
}

// ─── Pass 12: Style scrub (keep structural, drop cosmetic) ───────────────────
const COSMETIC_PROPS = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'color', 'background', 'background-color', 'background-image',
  'line-height', 'letter-spacing', 'word-spacing', 'text-transform',
  'text-shadow', 'text-indent', 'text-align',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'vertical-align', 'float', 'display', 'overflow', 'visibility', 'opacity',
  'white-space', 'word-break', 'word-wrap',
  'page-break-after', 'page-break-before', 'page',
  'mso-line-height-rule', 'mso-pagination', 'mso-margin-top-alt',
  'mso-outline-level', 'tab-stops', 'list-style',
];

export function scrubStyles(doc) {
  let count = 0;
  doc.querySelectorAll('[style]').forEach(el => {
    const tag = el.tagName.toLowerCase();

    if (tag === 'table' || tag === 'td') {
      const border = el.style.borderStyle;
      el.removeAttribute('style');
      if (border) el.style.borderStyle = border;
      count++;
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const lst = el.style.listStyleType;
      el.removeAttribute('style');
      if (lst) el.style.listStyleType = lst;
      count++;
      return;
    }

    COSMETIC_PROPS.forEach(prop => el.style.removeProperty(prop));
    if (!el.getAttribute('style')?.trim()) { el.removeAttribute('style'); count++; }
  });
  return { name: 'Style scrub (keep border-style, list-style-type)', count };
}

// ─── Pass 13: Remove empty elements ──────────────────────────────────────────
export function removeEmptyElements(doc) {
  let count = 0;
  for (let iter = 0; iter < 8; iter++) {
    let removed = false;
    doc.querySelectorAll('p, div').forEach(el => {
      const hasText = (el.textContent || '').replace(/\s+/g, '').trim();
      const hasBlock = el.querySelector('img,iframe,video,table,ul,ol,figure,h1,h2,h3,h4,h5,h6');
      if (!hasText && !hasBlock) { el.remove(); removed = true; count++; }
    });
    if (!removed) break;
  }
  return { name: 'Remove empty <p>/<div>', count };
}

// ─── Pass 14: DOM-aware whitespace normalize (skip pre/code) ─────────────────
export function normalizeWhitespace(doc) {
  let count = 0;
  const SKIP = new Set(['pre', 'code', 'textarea', 'script', 'style']);

  function walk(node) {
    if (node.nodeType === 3) { // text node
      // Only collapse if ancestor is not a skip element
      const newVal = node.nodeValue.replace(/\s+/g, ' ');
      if (newVal !== node.nodeValue) { node.nodeValue = newVal; count++; }
    } else if (node.nodeType === 1) {
      if (SKIP.has(node.tagName.toLowerCase())) return;
      Array.from(node.childNodes).forEach(walk);
    }
  }
  walk(doc.body);

  // Also fix &nbsp; — replace with real space
  doc.body.innerHTML = doc.body.innerHTML.replace(/&nbsp;/g, ' ');

  return { name: 'Whitespace normalize (skip pre/code)', count };
}

// ─── Link hygiene (runs as part of pass 3 extension) ────────────────────────
export function fixLinks(doc) {
  let relAdded = 0;
  let stripped = 0;
  let unwrapped = 0;

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = (a.getAttribute('href') || '').trim();

    // Unwrap empty href
    if (!href) {
      const parent = a.parentNode;
      while (a.firstChild) parent.insertBefore(a.firstChild, a);
      a.remove();
      unwrapped++;
      return;
    }

    // Add rel="noopener noreferrer" to external links
    const isExternal = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');
    if (isExternal) {
      const rel = a.getAttribute('rel') || '';
      const parts = rel.split(/\s+/).filter(Boolean);
      let changed = false;
      if (!parts.includes('noopener')) { parts.push('noopener'); changed = true; }
      if (!parts.includes('noreferrer')) { parts.push('noreferrer'); changed = true; }
      if (changed) { a.setAttribute('rel', parts.join(' ')); relAdded++; }
    }
  });

  return {
    name: 'Link hygiene (rel=noopener, unwrap empty hrefs)',
    count: relAdded + stripped + unwrapped,
    detail: [
      relAdded && `${relAdded} link(s) got rel="noopener noreferrer"`,
      unwrapped && `${unwrapped} empty-href anchor(s) unwrapped`,
    ].filter(Boolean).join('; '),
  };
}
