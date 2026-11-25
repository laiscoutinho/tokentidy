/**
 * Os lugares onde um valor do JavaScript vira estilo. Um objeto só é lido se chegar a um destino conhecido:
 * é isso que separa `style={card}` de `resize({ width: 300 })`.
 */

import type * as t from '@babel/types';

import { rulesForProperty } from '../../analysis/rules.ts';
import { elementSelector, isSvgDrawingElement, toKebabCase } from '../collector.ts';
import type { FileCollector, StyleRequest } from '../collector.ts';
import { walkDeclarationList } from '../css/stylesheet.ts';
import type { Host } from '../../types.ts';
import { hostBinding } from './angular-host.ts';
import { isCssTag, rootName, walkCssTemplate } from './css-in-js.ts';
import { walkCssString } from './css-strings.ts';
import { DEFAULT_COMPONENT_PROPS, componentProp, isComponent } from './component-props.ts';
import { ObjectFlow } from './flow.ts';
import { domAssignment, domCall } from './dom-sinks.ts';
import type { DomActions } from './dom-sinks.ts';
import { chartColors, unknownColors } from './js-values.ts';
import { themeDefinitions } from './theme.ts';
import { emitStyleObjects, literals, passedSx } from './style-object.ts';
import { DEFAULT_STYLE_SINKS, styleSinkOf } from './style-sinks.ts';
import type { StyleSink } from './style-sinks.ts';
import type { ObjectContext, ObjectKind } from './style-object.ts';

/** Construtores de gráficos cuja configuração tem cores em chaves `*Color`. */
const CHART_CONSTRUCTORS = new Set(['Chart', 'ApexCharts']);
/** Funções que recebem o tema da aplicação: o objeto é fonte de tokens, não valor solto. */
const THEME_FACTORIES = new Set(['createTheme', 'createMuiTheme', 'extendTheme']);

/** Cada destino de estilo que o JavaScript tem, e o que acontece com o valor que chega nele. */
export class ScriptSinks {
    readonly #collector: FileCollector;
    readonly #flow: ObjectFlow;
    readonly #seen = new WeakSet<t.ObjectExpression>();
    /** Templates já lidos por um destino conhecido (tag `css`, prop `css`, `styles:` do Angular): não são lidos de novo. */
    readonly #claimed = new WeakSet<t.Node>();
    readonly #imports: StyleRequest[] = [];
    /** Objetos passados a funções desconhecidas: olhados no fim, depois dos destinos conhecidos. */
    readonly #unknown: t.ObjectExpression[] = [];

