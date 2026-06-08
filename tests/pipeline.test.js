import { describe, it, expect } from 'vitest';
import { runPipeline } from '../src/pipeline.js';
import { AUTOFIXES, applyAutofix, detectBlockInInline } from '../src/validators.js';
import { sanitizeHtml } from '../src/sanitize.js';

describe('defect regressions', () => {
  it('preserves nested markup inside <u> instead of flattening to text', () => {
    const { html } = runPipeline('<p><u><a href="https://example.com">link</a></u></p>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('>link<');
  });

  it('merges adjacent <u> runs without losing their children', () => {
    const { html } = runPipeline('<p><u><strong>a</strong></u><u>b</u></p>');
    expect(html).toContain('<strong>a</strong>');
    expect(html).toContain('b');
  });

  it('keeps original spacing in a figcaption (no nbsp stripping)', () => {
    const raw = '<table><tr><td><img src="https://x.com/i.png" alt="x"></td></tr>'
      + '<tr><td>Figure 1 diagram</td></tr></table>';
    const { html } = runPipeline(raw);
    expect(html).toContain('Figure 1 diagram'); // spacing preserved (nbsp normalized to space)
    expect(html).not.toContain('Figure 1diagram'); // the old bug
  });

  it('does not silently delete double-<br>; surfaces it as a finding instead', () => {
    const { html, findings } = runPipeline('<p>a<br><br>b</p>');
    expect(findings.some(f => f.rule === 'double-br-as-paragraph')).toBe(true);
    expect(html).toContain('a');
    expect(html).toContain('b');
  });

  it('strips data:image/svg+xml from img src (SVG XSS vector)', () => {
    const raw = '<p><img alt="x" src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></p>';
    const { html } = runPipeline(raw);
    expect(html).not.toContain('data:image/svg');
  });
});

describe('link hygiene', () => {
  it('fixLinks adds rel="noopener noreferrer" to every external link (no missing-rel finding possible)', () => {
    const { html, findings } = runPipeline('<p><a href="https://example.com">x</a></p>');
    expect(html).toContain('rel="noopener noreferrer"');
    // the redundant link-external-no-rel validator was removed; nothing should report it
    expect(findings.some(f => f.rule === 'link-external-no-rel')).toBe(false);
  });
});

describe('Q4 — strip fixed dimensions', () => {
  it('img-fixed-dimensions is autofixable and removes width/height', () => {
    const { findings, doc } = runPipeline(
      '<p><img src="https://x.com/i.png" alt="x" width="600" height="400"></p>'
    );
    const finding = findings.find(f => f.rule === 'img-fixed-dimensions');
    expect(finding).toBeTruthy();
    expect(finding.autofixable).toBe(true);
    expect(finding.autofix).toBe('strip-dimensions');

    applyAutofix(finding, doc);
    const out = doc.body.innerHTML;
    expect(out).not.toContain('width=');
    expect(out).not.toContain('height=');
  });

  it('strip-dimensions autofix exists', () => {
    expect(typeof AUTOFIXES['strip-dimensions']).toBe('function');
  });
});

describe('Q5 — block-inside-inline reflow detector', () => {
  it('flags a <div> inside a <b>', () => {
    const finding = detectBlockInInline('<b><div>text</div></b>');
    expect(finding).toBeTruthy();
    expect(finding.rule).toBe('block-inside-inline');
  });

  it('does not flag valid nesting', () => {
    expect(detectBlockInInline('<div><b>text</b></div>')).toBeNull();
    expect(detectBlockInInline('<p>plain text</p>')).toBeNull();
  });

  it('ignores void elements inside inline (e.g. <a><img></a>)', () => {
    expect(detectBlockInInline('<a href="#"><img src="x"></a>')).toBeNull();
  });

  it('runPipeline surfaces the reflow finding', () => {
    const { findings } = runPipeline('<b><div>x</div></b>');
    expect(findings.some(f => f.rule === 'block-inside-inline')).toBe(true);
  });
});

describe('Q2 — DOMPurify final safety net', () => {
  it('strips on* handlers', () => {
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).not.toContain('onerror');
  });

  it('drops SVG (USE_PROFILES html only)', () => {
    expect(sanitizeHtml('<svg><script>alert(1)</script></svg>')).not.toContain('<svg');
  });

  it('keeps the attributes our transforms add (loading/decoding/rel/target)', () => {
    const out = sanitizeHtml(
      '<a href="https://x.com" rel="noopener noreferrer" target="_blank">x</a>'
      + '<img src="https://x.com/i.png" alt="x" loading="lazy" decoding="async">'
    );
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('decoding="async"');
  });

  it('runPipeline output has no script or inline handlers', () => {
    const { html } = runPipeline('<p onclick="evil()">hi</p><script>alert(1)<\/script>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
  });
});
