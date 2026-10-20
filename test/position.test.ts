import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPositionLookup } from '../src/position.ts';

test('converts an offset to 1-based line and column', () => {
    const positionOf = createPositionLookup('ab\ncd\n\nef');
    assert.deepEqual(positionOf(0), { line: 1, column: 1 });
    assert.deepEqual(positionOf(2), { line: 1, column: 3 }); // o próprio \n
    assert.deepEqual(positionOf(3), { line: 2, column: 1 });
    assert.deepEqual(positionOf(6), { line: 3, column: 1 }); // linha vazia
    assert.deepEqual(positionOf(8), { line: 4, column: 2 });
});

test('CRLF: the \\r stays at the end of the line and does not shift the next one', () => {
    const positionOf = createPositionLookup('a\r\nb');
    assert.deepEqual(positionOf(3), { line: 2, column: 1 });
});
