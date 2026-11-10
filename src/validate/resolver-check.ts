/**
 * Regras do arquivo resolver (Resolver Module do DTCG) que o schema não vê: a ordem aponta para conjuntos
 * e modificadores que existem, o `default` é um dos contextos e os arquivos citados existem dentro do projeto.
 */

import type { TokenDocument, ValidationProblem } from './references.ts';

/** Arquivo citado por `$ref`, relativo ao resolver; o carregamento confere se ele existe e está no projeto. */
export interface ResolverSource {
    pointer: string;
    /** Arquivo citado: `undefined` em fonte inline. */
    ref?: string;
    document?: TokenDocument;
}

interface Layer {
    name: string;
    sources?: ResolverSource[];
    contexts?: Map<string, ResolverSource[]>;
    default?: string;
}

export interface ResolverLayers {
    layers: Layer[];
    problems: ValidationProblem[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function sourcesOf(list: unknown, pointer: string, file: string): ResolverSource[] {
    if (!Array.isArray(list)) {
        return [];
    }
    return list.flatMap((source, i): ResolverSource[] => {
        const at = `${pointer}/${i}`;
        if (!isObject(source)) {
            return [];
        }
        if (typeof source['$ref'] === 'string') {
            return [{ pointer: at, ref: source['$ref'] }];
        }
        return [{ pointer: at, document: { file, json: source, base: at } }];
    });
}

function modifierLayer(name: string, body: Record<string, unknown>, pointer: string, file: string, problems: ValidationProblem[]): Layer {
    const contexts = new Map<string, ResolverSource[]>();
    const declared = isObject(body['contexts']) ? body['contexts'] : {};
    for (const [context, list] of Object.entries(declared)) {
        contexts.set(context, sourcesOf(list, `${pointer}/contexts/${context}`, file));
    }
    const fallback = typeof body['default'] === 'string' ? body['default'] : undefined;
    if (fallback !== undefined && !contexts.has(fallback)) {
        problems.push({ file, path: `${pointer}/default`, rule: 'resolver/unknown-default', message: `"${fallback}" is not one of the contexts` });
    }
    return { name, contexts, ...(fallback !== undefined && contexts.has(fallback) ? { default: fallback } : {}) };
}

/** As camadas na ordem de resolução; referências internas (`#/sets/x`) já substituídas. */
export function resolverLayers(json: Record<string, unknown>, file: string): ResolverLayers {
    const problems: ValidationProblem[] = [];
    const layers: Layer[] = [];
    const sets = isObject(json['sets']) ? json['sets'] : {};
    const modifiers = isObject(json['modifiers']) ? json['modifiers'] : {};
    const order = Array.isArray(json['resolutionOrder']) ? json['resolutionOrder'] : [];

    order.forEach((item: unknown, i) => {
        const pointer = `/resolutionOrder/${i}`;
        if (!isObject(item)) {
            return;
        }
        const ref = typeof item['$ref'] === 'string' ? item['$ref'] : undefined;
        if (ref !== undefined) {
            const [, kind, name] = /^#\/(sets|modifiers)\/(.+)$/.exec(ref) ?? [];
            const table = kind === 'sets' ? sets : kind === 'modifiers' ? modifiers : undefined;
            const body = table && name !== undefined && Object.hasOwn(table, name) ? table[name] : undefined;
            if (!isObject(body)) {
                problems.push({ file, path: `${pointer}/$ref`, rule: 'reference/broken', message: `${ref} does not exist in this resolver` });
            } else if (kind === 'sets') {
                layers.push({ name: name!, sources: sourcesOf(body['sources'], `/sets/${name}/sources`, file) });
            } else {
                layers.push(modifierLayer(name!, body, `/modifiers/${name}`, file, problems));
            }
            return;
        }
        const name = typeof item['name'] === 'string' ? item['name'] : `#${i}`;
        layers.push(item['type'] === 'modifier'
            ? modifierLayer(name, item, pointer, file, problems)
            : { name, sources: sourcesOf(item['sources'], `${pointer}/sources`, file) });
    });
    return { layers, problems };
}

export interface ResolverContext {
    /** `theme=dark`; vazio quando o resolver não tem modificadores. */
    label: string;
    sources: ResolverSource[];
}

/**
 * Cada contexto de cada modificador, com os outros no padrão: o alias tem que resolver em todo tema.
 * Não é o produto de todos os modificadores, que cresce exponencialmente e não acha mais aliases quebrados.
 */
export function resolverContexts(layers: readonly Layer[]): ResolverContext[] {
    const pick = (layer: Layer, chosen?: string): ResolverSource[] => {
        if (layer.sources) {
            return layer.sources;
        }
        const key = chosen ?? layer.default ?? [...layer.contexts!.keys()][0];
        return key === undefined ? [] : layer.contexts!.get(key) ?? [];
    };
    const base: ResolverContext = { label: '', sources: layers.flatMap((layer) => pick(layer)) };
    const contexts = layers.flatMap((layer) => (!layer.contexts ? [] : [...layer.contexts.keys()].map((key): ResolverContext => ({
        label: `${layer.name}=${key}`,
        sources: layers.flatMap((other) => pick(other, other === layer ? key : undefined)),
    }))));
    return contexts.length > 0 ? contexts : [base];
}
