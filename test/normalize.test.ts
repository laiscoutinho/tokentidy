import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    colorInfo, cubicBezierOf, formatNumber, lengthInPx, normalizeFinding, normalizeValue, parseLength, parseShadow, splitFontFamilies,
} from '../src/suggest/normalize.ts';
import type { TokenType } from '../src/types.ts';

// Cada caso: tipo, grafias que devem cair na mesma chave
const same: Array<[TokenType, string[]]> = [
    ['color', ['#FFF', '#ffffff', 'white', 'rgb(255,255,255)', 'hsl(0 0% 100%)']],
    ['color', ['rgba(0,0,0,.2)', '#00000033', 'rgb(0 0 0 / 20%)']],
    ['spacing', ['8px', '8.0px', '8PX', '6pt']],
    ['spacing', ['.5rem', '0.5rem']],
    ['spacing', ['-8px', '8px']],
    ['duration', ['.2s', '200ms', '0.2S']],
    ['opacity', ['50%', '.5', '0.50']],
    ['font-weight', ['bold', '700']],
    ['font-weight', ['normal', '400']],
    ['font-family', ['"Inter", Arial, sans-serif', "'inter',arial,  SANS-SERIF"]],
    ['easing', ['cubic-bezier(.4,0,.2,1)', 'cubic-bezier(0.4, 0, 0.2, 1)']],
    ['shadow', ['0 1PX 2px RGBA(0,0,0,.2)', '0 1px 2px 0 #00000033']],
    ['line-height', ['1.5', '1.50']],
];

for (const [type, values] of same) {
    test(`${type}: ${values.join(' = ')}`, () => {
        const keys = new Set(values.map((v) => normalizeValue(type, v)));
        assert.equal(keys.size, 1);
    });
}

test('does not merge values that are only close, in other units or with another meaning', () => {
    // px e rem só são iguais com a fonte raiz padrão: isso vira sugestão, não junção
    assert.notEqual(normalizeValue('spacing', '16px'), normalizeValue('spacing', '1rem'));
    assert.notEqual(normalizeValue('spacing', '15px'), normalizeValue('spacing', '16px'));
    assert.notEqual(normalizeValue('color', '#fff'), normalizeValue('color', '#fffffe'));
    assert.notEqual(normalizeValue('color', '#fff'), normalizeValue('color', '#ffffff80'));
    // Só o espaçamento ignora o sinal; em letter-spacing o negativo é outra decisão
    assert.equal(normalizeValue('letter-spacing', '-0.5px'), '-0.5px');
    assert.equal(normalizeValue('radius', '50%'), '50%');
});

test('keys are canonical and readable', () => {
    assert.equal(normalizeValue('color', '#FFF'), '#ffffff');
    assert.equal(normalizeValue('color', 'hsl(0 0% 100% / 50%)'), '#ffffff80');
    assert.equal(normalizeValue('spacing', '12pt'), '16px');
    assert.equal(normalizeValue('duration', '.2s'), '200ms');
    assert.equal(normalizeValue('font-family', "'Inter',arial, SANS-SERIF"), 'inter, arial, sans-serif');
    assert.equal(normalizeValue('shadow', '0 1px 2px #0003, inset 0 0 0 1px #FFF'), '0 1px 2px 0 #00000033, inset 0 0 0 1px #ffffff');
});

test('a color outside sRGB keeps its precision in OKLCH', () => {
    assert.equal(normalizeValue('color', 'oklch(70% 0.3 150)'), 'oklch(0.7 0.3 150)');
    assert.equal(colorInfo('oklch(70% 0.3 150)')?.wideGamut, true);
    assert.equal(colorInfo('oklch(70% 0.3 150)')?.hex, undefined);
});

test('a number without unit gets the unit the host implies', () => {
    assert.equal(normalizeFinding({ type: 'spacing', value: '8', impliedUnit: 'px' }), '8px');
    assert.equal(normalizeFinding({ type: 'spacing', value: '8px' }), '8px');
});

test('colorInfo gives sRGB, alpha, OKLCH and hex', () => {
    const red = colorInfo('#ff000080');
    assert.equal(red?.hex, '#ff000080');
    assert.deepEqual(red?.srgb, [1, 0, 0]);
    assert.equal(red?.alpha, 0.502);
    assert.equal(red?.wideGamut, false);
    assert.equal(colorInfo('not-a-color'), undefined);
});

test('lengthInPx converts only px and rem, using the root font size', () => {
    assert.equal(lengthInPx('8px'), 8);
    assert.equal(lengthInPx('1rem'), 16);
    assert.equal(lengthInPx('1rem', 10), 10);
    // em depende do elemento: não há conversão segura
    assert.equal(lengthInPx('2em'), undefined);
    assert.deepEqual(parseLength('-1.5rem'), { value: -1.5, unit: 'rem' });
});

test('helpers for the DTCG output', () => {
    assert.deepEqual(cubicBezierOf('cubic-bezier(0.4, 0, 0.2, 1)'), [0.4, 0, 0.2, 1]);
    assert.deepEqual(splitFontFamilies('"Inter", arial, sans-serif'), ['Inter', 'arial', 'sans-serif']);
    assert.equal(formatNumber(1 / 3), '0.3333');
    assert.equal(formatNumber(2), '2');
    const layers = parseShadow('0 1px 2px 0 #00000033, inset 0 0 0 1px #ffffff');
    assert.equal(layers?.length, 2);
    assert.equal(layers?.[1]?.inset, true);
});
