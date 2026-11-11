const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const model = require(path.join(root, 'creative-kpi-report.js'));
const releaseDate = model.VERSION.match(/^\d{4}-\d{2}-\d{2}/)[0].replaceAll('-', '');

for (const entry of ['index.html', 'home/index.html', 'product-book/index.html']) {
  test(`${entry} invalidates cached Creative KPI exporter for its report version`, () => {
    const html = fs.readFileSync(path.join(root, entry), 'utf8');
    const refs = [...html.matchAll(/<script\b[^>]*\bsrc="creative-kpi-report\.js\?v=([^"]+)"/g)];
    assert.equal(refs.length, 1, 'Exactly one report-model script is required');
    assert.ok(refs[0][1].startsWith(releaseDate), `Cached report URL ${refs[0][1]} predates report ${model.VERSION}`);
  });
}
