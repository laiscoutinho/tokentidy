/**
 * Cada linguagem que o TokenTidy lê, num projeto só: Less, Sass indentado, HTML (`<style>` e `style=""`),
 * JSX/TSX, Angular (template inline e `templateUrl`) e arquivo DTCG.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { analyzeDirectory } from '../../src/analysis/analyze.ts';
import { cssValueOf, parseDtcg } from '../../src/parsers/dtcg.ts';
import { FIXTURES } from '../helpers.ts';

const project = path.join(FIXTURES, 'hosts-project');
const result = await analyzeDirectory(project);

/** "arquivo linha:coluna host tipo propriedade valor [+unidade] seletor [fn=função]" */
function summary(file: string): string[] {
    return result.findings
        .filter((f) => f.file === file)
        .map((f) => `${f.line}:${f.column} ${f.host} ${f.type} ${f.property} ${f.value}${f.impliedUnit ? ` +${f.impliedUnit}` : ''} ${f.selector ?? '-'}${f.function ? ` fn=${f.function}` : ''}`);
}

test('Less: variables are definitions/references, mixins are skipped, colors inside functions keep the function', () => {
    assert.deepEqual(summary('src/theme.less'), [
        '4:12 less spacing padding 8px .button',
        '4:16 less spacing padding 16px .button',
        '6:11 less border-width border 1px .button',
        '6:28 less color border #4f46e5 .button fn=darken',
        '7:25 less color background #4338ca .button:hover',
    ]);
});

test('Sass (indented syntax): nesting and variables', () => {
    assert.deepEqual(summary('src/layout.sass'), [
        '3:16 sass spacing margin 24px .card',
        '4:10 sass color color #111827 .card',
        '6:12 sass color color #4f46e5 .card:hover',
    ]);
});

test('HTML: <style> is CSS and style="" is inline, with the element as selector', () => {
    assert.deepEqual(summary('src/index.html'), [
        '5:19 css color color #111827 body',
        '6:25 css font-size font-size 24px .title',
        '10:40 html color color #dc2626 button.remove',
        '10:58 html spacing padding 4px button.remove',
        '10:62 html spacing padding 8px button.remove',
    ]);
});

test('JSX: style={{}} with camelCase, numbers in px, ternaries and unitless properties', () => {
    assert.deepEqual(summary('src/Card.tsx'), [
        '5:45 jsx spacing padding 8 +px div.card',
        '5:60 jsx spacing margin-top 16px div.card',
        '5:81 jsx color color #111827 div.card',
        '5:120 jsx line-height line-height 1.5 div.card',
        '5:134 jsx opacity opacity 0.5 div.card',
    ]);
});

test('Angular: inline template, [style.x.unit] and [ngStyle]', () => {
    assert.deepEqual(summary('src/app/badge.component.ts'), [
        '5:48 angular-template color color #dc2626 span.badge',
        '5:77 angular-template spacing padding 4 +px span.badge',
        '5:111 angular-template radius border-radius 8px span.badge',
    ]);
});

test('Angular: an .html referenced by templateUrl is read as an Angular template', () => {
    assert.deepEqual(summary('src/app/list.component.html'), [
        '1:22 angular-template spacing gap 0.5 +rem ul',
        '2:21 angular-template color color #111827 li',
        '3:23 angular-template color color #4f46e5 li',
    ]);
});

test('existing tokens: definitions and references in every syntax', () => {
    assert.deepEqual(result.definitions.map((d) => `${d.syntax} ${d.name} ${d.value}`), [
        'dtcg color.brand #4f46e5',
        'dtcg color.ink {color.brand}',
        'dtcg space.md 16px',
        'scss-variable $gap 16px',
        'less-variable @brand #4f46e5',
    ]);
    assert.deepEqual(result.references.map((r) => `${r.name} ${r.property}`), ['--muted color', '$gap margin', '@brand color']);
});

test('token files are listed apart and are not counted as analyzed files', () => {
    assert.deepEqual(result.tokenFiles, ['design/brand.tokens.json']);
    assert.equal(result.filesAnalyzed, 7);
    assert.deepEqual(result.styleLanguages, ['less', 'sass']);
    assert.deepEqual(result.errors, []);
});

test('in every host, source.slice(offset, endOffset) === value', () => {
    for (const f of result.findings) {
        const source = readFileSync(path.join(project, f.file), 'utf8');
        assert.equal(source.slice(f.offset, f.endOffset), f.value, `${f.file}:${f.line}:${f.column}`);
    }
});

test('DTCG: invalid JSON becomes an error, and values are converted to CSS', () => {
    assert.equal(parseDtcg('{ nope', 'x.tokens.json').errors.length, 1);
    assert.equal(cssValueOf({ colorSpace: 'srgb', components: [1, 1, 1] }, 'color'), 'rgb(255 255 255)');
    assert.equal(cssValueOf({ colorSpace: 'srgb', components: [1, 1, 1], hex: '#ffffff' }, 'color'), '#ffffff');
    assert.equal(cssValueOf({ value: 0.5, unit: 'rem' }, 'dimension'), '0.5rem');
    assert.equal(cssValueOf([0.4, 0, 0.2, 1], 'cubicBezier'), 'cubic-bezier(0.4, 0, 0.2, 1)');
    assert.equal(cssValueOf(['Inter', 'sans-serif'], 'fontFamily'), 'Inter, sans-serif');
});
