# Word/PDF Cleaner

Client-side HTML cleaner that takes raw HTML pasted from Word/PDF and produces Helpjuice-ready output. The cleaning runs entirely in the browser - no server, no data leaves the page.

> **PDF note:** browsers can't parse PDF binaries client-side. Convert the PDF to HTML first (e.g. open in Word/Docs and copy, or any PDF→HTML export), then paste. This is the intended, permanent workflow - there is no backend.

## Develop

```sh
npm install
npm run dev      # Vite dev server with HMR
npm test         # Vitest unit tests (jsdom) — pipeline + autofixes + sanitizer
npm run build    # → dist/index.html (single inlined file)
```

Paste Word/PDF HTML into the left pane. The tool auto-cleans on paste and renders a report panel with issues grouped by severity. Auto-fixable issues have a one-click fix button. The Copy Clean button is gated on high-severity findings.

Use the **Target editor** toggle to match the Helpjuice editor you'll paste into. It tunes how table borders are emitted: **Froala** (Legacy) keeps inline styles, so the cleaner emits an exact 1px border; **CKEditor** (Rich Text, the default) strips inline `border-width`, so the cleaner emits `border-style`/`border-color` plus the `hj-cleaned-table`/`hj-cleaned-cell` classes for the exact width via theme CSS. Switching the toggle re-cleans the current input.

## Hosting

`npm run build` produces a single self-contained `dist/index.html` (all JS/CSS inlined via `vite-plugin-singlefile`). It works from any static host **and** from a plain `file://` URL.

### Deploy to GitHub Pages (manual)

```sh
npm run deploy
```

This builds and force-pushes `dist/` to the **`gh-pages`** branch (via `gh-pages`, run through `npx` — no permanent dependency). The empty `public/.nojekyll` is copied into the build so Pages serves the files as-is.

One-time setup: in the repo settings, set **Pages → Build and deployment → Source** to **Deploy from a branch → `gh-pages` / `/ (root)`**.

> Deploy is intentionally manual (no GitHub Actions). Run `npm run deploy` after merging changes to `main`. To host elsewhere, serve the built `dist/index.html` from any static server.

## Architecture

```
index.html            UI shell (markup + styles); loads src/main.js
src/
├── main.js           UI controller — event bindings, clean/report/copy flow
├── pipeline.js       Orchestrator — 14 transform passes → validate → DOMPurify net
├── transforms.js     14 named, single-responsibility transform passes
├── validators.js     17 validation rules + autofixes + block-in-inline detector
├── report.js         Report panel renderer + copy gate
├── attr-policy.js    Per-element attribute allow-list + URL scheme validator
└── sanitize.js       DOMPurify final safety net (HTML-only profile)
tests/                Vitest fixtures (regression + Q4/Q5 + sanitizer)
```

### Pipeline order

1. Remove Word namespace tags (`o:`, `w:`, `v:`, `m:`)
2. Remove Word artifacts (WordSection divs, style/script tags, HTML comments)
3. Security: strip `javascript:`/`vbscript:`/`data:image/svg`/unsafe-data URIs + `on*` handlers
4. Link hygiene: add `rel="noopener noreferrer"`, unwrap empty-href anchors
5. Semantic conversion: `<b>` → `<strong>`, `<i>` → `<em>`, unwrap deprecated elements
6. Selective span unwrap (keep `lang`/`aria-*`/`role` spans)
7. Normalize underline runs (merge adjacent `<u>`, preserving nested markup)
8. Heading cleanup: strip `<a>` from headings, remove empties, detect H1 + skipped levels
9. List conversion: bullet/OL detection, `<p>`-in-`<li>` unwrap (double-`<br>` → `<p>` is surfaced as a one-click report fix, not collapsed silently)
10. Table accessibility: promote `<thead>`, add `border-style`
11. Image fixes: single-image tables → `<figure>/<figcaption>`, add `loading`/`decoding`
12. Apply per-element attribute policy (SPECS.md §8)
13. Style scrub: keep `border-style`, `list-style-type`; drop all cosmetic Word styles
14. Remove empty `<p>`/`<div>`
15. DOM-aware whitespace normalize (skips `<pre>`/`<code>`)
16. **DOMPurify final safety net** (HTML-only profile — strips anything the explicit passes missed)
17. Validate (read-only) + raw-input block-inside-inline scan → findings
18. Render report + gate Copy Clean button

## Related

- `SPECS.md` (in the parent toolkit) — full v2 design document
- `AUDIT.md` (in the parent toolkit) — what v1 gets wrong and why
- [HANDOFF.md](HANDOFF.md) — resolved scope questions
