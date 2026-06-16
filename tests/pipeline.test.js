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

describe('list/sublist recognition (mso-list level + glyph fallback)', () => {
  // Word emits list paragraphs with the nesting level in the inline style
  // (mso-list:lN levelM) and the marker glyph inside a <span style='mso-list:Ignore'>
  // that pass 5 unwraps, leaving "·&nbsp;&nbsp; Text".
  const w = (level, marker, text) =>
    `<p style="mso-list:l0 level${level} lfo1">` +
    `<span style="mso-list:Ignore">${marker}<span style="font:7pt 'Times New Roman'">&nbsp;&nbsp; </span></span>` +
    `${text}</p>`;

  it('nests a level-2 mso-list item inside the level-1 list', () => {
    const raw = w(1, '·', 'Parent') + w(2, 'o', 'Child') + w(1, '·', 'Parent two');
    const { html } = runPipeline(raw);
    // one outer <ul> with a nested <ul> holding the child
    expect(html).toMatch(/<ul>\s*<li>Parent\s*<ul>\s*<li>Child<\/li>\s*<\/ul>\s*<\/li>\s*<li>Parent two<\/li>\s*<\/ul>/);
  });

  it("strips the 'o' marker + Word spacing from a level-2 item", () => {
    const { html } = runPipeline(w(1, '·', 'Top') + w(2, 'o', 'Sub item'));
    expect(html).toContain('<li>Sub item</li>');
    expect(html).not.toMatch(/<li>\s*o\s/);
    expect(html).not.toContain('&nbsp;');
  });

  it("does NOT treat a Portuguese 'o ...' paragraph (no mso-list) as a bullet", () => {
    const { html } = runPipeline('<p>o gato comeu o rato</p>');
    expect(html).toContain('<p>o gato comeu o rato</p>');
    expect(html).not.toContain('<ul>');
  });

  it('derives ordered vs unordered from the marker even with mso-list level', () => {
    const raw = w(1, '1.', 'First') + w(2, 'a.', 'Sub a') + w(1, '2.', 'Second');
    const { html } = runPipeline(raw);
    expect(html).toMatch(/<ol[^>]*>\s*<li>First\s*<ol[^>]*type="a"[^>]*>\s*<li>Sub a<\/li>/);
    expect(html).toContain('<li>Second</li>');
  });

  it('still converts plain glyph bullets with no mso-list (PDF paste fallback)', () => {
    const { html } = runPipeline('<p>• One</p><p>• Two</p>');
    expect(html).toMatch(/<ul>\s*<li>One<\/li>\s*<li>Two<\/li>\s*<\/ul>/);
  });

  it('handles three mso-list levels', () => {
    const raw = w(1, '·', 'L1') + w(2, 'o', 'L2') + w(3, '§', 'L3');
    const { html } = runPipeline(raw);
    expect(html).toMatch(/<li>L1\s*<ul>\s*<li>L2\s*<ul>\s*<li>L3<\/li>/);
  });
});

describe('table borders (per-editor) + thead promotion', () => {
  const TBL = '<table><tr><td>Name</td><td>Role</td></tr><tr><td>Amire</td><td>Dev</td></tr></table>';

  it('borders survive the full pipeline (applyAttrPolicy no longer strips them)', () => {
    const { html } = runPipeline(TBL); // default: ckeditor
    expect(html).toContain('hj-cleaned-table');
    expect(html).toContain('hj-cleaned-cell');
    expect(html).toMatch(/border-style:\s*solid/);
    // browsers serialize #cccccc as rgb(204, 204, 204)
    expect(html).toMatch(/border-color:\s*(#cccccc|rgb\(204,\s*204,\s*204\))/i);
    expect(html).toMatch(/border-collapse:\s*collapse/);
  });

  it('applies a border to <th> (promoted header row), not just <td>', () => {
    const { html } = runPipeline(TBL);
    expect(html).toMatch(/<th[^>]*scope="col"/);
    // the th carries the cell class + a border
    expect(html).toMatch(/<th[^>]*class="hj-cleaned-cell"/);
    const thChunk = html.slice(html.indexOf('<th'), html.indexOf('</th>'));
    expect(thChunk).toMatch(/border-style:\s*solid/);
  });

  it('CKEditor mode omits border-width (CKEditor strips it; class drives exact width)', () => {
    const { html } = runPipeline(TBL, 'ckeditor');
    expect(html).not.toMatch(/border-width/);
  });

  it('Froala mode emits an exact 1px border-width inline', () => {
    const { html } = runPipeline(TBL, 'froala');
    expect(html).toMatch(/border-width:\s*1px/);
  });

  it('drops non-border inline styles on tables (style whitelist is not an injection vector)', () => {
    const raw = '<table style="position:fixed;border:2px solid red"><tr><td style="position:absolute">x</td></tr></table>';
    const { html } = runPipeline(raw);
    expect(html).not.toMatch(/position/);
    expect(html).toContain('hj-cleaned-table');
  });

  it('does not keep Word table classes (class is replaced, not appended)', () => {
    const raw = '<table class="MsoTableGrid"><tr><td>x</td></tr></table>';
    const { html } = runPipeline(raw);
    expect(html).not.toMatch(/MsoTableGrid/);
    expect(html).toContain('hj-cleaned-table');
  });
});
