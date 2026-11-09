/** Cores que o JavaScript lê como valor: opções de gráfico e objetos passados a funções desconhecidas. */

import type * as t from '@babel/types';

import { literals } from './style-object.ts';

const COLOR_KEY = /color$/i;
const COLOR_LITERAL = /^(#[0-9a-f]{3,8}$|(rgb|hsl|hwb|oklch|oklab|lab|lch)a?\()/i;

function keyOf(prop: t.ObjectProperty): string {
    return prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'StringLiteral' ? prop.key.value : '';
}

function plainProperties(object: t.ObjectExpression): t.ObjectProperty[] {
    return object.properties.filter((prop): prop is t.ObjectProperty => prop.type === 'ObjectProperty' && !prop.computed);
}

/** `{ data: { datasets: [{ backgroundColor: ['#111', '#222'] }] } }`: chaves `*Color`, em qualquer profundidade. */
export function chartColors(node: t.Node, seen: WeakSet<t.ObjectExpression>, declare: (value: t.Expression) => void): void {
    if (node.type === 'ArrayExpression') {
        node.elements.forEach((element) => element && chartColors(element, seen, declare));
    } else if (node.type === 'ObjectExpression') {
        seen.add(node);
        for (const prop of plainProperties(node)) {
            const value = prop.value as t.Expression;
            if (!COLOR_KEY.test(keyOf(prop))) {
                chartColors(value, seen, declare);
            } else if (value.type === 'ArrayExpression') {
                value.elements.forEach((element) => element?.type === 'StringLiteral' && declare(element));
            } else {
                declare(value);
            }
        }
    }
}

/**
 * Função desconhecida: só cor explícita em chave de cor é certeza de valor visual.
 * Números ficam de fora: `resize({ width: 300 })` e `configure({ width: 320 })` não se distinguem.
 */
export function unknownColors(source: string, object: t.ObjectExpression, declare: (text: string, offset: number) => void): void {
    for (const prop of plainProperties(object).filter((p) => COLOR_KEY.test(keyOf(p)))) {
        for (const literal of literals(source, prop.value as t.Expression)) {
            if (!literal.numeric && COLOR_LITERAL.test(literal.text)) {
                declare(literal.text, literal.offset);
            }
        }
    }
}
