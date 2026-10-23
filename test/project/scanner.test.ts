import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { scanDirectory, isSupportedExtension } from '../../src/project/scanner.ts';
import { FIXTURES } from '../helpers.ts';

const fixture = path.join(FIXTURES, 'basic-project');

test('counts files by extension, including subfolders', async () => {
    const result = await scanDirectory(fixture);

    assert.equal(result.total, 4);
    assert.equal(result.byExtension['.scss'], 1);
    assert.equal(result.byExtension['.jsx'], 1);
    assert.equal(result.byExtension['.css'], 1);
    assert.equal(result.byExtension['.html'], 1);
    assert.equal(result.byExtension['.tsx'], 0);
});

test('ignores node_modules, dist and unsupported extensions', async () => {
    const result = await scanDirectory(fixture);

    assert.ok(result.files.every((file) => !file.includes('node_modules') && !file.startsWith('dist')));
    assert.ok(!result.files.includes('notes.txt'));
});

test('throws for a missing directory', async () => {
    await assert.rejects(() => scanDirectory('/path/that/does/not/exist'), /Directory not found/);
});

test('throws when the path is a file', async () => {
    await assert.rejects(() => scanDirectory(import.meta.filename), /Not a directory/);
});

test('isSupportedExtension accepts only analyzed extensions', () => {
    assert.equal(isSupportedExtension('.tsx'), true);
    assert.equal(isSupportedExtension('.txt'), false);
});
