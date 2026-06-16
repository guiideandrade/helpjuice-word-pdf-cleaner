// UI controller — extracted from index.html so Vite can bundle it.
import { runPipeline } from './pipeline.js';
import { renderReport, shouldGateCopy, confirmCopyGate } from './report.js';
import { validate, detectBlockInInline } from './validators.js';
import { sanitizeHtml } from './sanitize.js';

// ── State ────────────────────────────────────────────────────────────────────
let lastResult = null; // { html, transforms, findings, doc }
let lastRaw = '';      // raw input, for re-running the Q5 reflow scan after a fix

// ── DOM refs ─────────────────────────────────────────────────────────────────
const rawArea    = document.getElementById('raw-html');
const outputArea = document.getElementById('output-html');
const alertEl    = document.getElementById('alert');
const reportEl   = document.getElementById('report-panel');
const btnCopyRaw   = document.getElementById('btn-copy-raw');
const btnCopyClean = document.getElementById('btn-copy-clean');
const btnClear     = document.getElementById('btn-clear');
const editorToggle = document.getElementById('editor-toggle');

// Selected target editor ('ckeditor' | 'froala') — drives table-border output.
function selectedEditor() {
  const checked = editorToggle?.querySelector('input[name="editor"]:checked');
  return checked ? checked.value : 'ckeditor';
}

// ── Alert helpers ─────────────────────────────────────────────────────────────
function showAlert(msg, type = 'info') {
  alertEl.textContent = msg;
  alertEl.className = `alert ${type}`;
  setTimeout(() => alertEl.classList.add('hidden'), 4000);
}
function hideAlert() { alertEl.className = 'alert hidden'; }

// ── Clean ────────────────────────────────────────────────────────────────────
function clean() {
  const html = rawArea.value;
  if (!html.trim()) { showAlert('No HTML to clean.', 'error'); return; }
  hideAlert();

  try {
    lastRaw = html;
    lastResult = runPipeline(html, selectedEditor());
    outputArea.value = lastResult.html;
    refreshReport();
    const issueCount = lastResult.findings.length;
    showAlert(
      issueCount === 0
        ? '✅ Cleaned — no issues found.'
        : `✅ Cleaned — ${issueCount} issue(s) found. See report below.`,
      issueCount === 0 ? 'success' : 'info'
    );
  } catch (err) {
    console.error(err);
    showAlert('❌ Error: ' + err.message, 'error');
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
function refreshReport() {
  if (!lastResult) return;
  const { transforms, findings, doc } = lastResult;
  reportEl.classList.remove('hidden', 'has-high', 'has-medium', 'clean');

  renderReport(reportEl, {
    transforms,
    findings,
    doc,
    onFixed: () => {
      // After an auto-fix: re-serialize the DOM (through the sanitizer net) and
      // re-run validation. The Q5 reflow finding is raw-input-derived, so re-add it.
      lastResult.html = sanitizeHtml(doc.body.innerHTML.trim()).trim();
      outputArea.value = lastResult.html;
      const refreshed = validate(doc);
      const reflow = detectBlockInInline(lastRaw);
      if (reflow) refreshed.unshift(reflow);
      lastResult.findings = refreshed;
      refreshReport();
    },
  });

  // Border color hint
  if (findings.some(f => f.severity === 'high'))   reportEl.classList.add('has-high');
  else if (findings.some(f => f.severity === 'medium')) reportEl.classList.add('has-medium');
  else reportEl.classList.add('clean');
}

// ── Copy ──────────────────────────────────────────────────────────────────────
function copyText(text, btn) {
  if (!text) { showAlert('Nothing to copy.', 'error'); return; }
  const doNotify = () => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(doNotify, () => fallbackCopy(text, doNotify));
  } else {
    fallbackCopy(text, doNotify);
  }
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  cb?.();
}

// ── Bindings ──────────────────────────────────────────────────────────────────
btnCopyRaw.addEventListener('click', () => copyText(rawArea.value, btnCopyRaw));

btnCopyClean.addEventListener('click', () => {
  if (!outputArea.value) { showAlert('Nothing to copy.', 'error'); return; }
  if (lastResult && shouldGateCopy(lastResult.findings)) {
    if (!confirmCopyGate(lastResult.findings)) return;
  }
  copyText(outputArea.value, btnCopyClean);
});

btnClear.addEventListener('click', () => {
  rawArea.value = '';
  outputArea.value = '';
  reportEl.className = 'hidden';
  reportEl.innerHTML = '';
  lastResult = null;
  lastRaw = '';
  hideAlert();
});

// Re-clean when the target editor changes, so the output matches the selection.
editorToggle?.addEventListener('change', () => {
  if (rawArea.value.trim()) clean();
});

// Auto-clean on paste
rawArea.addEventListener('paste', e => {
  e.preventDefault();
  hideAlert();
  try {
    const cd = e.clipboardData || window.clipboardData;
    const htmlData = cd.getData('text/html');
    const textData = cd.getData('text/plain');
    const full = (htmlData && htmlData.trim()) ? htmlData : textData;
    if (full) {
      rawArea.value = full;
      setTimeout(clean, 120);
    }
  } catch (err) {
    console.error('Paste error:', err);
    showAlert('Paste operation failed.', 'error');
  }
});
