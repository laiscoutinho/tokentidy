// Um erro do schema é um problema, no ponto certo: os outros ramos do `oneOf` não viram cascata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '../helpers.ts';
import { discoverTokenFiles, validateTokenFiles } from '../../src/validate/validate.ts';

async function problems(json: unknown) {
    const dir = await tempDir();
    try {
        await writeFile(path.join(dir, 'a.tokens.json'), JSON.stringify(json));
        const result = await validateTokenFiles(await discoverTokenFiles([dir], { root: dir }), dir);
        return result.problems.map((p) => `${p.path} | ${p.message}`);
    } finally {
        await rm(dir, { recursive: true });
    }
}

const color = (hex: string) => ({ $value: { colorSpace: 'srgb', components: [1, 1, 1], hex } });

test('a short hex in a group of colors is one problem, at the hex, with the pattern', async () => {
    const shades = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`shade${i}`, color('#f0f0f0')]));
    assert.deepEqual(await problems({ color: { $type: 'color', gray: { ...shades, white: color('#fff') }, other: { a: color('#000000') } } }), [
        '/color/gray/white/$value/hex | must match pattern "^#[0-9a-fA-F]{6}$"',
    ]);
});

test('a name with a dot is one problem, and its valid siblings are not', async () => {
    const px = (value: number) => ({ $type: 'dimension', $value: { value, unit: 'px' } });
    assert.deepEqual(await problems({ 'font-size': { 10: px(10), 11: px(11), '10.4': px(10.4) } }), [
        '/font-size/10.4 | token and group names cannot contain ".", "{" or "}"',
    ]);
});

test('a composite value is checked against its own type: all missing properties together', async () => {
    const typography = { $type: 'typography', $value: { fontSize: { value: 14, unit: 'px' }, lineHeight: { value: 24, unit: 'px' } } };
    assert.deepEqual(await problems({ typography: { body: typography } }), [
        '/typography/body/$value | missing required properties: fontFamily, fontWeight, letterSpacing',
        '/typography/body/$value/lineHeight | must be number',
    ]);
});

test('a type the format does not have is one problem at $type', async () => {
    assert.deepEqual(await problems({ cursor: { $type: 'cursor', pointer: { $value: 'pointer' } } }).then((p) => p.map((x) => x.split(' | ')[0])), ['/cursor/$type']);
});
