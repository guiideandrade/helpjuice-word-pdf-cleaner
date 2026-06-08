# Changelog

## v2.1.0 — 2026-06-08

Resolves the five HANDOFF scope questions.

### Added
- **Build toolchain** — Vite + npm. `npm run dev` (HMR), `npm run build` → a single inlined `dist/index.html` (`vite-plugin-singlefile`) that works from `file://`, `npm test` (Vitest, jsdom).
- **DOMPurify final safety net** (Q2) — `src/sanitize.js` runs DOMPurify (HTML-only profile, no SVG/MathML) as the last pipeline step, after all explicit passes.
- **Vitest test suite** — regression coverage for the four v2.0.1 defects plus Q4/Q5 and the sanitizer.
- **`strip-dimensions` autofix** (Q4) — `img-fixed-dimensions` is now one-click fixable; removes Word's fixed `width`/`height` so images scale fluidly.
- **Block-inside-inline detector** (Q5) — `detectBlockInInline()` scans the raw input for block tags nested in inline tags (`<div>` inside `<b>`) and warns that `DOMParser` will silently reflow the structure.

### Changed
- UI controller extracted from inline `index.html` script into `src/main.js` (so Vite bundles it).
- Post-autofix re-serialization now also runs through the DOMPurify net.

### Decisions
- Q1 (class allow-list): won't fix — keep stripping all classes.
- Q3 (PDF backend): scoped out — "convert to HTML first, then paste" is permanent; no backend.

## v2.0.1 — 2026-06-08

### Fixed
- Underline normalization no longer flattens nested markup — `<u><a>link</a></u>` keeps its link instead of being reduced to plain text
- `<figcaption>` from single-image tables keeps original spacing (was stripping `&nbsp;` characters from the caption text)
- Double-`<br>` paragraph breaks are no longer silently deleted by the list pass (which merged adjacent lines); they are surfaced by the `double-br-as-paragraph` validator with a one-click `br-to-p` fix
- Security: `data:image/svg+xml` URIs are now stripped from `href`/`src` (SVG can carry inline `<script>`/event handlers)

## v2.0.0 — 2026-06-08

Complete rewrite. Ground-up transform + validate + report pipeline.

### Added
- 14 named, single-responsibility transform passes in SPECS.md §10 pipeline order
- 18 validation rules covering SEO, accessibility, security, HTML validity, and performance
- Report panel with per-finding auto-fix buttons and severity-gated copy gate
- Per-element attribute policy replacing v1's 8-item flat allow-list
- `<b>`/`<i>` → `<strong>`/`<em>` semantic conversion
- Selective span unwrap — preserves `lang`, `aria-*`, `role` spans
- Single-image table → `<figure>`/`<figcaption>` (v1 discarded captions)
- `loading="lazy"` and `decoding="async"` on all images
- `rel="noopener noreferrer"` added to external links
- `<a name="">` preserved (v1 stripped it, silently breaking bookmarks)
- `colspan`, `rowspan`, `scope`, `headers`, `lang`, `type`, `cite` all preserved
- `<thead>` promotion when table has no header row
- DOM-aware whitespace normalizer that skips `<pre>`/`<code>` (v1 collapsed code blocks)
- `<ol type>` no longer destroyed after being set (v1 bug: policy ran after list creation)
- Stricter sub-bullet `o`-word detection (v1 false-positived on Portuguese articles)
- Decorative-image fix flow: two-button choice (mark decorative vs. add placeholder alt)
- Inline caption input field in report for tables missing `<caption>`
- `<u>` visual-underline validator warning (HTML5 `<u>` is not a styling element)
- Fixed-dimension image validator (Word pixel values may not match KB layout)
- `javascript:`/`vbscript:`/unsafe-`data:` stripped from `href`/`src`
- `on*` event handlers explicitly removed
- `v1/` subfolder preserves original tool by Kenan Sehovic for reference

### Changed
- Attribute policy: `style` no longer globally allowed; structural properties kept via dedicated scrub pass
- Span unwrap: selective rather than unconditional (v1 stripped all spans)

### Architecture
- Modular ES modules (`src/pipeline.js`, `transforms.js`, `validators.js`, `report.js`, `attr-policy.js`)
- Deployable as a static file to GitHub Pages; no server required

---

## v1 (word-pdf-cleaner-v5-1) — pre-2026-06-01

Original single-file tool by Kenan Sehovic. See `v1/index.html` and `AUDIT.md` for full issue inventory.
