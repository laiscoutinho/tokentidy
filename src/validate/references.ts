/**
 * Regras que o JSON Schema não alcança: um alias aponta para um token que existe, não forma ciclo
 * e tem o tipo que o lugar pede. Os documentos são lidos juntos: `semantic.tokens.json` costuma
 * apontar para `primitives.tokens.json`, e olhar um arquivo só acusaria um alias válido.
 */

import { MAX_NESTING, expandExtends, findCycles } from './reference-graph.ts';
import type { GroupNode, Reference, TokenNode } from './reference-graph.ts';

export { MAX_NESTING };

export interface ValidationProblem {
    file: string;
    /** JSON Pointer do problema dentro do arquivo (`/color/brand/$value`); `/` é o documento. */
    path: string;
    /** `schema/invalid`, `json/invalid`, `reference/broken`, `reference/cycle`, `reference/type-mismatch`, `token/no-type`… */
    rule: string;
    message: string;
}

export interface TokenDocument {
    file: string;
    json: unknown;
    /** Ponteiro do documento quando ele está embutido em outro (fonte inline de um resolver). */
    base?: string;
}


const FIELD_TYPES = new Map<string, ReadonlyMap<string, string>>([
    ['border', new Map([['color', 'color'], ['width', 'dimension'], ['style', 'strokeStyle']])],
    ['transition', new Map([['duration', 'duration'], ['delay', 'duration'], ['timingFunction', 'cubicBezier']])],
    ['shadow', new Map([['color', 'color'], ['offsetX', 'dimension'], ['offsetY', 'dimension'], ['blur', 'dimension'], ['spread', 'dimension']])],
    ['typography', new Map([['fontFamily', 'fontFamily'], ['fontSize', 'dimension'], ['fontWeight', 'fontWeight'], ['letterSpacing', 'dimension'], ['lineHeight', 'number']])],
    ['gradientStop', new Map([['color', 'color'], ['position', 'number']])],
    ['strokeStyle', new Map([['dashArray', 'dimension']])],
]);

/** Tipo de um item de lista dentro de um valor composto. */
const ITEM_TYPES = new Map([['gradient', 'gradientStop'], ['shadow', 'shadow'], ['dimension', 'dimension']]);

const CURLY = /^\{([^{}]+)\}$/;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const escapePointer = (segment: string) => segment.replaceAll('~', '~0').replaceAll('/', '~1');
const unescapePointer = (segment: string) => segment.replaceAll('~1', '/').replaceAll('~0', '~');

/** Profundidade máxima do JSON, sem recursão (o arquivo é justamente o que pode ser fundo demais). */
export function nestingOf(json: unknown): number {
    let deepest = 0;
    const stack: [unknown, number][] = [[json, 1]];
    while (stack.length > 0) {
        const [value, depth] = stack.pop()!;
        if (typeof value === 'object' && value !== null) {
            deepest = Math.max(deepest, depth);
            if (depth <= MAX_NESTING) {
                stack.push(...Object.values(value).map((child): [unknown, number] => [child, depth + 1]));
            }
        }
    }
    return deepest;
}

/** `#/a/b/$value/color` → token `a.b`, propriedade `color`. Só ponteiro dentro do próprio documento. */
function pointerTarget(pointer: string): { target: string; field?: string } | undefined {
    if (!pointer.startsWith('#/')) {
        return undefined;
    }
    const segments = pointer.slice(2).split('/').map(unescapePointer);
    const at = segments.indexOf('$value');
    const trail = at === -1 ? segments : segments.slice(0, at);
    const field = at === -1 ? undefined : segments[at + 1];
    return { target: trail.join('.'), ...(field === undefined ? {} : { field }) };
}

class Collector {
    readonly tokens: TokenNode[] = [];
    readonly groups: GroupNode[] = [];
    readonly #file: string;
    readonly #base: string;

    constructor(document: TokenDocument) {
        this.#file = document.file;
        this.#base = document.base ?? '';
        if (isObject(document.json)) {
            this.#group(document.json, [], this.#base, undefined);
        }
    }

    #group(node: Record<string, unknown>, trail: string[], pointer: string, inherited: string | undefined): void {
        const type = typeof node['$type'] === 'string' ? node['$type'] : inherited;
        const name = trail.join('.');
        const extended = this.#extendsTarget(node['$extends']);
        this.groups.push({ name, pointer: pointer || '/', file: this.#file, ...(extended === undefined ? {} : { extends: extended }) });
        for (const [key, child] of Object.entries(node)) {
            if (!isObject(child) || (key.startsWith('$') && key !== '$root')) {
                continue;
            }
            const childPointer = `${pointer}/${escapePointer(key)}`;
            if (key === '$root' || Object.hasOwn(child, '$value') || Object.hasOwn(child, '$ref')) {
                this.#token(child, [...trail, key], childPointer, type);
            } else {
                this.#group(child, [...trail, key], childPointer, type);
            }
        }
    }

    #extendsTarget(value: unknown): string | undefined {
        if (typeof value === 'string') {
            return CURLY.exec(value)?.[1] ?? pointerTarget(value)?.target;
        }
        return isObject(value) && typeof value['$ref'] === 'string' ? pointerTarget(value['$ref'])?.target : undefined;
    }

