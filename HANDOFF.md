# Word/PDF Cleaner v2 — Scope Questions (Resolved)

The five open questions from the original handoff were resolved on 2026-06-08. Each is recorded below with its decision and what shipped. The defects found during review (underline flatten, caption spacing, double-`<br>`, SVG data URI) were fixed separately in v2.0.1.

---

## Q1 — Helpjuice class allow-list (AUDIT §6.7 / SPECS §11.5) — **WON'T FIX**

**Decision:** Keep stripping `class` from every element. Word junk classes (`MsoNormal`, etc.) and genuinely-meaningful Helpjuice classes are too entangled to distinguish safely, and an allow-list adds maintenance burden for little gain. Re-cleaning already-cleaned content is not a supported workflow.

If incremental re-cleaning ever becomes a real need, revisit by adding a `HELPJUICE_CLASS_ALLOW` set to `attr-policy.js` with an explicit, curated list.

---

## Q2 — DOMPurify as final safety net (SPECS §11.4) — **DONE (v2.1.0)**

**Decision:** Introduce a Vite + npm build and a `dompurify` dependency.

Shipped:
- `src/sanitize.js` — DOMPurify runs as pipeline step 16 (HTML-only profile, so SVG/MathML are dropped), the last-resort net after all explicit passes.
- Vitest test suite (`tests/`, jsdom) — regression tests for the four v2.0.1 defects plus Q4/Q5 and the sanitizer.
- `vite-plugin-singlefile` build → a single self-contained `dist/index.html` that works from `file://` as well as any static host.

---

## Q3 — PDF ingestion (SPECS §11.3) — **SCOPED OUT (no backend)**

**Decision:** No backend. "Convert the PDF to HTML first, then paste" is the permanent workflow, now stated explicitly at the top of the README. The tool stays 100% client-side. The batch-cleaning / audit-history / clean-on-import service ideas from SPECS §9 Option B are not pursued.

---

## Q4 — `srcset`/`sizes` for responsive images (AUDIT §1.7) — **DONE (different approach)**

**Decision:** True `srcset` needs resized image variants the client can't produce (and we ruled out a backend in Q3). Instead, the `img-fixed-dimensions` validator is now auto-fixable: a one-click **`strip-dimensions`** fix removes Word's fixed `width`/`height` so images scale fluidly to the KB's own CSS. The warning still fires first so the author can choose.

---

## Q5 — Block-inside-inline silent reflow (AUDIT §6.6) — **DONE**

**Decision:** Warn. `detectBlockInInline()` in `validators.js` scans the **raw** input string (before `DOMParser` reflows it) for block tags nested inside inline tags (e.g. `<div>` inside `<b>`) and emits a medium-severity `block-inside-inline` finding. The pipeline prepends it so the author knows the cleaned structure may differ from what they pasted. Void elements (`<img>`, `<br>`) inside inline are correctly ignored.
