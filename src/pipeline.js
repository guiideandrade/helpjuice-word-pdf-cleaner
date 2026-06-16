// Orchestrator: runs the 14 transform passes then the validation layer (SPECS.md §10).
import {
  removeWordNamespaceTags,
  removeWordArtifacts,
  securityStrip,
  semanticConversion,
  selectiveSpanUnwrap,
  normalizeUnderlineRuns,
  cleanHeadings,
  convertLists,
  fixTables,
  fixImages,
  applyAttrPolicy,
  scrubStyles,
  removeEmptyElements,
  normalizeWhitespace,
  fixLinks,
} from './transforms.js';
import { validate, detectBlockInInline } from './validators.js';
import { sanitizeHtml } from './sanitize.js';

// Returns { html, transforms, findings }
// `editor` selects the table-border output mode: 'froala' (exact inline 1px) or
// 'ckeditor' (style+color inline + class for theme-driven width). Defaults to
// 'ckeditor' (the current Helpjuice default editor).
export function runPipeline(rawHtml, editor = 'ckeditor') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  // Ordered passes per SPECS.md §10
  const transforms = [
    removeWordNamespaceTags(doc),    // 1
    removeWordArtifacts(doc),        // 2
    securityStrip(doc),              // 3a
    fixLinks(doc),                   // 3b link hygiene (rel, empty href)
    semanticConversion(doc),         // 4
    selectiveSpanUnwrap(doc),        // 5
    normalizeUnderlineRuns(doc),     // 6
    cleanHeadings(doc),              // 7
    convertLists(doc),               // 8
    fixTables(doc, editor),          // 9
    fixImages(doc),                  // 10
    applyAttrPolicy(doc),            // 11
    scrubStyles(doc),                // 12
    removeEmptyElements(doc),        // 13
    normalizeWhitespace(doc),        // 14
  ];

  // 15: Validate (read-only)
  const findings = validate(doc);

  // Q5: raw-input scan for block-inside-inline nesting the browser silently
  // reflowed during parse. Prepend so it surfaces near the top of the report.
  const reflow = detectBlockInInline(rawHtml);
  if (reflow) findings.unshift(reflow);

  // 16: Final safety net — DOMPurify over the serialized output (HANDOFF Q2).
  const html = sanitizeHtml(doc.body.innerHTML.trim()).trim();

  return { html, transforms, findings, doc };
}
