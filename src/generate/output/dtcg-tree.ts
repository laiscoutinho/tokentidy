/**
 * A árvore DTCG de `tokens.tokens.json`, fonte da verdade da geração (formato W3C 2025.10, lido por
 * Style Dictionary e Tokens Studio). Cada token leva em `$extensions["dev.tokentidy"]` as ocorrências
 * no código: é o que o `fix` usa. Aqui a árvore é montada, lida do disco e percorrida.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { cssValueOf } from '../../parsers/dtcg.ts';
import { normalizeValue } from '../../values/normalize.ts';
import type { Finding, TokenType } from '../../types.ts';
import type { GeneratedToken, GenerationResult, OwnToken } from '../generate.ts';
import { TOKEN_TYPES } from '../generate.ts';
import type { SemanticAlias } from '../semantic.ts';
import { DTCG_TYPES } from '../../token-index.ts';
import { dtcgValueOf } from './dtcg-values.ts';

/** Chave das extensões do TokenTidy no DTCG (notação de domínio invertido, como a especificação pede). */
export const EXTENSION = 'dev.tokentidy';
export const DTCG_FILE = 'tokens.tokens.json';

export type DtcgTree = Record<string, unknown>;

export interface DtcgToken {
    $type?: string;
    $value: unknown;
    $extensions?: Record<string, unknown>;
}

/** Ocorrência como vai para o JSON: o que o autofix precisa para trocar o trecho certo do arquivo certo. */
function occurrenceOf(finding: Finding): Record<string, unknown> {
    const { file, line, column, offset, endOffset, property, value, host, selector, atRules, function: fn, impliedUnit } = finding;
    return {
        file, line, column, offset, endOffset, property, value, host,
        ...(selector === undefined ? {} : { selector }),
        ...(atRules === undefined ? {} : { atRules }),
        ...(fn === undefined ? {} : { function: fn }),
        ...(impliedUnit === undefined ? {} : { impliedUnit }),
    };
}

function tokenEntry(token: GeneratedToken): DtcgToken {
    const { unit, ...dtcg } = dtcgValueOf(token.type, token.key);
    return {
        ...dtcg,
        $extensions: {
            [EXTENSION]: {
                type: token.type,
                key: token.key,
                css: token.value,
                ...(unit ? { unit } : {}),
                count: token.count,
                spellings: token.spellings,
                ...(token.equivalents ? { equivalents: token.equivalents.map(({ name, file, line }) => ({ name, file, line })) } : {}),
                occurrences: token.occurrences.map(occurrenceOf),
            },
        },
    };
}

function aliasEntry(alias: SemanticAlias): DtcgToken {
    return {
        $type: 'color',
        $value: `{${alias.target.join('.')}}`,
        $extensions: { [EXTENSION]: { count: alias.count, occurrences: alias.occurrences.map(occurrenceOf) } },
    };
}

/**
 * Árvore DTCG final. No modo extend parte do arquivo que já existe: tokens que não aparecem mais no código
 * continuam lá (podem estar em uso via `var()`), e os gerados agora são atualizados ou acrescentados.
 */
export function buildDtcgTree(result: GenerationResult, existing: DtcgTree | undefined): DtcgTree {
    const tree: DtcgTree = existing ? structuredClone(existing) : {};
    for (const token of result.tokens) {
        setAt(tree, token.path, tokenEntry(token));
    }
    for (const alias of result.aliases) {
        if (getAt(tree, alias.path) === undefined || isTokenNode(getAt(tree, alias.path))) {
            setAt(tree, alias.path, aliasEntry(alias));
        }
    }
    return tree;
}

// A árvore vem de um JSON do usuário: só propriedades próprias, para `__proto__`/`constructor` não chegarem ao protótipo
function getAt(tree: DtcgTree, trail: readonly string[]): unknown {
    let node: unknown = tree;
    for (const key of trail) {
        node = typeof node === 'object' && node !== null && Object.hasOwn(node, key) ? (node as DtcgTree)[key] : undefined;
    }
    return node;
}

function setAt(tree: DtcgTree, trail: readonly string[], value: DtcgToken): void {
    const define = (target: DtcgTree, key: string, content: unknown) =>
        Object.defineProperty(target, key, { value: content, enumerable: true, writable: true, configurable: true });
    let node = tree;
    for (const key of trail.slice(0, -1)) {
        const next = Object.hasOwn(node, key) ? node[key] : undefined;
        if (typeof next !== 'object' || next === null || Array.isArray(next) || isTokenNode(next)) {
            define(node, key, {});
        }
        node = node[key] as DtcgTree;
    }
    define(node, trail.at(-1)!, value);
}

function isTokenNode(node: unknown): node is DtcgToken {
    return typeof node === 'object' && node !== null && Object.hasOwn(node, '$value');
}

/** Extensão do TokenTidy num token, só se for propriedade própria. */
export function extensionOf(token: DtcgToken): unknown {
    const extensions = token.$extensions;
    return typeof extensions === 'object' && extensions !== null && Object.hasOwn(extensions, EXTENSION) ? extensions[EXTENSION] : undefined;
}

