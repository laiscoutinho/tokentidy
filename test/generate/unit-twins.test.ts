// O mesmo tamanho em px e em rem: dois tokens com nomes que dizem a diferença, não `-2`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nameGroups } from '../../src/generate/naming/token-names.ts';
import type { NamingInput } from '../../src/generate/naming/token-names.ts';

const context = { rootFontSize: 16, gridBase: 4 };
const names = (groups: NamingInput[]) => [...nameGroups(groups, context)].map(([g, path]) => `${g.key} ${path.join('-')}`);

test('a size written in px and in rem gets the unit in the name of the second', () => {
    assert.deepEqual(names([
        { type: 'size', key: '48px', property: 'width' },
        { type: 'size', key: '3rem', property: 'width' },
        { type: 'radius', key: '2px', property: 'border-radius' },
        { type: 'radius', key: '0.125rem', property: 'border-radius' },
    ]), ['48px size-12', '3rem size-12-rem', '2px radius-xs', '0.125rem radius-xs-rem']);
});

test('other collisions keep the number suffix', () => {
    const result = names([
        { type: 'easing', key: 'cubic-bezier(0.1, 0.2, 0.3, 1)', property: 'transition' },
        { type: 'easing', key: 'cubic-bezier(0.9, 0.2, 0.3, 1)', property: 'transition' },
    ]);
    assert.equal(new Set(result.map((r) => r.split(' ').at(-1))).size, 2);
    assert.ok(!result.some((r) => r.endsWith('-rem')));
});
