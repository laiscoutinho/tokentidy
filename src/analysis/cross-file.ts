/**
 * O que só se resolve com todos os arquivos lidos: mixins definidas em outro arquivo
 * e objetos de estilo importados. O resultado entra pelo coletor do arquivo onde o valor está escrito.
 */

import path from 'node:path';

import { declareExpression } from '../parsers/css/mixins.ts';
import type { MixinArgument, MixinCall, MixinDefinition, ParameterUse } from '../parsers/css/mixins.ts';
import type { ParseResult } from '../parsers/collector.ts';

/** Chave de um mapa `mat.*-overrides` → propriedade que dá o tipo do valor. */
const OVERRIDE_SUFFIXES: readonly [RegExp, string][] = [
    [/color$/, 'color'],
    [/(shape|radius)$/, 'border-radius'],
    [/font-size$|-size$/, 'font-size'],
    [/weight$/, 'font-weight'],
    [/line-height$/, 'line-height'],
    [/tracking$/, 'letter-spacing'],
    [/font$/, 'font-family'],
];

export function linkAcrossFiles(results: readonly ParseResult[]): void {
    const calls = results.flatMap((result) => result.mixinCalls ?? []);
    if (calls.length > 0) {
        const definitions = Map.groupBy(results.flatMap((result) => result.mixins ?? []), (mixin) => mixin.name);
        for (const call of calls) {
            resolveCall(call, soleDefinition(definitions.get(call.name.replace(/^.*\./, ''))));
        }
    }
    const links = results.flatMap((result) => result.styleLinks ? [result.styleLinks] : []);
    const byFile = new Map(links.map((link) => [link.file, link]));
    for (const link of links) {
        for (const request of link.imports) {
            const target = resolveImport(link.file, request.source, byFile);
            target?.emit(request);
        }
    }
}

/** Nomes repetidos com usos diferentes não dizem qual valeria aqui: fica como destino desconhecido. */
function soleDefinition(definitions: readonly MixinDefinition[] | undefined): MixinDefinition | undefined {
    const [first] = definitions ?? [];
    if (!first) {
        return undefined;
    }
    const shape = (definition: MixinDefinition) => JSON.stringify(definition.parameters.map((p) => [p.name, p.use?.property]));
    return definitions!.every((definition) => shape(definition) === shape(first)) ? first : undefined;
}

function resolveCall(call: MixinCall, definition: MixinDefinition | undefined): void {
    for (const argument of call.arguments) {
        if (argument.entries && call.name.endsWith('-overrides')) {
            for (const entry of argument.entries) {
                const property = OVERRIDE_SUFFIXES.find(([pattern]) => pattern.test(entry.key))?.[1];
                if (property) {
                    declare(call, { property, siblings: new Map() }, entry.text, entry.offset);
                } else {
                    unknown(call, entry.text, entry.offset);
                }
            }
            continue;
        }
        const use = parameterUse(definition, argument);
        if (use) {
            declare(call, use, argument.text, argument.offset);
        } else {
            unknown(call, argument.text, argument.offset);
        }
    }
}

function parameterUse(definition: MixinDefinition | undefined, argument: MixinArgument): ParameterUse | undefined {
    const parameter = typeof argument.key === 'number'
        ? definition?.parameters[argument.key]
        : definition?.parameters.find((p) => p.name.replace(/_/g, '-') === String(argument.key).replace(/_/g, '-'));
    return parameter?.use;
}

function declare(call: MixinCall, use: ParameterUse, text: string, offset: number): void {
    // O seletor é o de quem chama: é ali que o valor é aplicado
    declareExpression(call.collector, call.host, use, text, offset, '@include', call.atRules, call.selector);
}

function unknown(call: MixinCall, text: string, offset: number): void {
    call.collector.unknownDestination(text, offset, call.host, call.selector, '@include');
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

function resolveImport<T>(from: string, source: string, files: ReadonlyMap<string, T>): T | undefined {
    if (!source.startsWith('.')) {
        return undefined;
    }
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), source));
    // TypeScript em ESM importa `./x.js` e o arquivo é `./x.ts`
    const bases = [base, base.replace(/\.(js|jsx|mjs)$/, '')];
    for (const candidate of bases) {
        for (const extension of EXTENSIONS) {
            const found = files.get(`${candidate}${extension}`);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}
