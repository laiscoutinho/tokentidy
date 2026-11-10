// Cada guarda: um caso que bloqueia e um que deixa passar. Uma troca pode mudar um valor, nunca uma relação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '../helpers.ts';
import { analyzeDirectory } from '../../src/analysis/analyze.ts';
import { buildModel } from '../../src/coherence/model.ts';
import { checkChanges, contrastRatio } from '../../src/coherence/guards.ts';
import type { GuardId } from '../../src/coherence/guards.ts';
import { describeSelector } from '../../src/coherence/selectors.ts';
import { colorInfo } from '../../src/values/color-info.ts';
import { normalizeFinding } from '../../src/values/normalize.ts';

async function guard(files: Record<string, string>, moves: Record<string, string>) {
    const dir = await tempDir();
    try {
        for (const [name, content] of Object.entries(files)) {
            await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
            await writeFile(path.join(dir, name), content);
        }
        const analysis = await analyzeDirectory(dir);
        const changes = analysis.findings.flatMap((finding) => {
            const to = moves[normalizeFinding(finding)];
            return to ? [{ finding, to }] : [];
        });
        assert.ok(changes.length > 0, 'nenhuma troca candidata');
        const model = buildModel(analysis);
        return checkChanges(model, changes, { colorTolerance: 0.02 });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const guardsOf = (result: Awaited<ReturnType<typeof guard>>) => [...new Set(result.blocked.map((b) => b.guard))];

function blocks(name: string, id: GuardId, files: Record<string, string>, moves: Record<string, string>, reason?: RegExp) {
    test(`${id} blocks: ${name}`, async () => {
        const result = await guard(files, moves);
        assert.deepEqual(guardsOf(result), [id], JSON.stringify(result.blocked));
        if (reason) {
            assert.match(result.blocked[0]!.reason, reason);
        }
    });
}

function allows(name: string, id: GuardId, files: Record<string, string>, moves: Record<string, string>) {
    test(`${id} allows: ${name}`, async () => {
        const result = await guard(files, moves);
        assert.deepEqual(result.blocked, []);
        assert.ok(result.allowed.length > 0);
    });
}

const css = (text: string) => ({ 'a.css': text });

blocks('hover merged with its base', 'distinct-states', css('.btn { color: #4f46e5; }\n.btn:hover { color: #4f46e6; }\n'), { '#4f46e6': '#4f46e5' }, /merges \.btn:hover with \.btn/);
allows('hover that stays apart', 'distinct-states', css('.btn { color: #4f46e5; }\n.btn:hover { color: #4f46e6; }\n'), { '#4f46e6': '#3730a3' });
blocks('modifier class on the same block', 'distinct-states', css('.btn { color: #4f46e5; }\n.btn--active { color: #4f46e6; }\n'), { '#4f46e6': '#4f46e5' });
blocks('is-open on the same element', 'distinct-states', css('.menu { color: #4f46e5; }\n.menu.is-open { color: #4f46e6; }\n'), { '#4f46e6': '#4f46e5' });
blocks('both branches of a ternary', 'distinct-states', { 'a.tsx': "export const A = ({ isActive }) => <b style={{ color: isActive ? '#4f46e5' : '#4f46e6' }} />;\n" }, { '#4f46e6': '#4f46e5' }, /both branches/);
allows('ternary branches that stay apart', 'distinct-states', { 'a.tsx': "export const A = ({ isActive }) => <b style={{ color: isActive ? '#4f46e5' : '#ff0000' }} />;\n" }, { '#ff0000': '#ee0000' });
blocks('Angular [class.x]', 'distinct-states', { 'a.css': '.tab { color: #4f46e5; }\n.chosen { color: #4f46e6; }\n', 'a.component.ts': "@Component({ template: `<a class=\"tab\" [class.chosen]=\"on\"></a>` })\nexport class A {}\n" }, { '#4f46e6': '#4f46e5' });
blocks('Angular [ngClass]', 'distinct-states', { 'a.css': '.tab { color: #4f46e5; }\n.chosen { color: #4f46e6; }\n', 'a.component.ts': "@Component({ template: `<a class=\"tab\" [ngClass]=\"{ chosen: on }\"></a>` })\nexport class A {}\n" }, { '#4f46e6': '#4f46e5' });
blocks('conditional className in React', 'distinct-states', { 'a.css': '.tab { color: #4f46e5; }\n.chosen { color: #4f46e6; }\n', 'a.tsx': "export const A = ({ on, style }) => <a style={style} className={clsx('tab', on && 'chosen')} />;\n" }, { '#4f46e6': '#4f46e5' });

blocks('text falling below 4.5:1', 'contrast', css('.a { color: #767676; background: #ffffff; }\n'), { '#767676': '#777777' }, /text contrast of \.a/);
allows('text that stays above 4.5:1', 'contrast', css('.a { color: #767676; background: #ffffff; }\n'), { '#767676': '#757575' });
allows('a pair that never met the threshold', 'contrast', css('.a { color: #999999; background: #ffffff; }\n'), { '#999999': '#9a9a9a' });
blocks('background on a parent found through JSX nesting', 'contrast', {
    'a.css': '.box { background: #ffffff; }\n.label { color: #767676; }\n',
    'a.tsx': 'export const A = ({ style }) => <div className="box"><span className="label" style={style} /></div>;\n',
}, { '#767676': '#777777' });
blocks('falls back to the page background', 'contrast', css('body { background: #ffffff; }\n.label { color: #767676; }\n'), { '#767676': '#777777' });
allows('large text only needs 3:1', 'contrast', css('.a { color: #767676; background: #ffffff; font-size: 24px; }\n'), { '#767676': '#777777' });
blocks('control border falling below 3:1', 'contrast', css('.input { border-color: #949494; background: #ffffff; }\n'), { '#949494': '#959595' }, /border contrast/);

blocks('squish turned square', 'inset-shape', css('.a { padding: 15px 16px; }\n'), { '15px': '16px' }, /shape/);
allows('squish kept', 'inset-shape', css('.a { padding: 7px 16px; }\n'), { '7px': '8px' });

blocks('padding reaching the gap', 'spacing-hierarchy', css('.a { padding: 17px; gap: 16px; }\n'), { '17px': '16px' }, /order of padding and gap/);
allows('padding still above the gap', 'spacing-hierarchy', css('.a { padding: 25px; gap: 16px; }\n'), { '25px': '24px' });
blocks('equal values split apart', 'spacing-hierarchy', css('.a { padding: 16px; gap: 1rem; }\n'), { '1rem': '20px' });

blocks('inner = outer - padding broken', 'nested-radius', css('.card { border-radius: 16px; padding: 8px; }\n.card .inner { border-radius: 8px; }\n'), { '8px': '12px' });
allows('inner still within outer', 'nested-radius', css('.card { border-radius: 16px; }\n.card .inner { border-radius: 6px; }\n'), { '6px': '8px' });
blocks('inner larger than outer', 'nested-radius', css('.card { border-radius: 16px; }\n.card .inner { border-radius: 14px; }\n'), { '14px': '20px' }, /larger/);

blocks('h1 no longer above h2', 'type-scale', css('h1 { font-size: 33px; }\nh2 { font-size: 32px; }\n'), { '33px': '32px' });
allows('h1 still above h2', 'type-scale', css('h1 { font-size: 35px; }\nh2 { font-size: 32px; }\n'), { '35px': '36px' });
blocks('line-height ratio beyond 5%', 'type-scale', css('.a { font-size: 16px; line-height: 24px; }\n'), { '24px': '28px' }, /ratio/);

blocks('two sizes collapse', 'variants', css('.btn-sm { padding: 6px; }\n.btn-md { padding: 10px; }\n'), { '6px': '8px', '10px': '8px' }, /collapses/);
allows('variants that stay apart', 'variants', css('.btn-sm { padding: 6px; }\n.btn-md { padding: 10px; }\n'), { '6px': '4px', '10px': '12px' });
allows('a part of a component is not a variant', 'variants', css('.card-header { padding: 6px; }\n.card-footer { padding: 10px; }\n'), { '6px': '8px', '10px': '8px' });

test('selectors: state, variant and base', () => {
    assert.deepEqual(describeSelector('.btn:hover'), { base: '.btn', state: 'hover' });
    assert.deepEqual(describeSelector('.btn:focus-visible'), { base: '.btn', state: 'focus-visible' });
    assert.deepEqual(describeSelector('.btn--active'), { base: '.btn', state: 'active' });
    assert.deepEqual(describeSelector('.menu.is-open'), { base: '.menu', state: 'open' });
    assert.deepEqual(describeSelector('.btn--ghost'), { base: '.btn', variant: { block: 'btn', name: 'ghost' } });
    assert.deepEqual(describeSelector('.btn-sm'), { base: '.btn', variant: { block: 'btn', name: 'sm' } });
    assert.deepEqual(describeSelector('.btn.primary'), { base: '.btn', variant: { block: 'btn', name: 'primary' } });
    assert.deepEqual(describeSelector('.card-header'), { base: '.card-header' });
});

test('contrast is not rounded', () => {
    assert.ok(contrastRatio(colorInfo('#777777')!, colorInfo('#ffffff')!) < 4.5);
    assert.ok(contrastRatio(colorInfo('#767676')!, colorInfo('#ffffff')!) >= 4.5);
});

test('an unblocked change reports what it kept', async () => {
    const result = await guard(css('.a { padding: 25px; gap: 16px; }\n'), { '25px': '24px' });
    assert.deepEqual(result.kept, ['spacing order']);
});
