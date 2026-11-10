// Tipo pelo nome do token: só quando o nome aponta um tipo e o valor combina com ele.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nameParts, typeFromName } from '../../src/values/type-from-name.ts';

test('splits the name by prefix, separators and camelCase', () => {
    assert.deepEqual(nameParts('--fontSize-md'), ['font', 'size', 'md']);
    assert.deepEqual(nameParts('$space_4'), ['space', '4']);
    assert.deepEqual(nameParts('@radius.md'), ['radius', 'md']);
    assert.deepEqual(nameParts('space.4'), ['space', '4']);
});

test('each family of names declares its type', () => {
    const cases: [string, string, string][] = [
        ['--space-4', '16px', 'spacing'],
        ['--spacing-md', '1rem', 'spacing'],
        ['--gap-sm', '8px', 'spacing'],
        ['--gutter', '24px', 'spacing'],
        ['--radius-md', '8px', 'radius'],
        ['--rounded-lg', '12px', 'radius'],
        ['--border-radius-sm', '4px', 'radius'],
        ['--font-size-base', '16px', 'font-size'],
        ['--text-lg', '1.125rem', 'font-size'],
        ['--fs-sm', '14px', 'font-size'],
        ['--line-height-tight', '1.25', 'line-height'],
        ['--leading-6', '24px', 'line-height'],
        ['--letter-spacing-wide', '0.05em', 'letter-spacing'],
        ['--tracking-tight', '-0.02em', 'letter-spacing'],
        ['--font-weight-bold', '700', 'font-weight'],
        ['--weight-regular', 'normal', 'font-weight'],
        ['--font-sans', 'Inter, "Helvetica Neue", sans-serif', 'font-family'],
        ['--border-width-thin', '1px', 'border-width'],
        ['--border-strong', '2px', 'border-width'],
        ['--shadow-md', '0 4px 6px rgba(0, 0, 0, 0.1)', 'shadow'],
        ['--z-modal', '100', 'z-index'],
        ['--opacity-disabled', '0.5', 'opacity'],
        ['--duration-fast', '150ms', 'duration'],
        ['--ease-out', 'cubic-bezier(0, 0, 0.2, 1)', 'easing'],
        ['--breakpoint-md', '768px', 'breakpoint'],
        ['--container-lg', '1200px', 'container'],
        ['$spacer', '1rem', 'spacing'],
        ['@radius-base', '4px', 'radius'],
    ];
    for (const [name, value, type] of cases) {
        assert.equal(typeFromName(name, value), type, `${name}: ${value}`);
    }
});

test('compound names are not counted twice', () => {
    // `letter-spacing` não é também `spacing`; `font-size` não é também `font-family`
    assert.equal(typeFromName('--letter-spacing-sm', '0.01em'), 'letter-spacing');
    assert.equal(typeFromName('--font-size-sm', '14px'), 'font-size');
});

test('nothing when the name says no type, two types or `size`', () => {
    assert.equal(typeFromName('--card-16', '16px'), undefined);
    assert.equal(typeFromName('--base', '16px'), undefined);
    // `size` é espaçamento no Open Props e tamanho de elemento aqui: não se adivinha
    assert.equal(typeFromName('--size-4', '16px'), undefined);
    assert.equal(typeFromName('--space-radius', '8px'), undefined);
});

test('nothing when the value does not fit the type', () => {
    assert.equal(typeFromName('--space-x', '#fff'), undefined);
    assert.equal(typeFromName('--text-primary', '#333'), undefined);
    assert.equal(typeFromName('--space-4', '16px 8px'), undefined);
    assert.equal(typeFromName('--space-half', '50%'), undefined);
    assert.equal(typeFromName('--z-top', '1.5'), undefined);
    assert.equal(typeFromName('--opacity-high', '2'), undefined);
    assert.equal(typeFromName('--duration-x', '16px'), undefined);
    assert.equal(typeFromName('--font-md', '16px'), undefined);
    assert.equal(typeFromName('--font-ink', 'black'), undefined);
    assert.equal(typeFromName('--ease-x', 'calc(1px)'), undefined);
});

test('a color name with a color value is a color', () => {
    assert.equal(typeFromName('--color-brand', '#4f46e5'), 'color');
    assert.equal(typeFromName('--color-brand', '16px'), undefined);
});
