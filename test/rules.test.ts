import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ruleForProperty } from '../src/rules.ts';

test('classifies properties by category', () => {
    assert.deepEqual(ruleForProperty('color'), { kind: 'color', match: 'color' });
    assert.deepEqual(ruleForProperty('border-inline-start-color'), { kind: 'color', match: 'color' });
    assert.deepEqual(ruleForProperty('padding-block-end'), { kind: 'spacing', match: 'length' });
    assert.deepEqual(ruleForProperty('row-gap'), { kind: 'spacing', match: 'length' });
    assert.deepEqual(ruleForProperty('line-height'), { kind: 'typography', match: 'line-height' });
});

test('is case-insensitive', () => {
    assert.deepEqual(ruleForProperty('COLOR'), { kind: 'color', match: 'color' });
});

test('ignores out-of-scope properties and token definitions', () => {
    assert.equal(ruleForProperty('width'), undefined);
    assert.equal(ruleForProperty('border-radius'), undefined);
    assert.equal(ruleForProperty('--color-primary'), undefined);
    assert.equal(ruleForProperty('$red'), undefined);
});
