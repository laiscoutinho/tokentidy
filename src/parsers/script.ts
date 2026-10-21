// Parser de JS/JSX/TS/TSX: estilo inline do React (`style={{ ... }}`) e componentes Angular
// (`@Component({ styles, template, templateUrl })`). Usa o parser do Babel: JS puro (sem binário nativo),
// entende JSX, TypeScript e decorators, e informa a posição de cada nó.

import { parse } from '@babel/parser';
import type { ParserPlugin } from '@babel/parser';
import type * as t from '@babel/types';

import { FileCollector, elementSelector, offsetAt, toKebabCase } from './collector.ts';
import type { ParseResult } from './collector.ts';
import { walkStylesheet } from './css.ts';

/**
 * Propriedades em que o React NÃO completa número com `px` (`lineHeight: 1.5` fica `1.5`).
 * Nas outras, `padding: 8` vira `8px`. Lista do próprio React (`isUnitlessNumber`).
 */
const UNITLESS_PROPERTIES = new Set([
    'animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth',
    'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow', 'flexPositive',
    'flexShrink', 'flexNegative', 'flexOrder', 'gridArea', 'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart',
    'gridColumn', 'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'fontWeight', 'lineClamp', 'lineHeight',
    'opacity', 'order', 'orphans', 'scale', 'tabSize', 'widows', 'zIndex', 'zoom', 'fillOpacity', 'floodOpacity',
    'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth',
]);

export async function parseScript(source: string, file: string): Promise<ParseResult> {
    const collector = new FileCollector(file, source);
    // Atalho barato antes de montar a árvore: sem `style` nem `Component` no texto, não há o que procurar
    if (!source.includes('style') && !source.includes('Component')) {
        return collector.result;
    }

    let program: t.File;
    try {
        program = parse(source, { sourceType: 'unambiguous', plugins: pluginsFor(file), errorRecovery: true });
    } catch (error) {
        const loc = (error as { loc?: { line: number; column: number } }).loc;
        if (!loc) {
            throw error;
        }
        // O Babel conta a coluna a partir de 0
        collector.error(offsetAt(source, loc.line, loc.column + 1), (error as Error).message.replace(/ \(\d+:\d+\)$/, ''));
        return collector.result;
    }

    const component: AngularComponent = { templates: [], templateUrls: [] };
    visit(program.program, (node) => {
        if (node.type === 'JSXOpeningElement') {
            jsxStyle(collector, node);
        } else if (node.type === 'Decorator') {
            angularComponent(collector, node, component);
        }
    });
    // O parser do Angular é pesado: só é carregado quando um componente tem `template:` inline
    if (component.templates.length > 0) {
        const { walkAngularTemplate } = await import('./angular.ts');
        for (const template of component.templates) {
            walkAngularTemplate(collector, template.text, template.offset);
        }
    }
    if (component.templateUrls.length > 0) {
        collector.result.templateUrls = component.templateUrls;
    }
    return collector.result;
}

/** `.ts` não aceita JSX (o `<T>` de genéricos conflita); `.js` aceita, porque projetos React antigos usam JSX em `.js`. */
function pluginsFor(file: string): ParserPlugin[] {
    if (file.endsWith('.tsx')) {
        return ['jsx', 'typescript', 'decorators'];
    }
    if (file.endsWith('.ts') || file.endsWith('.mts') || file.endsWith('.cts')) {
        return ['typescript', 'decorators'];
    }
    return ['jsx', 'decorators'];
}

/** Percorre a árvore do Babel chamando `callback` para cada nó. */
function visit(node: t.Node, callback: (node: t.Node) => void): void {
    callback(node);
    for (const key of Object.keys(node) as (keyof t.Node)[]) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') {
            continue;
        }
        const child = node[key] as unknown;
        if (Array.isArray(child)) {
            for (const item of child) {
                if (isNode(item)) {
                    visit(item, callback);
                }
            }
        } else if (isNode(child)) {
            visit(child, callback);
        }
    }
}

