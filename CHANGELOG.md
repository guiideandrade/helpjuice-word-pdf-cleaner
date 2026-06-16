# Changelog

## v2.3.0 — 2026-06-16

### Added
- **Automatic table borders** (`fixTables`). Every table + `thead` + every `th`/`td` now gets a 1px solid `#ccc` border, `border-collapse: collapse`, cell padding, and stable `hj-cleaned-table` / `hj-cleaned-cell` classes. Header cells (`th`) are bordered too (previously skipped).
- **Froala / CKEditor target toggle** (UI). Table-border output is tuned per editor (Phase-0 round-trip findings): Froala (Legacy) keeps inline styles verbatim → emits the exact 1px `border-width`; CKEditor (Rich Text, default) strips inline `border-width` regardless of form, so it emits `border-style`+`border-color` and leans on the `hj-cleaned-*` classes for the exact width via theme CSS. Switching the toggle re-cleans. Default is CKEditor.

### Fixed
- **Borders now survive the pipeline.** `applyAttrPolicy` (pass 11) used to strip the `style` attribute before `scrubStyles` (pass 12) could preserve it, so `fixTables`' borders never reached the output. `style` + `class` are now allowed on `table`/`th`/`td`, and `scrubStyles` is the single gatekeeper — it keeps a strict border/padding/`border-collapse` allow-list and drops everything else (so allowing `style` is not a CSS-injection vector). Word's own table classes are replaced, not appended.

## v2.2.0 — 2026-06-16

### Changed
- **List nesting now reads Word's `mso-list` level** (`convertLists`). Level comes from the paragraph's `mso-list:lN levelM` inline style (authoritative; survives to pass 8), while ordered-vs-unordered still comes from the marker glyph. This fixes sub-bullets that the glyph-only heuristic missed (e.g. Word's level-2 `o ` marker) without reintroducing the Portuguese-`o` false-positive: a paragraph with no `mso-list` marker is never treated as a bullet on the strength of a leading `o`. Plain glyph bullets (PDF paste, no `mso-list`) still convert via the fallback path.
- **Marker stripping consumes Word's trailing spacing** — `stripBulletPrefix`/new `stripOrderedPrefix` now strip the `&nbsp;`/entity run Word leaves after a marker, so `·&nbsp;&nbsp; Text` becomes `Text`.

## v2.1.2 — 2026-06-08

### Changed
- Deployment is now manual instead of GitHub Actions. Removed `.github/workflows/deploy.yml` (the account's Actions are billing-locked); added an `npm run deploy` script that builds and pushes `dist/` to the `gh-pages` branch via `npx gh-pages`. Pages source = `gh-pages` branch.
- Added `public/.nojekyll` so Pages serves the build as-is.

## v2.1.1 — 2026-06-08

### Added
- GitHub Actions workflow (`.github/workflows/deploy.yml`): runs tests + build on every PR; builds and deploys `dist/` to GitHub Pages on push to `main`.
- Test asserting `fixLinks` adds `rel="noopener noreferrer"` to every external link.

### Removed
- Dead `link-external-no-rel` validator and its `add-rel` autofix — `fixLinks` already adds `rel` to every external link in-pipeline, so the rule could never fire (17 validation rules now).

### Changed
- `getOrderedLevel`: documented the deliberate lone-`i.`/`v.`/`x.` → alpha-level-2 choice (multi-char romans still route to level 3).

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

### Changed
- Attribute policy: `style` no longer globally allowed; structural properties kept via dedicated scrub pass
- Span unwrap: selective rather than unconditional (v1 stripped all spans)

### Architecture
- Modular ES modules (`src/pipeline.js`, `transforms.js`, `validators.js`, `report.js`, `attr-policy.js`)
- Deployable as a static file to GitHub Pages; no server required

---

## v1 (word-pdf-cleaner-v5-1) — pre-2026-06-01

Original single-file tool by Kenan Sehovic (removed from the tree on 2026-06-15; recoverable via git history). See `AUDIT.md` for the full issue inventory that drove the v2 rewrite.
