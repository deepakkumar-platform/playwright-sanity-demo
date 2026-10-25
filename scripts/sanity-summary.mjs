// Reads Playwright's JSON report and writes:
//  - results/sanity-summary.md   (also appended to the GitHub run summary)
//  - results/sanity-results.csv  (same columns as the sanity Excel sheet)
//  - step outputs for the notification job (status, counts, failed tests)
import fs from 'node:fs';

const reportPath = process.argv[2] || 'results/results.json';
const out = (k, v) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const cell = (s) => stripAnsi(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

if (!fs.existsSync(reportPath)) {
  // Tests never ran (install failed, app didn't start, ...). Still report it.
  const md = '### 🧪 Sanity tests: ❌ NOT RUN\nNo results file. Check the "Run sanity tests" step log.\n';
  fs.mkdirSync('results', { recursive: true });
  fs.writeFileSync('results/sanity-summary.md', md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  out('status', 'NOT RUN'); out('total', 0); out('passed', 0); out('failed', 0); out('flaky', 0); out('skipped', 0); out('failed_list', 'none');
  process.exit(0);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const rows = [];
(function walk(suites) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) {
      for (const t of spec.tests) {
        const last = t.results[t.results.length - 1] || {};
        const status = { expected: 'Pass', unexpected: 'Fail', flaky: 'Flaky', skipped: 'Not Run' }[t.status] || t.status;
        rows.push({
          id: (spec.title.match(/^((?:SAN|REG)-\d+)/) || [, '-'])[1],
          title: spec.title.replace(/^(?:SAN|REG)-\d+\s*/, ''),
          file: `${spec.file}:${spec.line}`,
          status,
          seconds: ((last.duration || 0) / 1000).toFixed(1),
          error: stripAnsi(last.error?.message || '').split('\n').filter(Boolean).slice(0, 6).join('\n'),
        });
      }
    }
    walk(s.suites);
  }
})(report.suites);

const count = (st) => rows.filter((r) => r.status === st).length;
const failed = count('Fail');
const overall = failed > 0 ? 'FAILED' : 'PASSED';
const icon = { Pass: '✅', Fail: '❌', Flaky: '⚠️', 'Not Run': '⏭️' };

let md = `### 🧪 Sanity tests: ${failed ? '❌' : '✅'} ${overall}\n`;
md += `**Target:** ${process.env.BASE_URL || 'local demo app'} · **Trigger:** ${process.env.GITHUB_EVENT_NAME || 'local'}\n\n`;
md += `| Total | Passed | Failed | Flaky | Not run |\n|---|---|---|---|---|\n`;
md += `| ${rows.length} | ${count('Pass')} | ${failed} | ${count('Flaky')} | ${count('Not Run')} |\n\n`;
md += `| ID | Test | Result | Time (s) |\n|---|---|---|---|\n`;
md += rows.map((r) => `| ${r.id} | ${cell(r.title)} | ${icon[r.status] || ''} ${r.status} | ${r.seconds} |`).join('\n') + '\n';

const failures = rows.filter((r) => r.status === 'Fail');
if (failures.length) {
  md += `\n#### Failure details\n`;
  for (const f of failures) md += `\n**${f.id} ${f.title}** (\`${f.file}\`)\n\`\`\`\n${f.error}\n\`\`\`\n`;
  md += `\nScreenshots, video and trace: download the **playwright-report** artifact and open \`index.html\`.\n`;
}

fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/sanity-summary.md', md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);

// "Expected ... Received ..." is the most useful one-line remark for the sheet
const remark = (e) => (e ? e.split('\n').filter((l) => /^(Expected|Received)/.test(l)).join(' / ') || e.split('\n')[0] : 'As expected');
const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
fs.writeFileSync(
  'results/sanity-results.csv',
  ['Test Case ID,Test Scenario,Execution Status (Pass/Fail/Blocked/Not Run),Actual Result / Remarks']
    .concat(rows.map((r) => [r.id, r.title, r.status, remark(r.error)].map(csv).join(',')))
    .join('\n') + '\n',
);

out('status', overall);
out('total', rows.length);
out('passed', count('Pass'));
out('failed', failed);
out('flaky', count('Flaky'));
out('skipped', count('Not Run'));
out('failed_list', failures.map((f) => `${f.id} ${f.title}`).join('; ') || 'none');
console.log(md);