function isNode(value: unknown): value is t.Node {
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/** `<button className="remove" style={{ color: '#fff', padding: 8 }}>` */
function jsxStyle(collector: FileCollector, element: t.JSXOpeningElement): void {
    const attributes = element.attributes.filter((attr): attr is t.JSXAttribute => attr.type === 'JSXAttribute');
    const style = attributes.find((attr) => attr.name.type === 'JSXIdentifier' && attr.name.name === 'style');
    if (style?.value?.type !== 'JSXExpressionContainer' || style.value.expression.type !== 'ObjectExpression') {
        return;
    }

    const staticAttr = (name: string): string | undefined => {
        const attr = attributes.find((a) => a.name.type === 'JSXIdentifier' && a.name.name === name);
        return attr?.value?.type === 'StringLiteral' ? attr.value.value : undefined;
    };
    const tagName = element.name.type === 'JSXIdentifier' ? element.name.name : 'element';
    const attrs = [['id', staticAttr('id')], ['class', staticAttr('className')]]
        .filter((pair): pair is [string, string] => pair[1] !== undefined)
        .map(([name, value]) => ({ name, value }));
    const selector = elementSelector(tagName, attrs);

    const values = style.value.expression.properties.flatMap((prop) => {
        if (prop.type !== 'ObjectProperty') {
            return [];
        }
        const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'StringLiteral' ? prop.key.value : undefined;
        if (key === undefined || key.startsWith('--')) {
            return [];
        }
        const impliedUnit = UNITLESS_PROPERTIES.has(key) ? undefined : 'px';
        return literals(collector.source, prop.value as t.Expression).map((literal) => ({
            property: toKebabCase(key),
            ...literal,
            impliedUnit: literal.numeric ? impliedUnit : undefined,
        }));
    });

    const siblings = new Map(values.map((v) => [v.property, v.impliedUnit ? `${v.text}${v.impliedUnit}` : v.text]));
    for (const value of values) {
        collector.declaration({
            property: value.property,
            value: value.text,
            offset: value.offset,
            host: 'jsx',
            siblings,
            selector,
            ...(value.impliedUnit ? { impliedUnit: value.impliedUnit } : {}),
        });
    }
}

interface Literal {
    text: string;
    offset: number;
    numeric: boolean;
}

/**
 * Literais de uma expressão: string, template sem `${}`, número (`8`, `-8`)
 * e os dois lados de um ternário ou o lado direito de `||`/`??` (`cor || '#fff'`).
 * Expressões calculadas (variáveis, chamadas) já não são valor solto.
 */
function literals(source: string, node: t.Expression): Literal[] {
    switch (node.type) {
        case 'StringLiteral':
            return stringContent(source, node.start!, node.end!, node.value);
        case 'TemplateLiteral': {
            const quasi = node.quasis[0];
            return node.expressions.length === 0 && quasi ? stringContent(source, quasi.start!, quasi.end!, quasi.value.cooked ?? '', false) : [];
        }
        case 'NumericLiteral':
            return [{ text: source.slice(node.start!, node.end!), offset: node.start!, numeric: true }];
        case 'UnaryExpression':
            return node.operator === '-' && node.argument.type === 'NumericLiteral'
                ? [{ text: source.slice(node.start!, node.end!), offset: node.start!, numeric: true }]
                : [];
        case 'ConditionalExpression':
            return [...literals(source, node.consequent), ...literals(source, node.alternate)];
        case 'LogicalExpression':
            return node.operator === '&&' ? [] : literals(source, node.right);
        default:
            return [];
    }
}

/**
 * Conteúdo de uma string, sem as aspas. Com escape (`'\''`) o texto do arquivo difere do valor
 * e as posições deixariam de bater: fica de fora.
 */
function stringContent(source: string, start: number, end: number, value: string, quoted = true): Literal[] {
    const from = quoted ? start + 1 : start;
    const to = quoted ? end - 1 : end;
    const text = source.slice(from, to);
    return text === value ? [{ text, offset: from, numeric: false }] : [];
}

interface AngularComponent {
    /** `template:` inline, analisado depois de carregar o parser do Angular. */
    templates: Literal[];
    templateUrls: string[];
}

/** `@Component({ styles: [...], template: '...', templateUrl: './x.html' })` */
function angularComponent(collector: FileCollector, decorator: t.Decorator, component: AngularComponent): void {
    const call = decorator.expression;
    if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== 'Component') {
        return;
    }
    const options = call.arguments[0];
    if (options?.type !== 'ObjectExpression') {
        return;
    }
    for (const prop of options.properties) {
        if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') {
            continue;
        }
        const value = prop.value as t.Expression;
        switch (prop.key.name) {
            case 'styles': {
                // `styles: '...'` (Angular 17+) ou `styles: ['...', '...']`
                const items = value.type === 'ArrayExpression' ? value.elements : [value];
                for (const item of items) {
                    for (const literal of item && item.type !== 'SpreadElement' ? literals(collector.source, item as t.Expression) : []) {
                        // O Angular aceita SCSS inline quando o projeto configura `inlineStyleLanguage`; o parser de SCSS lê CSS também
                        walkStylesheet(collector, literal.text, literal.offset, 'scss');
                    }
                }
                break;
            }
            case 'template':
                component.templates.push(...literals(collector.source, value));
                break;
            case 'templateUrl':
                if (value.type === 'StringLiteral') {
                    component.templateUrls.push(value.value);
                }
                break;
        }
    }
}
