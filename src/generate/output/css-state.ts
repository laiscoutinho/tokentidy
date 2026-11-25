/**
 * Estado da pasta de tokens lido do `tokens.css` gerado: é o arquivo que a pessoa vê e edita.
 * Nome, valor e categoria vêm do CSS; o `tokens.tokens.json`, quando existe, só devolve o caminho exato
 * e as ocorrências de um token que continua com o mesmo nome e valor. Token apagado ou com valor novo no CSS
 * segue o CSS.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import type { AtRule, Container, Rule } from 'postcss';

import { TOKEN_TYPES } from '../../analysis/rules.ts';
import { normalizeValue } from '../../values/normalize.ts';
import { typeFromName } from '../../values/type-from-name.ts';
import type { TokenType } from '../../types.ts';
import { EXTENSION, extensionOf, readDtcgTree, tokensOf } from './dtcg-tree.ts';
import type { DtcgToken, DtcgTree } from './dtcg-tree.ts';
import { dtcgValueOf } from './dtcg-values.ts';
import { isGenerated } from './render-files.ts';
import { DARK_FILE } from './theme-files.ts';

/** Declaração `--nome: valor` de um bloco do CSS gerado, com a categoria do comentário acima dela. */
interface CssToken {
    name: string;
    value: string;
    category: string;
}

export interface CssState {
    /** Tokens do `:root`, como árvore DTCG (com a extensão do TokenTidy). */
    tree: DtcgTree;
    /** Bloco do tema escuro: os aliases que mudam de valor, mais onde o bloco é ativado. */
    dark?: { tree: DtcgTree; light: DtcgTree; selectors: string[]; media: boolean };
}

const ALIAS = /^var\(\s*--([A-Za-z0-9_-]+)\s*\)$/;

/** Tipo do token pela categoria (`/* spacing *\/`), ou pelo nome e valor quando a categoria não é um tipo. */
function typeOf(category: string, name: string, value: string): TokenType | undefined {
    if (category === 'text-shadow') {
        return 'shadow';
    }
    return TOKEN_TYPES.includes(category as TokenType) ? category as TokenType : typeFromName(name, value);
}

/** Declarações de custom properties de um bloco, com a categoria do último comentário. */
function declarationsOf(block: Container): CssToken[] {
    const found: CssToken[] = [];
    let category = '';
    block.each((node) => {
        if (node.type === 'comment') {
            category = node.text.trim();
        } else if (node.type === 'decl' && node.prop.startsWith('--')) {
            found.push({ name: node.prop.slice(2), value: node.value.trim(), category });
        }
    });
    return found;
}

/** `:root` de primeiro nível e blocos do tema escuro (seletor próprio ou `prefers-color-scheme`). */
function parseGenerated(source: string): { root: CssToken[]; dark: CssToken[]; selectors: string[]; media: boolean } {
    const ast = postcss.parse(source);
    const root: CssToken[] = [];
    const dark: CssToken[] = [];
    const selectors: string[] = [];
    let media = false;
    ast.each((node) => {
        if (node.type === 'rule' && (node as Rule).selector.trim() === ':root') {
            root.push(...declarationsOf(node as Rule));
        } else if (node.type === 'rule') {
            selectors.push(...(node as Rule).selectors.map((s) => s.trim()));
            dark.push(...declarationsOf(node as Rule));
        } else if (node.type === 'atrule' && (node as AtRule).name === 'media' && /prefers-color-scheme:\s*dark/.test((node as AtRule).params)) {
            media = true;
            (node as AtRule).each((inner) => {
                if (inner.type === 'rule') {
                    dark.push(...declarationsOf(inner));
                }
            });
        }
    });
    return { root, dark, selectors, media };
}

/** Lê o `tokens.css` e, se ele for só `@import` dos arquivos por categoria, cada um deles. */
async function readCss(outDir: string): Promise<string | undefined> {
    const main = path.join(outDir, 'tokens.css');
    if (!existsSync(main)) {
        return undefined;
    }
    const source = await readFile(main, 'utf8');
    if (!isGenerated(source)) {
        return undefined;
    }
    const imports = [...source.matchAll(/^@import\s+"\.\/([^"]+\.css)";/gm)].map((m) => m[1]!);
    const parts = await Promise.all(imports.map((file) => readFile(path.join(outDir, file), 'utf8').catch(() => '')));
    return [...parts, source].join('\n');
}

function define(target: DtcgTree, key: string, content: unknown): void {
    Object.defineProperty(target, key, { value: content, enumerable: true, writable: true, configurable: true });
}

function setAt(tree: DtcgTree, trail: readonly string[], value: DtcgToken): void {
    let node = tree;
    for (const key of trail.slice(0, -1)) {
        const next = Object.hasOwn(node, key) ? node[key] : undefined;
        if (typeof next !== 'object' || next === null || Object.hasOwn(next, '$value')) {
            define(node, key, {});
        }
        node = node[key] as DtcgTree;
    }
    define(node, trail.at(-1)!, value);
}

