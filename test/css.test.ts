import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseCss } from '../src/parsers/css.ts';
import type { StyleSyntax } from '../src/parsers/css.ts';

const fixtures = path.join(import.meta.dirname, 'fixtures', 'css');

function parseFixture(name: string) {
    const source = readFileSync(path.join(fixtures, name), 'utf8');
    const syntax: StyleSyntax = name.endsWith('.scss') ? 'scss' : 'css';
    return { source, ...parseCss(source, name, syntax) };
}

/** Resumo legível de cada achado: "linha:coluna propriedade valor". */
function summary(name: string): string[] {
    return parseFixture(name).findings.map((f) => `${f.line}:${f.column} ${f.property} ${f.value}`);
}

test('CSS: shorthands, comments, !important and @media', () => {
    assert.deepEqual(summary('basic.css'), [
        '2:10 color #333',
        '3:21 background-color white',
        '4:11 margin 4px',
        '4:15 margin 8px',
        '5:11 border 1px',
        '5:21 border #ccc',
        '6:12 padding 16px',
        '7:15 margin-top 8px',
        '18:10 width 320px',
        '19:18 border-radius 4px',
        '24:14 padding 24px',
    ]);
});

test('token definitions (--x) are not violations', () => {
    assert.deepEqual(summary('tokens.css'), []);
});

test('colors inside functions and color functions', () => {
    // A sombra com `var()` em uma das camadas já depende de token: não é reportada
    assert.deepEqual(summary('functions.css'), [
        '3:10 color hsl(210 50% 40%)',
        '4:18 outline-color oklch(70% 0.1 200)',
        '5:47 background-image #fff',
        '5:53 background-image rebeccapurple',
        '6:47 background #fafafa',
        '7:24 padding 16px',
        '8:17 border-color color-mix(in srgb, red 40%, white)',
    ]);
});

test('typography: size, line height, weight, family and the font shorthand', () => {
    assert.deepEqual(summary('typography.css'), [
        '2:14 font-size 14px',
        '3:16 line-height 1.5',
        '4:16 font-weight 700',
        '5:19 letter-spacing 0.5px',
        '6:16 font-family "Inter", Arial, sans-serif',
        '10:16 font bold',
        '10:21 font 12px',
        '10:26 font 20px',
        '10:31 font Georgia, serif',
    ]);
});

test('SCSS: variables, // comments, module functions, interpolation and nesting', () => {
    assert.deepEqual(summary('variables.scss'), [
        '9:30 padding 12px',
        '15:24 background #1976d2',
    ]);
});

test('token type of each finding', () => {
    assert.deepEqual(parseFixture('typography.css').findings.map((f) => f.type), [
        'font-size', 'line-height', 'font-weight', 'letter-spacing', 'font-family',
        'font-weight', 'font-size', 'line-height', 'font-family',
    ]);
    assert.deepEqual(parseFixture('basic.css').findings.map((f) => f.type), [
        'color', 'color', 'spacing', 'spacing', 'border-width', 'color', 'spacing', 'spacing', 'container', 'radius', 'spacing',
    ]);
});

test('a syntax error becomes an AnalysisError instead of throwing', () => {
    const { findings, errors } = parseFixture('broken.css');
    assert.deepEqual(findings, []);
    assert.deepEqual(errors, [{ file: 'broken.css', line: 2, column: 14, message: 'Missed semicolon' }]);
});

test('files with a BOM and with CRLF line endings', () => {
    assert.deepEqual(summary('bom.css'), ['2:10 color #abc']);
    assert.deepEqual(summary('crlf.css'), ['2:11 margin 2px', '3:10 color navy']);
});

// Garantia que o autofix vai usar: o intervalo [offset, endOffset) é exatamente o valor
test('in every fixture, source.slice(offset, endOffset) === value', () => {
    for (const name of ['basic.css', 'functions.css', 'typography.css', 'variables.scss', 'bom.css', 'crlf.css']) {
        const { source, findings } = parseFixture(name);
        assert.ok(findings.length > 0, name);
        for (const f of findings) {
            assert.equal(source.slice(f.offset, f.endOffset), f.value, `${name}:${f.line}:${f.column}`);
        }
    }
});
