/**
 * Objetos de estilo do JavaScript: `{ padding: 8, color: '#fff' }`. O mesmo percurso serve para `style={{}}`,
 * objetos seguidos por variável, `Object.assign(el.style, …)`, `sx` do MUI e `css({…})`; muda só o que o destino aceita.
 */

import type * as t from '@babel/types';

import { toKebabCase } from '../collector.ts';
import type { FileCollector } from '../collector.ts';
import type { Host } from '../../types.ts';

/**
 * Propriedades em que o React NÃO completa número com `px` (`lineHeight: 1.5` fica `1.5`).
 * Nas outras, `padding: 8` vira `8px`. Lista do próprio React (`isUnitlessNumber`).
 */
export const UNITLESS_PROPERTIES = new Set([
    'animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth',
    'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow', 'flexPositive',
    'flexShrink', 'flexNegative', 'flexOrder', 'gridArea', 'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart',
    'gridColumn', 'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'fontWeight', 'lineClamp', 'lineHeight',
    'opacity', 'order', 'orphans', 'scale', 'tabSize', 'widows', 'zIndex', 'zoom', 'fillOpacity', 'floodOpacity',
    'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth',
]);

/** Atalhos do sistema do MUI para a propriedade CSS correspondente. */
const SX_ALIASES = new Map([
    ['m', 'margin'], ['mt', 'marginTop'], ['mr', 'marginRight'], ['mb', 'marginBottom'], ['ml', 'marginLeft'],
    // O MUI expande `mx` em left + right; uma propriedade lógica mantém um achado por valor, com o mesmo tipo
    ['mx', 'marginInline'], ['my', 'marginBlock'],
    ['p', 'padding'], ['pt', 'paddingTop'], ['pr', 'paddingRight'], ['pb', 'paddingBottom'], ['pl', 'paddingLeft'],
    ['px', 'paddingInline'], ['py', 'paddingBlock'],
    ['bgcolor', 'backgroundColor'],
]);

const SX_BREAKPOINTS = new Set(['xs', 'sm', 'md', 'lg', 'xl']);

/**
 * O que o destino aceita:
 * - `style`: plano, número vira `px` (React);
 * - `css-object`: como `style`, com blocos aninhados (`'&:hover': {…}`);
 * - `sx`: só strings (`p: 2` já é um passo do tema), com atalhos e valores por breakpoint;
 * - `dom`: plano, número não vira `px` (`el.style.padding = 8` é ignorado pelo navegador).
 */
export type ObjectKind = 'style' | 'css-object' | 'sx' | 'dom';

export interface ObjectContext {
    collector: FileCollector;
    kind: ObjectKind;
    host: Host;
    selector?: string;
    /** Objetos de um `...spread` (os importados de outro arquivo são resolvidos depois). */
    follow: (node: t.Expression) => t.ObjectExpression[];
    /** Um objeto usado em dois lugares é reportado uma vez. */
    seen: WeakSet<t.ObjectExpression>;
}

interface StyleValue extends Literal {
    property: string;
    impliedUnit?: string;
}

export function emitStyleObjects(objects: readonly t.ObjectExpression[], context: ObjectContext): void {
    const nested: t.ObjectExpression[] = [];
    const values = objects.filter((object) => !context.seen.has(object)).flatMap((object) => valuesOf(object, context, nested));
    const siblings = new Map(values.map((v) => [v.property, v.impliedUnit ? `${v.text}${v.impliedUnit}` : v.text]));
    for (const value of values) {
        context.collector.declaration({
            property: value.property,
            value: value.text,
            offset: value.offset,
            host: context.host,
            siblings,
            ...(context.selector === undefined ? {} : { selector: context.selector }),
            ...(value.impliedUnit ? { impliedUnit: value.impliedUnit } : {}),
            ...(value.numeric ? { numeric: true } : {}),
            ...(value.branch === undefined ? {} : { branch: value.branch }),
        });
    }
    // Cada bloco aninhado é outra regra: seus vizinhos são só os dele
    for (const object of nested) {
        emitStyleObjects([object], context);
    }
}

function valuesOf(object: t.ObjectExpression, context: ObjectContext, nested: t.ObjectExpression[]): StyleValue[] {
    context.seen.add(object);
    const { collector, kind } = context;
    return object.properties.flatMap((prop): StyleValue[] => {
        if (prop.type === 'SpreadElement') {
            return context.follow(prop.argument).filter((o) => !context.seen.has(o)).flatMap((o) => valuesOf(o, context, nested));
        }
        if (prop.type !== 'ObjectProperty' || prop.computed) {
            return [];
        }
        const written = prop.key.type === 'Identifier' ? prop.key.name : prop.key.type === 'StringLiteral' ? prop.key.value : undefined;
        if (written === undefined || written.startsWith('--')) {
            return [];
        }
        const key = kind === 'sx' ? SX_ALIASES.get(written) ?? written : written;
        const value = prop.value as t.Expression;
        if (value.type === 'ObjectExpression') {
            if (kind === 'sx' && [...value.properties].every((p) => p.type === 'ObjectProperty' && p.key.type === 'Identifier' && SX_BREAKPOINTS.has(p.key.name))) {
                return value.properties.flatMap((p) => stylesFrom(collector.source, (p as t.ObjectProperty).value as t.Expression, key, kind));
            }
            if (kind === 'sx' || kind === 'css-object') {
                nested.push(value);
            }
            return [];
        }
        return stylesFrom(collector.source, value, key, kind);
    });
}

function stylesFrom(source: string, node: t.Expression, key: string, kind: ObjectKind): StyleValue[] {
    const impliedUnit = kind === 'dom' || UNITLESS_PROPERTIES.has(key) ? undefined : 'px';
    return literals(source, node)
        // `p: 2` e `fontWeight: '700'` no `sx` são passos do tema; só strings com unidade ou cor são valor solto
        .filter((literal) => (kind !== 'sx' || (!literal.numeric && !/^[\d.]+$/.test(literal.text))) && (kind !== 'dom' || !literal.numeric || impliedUnit === undefined && UNITLESS_PROPERTIES.has(key)))
        .map((literal) => ({
            ...literal,
            property: toKebabCase(key),
            ...(literal.numeric && impliedUnit ? { impliedUnit } : {}),
        }));
}

export interface Literal {
    text: string;
    offset: number;
    numeric: boolean;
    /** Veio de um ternário: a posição dele. */
    branch?: number;
}

/**
 * Literais de uma expressão: string, template sem `${}`, número (`8`, `-8`)
 * e os dois lados de um ternário ou o lado direito de `||`/`??` (`cor || '#fff'`).
 * Expressões calculadas (variáveis, chamadas) já não são valor solto.
 */
export function literals(source: string, node: t.Expression): Literal[] {
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
            return [...literals(source, node.consequent), ...literals(source, node.alternate)].map((literal) => ({ ...literal, branch: literal.branch ?? node.start! }));
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
