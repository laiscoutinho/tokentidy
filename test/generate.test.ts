import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { analyzeDirectory } from '../src/analyze.ts';
import { generateTokens } from '../src/generate/generate.ts';
import type { GenerationOptions } from '../src/generate/generate.ts';
import type { Finding, Host, TokenDefinition, TokenType } from '../src/types.ts';

const project = path.join(import.meta.dirname, 'fixtures', 'generate-project');

const options: GenerationOptions = { minOccurrences: 2, gridBase: 4, semanticTokens: true, mode: 'extend' };

function finding(type: TokenType, property: string, value: string, extra: Partial<Finding> = {}): Finding {
    return { file: 'a.css', line: 1, column: 1, offset: 0, endOffset: value.length, type, rule: `${type}/hardcoded`, property, value, host: 'css', ...extra };
}

/** O mesmo valor `n` vezes. */
function times(n: number, type: TokenType, property: string, value: string, extra: Partial<Finding> = {}): Finding[] {
    return Array.from({ length: n }, () => finding(type, property, value, extra));
}

function definition(name: string, value: string, syntax: TokenDefinition['syntax']): TokenDefinition {
    return { name, value, syntax, file: 'tokens.scss', line: 1, column: 1 };
}

test('groups different spellings of the same value into one token', async () => {
    const { tokens } = generateTokens((await analyzeDirectory(project)).findings, options);
    const white = tokens.find((t) => t.key === '#ffffff');

    assert.equal(white?.name, 'color-white');
    assert.equal(white?.count, 3);
    assert.deepEqual(white?.spellings.toSorted(), ['#FFF', '#fff', 'white']);
    assert.equal(white?.occurrences.length, 3);
});

test('a value used fewer times than minOccurrences is not a token', () => {
    const findings = [...times(2, 'spacing', 'margin', '8px'), finding('spacing', 'margin', '12px')];

    const result = generateTokens(findings, options);
    assert.deepEqual(result.tokens.map((t) => t.value), ['8px']);
    assert.deepEqual(result.belowThreshold.map((b) => [b.key, b.count]), [['12px', 1]]);

    assert.deepEqual(generateTokens(findings, { ...options, minOccurrences: 3 }).tokens, []);
});

test('the same value in different roles becomes different tokens', () => {
    const { tokens } = generateTokens([
        ...times(2, 'font-size', 'font-size', '16px'),
        ...times(2, 'line-height', 'line-height', '16px'),
        ...times(2, 'spacing', 'margin', '16px'),
    ], options);

    assert.deepEqual(tokens.map((t) => t.type), ['spacing', 'font-size', 'line-height']);
});

test('spacing is named on the 4px scale; values off the grid become a suggestion', () => {
    const result = generateTokens([
        ...times(2, 'spacing', 'margin', '4px'),
        ...times(2, 'spacing', 'margin', '10px'),
        ...times(2, 'spacing', 'margin', '-24px'),
    ], options);

    assert.deepEqual(result.tokens.map((t) => [t.name, t.value]), [['spacing-1', '4px'], ['spacing-2_5', '10px'], ['spacing-6', '24px']]);
    assert.deepEqual(result.suggestions.map((s) => [s.kind, s.values]), [['off-grid', ['10px']]]);
});

test('px and rem with the same size are not merged: they become a suggestion', () => {
    const result = generateTokens([...times(2, 'spacing', 'margin', '1rem'), ...times(2, 'spacing', 'margin', '16px')], options);

    assert.equal(result.tokens.length, 2);
    assert.deepEqual(result.suggestions.map((s) => [s.kind, s.values]), [['same-size-different-unit', ['16px', '1rem']]]);
    // Com outra fonte raiz, 1rem não é mais 16px
    const root10 = generateTokens([...times(2, 'spacing', 'margin', '1rem'), ...times(2, 'spacing', 'margin', '16px')], { ...options, rootFontSize: 10 });
    assert.ok(root10.suggestions.every((s) => s.kind !== 'same-size-different-unit'));
});

test('colors are named by hue family and lightness', () => {
    const { tokens } = generateTokens([...times(2, 'color', 'color', '#4f46e5'), ...times(2, 'color', 'color', '#000'), ...times(2, 'color', 'color', 'rgb(0 0 0 / 50%)')], options);

    assert.deepEqual(tokens.map((t) => t.name).toSorted(), ['color-black', 'color-black-a50', 'color-indigo-600']);
});

