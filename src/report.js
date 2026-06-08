// Report layer — renders the result panel and manages the copy gate (SPECS.md §3).
import { applyAutofix } from './validators.js';

const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const SEV_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' };
const SEV_LABEL = { high: 'HIGH', medium: 'MED', low: 'LOW' };
const CAT_ICON  = { seo: '🔍', a11y: '♿', html: '🏷️', security: '🔒', performance: '⚡', correctness: '✅' };

export function renderReport(container, { transforms, findings, doc, onFixed }) {
  container.innerHTML = '';
  if (!transforms.length && !findings.length) return;

  const highCount   = findings.filter(f => f.severity === 'high').length;
  const medCount    = findings.filter(f => f.severity === 'medium').length;
  const lowCount    = findings.filter(f => f.severity === 'low').length;
  const totalIssues = findings.length;

  const passCount   = transforms.filter(t => t.count > 0).length;

  // ── Summary bar ────────────────────────────────────────────────────────────
  const summaryEl = document.createElement('div');
  summaryEl.className = 'report-summary';
  const issueText = totalIssues === 0
    ? '<span style="color:#10b981">No issues found.</span>'
    : `<span style="color:#f59e0b">${totalIssues} issue(s)</span>` +
      (highCount ? ` &mdash; <span style="color:#ef4444">${highCount} high</span>` : '') +
      (medCount  ? `, ${medCount} medium` : '') +
      (lowCount  ? `, ${lowCount} low` : '');

  summaryEl.innerHTML = `
    <strong>Cleaned.</strong> ${passCount} transform pass(es) ran. ${issueText}
  `;
  container.appendChild(summaryEl);

  // ── Transform log ──────────────────────────────────────────────────────────
  const activePasses = transforms.filter(t => t.count > 0);
  if (activePasses.length) {
    const logEl = document.createElement('details');
    logEl.className = 'report-section';
    logEl.open = false;
    logEl.innerHTML = `<summary>Transform log (${activePasses.length} passes made changes)</summary>`;
    const ul = document.createElement('ul');
    ul.className = 'report-log';
    activePasses.forEach(t => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="report-pass-name">${escHtml(t.name)}</span>` +
        ` <span class="report-pass-count">${t.count} change(s)</span>` +
        (t.detail ? `<br><span class="report-pass-detail">${escHtml(t.detail)}</span>` : '');
      ul.appendChild(li);
    });
    logEl.appendChild(ul);
    container.appendChild(logEl);
  }

  // ── Findings ───────────────────────────────────────────────────────────────
  if (findings.length) {
    const findingsEl = document.createElement('div');
    findingsEl.className = 'report-section';

    const sorted = [...findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

    sorted.forEach(finding => {
      const row = document.createElement('div');
      row.className = 'report-finding';
      row.dataset.rule = finding.rule;

      const sevSpan = `<span class="report-sev" style="background:${SEV_COLOR[finding.severity]}">${SEV_LABEL[finding.severity]}</span>`;
      const catIcon = CAT_ICON[finding.category] || '•';
      const fixBtn  = finding.autofixable
        ? `<button class="report-fix-btn" data-rule="${escHtml(finding.rule)}">Auto-fix</button>`
        : '';

      row.innerHTML = `
        ${sevSpan}
        <span class="report-cat-icon">${catIcon}</span>
        <span class="report-finding-msg">${escHtml(finding.message)}</span>
        ${fixBtn}
      `;

      if (finding.autofixable) {
        row.querySelector('.report-fix-btn').addEventListener('click', () => {
          applyAutofix(finding, doc);
          row.remove();
          onFixed?.();
        });
      }

      findingsEl.appendChild(row);
    });
    container.appendChild(findingsEl);
  }
}

// Returns true if the copy should be gated (any high-severity unresolved findings).
export function shouldGateCopy(findings) {
  return findings.some(f => f.severity === 'high');
}

// Renders a confirmation prompt inside btnEl's parent; resolves true if user confirms.
export function confirmCopyGate(findings) {
  const highCount = findings.filter(f => f.severity === 'high').length;
  const messages  = findings.filter(f => f.severity === 'high').map(f => f.message);
  return window.confirm(
    `This content has ${highCount} high-severity issue(s):\n\n` +
    messages.map(m => `• ${m}`).join('\n') +
    '\n\nCopy anyway?'
  );
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
