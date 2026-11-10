/**
 * Os lugares onde um valor do JavaScript vira estilo. Um objeto só é lido se chegar a um destino conhecido:
 * é isso que separa `style={card}` de `resize({ width: 300 })`.
 */

import type * as t from '@babel/types';

import { elementSelector, toKebabCase } from '../collector.ts';
import type { FileCollector, StyleRequest } from '../collector.ts';
import { walkDeclarationList } from '../css/stylesheet.ts';
import type { Host } from '../../types.ts';
import { hostBinding } from './angular-host.ts';
import { isCssTag, rootName, walkCssTemplate } from './css-in-js.ts';
import { ObjectFlow, memberName } from './flow.ts';
import { chartColors, unknownColors } from './js-values.ts';
import { themeDefinitions } from './theme.ts';
import { emitStyleObjects, literals } from './style-object.ts';
import type { ObjectContext, ObjectKind } from './style-object.ts';

/** Atributos de apresentação do SVG que recebem cor (`<path fill="#fff" />`), em JSX. */
const SVG_COLOR_ATTRIBUTES = new Set(['fill', 'stroke', 'stopColor', 'floodColor', 'lightingColor']);
/** Propriedades do contexto 2D do canvas que recebem cor. */
const CANVAS_COLOR_PROPERTIES = new Set(['fillStyle', 'strokeStyle', 'shadowColor']);
/** Construtores de gráficos cuja configuração tem cores em chaves `*Color`. */
const CHART_CONSTRUCTORS = new Set(['Chart', 'ApexCharts']);
/** Funções que recebem o tema da aplicação: o objeto é fonte de tokens, não valor solto. */
const THEME_FACTORIES = new Set(['createTheme', 'createMuiTheme', 'extendTheme']);

/** Cada destino de estilo que o JavaScript tem, e o que acontece com o valor que chega nele. */
export class ScriptSinks {
    readonly #collector: FileCollector;
    readonly #flow: ObjectFlow;
    readonly #seen = new WeakSet<t.ObjectExpression>();
    readonly #imports: StyleRequest[] = [];
    /** Objetos passados a funções desconhecidas: olhados no fim, depois dos destinos conhecidos. */
    readonly #unknown: t.ObjectExpression[] = [];

    constructor(collector: FileCollector, program: t.File) {
        this.#collector = collector;
        this.#flow = new ObjectFlow(program);
    }

    visit(node: t.Node): void {
        switch (node.type) {
            case 'JSXOpeningElement':
                this.#jsx(node);
                break;
            case 'AssignmentExpression':
                this.#assignment(node);
                break;
            case 'CallExpression':
                this.#call(node);
                break;
            case 'NewExpression':
                this.#construct(node);
                break;
            case 'TaggedTemplateExpression':
                if (isCssTag(node.tag)) {
                    walkCssTemplate(this.#collector, node.quasi);
                }
                break;
            case 'ClassProperty':
                hostBinding(this.#collector, node);
                break;
            default:
                break;
        }
    }

    finish(): void {
        for (const object of this.#unknown.filter((o) => !this.#seen.has(o))) {
            unknownColors(this.#collector.source, object, (text, offset) => {
                this.#collector.declaration({ property: 'color', value: text, offset, host: 'js-value', siblings: new Map() });
            });
        }
        if (this.#imports.length > 0 || this.#hasExports()) {
            this.#collector.result.styleLinks = {
                file: this.#collector.file,
                imports: this.#imports,
                emit: (request) => this.#emitExported(request),
            };
        }
    }

