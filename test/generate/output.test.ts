import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { generateTokens } from '../../src/generate/generate.ts';
import type { GenerationOptions } from '../../src/generate/generate.ts';
import { EXTENSION, OutputError, buildDtcgTree, ownTokensOf, readDtcgTree } from '../../src/generate/output/dtcg-tree.ts';
import { dtcgValueOf } from '../../src/generate/output/dtcg-values.ts';
import { renderOutput } from '../../src/generate/output/render-files.ts';
import { writeOutput } from '../../src/generate/output/write-files.ts';
import type { Finding, TokenType } from '../../src/types.ts';
import { tempDir } from '../helpers.ts';

const options: GenerationOptions = { minOccurrences: 2, gridBase: 4, semanticTokens: true, mode: 'extend' };

function times(n: number, type: TokenType, property: string, value: string, extra: Partial<Finding> = {}): Finding[] {
    return Array.from({ length: n }, (_, i) => ({ file: 'a.css', line: i + 1, column: 1, offset: i * 20, endOffset: i * 20 + value.length, type, rule: `${type}/hardcoded`, property, value, host: 'css' as const, ...extra }));
}

const result = generateTokens([
    ...times(2, 'color', 'color', '#dc2626', { selector: '.erro' }),
    ...times(2, 'spacing', 'margin', '12px'),
    ...times(2, 'spacing', 'margin', '10px'),
    ...times(2, 'duration', 'transition', '.2s'),
], options);
const tree = buildDtcgTree(result, undefined);

test('DTCG values follow the 2025.10 format', () => {
    assert.deepEqual(dtcgValueOf('color', '#dc2626'), {
        $type: 'color', $value: { colorSpace: 'srgb', components: [0.8627, 0.149, 0.149], hex: '#dc2626' },
    });
    assert.deepEqual(dtcgValueOf('color', 'oklch(0.7 0.3 150)'), { $type: 'color', $value: { colorSpace: 'oklch', components: [0.7, 0.3, 150] } });
    assert.deepEqual(dtcgValueOf('spacing', '12px'), { $type: 'dimension', $value: { value: 12, unit: 'px' } });
    assert.deepEqual(dtcgValueOf('duration', '200ms'), { $type: 'duration', $value: { value: 200, unit: 'ms' } });
    assert.deepEqual(dtcgValueOf('easing', 'cubic-bezier(0.4, 0, 0.2, 1)'), { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] });
    assert.deepEqual(dtcgValueOf('font-family', 'inter, arial, sans-serif'), { $type: 'fontFamily', $value: ['inter', 'arial', 'sans-serif'] });
    assert.deepEqual(dtcgValueOf('opacity', '0.5'), { $type: 'number', $value: 0.5 });
    // O DTCG só aceita px e rem em dimension: em e % viram número, com a unidade na extensão
    assert.deepEqual(dtcgValueOf('spacing', '1.5em'), { $type: 'number', $value: 1.5, unit: 'em' });
    assert.equal(dtcgValueOf('shadow', '0 1px 2px 0 #00000033').$type, 'shadow');
});

test('each token keeps its occurrences in the extension: the base for autofix', () => {
    const red = (tree['color'] as Record<string, Record<string, Record<string, unknown>>>)['red']!['500']!;
    const extension = (red['$extensions'] as Record<string, Record<string, unknown>>)[EXTENSION]!;

    assert.equal(extension['type'], 'color');
    assert.equal(extension['key'], '#dc2626');
    assert.equal(extension['count'], 2);
    assert.deepEqual((extension['occurrences'] as Finding[]).map((o) => [o.file, o.line, o.offset, o.endOffset, o.selector]), [
        ['a.css', 1, 0, 7, '.erro'],
        ['a.css', 2, 20, 27, '.erro'],
    ]);
});

test('semantic aliases are DTCG references to the primitive', () => {
    const danger = (tree['color'] as Record<string, Record<string, Record<string, unknown>>>)['text']!['danger']!;
    assert.equal(danger['$value'], '{color.red.500}');
});

