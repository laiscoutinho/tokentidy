import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findValues } from '../../../src/parsers/css/values.ts';
import type { ValueMatcher } from '../../../src/analysis/rules.ts';

// Cada caso: valor, o que procurar e os trechos esperados
const cases: Array<[string, ValueMatcher, string[]]> = [
    // Shorthands: cada parte é um achado
    ['4px 8px 0 auto', 'length', ['4px', '8px']],
    ['1px solid #ccc', 'color', ['#ccc']],
    ['-8px 1.5rem 2em 10pt', 'length', ['-8px', '1.5rem', '2em', '10pt']],
    // Não são violação
    ['0 auto', 'length', []],
    ['50% 10vw', 'length', []],
    ['transparent', 'color', []],
    ['currentColor', 'color', []],
    ['inherit', 'color', []],
    ['var(--space-2, 12px)', 'length', []],
    ['url(icon.svg#fff)', 'color', []],
    // Funções de cor viram um achado só; outras funções são analisadas por dentro
    ['0 1px rgba(0,0,0,.2)', 'color', ['rgba(0,0,0,.2)']],
    ['linear-gradient(red, #00f 50%)', 'color', ['red', '#00f']],
    ['calc(100% - 16px)', 'length', ['16px']],
    ['rgb(var(--r) 0 0)', 'color', []],
    // Canais literais com opacidade variável: a cor continua fixa no código
    ['rgb(10 88 202 / var(--opacity))', 'color', ['rgb(10 88 202 / var(--opacity))']],
    // SCSS
    ['$red', 'color', []],
    ['darken($primary, 10%)', 'color', []],
    ['darken(#1976d2, 10%)', 'color', ['#1976d2']],
    ['math.div($gap, 2) 12px', 'length', ['12px']],
    ['calc(100% - #{$gutter * 2px})', 'length', []],
    // Tipografia
    ['1.5', 'line-height', ['1.5']],
    ['normal', 'line-height', []],
    ['700', 'font-weight', ['700']],
    ['bold', 'font-weight', ['bold']],
    ['normal', 'font-weight', []],
    ['italic bold 12px/20px Georgia, serif', 'font', ['bold', '12px', '20px', 'Georgia, serif']],
    ['"Inter", Arial, sans-serif', 'font-family', ['"Inter", Arial, sans-serif']],
    ['sans-serif', 'font-family', []],
    ['var(--font-body)', 'font-family', []],
    ['$font-stack', 'font-family', []],
];

for (const [value, match, expected] of cases) {
    test(`${match}: "${value}" → [${expected.join(', ')}]`, () => {
        assert.deepEqual(findValues(value, match).map((m) => m.text), expected);
    });
}

test('positions point to the exact slice of the value', () => {
    const value = 'margin: 4px  8px';
    for (const m of findValues(value, 'length')) {
        assert.equal(value.slice(m.start, m.end), m.text);
    }
});
