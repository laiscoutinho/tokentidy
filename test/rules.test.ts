import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isHorizontallyCentered, rulesForProperty } from '../src/rules.ts';

const siblings = (entries: Record<string, string>) => new Map(Object.entries(entries));

test('classifies properties by token type', () => {
    assert.deepEqual(rulesForProperty('color'), [{ type: 'color', match: 'color' }]);
    assert.deepEqual(rulesForProperty('border-inline-start-color'), [{ type: 'color', match: 'color' }]);
    assert.deepEqual(rulesForProperty('padding-block-end'), [{ type: 'spacing', match: 'length' }]);
    assert.deepEqual(rulesForProperty('row-gap'), [{ type: 'spacing', match: 'length' }]);
    assert.deepEqual(rulesForProperty('border-top-left-radius'), [{ type: 'radius', match: 'radius' }]);
    assert.deepEqual(rulesForProperty('line-height'), [{ type: 'line-height', match: 'line-height' }]);
    assert.deepEqual(rulesForProperty('box-shadow'), [{ type: 'shadow', match: 'shadow' }]);
    assert.deepEqual(rulesForProperty('stroke-opacity'), [{ type: 'opacity', match: 'opacity' }]);
    assert.deepEqual(rulesForProperty('animation-delay'), [{ type: 'duration', match: 'duration' }]);
    assert.deepEqual(rulesForProperty('z-index'), [{ type: 'z-index', match: 'z-index' }]);
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

test('width alone is ambiguous: it goes to review, not to violations', () => {
    const review = [{ type: 'size', match: 'length', review: 'size/no-context' }];
    assert.deepEqual(rulesForProperty('width', siblings({ width: '300px' })), review);
    assert.deepEqual(rulesForProperty('height', siblings({ width: '20px', height: '24px' })), review);
    assert.deepEqual(rulesForProperty('max-height', siblings({ 'max-height': '80vh' })), review);
    assert.deepEqual(rulesForProperty('flex-basis'), []);
});

test('vendor prefixes follow the unprefixed property', () => {
    assert.deepEqual(rulesForProperty('-webkit-box-shadow'), rulesForProperty('box-shadow'));
    assert.deepEqual(rulesForProperty('-moz-border-radius'), rulesForProperty('border-radius'));
    assert.deepEqual(rulesForProperty('-webkit-tap-highlight-color'), []);
});

test('user keys never reach Object.prototype', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
        assert.deepEqual(rulesForProperty(key, siblings({ [key]: '10px', width: '10px', height: '10px' })), [], key);
    }
});

test('width of a horizontally centered block is a container', () => {
    const margins: Record<string, string>[] = [{ margin: '0 auto' }, { margin: '2rem auto 0' }, { 'margin-inline': 'auto' }, { 'margin-left': 'auto', 'margin-right': 'auto' }];
    for (const margin of margins) {
        assert.deepEqual(rulesForProperty('max-width', siblings({ 'max-width': '1200px', ...margin })), [{ type: 'container', match: 'length' }], JSON.stringify(margin));
    }
});

test('equal width and height make a square element: size', () => {
    const square = siblings({ width: '24px', height: '24PX' });
    assert.deepEqual(rulesForProperty('width', square), [{ type: 'size', match: 'length' }]);
    assert.deepEqual(rulesForProperty('height', square), [{ type: 'size', match: 'length' }]);
});

test('isHorizontallyCentered reads every form of the margin shorthand', () => {
    assert.equal(isHorizontallyCentered(siblings({ margin: 'auto' })), true);
    assert.equal(isHorizontallyCentered(siblings({ margin: '0 auto 0 auto' })), true);
    assert.equal(isHorizontallyCentered(siblings({ margin: '0 auto 0 8px' })), false);
    assert.equal(isHorizontallyCentered(siblings({ margin: 'auto 0' })), false);
    assert.equal(isHorizontallyCentered(siblings({})), false);
});
