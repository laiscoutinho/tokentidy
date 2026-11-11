// Nome de cor: família pelo matiz, degrau pela luminosidade na curva da família, e a escala sempre em ordem.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { familyOf } from '../../src/generate/naming/color-family.ts';
import { colorSteps, stepPosition } from '../../src/generate/naming/color-steps.ts';
import { colorInfo } from '../../src/values/color-info.ts';

const lightness = (color: string) => colorInfo(color)!.oklch[0];
const family = (color: string) => familyOf(colorInfo(color)!.oklch);

test('the family comes from the hue, also in light colors', () => {
    assert.equal(family('#f5f5dc'), 'yellow');
    assert.equal(family('#ffff00'), 'yellow');
    assert.equal(family('#0000ff'), 'blue');
    assert.equal(family('#00a32a'), 'green');
    assert.equal(family('#24292d'), 'gray');
    assert.equal(family('#d3d3d3'), 'gray');
});

test('steps follow lightness: lighter is always a smaller number', () => {
    const grays = ['#d3d3d3', '#cccccc', '#24292d', '#1e1e1e', '#757575', '#949494', '#dddddd', '#eeeeee', '#f0f0f0', '#2f2f2f'];
    const steps = colorSteps(grays, 'gray', lightness);
    const ordered = grays.toSorted((a, b) => lightness(b) - lightness(a)).map((c) => Number(steps.get(c)));
    assert.deepEqual(ordered, ordered.toSorted((a, b) => a - b));
    assert.equal(new Set(ordered).size, grays.length);
    assert.equal(steps.get('#d3d3d3'), '300');
    assert.equal(steps.get('#24292d'), '800');
    assert.ok(Number(steps.get('#cccccc')) > 300);

    assert.equal(colorSteps(['#0000ff'], 'blue', lightness).get('#0000ff'), '800');
    assert.notEqual(colorSteps(['#ffff00'], 'yellow', lightness).get('#ffff00'), '50');
    assert.ok(stepPosition('gray', 1) === 0 && stepPosition('gray', 0) === 1000);
});
