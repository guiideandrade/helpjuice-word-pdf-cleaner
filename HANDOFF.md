# Word/PDF Cleaner v2 — Open Questions

Decisions needed before closing the remaining gaps from AUDIT.md and SPECS.md.

---

## Q1 — Helpjuice class allow-list (AUDIT §6.7 / SPECS §11.5)

**Gap:** `class` is stripped from every element. v1 did the same, but this means two things break:
1. Content that already has Helpjuice-specific classes (callout boxes, code blocks, custom components) is destroyed if re-cleaned.
2. The tool can never be used incrementally — any previously cleaned content re-cleaned loses its class structure.

SPECS §11.5 deliberately defers this: *"which class values are Helpjuice-meaningful and should survive vs. which are Word junk (MsoNormal)?"*

**Question:** Which `class` values should the cleaner preserve? Provide a list (e.g. `callout`, `code-block`, `note`, `warning`) and v2 will add them to a `HELPJUICE_CLASS_ALLOW` set in `attr-policy.js`. Everything not on the list (including `MsoNormal`, `MsoBodyText`, `MsoListParagraph`, etc.) continues to be stripped.

---

## Q2 — DOMPurify as final safety net (SPECS §11.4)

**Gap:** v2 makes security explicit (strips `javascript:`, `on*` handlers, etc.) but has no final sanitizer pass. A sufficiently crafted paste could still produce unsafe output if a transform has a gap.

SPECS §9 says: *"Optional: run output through DOMPurify as a final safety net if a build step is introduced."*

**Question:** Is it acceptable to introduce a build step (e.g. Vite + npm) and a single `dompurify` dependency? This would unlock:
- DOMPurify as a last-resort sanitizer after all transforms
- Vitest unit tests per transform pass (testable with fixed input/output fixtures as SPECS §1 describes)
- Bundled single-file output (no ES module HTTP requirement, works as `file://`)

Alternative: keep zero dependencies — accept the security trade-off, document it in the README.

---

## Q3 — PDF ingestion (SPECS §11.3)

**Gap:** The tool name says "PDF" but v2 (like v1) only works if something upstream has already converted PDF to HTML. Real PDF→HTML requires a backend process (LibreOffice headless, `pdf2html`, etc.).

SPECS §9 Option B describes a thin Node service that would unlock batch cleaning, saved audit history, and a Helpjuice API integration to clean-on-import.

**Question:** Is real PDF support worth building a backend? Or is *"convert to HTML first, then paste"* the permanent workflow? If a backend is wanted, the churn-analytics Fly.io + Vitest pattern from `projects/churn-analytics/` applies directly.

---

## Q4 — `srcset`/`sizes` for responsive images (AUDIT §1.7)

**Gap:** Output images always have a single `src`. Word exports pixel dimensions tuned to document DPI; on HiDPI or mobile these will be blurry or wasteful.

**Question:** Is generating or prompting for `srcset`/`sizes` in scope for the cleaner? This likely requires either a backend (to produce resized variants) or an upload step to Helpjuice storage that returns multiple URLs. If out of scope permanently, AUDIT §1.7 can be closed as "won't fix" and documented.

---

## Q5 — Block-inside-inline silent reflow (AUDIT §6.6)

**Gap:** Word HTML can produce structures like `<b><div>text</div></b>`. The browser's `DOMParser` silently reflows these into valid HTML, but the reflow often splits the inline element and produces orphaned tags. v2 inherits this behavior silently.

**Question:** Should v2 detect and warn when the input contains block-inside-inline nesting (which means the cleaned output may not match the input structure)? A validator rule could scan for this before the parse. Or is silent DOMParser reflow acceptable for this tool's use case?