/** Todos os tokens de uma árvore, em ordem, com o tipo herdado dos grupos. */
export function* tokensOf(tree: DtcgTree, trail: string[] = [], type?: string): Generator<{ path: string[]; token: DtcgToken; type?: string }> {
    const ownType = Object.hasOwn(tree, '$type') && typeof tree['$type'] === 'string' ? tree['$type'] : type;
    for (const [key, child] of Object.entries(tree)) {
        if (key.startsWith('$') || typeof child !== 'object' || child === null) {
            continue;
        }
        if (isTokenNode(child)) {
            yield { path: [...trail, key], token: child, ...(child.$type ?? ownType ? { type: child.$type ?? ownType } : {}) };
        } else {
            yield* tokensOf(child as DtcgTree, [...trail, key], ownType);
        }
    }
}

/** Tokens gerados antes pelo TokenTidy (os que têm a extensão), para manter o nome no modo extend. */
export function ownTokensOf(tree: DtcgTree): OwnToken[] {
    const own: OwnToken[] = [];
    for (const { path: trail, token } of tokensOf(tree)) {
        const extension = extensionOf(token) as { type?: TokenType; key?: string } | undefined;
        if (extension?.type && extension.key !== undefined) {
            own.push({ path: trail, type: extension.type, key: extension.key });
        }
    }
    return own;
}

/** Onde um token gerado foi usado (o mínimo que o `fix` precisa para reconhecer a ocorrência). */
export interface TreeOccurrence {
    file: string;
    property: string;
    selector?: string;
}

/** Token da pasta de saída, como o `fix` precisa: caminho, tipo e valor, ou o alvo de um alias. */
export interface TreeToken {
    path: string[];
    type?: TokenType;
    /** Valor normalizado (a mesma chave do `generate`). */
    key?: string;
    /** Alias (`{color.indigo.600}`): caminho do token para onde aponta. */
    target?: string[];
    /** Ocorrências registradas pelo `generate`: num alias, onde ele deve ser usado. */
    occurrences: TreeOccurrence[];
}

/**
 * Todos os tokens da árvore com tipo e valor. Tokens sem a extensão do TokenTidy (escritos à mão no JSON)
 * têm o tipo pelo `$type` ou pela categoria (`spacing.4`) e o valor pelo `$value`.
 */
export function treeTokensOf(tree: DtcgTree): TreeToken[] {
    const result: TreeToken[] = [];
    for (const { path: trail, token, type } of tokensOf(tree)) {
        const extension = extensionOf(token) as { type?: unknown; key?: unknown; occurrences?: unknown } | undefined;
        const occurrences = Array.isArray(extension?.occurrences) ? extension.occurrences.filter(isOccurrence) : [];
        const reference = typeof token.$value === 'string' ? /^\{([^}]+)\}$/.exec(token.$value)?.[1] : undefined;
        if (reference) {
            result.push({ path: trail, target: reference.split('.'), occurrences });
            continue;
        }
        if (TOKEN_TYPES.includes(extension?.type as TokenType) && typeof extension?.key === 'string') {
            result.push({ path: trail, type: extension.type as TokenType, key: extension.key, occurrences });
            continue;
        }
        const category = trail[0] as TokenType;
        const tokenType = (type ? DTCG_TYPES.get(type) : undefined) ?? (TOKEN_TYPES.includes(category) ? category : undefined);
        const css = cssValueOf(token.$value, type);
        if (tokenType && css !== undefined) {
            result.push({ path: trail, type: tokenType, key: normalizeValue(tokenType, css), occurrences });
        }
    }
    return result;
}

function isOccurrence(item: unknown): item is TreeOccurrence {
    const o = item as Partial<TreeOccurrence> | null;
    return typeof o === 'object' && o !== null && typeof o.file === 'string' && typeof o.property === 'string'
        && (o.selector === undefined || typeof o.selector === 'string');
}

/** Arquivo de saída que o TokenTidy não consegue ler ou não pode substituir: erro de uso, nada é escrito. */
export class OutputError extends Error {}

/** Lê o `tokens.tokens.json` da pasta de saída, se existir. Arquivo corrompido é erro claro, não um stack trace. */
export async function readDtcgTree(outDir: string): Promise<DtcgTree | undefined> {
    const file = path.join(outDir, DTCG_FILE);
    if (!existsSync(file)) {
        return undefined;
    }
    let json: unknown;
    try {
        json = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
        throw new OutputError(`Invalid JSON in ${file}: ${(error as Error).message}. Fix it or use --out to write elsewhere.`);
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        throw new OutputError(`${file} is not a DTCG token file (expected a JSON object)`);
    }
    return json as DtcgTree;
}

/** Tokens da árvore sem a extensão do TokenTidy: escritos à mão. */
export function handWritten(tree: DtcgTree): string[] {
    return [...tokensOf(tree)].filter(({ token }) => extensionOf(token) === undefined).map(({ path: trail }) => trail.join('.'));
}
