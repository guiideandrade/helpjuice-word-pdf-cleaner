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
import { validate } from './validators.js';

// Returns { html, transforms, findings }
export function runPipeline(rawHtml) {
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
    fixTables(doc),                  // 9
    fixImages(doc),                  // 10
    applyAttrPolicy(doc),            // 11
    scrubStyles(doc),                // 12
    removeEmptyElements(doc),        // 13
    normalizeWhitespace(doc),        // 14
  ];

  // 15: Validate (read-only)
  const findings = validate(doc);

  // Serialize output
  const html = doc.body.innerHTML.trim();

  return { html, transforms, findings, doc };
}