test('semantic aliases come only from unambiguous roles used enough times', () => {
    const { aliases } = generateTokens([
        ...times(2, 'color', 'color', '#dc2626', { selector: '.btn-excluir' }),
        finding('color', 'color', '#dc2626', { selector: '.alert' }),
        ...times(2, 'color', 'background', '#4f46e5', { selector: '.btn-primary' }),
        finding('color', 'background', '#4f46e5', { selector: '.btn-primary:hover' }),
        // Duas cores no mesmo papel: nenhum alias
        ...times(2, 'color', 'border-color', '#4f46e5', { selector: '.card-info' }),
        ...times(2, 'color', 'border-color', '#dc2626', { selector: '.info' }),
    ], options);

    assert.deepEqual(aliases.map((a) => [a.name, a.target.join('.'), a.count]), [
        ['color-bg-primary', 'color.indigo.600', 2],
        ['color-text-danger', 'color.red.500', 2],
    ]);
    assert.deepEqual(generateTokens(times(2, 'color', 'color', '#dc2626', { selector: '.erro' }), { ...options, semanticTokens: false }).aliases, []);
});

test('an existing token usable in every host is reused, even when used once', () => {
    const result = generateTokens([finding('color', 'color', '#4F46E5')], {
        ...options, definitions: [definition('--brand', '#4f46e5', 'custom-property')],
    });

    assert.deepEqual(result.tokens, []);
    assert.deepEqual(result.reused.map((r) => [r.definition.name, r.count]), [['--brand', 1]]);
});

test('an existing token that does not work in some host becomes a CSS token with the equivalent recorded', () => {
    const hosts: Host[] = ['scss', 'jsx'];
    const result = generateTokens(hosts.map((host) => finding('color', 'color', '#4f46e5', { host })), {
        ...options, definitions: [definition('$roxo', '#4f46e5', 'scss-variable')],
    });

    assert.deepEqual(result.reused, []);
    assert.deepEqual(result.tokens.map((t) => [t.name, t.equivalents?.map((d) => d.name)]), [['color-indigo-600', ['$roxo']]]);
});

test('extend keeps the names already generated; new ignores existing tokens', () => {
    const findings = times(2, 'color', 'color', '#4f46e5');
    const ownTokens = [{ path: ['color', 'brand'], type: 'color' as const, key: '#4f46e5' }];

    assert.deepEqual(generateTokens(findings, { ...options, ownTokens }).tokens.map((t) => [t.name, t.kept]), [['color-brand', true]]);
    assert.deepEqual(generateTokens(findings, { ...options, mode: 'new', ownTokens }).tokens.map((t) => [t.name, t.kept]), [['color-indigo-600', undefined]]);
});

test('the same input always produces the same output, in any order', async () => {
    const { findings } = await analyzeDirectory(project);

    assert.deepEqual(generateTokens(findings, options), generateTokens(findings.toReversed(), options));
});

test('cool grays are named gray, near-white tints keep their hue, pure extremes stay white/black', () => {
    const { tokens } = generateTokens([...times(2, 'color', 'color', '#111827'), ...times(2, 'color', 'color', '#eff6ff'), ...times(2, 'color', 'color', '#fff')], options);

    // O degrau vem da luminosidade; aqui interessa a família
    assert.deepEqual(tokens.map((t) => t.path.slice(0, 2).join('-')).toSorted(), ['color-blue', 'color-gray', 'color-white']);
});

test('a value from a hand-written DTCG file is named by its path, also in new mode', () => {
    const findings = [finding('color', 'color', '#4f46e5', { host: 'scss' }), finding('color', 'color', '#4f46e5', { host: 'jsx' })];
    const definitions = [definition('color.primary', '#4f46e5', 'dtcg')];

    for (const mode of ['extend', 'new'] as const) {
        const result = generateTokens(findings, { ...options, mode, definitions });
        assert.deepEqual(result.tokens.map((t) => [t.name, t.equivalents?.map((d) => d.name)]), [['color-primary', ['color.primary']]], mode);
    }
});

test('the diagnosis counts values, tokens and uses per type, and compares with the reference scale', async () => {
    const { diagnose, describe } = await import('../src/generate/diagnosis.ts');
    const spacing = Array.from({ length: 15 }, (_, i) => ({ type: 'spacing' as const, key: `${i + 1}px`, count: 1 }));
    const [diagnosis] = diagnose([{ type: 'spacing', key: '16px', count: 5 }], spacing, ['color', 'spacing']);

    assert.deepEqual(diagnosis, { type: 'spacing', distinct: 16, steps: 1, uses: 20, onStep: 5, consistency: 0.25, singleUse: 15, reference: { system: 'Carbon', steps: 13 } });
    assert.equal(describe(diagnosis!), "16 values, 1 token, 25% of uses on a token; above Carbon's 13 spacing steps, 15 values used once");
    assert.equal(describe(diagnose([{ type: 'color', key: '#fff', count: 2 }], [], ['color'])[0]!), '1 value, 1 token, 100% of uses on a token');
    assert.equal(generateTokens(times(2, 'color', 'color', '#fff'), options).diagnosis.length, 1);
});
