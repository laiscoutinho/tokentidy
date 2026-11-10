/**
 * Parser de JS/JSX/TS/TSX: procura os lugares onde um valor vira estilo. O Babel é JS puro (sem binário nativo),
 * entende JSX, TypeScript e decorators, e informa a posição de cada nó. Um objeto só é lido se chegar a um
 * destino conhecido: é isso que separa `style={card}` de `resize({ width: 300 })`.
 */

import { parse } from '@babel/parser';
import type { ParserPlugin } from '@babel/parser';
import type * as t from '@babel/types';

import { FileCollector, offsetAt } from './collector.ts';
import type { ParseResult } from './collector.ts';
import { walkStylesheet } from './css/stylesheet.ts';
import { angularHost } from './js/angular-host.ts';
import { jsxElements } from './js/elements.ts';
import { ScriptSinks } from './js/sinks.ts';
import { literals } from './js/style-object.ts';
import type { Literal } from './js/style-object.ts';

/** Atalho barato antes de montar a árvore: sem nada disso no texto, não há o que procurar. */
const MAY_HAVE_STYLES = /style|component|css|sx=|fill|stroke|chart|color|theme|keyframes|hostbinding|matchmedia/i;

export async function parseScript(source: string, file: string): Promise<ParseResult> {
    const collector = new FileCollector(file, source);
    if (!MAY_HAVE_STYLES.test(source)) {
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
    const sinks = new ScriptSinks(collector, program);
    walkTree(program.program, (node) => {
        if (node.type === 'Decorator') {
            angularComponent(collector, node, component);
        } else {
            sinks.visit(node);
        }
    });
    sinks.finish();
    jsxElements(collector, program.program);
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
export function pluginsFor(file: string): ParserPlugin[] {
    if (file.endsWith('.tsx')) {
        return ['jsx', 'typescript', 'decorators'];
    }
    if (file.endsWith('.ts') || file.endsWith('.mts') || file.endsWith('.cts')) {
        return ['typescript', 'decorators'];
    }
    return ['jsx', 'decorators'];
}

/** Percorre a árvore do Babel chamando `callback` para cada nó. */
export function walkTree(node: t.Node, callback: (node: t.Node) => void): void {
    callback(node);
    for (const key of Object.keys(node) as (keyof t.Node)[]) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') {
            continue;
        }
        const child = node[key] as unknown;
        if (Array.isArray(child)) {
            for (const item of child) {
                if (isNode(item)) {
                    walkTree(item, callback);
                }
            }
        } else if (isNode(child)) {
            walkTree(child, callback);
        }
    }
}

function isNode(value: unknown): value is t.Node {
    return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

interface AngularComponent {
    /** `template:` inline, analisado depois de carregar o parser do Angular. */
    templates: Literal[];
    templateUrls: string[];
}

/** `@Component({ styles: [...], template: '...', templateUrl: './x.html' })` */
function angularComponent(collector: FileCollector, decorator: t.Decorator, component: AngularComponent): void {
    const call = decorator.expression;
    if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || (call.callee.name !== 'Component' && call.callee.name !== 'Directive')) {
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
            case 'host':
                if (value.type === 'ObjectExpression') {
                    angularHost(collector, value);
                }
                break;
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
