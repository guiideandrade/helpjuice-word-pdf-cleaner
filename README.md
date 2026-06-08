# Word/PDF Cleaner

Client-side HTML cleaner that takes raw HTML pasted from Word/PDF and produces Helpjuice-ready output. Runs entirely in the browser - no server, no data leaves the page.

## Overview

Two versions live here:

| Folder | Description |
|--------|-------------|
| `v1/`  | Original single-file tool by Kenan Sehovic. Preserved as-is for reference. |
| `v2/`  | Ground-up rewrite: transform + validate + report pipeline per `SPECS.md`. |

## How to use

Open `v2/index.html` via any static HTTP server (required for ES module imports):

```sh
# From the project root
npx serve projects/word-pdf-cleaner/v2
```

Or deploy to GitHub Pages (recommended — see below).

Paste Word/PDF HTML into the left pane. The tool auto-cleans on paste and renders a report panel with issues grouped by severity. Auto-fixable issues have a one-click fix button. The Copy Clean button is gated on high-severity findings.

## Hosting

The tool is 100% static. The recommended host is **GitHub Pages** — no server needed. Point Pages at `projects/word-pdf-cleaner/v2/` on `main`.

> Note: `index.html` uses ES modules (`<script type="module">`), so it must be served over HTTP, not opened as a `file://` URL.

## Architecture (v2)

```
v2/
├── index.html          UI shell + event bindings
└── src/
    ├── pipeline.js     Orchestrator — runs 14 passes then validates
    ├── transforms.js   14 named, single-responsibility transform passes
    ├── validators.js   18 read-only validation rules + auto-fix implementations
    ├── report.js       Report panel renderer + copy gate
    └── attr-policy.js  Per-element attribute allow-list + URL scheme validator
```

### Pipeline order

1. Remove Word namespace tags (`o:`, `w:`, `v:`, `m:`)
2. Remove Word artifacts (WordSection divs, style/script tags, HTML comments)
3. Security: strip `javascript:`/`vbscript:`/unsafe-data URIs + `on*` handlers
4. Link hygiene: add `rel="noopener noreferrer"`, unwrap empty-href anchors
5. Semantic conversion: `<b>` → `<strong>`, `<i>` → `<em>`, unwrap deprecated elements
6. Selective span unwrap (keep `lang`/`aria-*`/`role` spans)
7. Normalize underline runs (merge adjacent `<u>`)
8. Heading cleanup: strip `<a>` from headings, remove empties, detect H1 + skipped levels
9. List conversion: bullet/OL detection, `<p>`-in-`<li>` unwrap, `<br><br>` → `<p>`
10. Table accessibility: promote `<thead>`, add `border-style`
11. Image fixes: single-image tables → `<figure>/<figcaption>`, add `loading`/`decoding`
12. Apply per-element attribute policy (SPECS.md §8)
13. Style scrub: keep `border-style`, `list-style-type`; drop all cosmetic Word styles
14. Remove empty `<p>`/`<div>`
15. DOM-aware whitespace normalize (skips `<pre>`/`<code>`)
16. Validate (read-only) → findings
17. Render report + gate Copy Clean button

## Related

- [SPECS.md](SPECS.md) — full v2 design document
- [AUDIT.md](AUDIT.md) — what v1 gets wrong and why