/**
 * Caminhos possíveis de um nome do CSS, do preferido ao último recurso: o do JSON quando ele ainda tem esse nome;
 * senão a categoria e cada parte do resto (`--color-indigo-600` → `['color', 'indigo', '600']`), como o `generate`
 * aninha; depois categoria e resto inteiro; por fim o nome. Todos dão o mesmo nome no CSS.
 */
function pathsOf(token: CssToken, known: ReadonlyMap<string, string[]>): string[][] {
    const fromJson = known.get(token.name);
    if (fromJson) {
        return [fromJson];
    }
    const { category, name } = token;
    if (!category || !name.startsWith(`${category}-`) || name.length <= category.length + 1) {
        return [[name]];
    }
    const rest = name.slice(category.length + 1);
    const parts = rest.split('-');
    return [...(parts.length > 1 && parts.every(Boolean) ? [[category, ...parts]] : []), [category, rest], [name]];
}

/** Um caminho por token, sem que um token fique dentro de outro (`color.indigo` e `color.indigo.600`). */
function trailsOf(tokens: readonly CssToken[], known: ReadonlyMap<string, string[]>): Map<CssToken, string[]> {
    const options = new Map(tokens.map((token) => [token, pathsOf(token, known)]));
    const key = (trail: readonly string[]) => trail.join('\u0000');
    const leaves = new Set([...options.values()].map((paths) => key(paths[0]!)));
    const inside = (trail: readonly string[]) => trail.slice(0, -1).some((_, i) => leaves.has(key(trail.slice(0, i + 1))));
    return new Map([...options].map(([token, paths]) => [token, paths.find((trail) => !inside(trail)) ?? paths.at(-1)!]));
}

/** Monta a árvore de um bloco: primitivos primeiro, depois os aliases (`var(--x)`) apontando para o caminho de `x`. */
function treeOf(tokens: readonly CssToken[], json: DtcgTree | undefined, names: Map<string, string[]>): DtcgTree {
    const previous = new Map<string, { path: string[]; token: DtcgToken }>();
    for (const entry of json ? tokensOf(json) : []) {
        previous.set(entry.path.join('-'), entry);
        names.set(entry.path.join('-'), entry.path);
    }
    const tree: DtcgTree = {};
    const ordered = [...tokens.filter((t) => !ALIAS.test(t.value)), ...tokens.filter((t) => ALIAS.test(t.value))];
    const trails = trailsOf(ordered, names);
    for (const [token, trail] of trails) {
        names.set(token.name, trail);
    }
    for (const token of ordered) {
        const trail = trails.get(token)!;
        const before = previous.get(token.name)?.token;
        const target = ALIAS.exec(token.value)?.[1];
        if (target !== undefined) {
            const targetPath = names.get(target) ?? [target];
            const same = before && before.$value === `{${targetPath.join('.')}}`;
            setAt(tree, trail, same ? structuredClone(before) : { $type: 'color', $value: `{${targetPath.join('.')}}` });
            continue;
        }
        const type = typeOf(token.category, token.name, token.value);
        if (!type) {
            continue;
        }
        const key = normalizeValue(type, token.value);
        const extension = before ? extensionOf(before) as { key?: string } | undefined : undefined;
        if (before && extension?.key === key) {
            setAt(tree, trail, structuredClone(before));
            continue;
        }
        const { unit, ...dtcg } = dtcgValueOf(type, key);
        setAt(tree, trail, {
            ...dtcg,
            $extensions: { [EXTENSION]: { type, key, css: token.value, ...(unit ? { unit } : {}), count: 0, spellings: [token.value] } },
        });
    }
    return tree;
}

/**
 * Estado da pasta de saída. Com `tokens.css` gerado, ele manda (é o que a pessoa edita);
 * sem ele, vale o `tokens.tokens.json` de versões anteriores, se houver.
 */
export async function readTokenState(outDir: string): Promise<CssState | undefined> {
    const json = await readDtcgTree(outDir);
    const css = await readCss(outDir);
    if (css === undefined) {
        return json ? { tree: json } : undefined;
    }
    let parsed: ReturnType<typeof parseGenerated>;
    try {
        parsed = parseGenerated(css);
    } catch {
        // CSS quebrado à mão: o JSON, se houver, ainda diz o que foi gerado
        return json ? { tree: json } : undefined;
    }
    const names = new Map<string, string[]>();
    const tree = treeOf(parsed.root, json, names);
    if (parsed.dark.length === 0) {
        return { tree };
    }
    const darkJson = await readDtcgTree(outDir, DARK_FILE).catch(() => undefined);
    const darkTree = treeOf(parsed.dark, darkJson, new Map(names));
    // O valor claro de cada token do tema é o do `:root`
    const darkNames = new Set(parsed.dark.map((t) => t.name));
    const light = treeOf(parsed.root.filter((t) => darkNames.has(t.name)), json, new Map(names));
    const selectors = [...new Set(parsed.selectors)].sort();
    return { tree, dark: { tree: darkTree, light, selectors, media: parsed.media } };
}
