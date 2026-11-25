import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IGNORED_FUNCTIONS, rulesForProperty } from '../../src/analysis/rules.ts';

test('classifies properties by token type', () => {
    assert.deepEqual(rulesForProperty('color'), [{ type: 'color', match: 'color' }]);
    assert.deepEqual(rulesForProperty('border-inline-start-color'), [{ type: 'color', match: 'color' }]);
    assert.deepEqual(rulesForProperty('padding-block-end'), [{ type: 'spacing', match: 'length' }]);
    assert.deepEqual(rulesForProperty('row-gap'), [{ type: 'spacing', match: 'length' }]);
    assert.deepEqual(rulesForProperty('border-top-left-radius'), [{ type: 'radius', match: 'radius' }]);
    assert.deepEqual(rulesForProperty('line-height'), [{ type: 'line-height', match: 'line-height' }]);
    assert.deepEqual(rulesForProperty('box-shadow'), [{ type: 'shadow', match: 'shadow' }]);
    assert.deepEqual(rulesForProperty('filter'), [{ type: 'shadow', match: 'drop-shadow' }]);
    assert.deepEqual(rulesForProperty('animation-delay'), [{ type: 'duration', match: 'duration' }]);
});

test('shorthands that mix decisions return one rule per decision', () => {
    assert.deepEqual(rulesForProperty('border'), [{ type: 'border-width', match: 'length' }, { type: 'color', match: 'color' }]);
    assert.deepEqual(rulesForProperty('transition'), [{ type: 'duration', match: 'duration' }, { type: 'easing', match: 'easing' }]);
});

test('is case-insensitive', () => {
    assert.deepEqual(rulesForProperty('COLOR'), [{ type: 'color', match: 'color' }]);
});

test('ignores out-of-scope properties and token definitions', () => {
    assert.deepEqual(rulesForProperty('display'), []);
    assert.deepEqual(rulesForProperty('--color-primary'), []);
    assert.deepEqual(rulesForProperty('$red'), []);
});

test('width and height always go to review, never to violations', () => {
    const review = [{ type: 'size', match: 'length', review: 'size/no-context' }];
    for (const prop of ['width', 'height', 'max-width', 'min-height', 'inline-size', 'max-block-size']) {
        assert.deepEqual(rulesForProperty(prop), review, prop);
    }
    assert.deepEqual(rulesForProperty('flex-basis'), []);
});

test('z-index, opacity and layout math are out of scope', () => {
    for (const prop of ['z-index', 'opacity', 'fill-opacity', 'stroke-opacity']) {
        assert.deepEqual(rulesForProperty(prop), [], prop);
    }
    for (const fn of ['calc', 'clamp', 'min', 'max']) {
        assert.ok(IGNORED_FUNCTIONS.has(fn), fn);
    }
});

test('vendor prefixes follow the unprefixed property', () => {
    assert.deepEqual(rulesForProperty('-webkit-box-shadow'), rulesForProperty('box-shadow'));
    assert.deepEqual(rulesForProperty('-moz-border-radius'), rulesForProperty('border-radius'));
    assert.deepEqual(rulesForProperty('-webkit-tap-highlight-color'), []);
});

test('user keys never reach Object.prototype', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
        assert.deepEqual(rulesForProperty(key), [], key);
    }
});
