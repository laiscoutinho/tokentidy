/**
 * Mixins do SCSS. Argumentos de `@include` e padrões de `@mixin` não são reportados: o tipo do valor
 * dependeria de adivinhar o que a mixin faz com ele (`text-stroke` lido como sombra).
 * A exceção são os mapas `mat.*-overrides` do Angular Material: a chave diz o papel (`container-color`).
 * O `postcss-scss` entrega só o texto; o `sass-parser` lê a expressão e dá a posição de cada entrada.
 */

import { createRequire } from 'node:module';

import type { FileCollector } from '../collector.ts';
import type { Host } from '../../types.ts';

const require = createRequire(import.meta.url);

interface Positioned {
    source?: { start?: { offset: number }; end?: { offset: number } };
    sassType?: string;
    nodes?: { key: Positioned; value: Positioned }[];
}

interface SassInclude {
    includeName: string;
    arguments: { nodes: { value: Positioned }[] };
}

export interface MixinContext {
    collector: FileCollector;
    host: Host;
    baseOffset: number;
    selector?: string;
    atRules: string[];
}

/** Chave de um mapa `mat.*-overrides` → propriedade que dá o tipo do valor. Chave sem papel conhecido fica de fora. */
const OVERRIDE_SUFFIXES: readonly [RegExp, string][] = [
    [/color$/, 'color'],
    [/(shape|radius)$/, 'border-radius'],
    [/font-size$|-size$/, 'font-size'],
    [/weight$/, 'font-weight'],
    [/line-height$/, 'line-height'],
    [/tracking$/, 'letter-spacing'],
    [/font$/, 'font-family'],
];

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

/** `@include mat.button-overrides((filled-container-color: #4f46e5))`: cada entrada com papel vira declaração. */
export function recordInclude(params: { text: string; offset: number }, context: MixinContext): void {
    if (!/^[\w.-]+-overrides\s*\(/.test(params.text)) {
        return;
    }
    const prefix = '@include ';
    const snippet = `${prefix}${params.text}`;
    const node = parseSnippet<SassInclude>(snippet);
    if (!node) {
        return;
    }
    const shift = context.baseOffset + params.offset - prefix.length;
    const { collector, host, atRules, selector } = context;
    for (const argument of node.arguments.nodes) {
        if (argument.value.sassType !== 'map') {
            continue;
        }
        for (const entry of argument.value.nodes ?? []) {
            const key = textOf(entry.key, snippet, shift);
            const value = textOf(entry.value, snippet, shift);
            const property = key && OVERRIDE_SUFFIXES.find(([pattern]) => pattern.test(key.text))?.[1];
            if (property && value) {
                collector.declaration({
                    property, value: value.text, offset: value.offset, host, siblings: new Map(), atRules, enclosing: '@include',
                    ...(selector === undefined ? {} : { selector }),
                });
            }
        }
    }
}
