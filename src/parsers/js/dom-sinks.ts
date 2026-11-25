/**
 * Destinos de estilo do DOM imperativo: `el.style.color = …`, `setProperty`, `setAttribute('style', …)`,
 * `renderer.setStyle`, `Object.assign(el.style, …)` e o contexto do canvas.
 */

import type * as t from '@babel/types';

import { toKebabCase } from '../collector.ts';
import type { Host } from '../../types.ts';
import { memberName } from './flow.ts';

/** Propriedades do contexto 2D do canvas que recebem cor. */
const CANVAS_COLOR_PROPERTIES = new Set(['fillStyle', 'strokeStyle', 'shadowColor']);

/** O que cada destino faz com o valor; quem implementa é o `ScriptSinks`. */
export interface DomActions {
    declare(expression: t.Expression, property: string, host: Host): void;
    declarationList(expression: t.Expression): void;
    emitDom(expression: t.Expression): void;
}

/** `el.style.color = '#fff'`, `el.style.cssText = '…'`, `ctx.fillStyle = '#fff'`. */
export function domAssignment(node: t.AssignmentExpression, actions: DomActions): void {
    if (node.operator !== '=' || node.left.type !== 'MemberExpression') {
        return;
    }
    const name = memberName(node.left);
    if (name === undefined) {
        return;
    }
    if (CANVAS_COLOR_PROPERTIES.has(name)) {
        actions.declare(node.right, 'color', 'js-value');
        return;
    }
    if (!isStyleMember(node.left.object)) {
        return;
    }
    if (name === 'cssText') {
        actions.declarationList(node.right);
    } else if (!name.startsWith('--')) {
        actions.declare(node.right, toKebabCase(name), 'jsx');
    }
}

/** Chamada de método que é destino do DOM. Devolve `true` quando tratou a chamada. */
export function domCall(callee: t.MemberExpression, args: t.CallExpression['arguments'], actions: DomActions): boolean {
    const name = memberName(callee);
    const [first, second, third] = args;
    // `el.style.setProperty('color', '#fff')`
    if (name === 'setProperty' && isStyleMember(callee.object) && first?.type === 'StringLiteral' && !first.value.startsWith('--') && second?.type !== 'SpreadElement' && second) {
        actions.declare(second as t.Expression, first.value.toLowerCase(), 'jsx');
        return true;
    }
    // `el.setAttribute('style', '…')`; `setAttribute('fill', …)` é desenho de SVG e não é lido
    if (name === 'setAttribute' && first?.type === 'StringLiteral' && second && second.type !== 'SpreadElement') {
        if (first.value === 'style') {
            actions.declarationList(second as t.Expression);
        }
        return true;
    }
    // `renderer.setStyle(el, 'color', '#fff')`
    if (name === 'setStyle' && second?.type === 'StringLiteral' && third && third.type !== 'SpreadElement') {
        if (!second.value.startsWith('--')) {
            actions.declare(third as t.Expression, toKebabCase(second.value), 'jsx');
        }
        return true;
    }
    // `Object.assign(el.style, { … })`
    if (name === 'assign' && callee.object.type === 'Identifier' && callee.object.name === 'Object' && first && first.type !== 'SpreadElement' && isStyleMember(first as t.Expression)) {
        for (const source of args.slice(1)) {
            if (source.type !== 'SpreadElement') {
                actions.emitDom(source as t.Expression);
            }
        }
        return true;
    }
    return false;
}

/** `el.style`, `this.el.nativeElement.style`, `document.body.style`. */
function isStyleMember(node: t.Node): boolean {
    return node.type === 'MemberExpression' && memberName(node) === 'style';
}
