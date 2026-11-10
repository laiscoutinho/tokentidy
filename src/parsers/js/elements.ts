/**
 * Elementos JSX: que classes têm, quais dependem de condição e quem contém quem.
 * `className={isActive ? 'on' : 'off'}` e `clsx('btn', { on: isActive })` dizem que `.on` é um estado.
 */

import type * as t from '@babel/types';

import type { FileCollector } from '../collector.ts';

const CLASS_HELPERS = new Set(['clsx', 'cn', 'classnames', 'classNames', 'cx']);

interface Classes {
    always: string[];
    conditional: string[];
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);

function readClasses(node: t.Node, conditional: boolean, into: Classes): void {
    const target = conditional ? into.conditional : into.always;
    switch (node.type) {
        case 'StringLiteral':
            target.push(...words(node.value));
            break;
        case 'TemplateLiteral':
            node.quasis.forEach((quasi) => target.push(...words(quasi.value.cooked ?? '')));
            node.expressions.forEach((expression) => readClasses(expression, conditional, into));
            break;
        case 'ConditionalExpression':
            readClasses(node.consequent, true, into);
            readClasses(node.alternate, true, into);
            break;
        case 'LogicalExpression':
            readClasses(node.right, true, into);
            break;
        // CSS Modules: `styles.active`
        case 'MemberExpression':
            if (!node.computed && node.property.type === 'Identifier') {
                target.push(node.property.name);
            }
            break;
        case 'CallExpression':
            if (node.callee.type === 'Identifier' && CLASS_HELPERS.has(node.callee.name)) {
                node.arguments.forEach((argument) => readClasses(argument, conditional, into));
            }
            break;
        case 'ObjectExpression':
            for (const prop of node.properties) {
                if (prop.type === 'ObjectProperty' && !prop.computed) {
                    const name = prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'StringLiteral' ? prop.key.value : '';
                    into.conditional.push(...words(name));
                }
            }
            break;
        default:
    }
}

function classesOf(opening: t.JSXOpeningElement): Classes {
    const classes: Classes = { always: [], conditional: [] };
    for (const attr of opening.attributes) {
        if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && (attr.name.name === 'className' || attr.name.name === 'class') && attr.value) {
            readClasses(attr.value.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value, false, classes);
        }
    }
    return classes;
}

function isNode(value: unknown): value is t.Node {
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

export function jsxElements(collector: FileCollector, root: t.Node): void {
    const walk = (node: t.Node, ancestors: readonly string[][]): void => {
        let inner = ancestors;
        if (node.type === 'JSXElement') {
            const { always, conditional } = classesOf(node.openingElement);
            const name = node.openingElement.name;
            collector.element({ tag: name.type === 'JSXIdentifier' ? name.name : 'element', classes: always, conditional, ancestors: [...ancestors] });
            inner = [always, ...ancestors];
        }
        for (const key of Object.keys(node) as (keyof t.Node)[]) {
            if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') {
                continue;
            }
            const child = node[key] as unknown;
            for (const item of Array.isArray(child) ? child : [child]) {
                if (isNode(item)) {
                    walk(item, inner);
                }
            }
        }
    };
    walk(root, []);
}
