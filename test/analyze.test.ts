import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { analyzeDirectory } from '../src/analyze.ts';

const fixtures = path.join(import.meta.dirname, 'fixtures');

test('analyzes only CSS/SCSS, ignoring node_modules and dist', async () => {
    const result = await analyzeDirectory(path.join(fixtures, 'basic-project'));

    assert.equal(result.filesAnalyzed, 2);
    assert.deepEqual(result.findings.map((f) => `${f.file} ${f.value}`), [
        'src/App.scss #ff0000',
        'src/components/Button.css 12px',
    ]);
    assert.deepEqual(result.errors, []);
});

test('sorts by file and collects syntax errors without stopping', async () => {
    const result = await analyzeDirectory(path.join(fixtures, 'css'));
    const files = result.findings.map((f) => f.file);

    assert.deepEqual(files, files.toSorted());
    assert.deepEqual(result.errors.map((e) => e.file), ['broken.css']);
    assert.ok(result.findings.some((f) => f.file === 'variables.scss'));
});