    /** Não vale a análise cruzada num arquivo sem `export`. */
    #hasExports(): boolean {
        return this.#collector.source.includes('export');
    }

    #emitExported(request: StyleRequest): void {
        const exported = this.#flow.exported(request.name);
        if (!exported) {
            return;
        }
        const { objects } = this.#flow.follow(exported, request.path);
        emitStyleObjects(objects, this.#context(request.kind, 'jsx', request.selector));
    }

    #context(kind: ObjectKind, host: Host, selector: string | undefined): ObjectContext {
        return {
            collector: this.#collector, kind, host, seen: this.#seen,
            ...(selector === undefined ? {} : { selector }),
            follow: (node) => this.#follow(node, kind, selector).objects,
        };
    }

    #follow(node: t.Expression, kind: ObjectKind, selector: string | undefined) {
        const followed = this.#flow.follow(node);
        for (const imported of followed.imports) {
            this.#imports.push({ ...imported, kind, ...(selector === undefined ? {} : { selector }) });
        }
        return followed;
    }

    #emit(node: t.Expression, kind: ObjectKind, selector: string | undefined, host: Host = 'jsx'): void {
        emitStyleObjects(this.#follow(node, kind, selector).objects, this.#context(kind, host, selector));
    }

    /** `<button className="remove" style={{ color: '#fff', padding: 8 }}>`, `sx`, `css` e cores de SVG. */
    #jsx(element: t.JSXOpeningElement): void {
        const attributes = element.attributes.filter((attr): attr is t.JSXAttribute => attr.type === 'JSXAttribute');
        const named = (name: string) => attributes.find((a) => a.name.type === 'JSXIdentifier' && a.name.name === name);
        const staticAttr = (name: string): string | undefined => {
            const attr = named(name);
            return attr?.value?.type === 'StringLiteral' ? attr.value.value : undefined;
        };
        const tagName = element.name.type === 'JSXIdentifier' ? element.name.name : 'element';
        const attrs = [['id', staticAttr('id')], ['class', staticAttr('className')]]
            .filter((pair): pair is [string, string] => pair[1] !== undefined)
            .map(([name, value]) => ({ name, value }));
        const selector = elementSelector(tagName, attrs);

        for (const [name, kind] of [['style', 'style'], ['sx', 'sx'], ['css', 'css-object']] as const) {
            const value = named(name)?.value;
            if (value?.type !== 'JSXExpressionContainer' || value.expression.type === 'JSXEmptyExpression') {
                continue;
            }
            if (name === 'css' && value.expression.type === 'TemplateLiteral') {
                walkCssTemplate(this.#collector, value.expression);
            } else {
                this.#emit(value.expression, kind, selector);
            }
        }
        const theme = named('theme')?.value;
        if (tagName === 'ThemeProvider' && theme?.type === 'JSXExpressionContainer' && theme.expression.type !== 'JSXEmptyExpression') {
            this.#theme(theme.expression);
        }
        for (const attr of attributes) {
            if (attr.name.type === 'JSXIdentifier' && SVG_COLOR_ATTRIBUTES.has(attr.name.name)) {
                this.#svgAttribute(attr, attr.name.name, selector);
            }
        }
    }

    #svgAttribute(attr: t.JSXAttribute, name: string, selector: string): void {
        const expression = attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value;
        if (!expression || expression.type === 'JSXEmptyExpression' || expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
            return;
        }
        this.#declareLiterals(expression, toKebabCase(name), 'svg-attribute', selector);
    }

    #declareLiterals(expression: t.Expression, property: string, host: Host, selector?: string): void {
        for (const literal of literals(this.#collector.source, expression).filter((l) => !l.numeric)) {
            this.#collector.declaration({
                property, value: literal.text, offset: literal.offset, host, siblings: new Map(),
                ...(selector === undefined ? {} : { selector }),
                ...(literal.branch === undefined ? {} : { branch: literal.branch }),
            });
        }
    }

    /** `el.style.color = '#fff'`, `el.style.cssText = '…'`, `ctx.fillStyle = '#fff'`. */
    #assignment(node: t.AssignmentExpression): void {
        if (node.operator !== '=' || node.left.type !== 'MemberExpression') {
            return;
        }
        const name = memberName(node.left);
        if (name === undefined) {
            return;
        }
        if (CANVAS_COLOR_PROPERTIES.has(name)) {
            this.#declareLiterals(node.right, 'color', 'js-value');
            return;
        }
        if (!isStyleMember(node.left.object)) {
            return;
        }
        if (name === 'cssText') {
            this.#declarationList(node.right);
        } else if (!name.startsWith('--')) {
            this.#declareLiterals(node.right, toKebabCase(name), 'jsx');
        }
    }

    #declarationList(expression: t.Expression): void {
        for (const literal of literals(this.#collector.source, expression).filter((l) => !l.numeric)) {
            walkDeclarationList(this.#collector, literal.text, literal.offset, 'jsx', undefined);
        }
    }

    #call(node: t.CallExpression): void {
        const callee = node.callee;
        const args = node.arguments;
        const first = args[0];
        const second = args[1];
        if (callee.type === 'MemberExpression') {
            const name = memberName(callee);
            // `el.style.setProperty('color', '#fff')`
            if (name === 'setProperty' && isStyleMember(callee.object) && first?.type === 'StringLiteral' && !first.value.startsWith('--') && second?.type !== 'SpreadElement' && second) {
                this.#declareLiterals(second as t.Expression, first.value.toLowerCase(), 'jsx');
                return;
            }
            // `el.setAttribute('style', '…')`, `el.setAttribute('fill', '#fff')`
            if (name === 'setAttribute' && first?.type === 'StringLiteral' && second && second.type !== 'SpreadElement') {
                if (first.value === 'style') {
                    this.#declarationList(second as t.Expression);
                } else if (first.value === 'fill' || first.value === 'stroke') {
                    this.#declareLiterals(second as t.Expression, first.value, 'svg-attribute');
                }
                return;
            }
            // `renderer.setStyle(el, 'color', '#fff')`
            const third = args[2];
            if (name === 'setStyle' && second?.type === 'StringLiteral' && third && third.type !== 'SpreadElement') {
                if (!second.value.startsWith('--')) {
                    this.#declareLiterals(third as t.Expression, toKebabCase(second.value), 'jsx');
                }
                return;
            }
            // `Object.assign(el.style, { … })`
            if (name === 'assign' && callee.object.type === 'Identifier' && callee.object.name === 'Object' && first && first.type !== 'SpreadElement' && isStyleMember(first as t.Expression)) {
                for (const source of args.slice(1)) {
                    if (source.type !== 'SpreadElement') {
                        this.#emit(source as t.Expression, 'dom', undefined);
                    }
                }
                return;
            }
            // `window.matchMedia('(min-width: 768px)')`: o `var()` não funciona ali, então é breakpoint para revisão
            if (name === 'matchMedia') {
                this.#matchMedia(first);
                return;
            }
        }
        if (callee.type === 'Identifier' && callee.name === 'matchMedia') {
            this.#matchMedia(first);
            return;
        }
        // `styled.div({ padding: 8 })`, `css({ … })`
        if (isCssTag(callee) && !(callee.type === 'CallExpression')) {
            for (const argument of args) {
                if (argument.type === 'ObjectExpression') {
                    this.#emit(argument, 'css-object', undefined);
                }
            }
            return;
        }
        if (callee.type === 'Identifier' && THEME_FACTORIES.has(callee.name)) {
            for (const argument of args) {
                if (argument.type !== 'SpreadElement' && argument.type !== 'ArgumentPlaceholder') {
                    this.#theme(argument as t.Expression);
                }
            }
            return;
        }
        // Qualquer outra função: destino desconhecido
        if (rootName(callee) !== undefined || callee.type === 'MemberExpression') {
            this.#unknown.push(...args.filter((arg): arg is t.ObjectExpression => arg.type === 'ObjectExpression'));
        }
    }

    #theme(node: t.Expression): void {
        for (const object of this.#flow.follow(node).objects) {
            this.#seen.add(object);
            themeDefinitions(this.#collector, object, (value) => this.#flow.follow(value).objects);
        }
    }

    #matchMedia(argument: t.Node | undefined): void {
        if (argument?.type !== 'StringLiteral') {
            return;
        }
        for (const literal of literals(this.#collector.source, argument)) {
            this.#collector.breakpoint('media', literal.text, literal.offset, 'css-in-js');
        }
    }

    /** `new Chart(el, { data: { datasets: [{ backgroundColor: '#4f46e5' }] } })` */
    #construct(node: t.NewExpression): void {
        if (node.callee.type !== 'Identifier' || !CHART_CONSTRUCTORS.has(node.callee.name)) {
            return;
        }
        for (const argument of node.arguments) {
            if (argument.type !== 'SpreadElement' && argument.type !== 'ArgumentPlaceholder') {
                for (const object of this.#follow(argument as t.Expression, 'style', undefined).objects) {
                    chartColors(object, this.#seen, (value) => this.#declareLiterals(value, 'color', 'js-value'));
                }
            }
        }
    }
}

/** `el.style`, `this.el.nativeElement.style`, `document.body.style`. */
function isStyleMember(node: t.Node): boolean {
    return node.type === 'MemberExpression' && memberName(node) === 'style';
}