    #token(node: Record<string, unknown>, trail: string[], pointer: string, inherited: string | undefined): void {
        const type = typeof node['$type'] === 'string' ? node['$type'] : inherited;
        const references: Reference[] = [];
        if (typeof node['$ref'] === 'string') {
            this.#pointerReference(node['$ref'], `${pointer}/$ref`, true, undefined, references);
        }
        if (Object.hasOwn(node, '$value')) {
            this.#value(node['$value'], `${pointer}/$value`, type, true, references);
        }
        this.tokens.push({ name: trail.join('.'), pointer, file: this.#file, ...(type ? { type } : {}), references });
    }

    #pointerReference(text: string, pointer: string, whole: boolean, expected: string | undefined, into: Reference[]): void {
        const parsed = pointerTarget(text);
        if (parsed) {
            into.push({ ...parsed, pointer, whole, ...(expected ? { expected } : {}) });
        }
    }

    /** Procura aliases dentro do valor; em valor composto, cada campo tem o seu tipo. */
    #value(value: unknown, pointer: string, type: string | undefined, whole: boolean, into: Reference[]): void {
        if (typeof value === 'string') {
            const target = CURLY.exec(value)?.[1];
            if (target !== undefined) {
                into.push({ target, pointer, whole, ...(type ? { expected: type } : {}) });
            }
            return;
        }
        if (Array.isArray(value)) {
            const itemType = type ? ITEM_TYPES.get(type) : undefined;
            value.forEach((item, i) => this.#value(item, `${pointer}/${i}`, itemType, false, into));
            return;
        }
        if (!isObject(value)) {
            return;
        }
        if (typeof value['$ref'] === 'string') {
            this.#pointerReference(value['$ref'], `${pointer}/$ref`, whole, type, into);
            return;
        }
        const fields = type ? FIELD_TYPES.get(type) : undefined;
        if (fields) {
            for (const [key, child] of Object.entries(value)) {
                this.#value(child, `${pointer}/${escapePointer(key)}`, fields.get(key), false, into);
            }
        }
    }
}

/** Problemas de referência de um conjunto de documentos lidos juntos, como se fossem um só. */
export function referenceProblems(documents: readonly TokenDocument[]): ValidationProblem[] {
    const collected = documents.map((document) => new Collector(document));
    const tokens = collected.flatMap((c) => c.tokens);
    const groups = collected.flatMap((c) => c.groups);
    const problems: ValidationProblem[] = [];

    expandExtends(tokens, groups, problems);

    const byName = Map.groupBy(tokens, (token) => token.name);
    /** No mesmo arquivo primeiro; entre arquivos, o último, como a ordem de um resolver sobrescreve. */
    const find = (name: string, file: string): TokenNode | undefined => {
        const options = byName.get(name);
        return options?.find((t) => t.file === file) ?? options?.at(-1);
    };

    const edges = new Map<TokenNode, { reference: Reference; target: TokenNode }[]>();
    for (const token of tokens) {
        const resolved: { reference: Reference; target: TokenNode }[] = [];
        for (const reference of token.references) {
            const target = find(reference.target, token.file);
            if (target) {
                resolved.push({ reference, target });
            } else {
                problems.push({ file: token.file, path: reference.pointer, rule: 'reference/broken', message: `{${reference.target}} does not exist` });
            }
        }
        edges.set(token, resolved);
    }

    const inCycle = findCycles(tokens, edges, problems);

    const typeOf = (start: TokenNode): string | undefined => {
        let current: TokenNode | undefined = start;
        const seen = new Set<TokenNode>();
        while (current && !seen.has(current)) {
            if (current.type) {
                return current.type;
            }
            seen.add(current);
            current = edges.get(current)?.find((e) => e.reference.whole)?.target;
        }
        return undefined;
    };

    for (const token of tokens) {
        const resolved = edges.get(token)!;
        const hasBroken = resolved.length < token.references.length;
        if (!inCycle.has(token) && !hasBroken && typeOf(token) === undefined) {
            problems.push({ file: token.file, path: token.pointer, rule: 'token/no-type', message: 'the token has no $type, not even from its group or alias' });
        }
        for (const { reference, target } of resolved) {
            const targetType = typeOf(target);
            const actual = reference.field === undefined ? targetType : targetType ? FIELD_TYPES.get(targetType)?.get(reference.field) : undefined;
            if (reference.expected && actual && reference.expected !== actual) {
                problems.push({
                    file: token.file, path: reference.pointer, rule: 'reference/type-mismatch',
                    message: `expected ${reference.expected}, but {${reference.target}} is ${actual}`,
                });
            }
        }
    }
    return problems;
}