test('CSS, SCSS and Less are generated from the DTCG tree, sorted by category and size', () => {
    const files = renderOutput(tree, { outDir: '/out', mode: 'new', styleLanguages: ['less', 'scss'], splitThreshold: 60 });
    const content = (name: string) => files.find((f) => f.file === path.join('/out', name))?.content;

    assert.deepEqual(files.map((f) => path.basename(f.file)), ['tokens.tokens.json', 'tokens.css', '_tokens.scss', '_tokens.less']);
    assert.match(content('tokens.css')!, /:root \{\n {2}\/\* color \*\/\n {2}--color-red-500: #dc2626;\n {2}--color-text-danger: var\(--color-red-500\);\n\n {2}\/\* spacing \*\/\n {2}--spacing-2_5: 10px;\n {2}--spacing-3: 12px;/);
    assert.match(content('_tokens.scss')!, /\$color-text-danger: \$color-red-500;/);
    assert.match(content('_tokens.less')!, /@duration-200: 200ms;/);
});

test('SCSS and Less files only exist when the project uses them', () => {
    const files = renderOutput(tree, { outDir: '/out', mode: 'new', styleLanguages: [], splitThreshold: 60 });
    assert.deepEqual(files.map((f) => path.basename(f.file)), ['tokens.tokens.json', 'tokens.css']);
});

test('with many tokens, the CSS is split by category with an index and a README', () => {
    const files = renderOutput(tree, { outDir: '/out', mode: 'new', styleLanguages: [], splitThreshold: 2 });

    assert.deepEqual(files.map((f) => path.relative('/out', f.file)), [
        'tokens.tokens.json', path.join('css', 'color.css'), path.join('css', 'spacing.css'), path.join('css', 'duration.css'), 'tokens.css', 'README.md',
    ]);
    assert.match(files.find((f) => f.file === '/out/tokens.css')!.content, /@import "\.\/css\/color\.css";/);
});

test('ownTokensOf reads back the names generated before (extend keeps them)', () => {
    assert.deepEqual(ownTokensOf(tree).map((t) => [t.path.join('.'), t.key]), [
        ['color.red.500', '#dc2626'], ['spacing.3', '12px'], ['spacing.2_5', '10px'], ['duration.200', '200ms'],
    ]);
});

test('extend keeps tokens of the existing file that no longer appear in the code', () => {
    const existing = { color: { brand: { $type: 'color', $value: '#000000' } } };
    const merged = buildDtcgTree(result, existing);

    assert.deepEqual((merged['color'] as Record<string, unknown>)['brand'], existing.color.brand);
    assert.ok((merged['color'] as Record<string, unknown>)['red']);
});

test('writeOutput deletes stale files only when TokenTidy generated them', async () => {
    const dir = await tempDir();
    try {
        const options = { outDir: dir, mode: 'new' as const, styleLanguages: ['less'], splitThreshold: 60 };
        await writeOutput(renderOutput(tree, options), options);
        await writeFile(path.join(dir, 'notes.md'), 'mine');
        await mkdir(path.join(dir, 'css'));
        await writeFile(path.join(dir, 'css', 'theme.css'), ':root {}');

        // O projeto parou de usar Less: o `_tokens.less` gerado antes sobra e é apagado
        const withoutLess = { ...options, styleLanguages: [] };
        await writeOutput(renderOutput(tree, withoutLess), withoutLess);

        assert.equal(await readFile(path.join(dir, 'notes.md'), 'utf8'), 'mine');
        assert.equal(await readFile(path.join(dir, 'css', 'theme.css'), 'utf8'), ':root {}');
        assert.equal(existsSync(path.join(dir, '_tokens.less')), false);
        assert.deepEqual(await readDtcgTree(dir), tree);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('writeOutput never overwrites a file it did not generate', async () => {
    const dir = await tempDir();
    try {
        await writeFile(path.join(dir, 'tokens.css'), ':root { --mine: red; }');
        const options = { outDir: dir, mode: 'extend' as const, styleLanguages: [], splitThreshold: 60 };

        await assert.rejects(writeOutput(renderOutput(tree, options), options), /tokens\.css was not generated by TokenTidy/);
        assert.equal(await readFile(path.join(dir, 'tokens.css'), 'utf8'), ':root { --mine: red; }');
        assert.equal(existsSync(path.join(dir, 'tokens.tokens.json')), false);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('writeOutput in new mode keeps a DTCG file with hand-written tokens', async () => {
    const dir = await tempDir();
    try {
        const manual = { color: { brand: { $type: 'color', $value: '#4f46e5' } } };
        await writeFile(path.join(dir, 'tokens.tokens.json'), JSON.stringify(manual));
        const options = { outDir: dir, mode: 'new' as const, styleLanguages: [], splitThreshold: 60 };

        await assert.rejects(writeOutput(renderOutput(tree, options), options), /tokens not generated by TokenTidy \(color\.brand\)/);
        assert.deepEqual(await readDtcgTree(dir), manual);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('readDtcgTree reports a corrupted file with its path', async () => {
    const dir = await tempDir();
    try {
        await writeFile(path.join(dir, 'tokens.tokens.json'), '{ "color": ');
        await assert.rejects(readDtcgTree(dir), (error: Error) => error instanceof OutputError && error.message.includes(path.join(dir, 'tokens.tokens.json')));
        await writeFile(path.join(dir, 'tokens.tokens.json'), '[]');
        await assert.rejects(readDtcgTree(dir), /expected a JSON object/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('the DTCG tree keeps __proto__ and constructor as plain token groups', () => {
    const existing = JSON.parse('{ "__proto__": { "x": { "$value": "1px" } }, "constructor": { "$value": "red" } }');
    const result = buildDtcgTree({ tokens: [], aliases: [], reused: [], belowThreshold: [], suggestions: [], diagnosis: [], rootFontSize: 16 }, existing);

    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.ok(Object.hasOwn(result, '__proto__'));
    assert.equal(({} as Record<string, unknown>)['x'], undefined);
});
