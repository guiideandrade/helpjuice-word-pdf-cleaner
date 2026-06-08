// Final safety net (SPECS §9 / HANDOFF Q2). Runs DOMPurify over the fully
// transformed output as a last-resort sanitizer, after all explicit passes.
// USE_PROFILES.html restricts output to HTML (no SVG/MathML), which complements
// the explicit data:image/svg strip in the security pass.
import DOMPurify from 'dompurify';

const CONFIG = {
  USE_PROFILES: { html: true },
  // Non-standard attributes our transforms intentionally add/keep.
  ADD_ATTR: ['loading', 'decoding', 'target'],
  FORBID_TAGS: ['style'],
  // data-* are preserved by the attr policy; keep them through the net too.
  ALLOW_DATA_ATTR: true,
};

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, CONFIG);
}
