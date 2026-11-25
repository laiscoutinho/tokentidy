/**
 * Funções e construtores de bibliotecas que recebem um objeto de estilo próprio (canvas, jogos):
 * `new PIXI.TextStyle({ fill: '#fff' })`, `this.add.text(x, y, s, { color: '#fff' })` do Phaser.
 * O valor é lido por JavaScript, não pelo CSS: `js-value`. Só as chaves listadas são lidas.
 */

import type * as t from '@babel/types';

import { memberName } from './flow.ts';

/** Um destino: `call` é o fim do nome chamado (`TextStyle`, `add.text`); `keys`, as chaves de estilo do objeto. */
export interface StyleSink {
    call: string;
    keys?: readonly string[];
}

/** Destinos conhecidos. Os da configuração (`styleSinks`) se somam a estes. */
export const DEFAULT_STYLE_SINKS: readonly StyleSink[] = [
    // PixiJS: `fill` e `stroke` são cores; `strokeThickness` e `padding` ficam de fora
    { call: 'TextStyle', keys: ['fill', 'stroke', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'dropShadowColor'] },
    // Phaser: o quarto argumento de `this.add.text`
    { call: 'add.text', keys: ['color', 'backgroundColor', 'stroke', 'fontFamily', 'fontSize', 'fontStyle'] },
];

/** Nome chamado, do jeito que a configuração o escreve: `this.add.text` → `['add', 'text']` (o `this` não conta). */
function calleePath(node: t.Node): string[] | undefined {
    if (node.type === 'Identifier') {
        return [node.name];
    }
    if (node.type === 'ThisExpression') {
        return [];
    }
    if (node.type === 'MemberExpression') {
        const name = memberName(node);
        const head = calleePath(node.object as t.Expression);
        return name === undefined || head === undefined ? undefined : [...head, name];
    }
    return undefined;
}

/** O destino que esta chamada (ou `new`) atinge, se algum. */
export function styleSinkOf(callee: t.Node, sinks: readonly StyleSink[]): StyleSink | undefined {
    const path = calleePath(callee);
    if (!path?.length) {
        return undefined;
    }
    return sinks.find((sink) => {
        const parts = sink.call.split('.');
        return parts.length <= path.length && parts.every((part, i) => part === path[path.length - parts.length + i]);
    });
}
