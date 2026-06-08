# Changelog

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
