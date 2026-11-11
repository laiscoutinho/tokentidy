// A aproximação de cor não muda o tom: ΔE pequeno não basta quando um rosado ou um azulado iria para cinza.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sameHue } from '../../src/check/near.ts';
import { findConsolidations } from '../../src/consolidate/consolidate.ts';
import type { Finding } from '../../src/types.ts';
import { colorInfo } from '../../src/values/color-info.ts';

const color = (value: string, line: number): Finding => ({
    file: 'a.scss', line, column: 1, offset: line * 10, endOffset: line * 10 + value.length,
    type: 'color', rule: 'color/hardcoded', property: 'background-color', value, host: 'scss',
});
const oklch = (value: string) => colorInfo(value)!.oklch;

test('a tinted color never goes to a neutral token, even within the ΔE tolerance', () => {
    const findings = ['#fcf0f1', '#f0f6fc', '#d4cdcb', '#f1f1f1'].map(color);
    const groups = findConsolidations(findings, { gridBase: 4, colorTolerance: 0.03 }, ['#f0f0f0', '#cccccc']);
    assert.deepEqual(groups.map((g) => [g.from.map((f) => f.key), g.to]), [[['#f1f1f1'], '#f0f0f0']]);
});

test('sameHue: neutrals with neutrals, and tinted colors only within the hue limit', () => {
    assert.equal(sameHue(oklch('#ffffff'), oklch('#f0f0f0')), true);
    assert.equal(sameHue(oklch('#fcf0f1'), oklch('#f0f0f0')), false);
    assert.equal(sameHue(oklch('#3858e9'), oklch('#3a5ae8')), true);
    assert.equal(sameHue(oklch('#3858e9'), oklch('#7a3ae8')), false);
    // O matiz é circular: 355° e 5° estão a 10° um do outro
    assert.equal(sameHue([0.6, 0.1, 355], [0.6, 0.1, 5]), true);
});