    readonly #componentProps: ReadonlySet<string>;
    readonly #styleSinks: readonly StyleSink[];
    readonly #dom: DomActions = {
        declare: (expression, property, host) => this.#declareLiterals(expression, property, host),
        declarationList: (expression) => this.#declarationList(expression),
        emitDom: (expression) => this.#emit(expression, 'dom', undefined),
    };

    constructor(collector: FileCollector, program: t.File, componentProps: ReadonlySet<string> = DEFAULT_COMPONENT_PROPS, styleSinks: readonly StyleSink[] = []) {
        this.#collector = collector;
        this.#componentProps = componentProps;
        this.#styleSinks = [...DEFAULT_STYLE_SINKS, ...styleSinks];
        this.#flow = new ObjectFlow(program);
    }

    visit(node: t.Node): void {
        switch (node.type) {
            case 'JSXOpeningElement':
                this.#jsx(node);
                break;
            case 'AssignmentExpression':
                domAssignment(node, this.#dom);
                break;
            case 'CallExpression':
                this.#call(node);
                break;
            case 'NewExpression':
                this.#construct(node);
                break;
            case 'TaggedTemplateExpression':
                // Template com tag desconhecida (`gql`, `html`) não é CSS solto
                this.#claimed.add(node.quasi);
                if (isCssTag(node.tag)) {
                    walkCssTemplate(this.#collector, node.quasi);
                }
                break;
            case 'TemplateLiteral':
                if (!this.#claimed.has(node)) {
                    walkCssString(this.#collector, node);
                }
                break;
            case 'ClassProperty':
                hostBinding(this.#collector, node);
                break;
            case 'AssignmentPattern':
                this.#styleDefault(node);
                break;
            default:
                break;
        }
    }

    /** O template é lido por outro caminho (`styles:`/`template:` do Angular). */
    claim(node: t.Node): void {
        this.#claimed.add(node);
    }

    finish(): void {
        for (const object of this.#unknown.filter((o) => !this.#seen.has(o))) {
            unknownColors(this.#collector.source, object, (text, offset) => {
                this.#collector.declaration({ property: 'color', value: text, offset, host: 'js-value', siblings: new Map() });
            });
        }
        // O `emit` prende a árvore do Babel até o fim da análise: só fica quando algum export chega a um objeto
        const exportsObjects = this.#collector.source.includes('export') && this.#flow.exportsObjects();
        if (this.#imports.length > 0 || exportsObjects) {
            this.#collector.result.styleLinks = {
                file: this.#collector.file,
                imports: this.#imports,
                emit: exportsObjects ? (request) => this.#emitExported(request) : () => undefined,
            };
        }
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

    /** `<button className="remove" style={{ color: '#fff', padding: 8 }}>`, `sx` e `css`. O desenho de um SVG (`<path>`) não é lido. */
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
        if (isSvgDrawingElement(tagName)) {
            return;
        }

        for (const [name, kind] of [['style', 'style'], ['sx', 'sx'], ['css', 'css-object']] as const) {
            const value = named(name)?.value;
            if (value?.type !== 'JSXExpressionContainer' || value.expression.type === 'JSXEmptyExpression') {
                continue;
            }
            if (name === 'css' && value.expression.type === 'TemplateLiteral') {
                this.#claimed.add(value.expression);
                walkCssTemplate(this.#collector, value.expression);
            } else {
                this.#emit(value.expression, kind, selector);
            }
        }
        // `PaperProps={{ sx }}`, `slotProps={{ paper: { sx } }}`: o `sx` repassado a um componente interno
        for (const attr of attributes) {
            if (attr.name.type === 'JSXIdentifier' && /Props$/.test(attr.name.name) && attr.value?.type === 'JSXExpressionContainer'
                && attr.value.expression.type === 'ObjectExpression') {
                for (const sx of passedSx(attr.value.expression, 1)) {
                    this.#emit(sx, 'sx', selector);
                }
            }
        }
        const theme = named('theme')?.value;
        if (tagName === 'ThemeProvider' && theme?.type === 'JSXExpressionContainer' && theme.expression.type !== 'JSXEmptyExpression') {
            this.#theme(theme.expression);
        }
        const component = isComponent(element.name);
        for (const attr of component ? attributes : []) {
            if (attr.name.type === 'JSXIdentifier' && this.#componentProps.has(attr.name.name)) {
                componentProp(this.#collector, attr, attr.name.name, selector);
            }
        }
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

    #declarationList(expression: t.Expression): void {
        for (const literal of literals(this.#collector.source, expression).filter((l) => !l.numeric)) {
            walkDeclarationList(this.#collector, literal.text, literal.offset, 'jsx', undefined);
        }
    }

    #call(node: t.CallExpression): void {
        const callee = node.callee;
        const args = node.arguments;
        if (callee.type === 'MemberExpression' && domCall(callee, args, this.#dom)) {
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
        if (this.#librarySink(callee, args)) {
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

    /** `new Chart(el, { data: { datasets: [{ backgroundColor: '#4f46e5' }] } })` */
    #construct(node: t.NewExpression): void {
        if (this.#librarySink(node.callee, node.arguments)) {
            return;
        }
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

    /** `new PIXI.TextStyle({…})`, `this.add.text(x, y, s, {…})`: cada objeto passado é lido com as chaves do destino. */
    #librarySink(callee: t.Node, args: t.CallExpression['arguments']): boolean {
        const sink = styleSinkOf(callee, this.#styleSinks);
        if (!sink) {
            return false;
        }
        const context = { ...this.#context('style', 'js-value', undefined), ...(sink.keys ? { keys: new Set(sink.keys) } : {}) };
        for (const argument of args) {
            if (argument.type !== 'SpreadElement' && argument.type !== 'ArgumentPlaceholder') {
                emitStyleObjects(this.#follow(argument as t.Expression, 'style', undefined).objects, context);
            }
        }
        return true;
    }

    /** `function label(color = '#ffffff')`, `({ fontSize = '14px' })`: o padrão de um parâmetro com nome de propriedade de estilo. */
    #styleDefault(node: t.AssignmentPattern): void {
        if (node.left.type !== 'Identifier' || node.right.type === 'Identifier') {
            return;
        }
        const property = toKebabCase(node.left.name);
        if (rulesForProperty(property).some((rule) => rule.review === undefined)) {
            this.#declareLiterals(node.right, property, 'js-value');
        }
    }

}
