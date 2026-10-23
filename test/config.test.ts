import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ConfigError, DEFAULT_CONFIG, integerAtLeast, loadConfig, validateConfig } from '../src/config.ts';
import { tempDir } from './helpers.ts';

test('without a config file, the defaults are used', async () => {
    const dir = await tempDir();
    try {
        assert.deepEqual(await loadConfig(dir), { config: DEFAULT_CONFIG });
        assert.equal(DEFAULT_CONFIG.minOccurrences, 2);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('tokentidy.config.json at the root overrides the defaults', async () => {
    const dir = await tempDir();
    try {
        await writeFile(path.join(dir, 'tokentidy.config.json'), JSON.stringify({ minOccurrences: 3, output: 'tokens', semanticTokens: false }));
        const { config, file } = await loadConfig(dir);
        assert.equal(file, path.join(dir, 'tokentidy.config.json'));
        assert.deepEqual(config, { ...DEFAULT_CONFIG, minOccurrences: 3, output: 'tokens', semanticTokens: false });
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('an explicit config file must exist, and must be valid JSON', async () => {
    const dir = await tempDir();
    try {
        await assert.rejects(() => loadConfig(dir, path.join(dir, 'missing.json')), /Config file not found/);
        await writeFile(path.join(dir, 'bad.json'), '{ nope');
        await assert.rejects(() => loadConfig(dir, path.join(dir, 'bad.json')), /Invalid JSON/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('a wrong option fails loudly instead of being ignored', () => {
    const invalid: Array<[unknown, RegExp]> = [
        [[], /expected a JSON object/],
        [{ minOccurrence: 3 }, /unknown option "minOccurrence"/],
        [{ minOccurrences: 1 }, /minOccurrences must be an integer >= 2/],
        [{ minOccurrences: 2.5 }, /minOccurrences must be an integer/],
        [{ gridBase: 0 }, /gridBase must be an integer >= 1/],
        [{ rootFontSize: -16 }, /rootFontSize must be a positive number/],
        [{ output: '/abs/path' }, /output must be a folder path relative/],
        [{ semanticTokens: 'yes' }, /semanticTokens must be true or false/],
        [{ ignore: 'legacy/**' }, /ignore must be a list of glob patterns/],
        [{ ignore: ['ok', ' '] }, /ignore must be a list of glob patterns/],
        [{ includeMinified: 1 }, /includeMinified must be true or false/],
    ];
    for (const [raw, message] of invalid) {
        assert.throws(() => validateConfig(raw, 'cfg'), (error: Error) => error instanceof ConfigError && message.test(error.message), JSON.stringify(raw));
    }
    assert.equal(validateConfig({ $schema: 'x', rootFontSize: 10 }, 'cfg').rootFontSize, 10);
    assert.deepEqual(validateConfig({ ignore: [' legacy/** '], includeMinified: true }, 'cfg'), { ...validateConfig({}, 'cfg'), ignore: ['legacy/**'], includeMinified: true });
});

test('integerAtLeast accepts numeric strings (CLI options) and rejects the rest', () => {
    assert.equal(integerAtLeast('3', 2, 'n'), 3);
    assert.throws(() => integerAtLeast('', 2, 'n'), ConfigError);
    assert.throws(() => integerAtLeast('abc', 2, 'n'), ConfigError);
});
