/**
 * Valores em expressões do SCSS: argumentos de `@include`, padrões de `@mixin` e mapas `mat.*-overrides`.
 * O `postcss-scss` entrega só o texto; o `sass-parser` lê a expressão e dá a posição de cada argumento.
 * Cada parâmetro herda a propriedade onde a mixin o usa; a definição pode estar em outro arquivo,
 * então as chamadas ficam guardadas e são resolvidas depois de todos os arquivos (`analysis/cross-file.ts`).
 */

import { createRequire } from 'node:module';
import type { AtRule, Declaration as PostcssDeclaration } from 'postcss';

import type { FileCollector } from '../collector.ts';
import type { Siblings } from '../../analysis/rules.ts';
import type { Host } from '../../types.ts';

const require = createRequire(import.meta.url);

interface Positioned {
    source?: { start?: { offset: number }; end?: { offset: number } };
    sassType?: string;
    nodes?: { key: Positioned; value: Positioned }[];
}

interface SassParameter {
    name: string;
    defaultValue?: Positioned;
}

interface SassMixin {
    parameters: { nodes: SassParameter[] };
}

interface SassInclude {
    includeName: string;
    arguments: { nodes: { name?: string; value: Positioned }[] };
}

export interface ParameterUse {
    property: string;
    siblings: Siblings;
    selector?: string;
}

export interface MixinDefinition {
    name: string;
    parameters: { name: string; use?: ParameterUse }[];
}

export interface MixinArgument {
    /** Posição na chamada, ou o nome em `$pad: 4px`. */
    key: number | string;
    text: string;
    offset: number;
    /** Argumento que é um mapa: `(filled-container-color: #4f46e5)`. */
    entries?: { key: string; text: string; offset: number }[];
}

export interface MixinCall {
    name: string;
    arguments: MixinArgument[];
    host: Host;
    selector?: string;
    atRules: string[];
    collector: FileCollector;
}

export interface MixinContext {
    collector: FileCollector;
    host: Host;
    baseOffset: number;
    selector?: string;
    atRules: string[];
    siblingsOf: (declaration: PostcssDeclaration) => Siblings;
    valueOf: (declaration: PostcssDeclaration) => string | undefined;
}

/** Sintaxe das expressões é a mesma em SCSS e Sass indentado: o trecho é sempre lido como SCSS. */
function parseSnippet<T>(snippet: string): T | undefined {
    try {
        const { scss } = require('sass-parser') as typeof import('sass-parser');
        return scss.parse(snippet).nodes[0] as unknown as T;
    } catch {
        return undefined;
    }
}

function textOf(node: Positioned, snippet: string, shift: number): { text: string; offset: number } | undefined {
    const start = node.source?.start?.offset;
    const end = node.source?.end?.offset;
    return start === undefined || end === undefined ? undefined : { text: snippet.slice(start, end), offset: start + shift };
}

/** `@include btn(#f59e0b, 10px)`: guarda a chamada para resolver depois. */
export function recordInclude(params: { text: string; offset: number }, context: MixinContext): void {
    if (!params.text.includes('(')) {
        return;
    }
    const prefix = '@include ';
    const snippet = `${prefix}${params.text}`;
    const node = parseSnippet<SassInclude>(snippet);
    if (!node) {
        return;
    }
    const shift = context.baseOffset + params.offset - prefix.length;
    const args = node.arguments.nodes.flatMap((argument, index): MixinArgument[] => {
        const value = textOf(argument.value, snippet, shift);
        if (!value) {
            return [];
        }
        const entries = argument.value.sassType === 'map'
            ? (argument.value.nodes ?? []).flatMap((entry) => {
                const key = textOf(entry.key, snippet, shift);
                const text = textOf(entry.value, snippet, shift);
                return key && text ? [{ key: key.text, ...text }] : [];
            })
            : undefined;
        return [{ key: argument.name ?? index, ...value, ...(entries ? { entries } : {}) }];
    });
    if (args.length === 0) {
        return;
    }
    const { collector, host, atRules, selector } = context;
    (collector.result.mixinCalls ??= []).push({
        name: node.includeName, arguments: args, host, atRules, collector,
        ...(selector === undefined ? {} : { selector }),
    });
}

/** `@mixin btn($bg: #f59e0b, $pad) { background: $bg; … }`: registra os parâmetros e analisa os padrões. */
export function recordMixin(atRule: AtRule, params: { text: string; offset: number }, context: MixinContext): void {
    const prefix = '@mixin ';
    const snippet = `${prefix}${params.text} {}`;
    const node = parseSnippet<SassMixin>(snippet);
    const name = params.text.match(/^[\w-]+/)?.[0];
    if (!node || !name) {
        return;
    }
    const shift = context.baseOffset + params.offset - prefix.length;
    const parameters = node.parameters.nodes.map((parameter) => {
        const use = firstUse(atRule, parameter.name, context);
        return { name: parameter.name, ...(use ? { use } : {}) };
    });
    (context.collector.result.mixins ??= []).push({ name, parameters });

    for (const [index, parameter] of node.parameters.nodes.entries()) {
        const value = parameter.defaultValue ? textOf(parameter.defaultValue, snippet, shift) : undefined;
        if (!value) {
            continue;
        }
        const use = parameters[index]?.use;
        if (use) {
            declareExpression(context.collector, context.host, use, value.text, value.offset, '@mixin', context.atRules);
        } else {
            context.collector.unknownDestination(value.text, value.offset, context.host, context.selector, '@mixin');
        }
    }
}

export function declareExpression(collector: FileCollector, host: Host, use: ParameterUse, value: string, offset: number, enclosing: string, atRules: string[], selector = use.selector): void {
    collector.declaration({
        property: use.property, value, offset, host, siblings: use.siblings, atRules, enclosing,
        ...(selector === undefined ? {} : { selector }),
    });
}

/** Primeira declaração do corpo que usa o parâmetro: é ela que diz o que o valor significa. */
function firstUse(atRule: AtRule, parameter: string, context: MixinContext): ParameterUse | undefined {
    const pattern = new RegExp(`\\$${parameter.replace(/[-_]/g, '[-_]')}(?![\\w-])`);
    let use: ParameterUse | undefined;
    atRule.walkDecls((declaration) => {
        if (use || declaration.prop.startsWith('--') || declaration.prop.startsWith('$')) {
            return;
        }
        if (pattern.test(context.valueOf(declaration) ?? '')) {
            const parent = declaration.parent;
            use = {
                property: declaration.prop.toLowerCase(),
                siblings: context.siblingsOf(declaration),
                ...(parent?.type === 'rule' && 'selector' in parent ? { selector: String(parent.selector) } : {}),
            };
        }
    });
    return use;
}
