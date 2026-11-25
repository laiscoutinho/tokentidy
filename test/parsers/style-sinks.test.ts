import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../../src/analysis/analyze.ts';
import { ConfigError, analysisOptions, validateConfig, DEFAULT_CONFIG } from '../../src/project/config.ts';
import { tempDir } from '../helpers.ts';

async function values(source: string, options: Parameters<typeof analyzePaths>[1] = {}): Promise<string[]> {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    await writeFile(path.join(dir, 'a.ts'), source);
    const result = await analyzePaths([dir], { root: dir, ...options });
    assert.deepEqual(result.errors, []);
    return [...result.findings, ...result.review].map((f) => `${f.host} ${f.property} ${f.value}`).sort();
}

test('PixiJS TextStyle and Phaser add.text: only the style keys of the object are read, as js-value', async () => {
    assert.deepEqual(await values(`
const title = new PIXI.TextStyle({ fill: '#121212', fontSize: 24, strokeThickness: 4, padding: 8 });
const label = new TextStyle({ stroke: '#131313' });
class S { create() { this.add.text(10, 20, 'hi', { color: '#141414', fontFamily: 'Arial, sans-serif', wordWrap: { width: 300 } }); } }
`), [
        'js-value color #141414',
        'js-value fill #121212',
        'js-value font-family Arial, sans-serif',
        'js-value font-size 24',
        'js-value stroke #131313',
    ]);
});

test('styleSinks in the config add a library call; without keys every key is read', async () => {
    const source = `drawLabel({ color: '#151515', margin: 12 }); chart.theme.set({ fill: '#161616', id: 'x' });`;
    assert.deepEqual(await values(source, { styleSinks: [{ call: 'drawLabel' }, { call: 'theme.set', keys: ['fill'] }] }), [
        'js-value color #151515', 'js-value fill #161616', 'js-value margin 12',
    ]);
    // Sem a configuração, as duas são funções desconhecidas: só a chave de cor
    assert.deepEqual(await values(source), ['js-value color #151515']);
});

test('a parameter default is read only when the name is a style property', async () => {
    assert.deepEqual(await values(`
export function badge(text, color = '#171717', fontSize = '13px', width = '300px', id = '#181818', size = 2) {}
export const Card = ({ backgroundColor = '#191919', title = 'x' }) => null;
`), ['js-value background-color #191919', 'js-value color #171717', 'js-value font-size 13px']);
});

test('styleSinks must be a list of { call, keys }', () => {
    assert.deepEqual(validateConfig({ styleSinks: [{ call: 'add.text', keys: ['color'] }] }, 'c').styleSinks, [{ call: 'add.text', keys: ['color'] }]);
    for (const wrong of ['TextStyle', [{ keys: ['fill'] }], [{ call: 'a b' }], [{ call: 'x', keys: 'fill' }], [{ call: 'x', other: 1 }]]) {
        assert.throws(() => validateConfig({ styleSinks: wrong }, 'c'), ConfigError);
    }
    assert.deepEqual(analysisOptions({ ...DEFAULT_CONFIG, styleSinks: [{ call: 'x' }] }).styleSinks, [{ call: 'x' }]);
    assert.equal('styleSinks' in analysisOptions(DEFAULT_CONFIG), false);
});
