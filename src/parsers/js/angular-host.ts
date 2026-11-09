/** Estilos que uma classe Angular aplica no próprio elemento: `host: {…}` e `@HostBinding('style.x')`. */

import type * as t from '@babel/types';

import { toKebabCase } from '../collector.ts';
import type { FileCollector } from '../collector.ts';
import { walkDeclarationList } from '../css/stylesheet.ts';
import { literals } from './style-object.ts';

/** `host: { style: 'color: #fff', '[style.color]': "'#fff'", '[style.width.px]': '300' }` */
export function angularHost(collector: FileCollector, host: t.ObjectExpression): void {
    for (const prop of host.properties) {
        if (prop.type !== 'ObjectProperty' || prop.computed) {
            continue;
        }
        const key = prop.key.type === 'StringLiteral' ? prop.key.value : prop.key.type === 'Identifier' ? prop.key.name : undefined;
        if (key === 'style') {
            for (const literal of literals(collector.source, prop.value as t.Expression)) {
                walkDeclarationList(collector, literal.text, literal.offset, 'jsx', undefined);
            }
            continue;
        }
        const binding = key?.match(/^\[style\.([\w-]+)(?:\.([a-z%]+))?\]$/i);
        if (!binding || prop.value.type !== 'StringLiteral') {
            continue;
        }
        hostExpression(collector, prop.value, toKebabCase(binding[1]!), binding[2]);
    }
}

/**
 * O valor é uma expressão Angular dentro de uma string de JS: só literal simples.
 * Fica como `angular-template` e sem a posição da unidade, então o `fix` não mexe no número.
 */
function hostExpression(collector: FileCollector, value: t.StringLiteral, property: string, unit: string | undefined): void {
    const [literal] = literals(collector.source, value);
    if (!literal) {
        return;
    }
    const quoted = literal.text.match(/^(['"])(.*)\1$/);
    const text = quoted ? quoted[2]! : literal.text;
    const numeric = !quoted && /^-?\d*\.?\d+$/.test(literal.text);
    if (!quoted && !numeric) {
        return;
    }
    const impliedUnit = numeric ? unit : undefined;
    collector.declaration({
        property,
        value: text,
        offset: literal.offset + (quoted ? 1 : 0),
        host: 'angular-template',
        siblings: new Map(),
        ...(impliedUnit ? { impliedUnit } : {}),
        ...(numeric ? { numeric: true } : {}),
    });
}

/** `@HostBinding('style.color') color = '#fff'` e `@HostBinding('style.width.px') width = 300` */
export function hostBinding(collector: FileCollector, member: t.ClassProperty): void {
    for (const decorator of member.decorators ?? []) {
        const call = decorator.expression;
        if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== 'HostBinding') {
            continue;
        }
        const argument = call.arguments[0];
        const parts = argument?.type === 'StringLiteral' ? argument.value.match(/^style\.([\w-]+)(?:\.([a-z%]+))?$/i) : null;
        if (!parts || argument?.type !== 'StringLiteral' || !member.value) {
            continue;
        }
        const unit = parts[2];
        for (const literal of literals(collector.source, member.value)) {
            const impliedUnit = literal.numeric ? unit : undefined;
            // Só com um valor único a unidade pode sair do decorator junto com o número
            const closing = argument.end! - 1;
            const suffix = impliedUnit ? { offset: closing - impliedUnit.length - 1, endOffset: closing } : undefined;
            collector.declaration({
                property: toKebabCase(parts[1]!),
                value: literal.text,
                offset: literal.offset,
                host: 'jsx',
                siblings: new Map(),
                ...(impliedUnit ? { impliedUnit, numeric: true } : {}),
                ...(suffix && member.value.type === 'NumericLiteral' ? { unitSuffix: suffix } : {}),
            });
        }
    }
}
