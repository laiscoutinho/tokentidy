// Saída da geração: a pasta de tokens (padrão `design-tokens/`).
// - `tokens.tokens.json`: formato DTCG (W3C, versão 2025.10), a fonte da verdade. Ferramentas como
//   Style Dictionary e Tokens Studio leem esse formato;
// - `tokens.css`: os mesmos tokens como custom properties (`--color-red-500`), que funcionam em qualquer arquivo;
// - `_tokens.scss` / `_tokens.less`: só quando o projeto usa SCSS/Sass ou Less, para usar em funções
//   que rodam no build (`darken($cor, 10%)`), que não aceitam `var()`.
// Projeto grande (muitos tokens): o CSS é dividido em um arquivo por categoria e entra um README.
// Cada token leva em `$extensions["dev.tokentidy"]` as ocorrências no código: é o que o autofix vai usar.

import { existsSync } from 'node:fs';
import { readdir, readFile, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';

import { writeFileAtomic } from '../fs-safe.ts';

import { cssValueOf } from '../parsers/dtcg.ts';
import { colorInfo, cubicBezierOf, lengthInPx, parseLength, parseShadow, splitFontFamilies } from '../suggest/normalize.ts';
import type { ShadowLayer } from '../suggest/normalize.ts';
import type { Finding, TokenType } from '../types.ts';
import type { GeneratedToken, GenerationResult, OwnToken } from './generate.ts';
import { TOKEN_TYPES } from './generate.ts';
import type { SemanticAlias } from './semantic.ts';

/** Chave das extensões do TokenTidy no DTCG (notação de domínio invertido, como a especificação pede). */
export const EXTENSION = 'dev.tokentidy';
export const DTCG_FILE = 'tokens.tokens.json';

/** Arquivos que o TokenTidy gera: só eles são apagados no modo "começar do zero". */
const GENERATED_FILES = [DTCG_FILE, 'tokens.css', '_tokens.scss', '_tokens.less', 'README.md'];
const SPLIT_DIR = 'css';

type DtcgTree = Record<string, unknown>;

interface DtcgToken {
    $type?: string;
    $value: unknown;
    $extensions?: Record<string, unknown>;
}

// ─── DTCG ───────────────────────────────────────────────────────────────────

/** Valor e `$type` de um token no formato DTCG. Unidade que o DTCG não aceita (`em`, `%`) vira `number` + unidade na extensão. */
export function dtcgValueOf(type: TokenType, key: string): { $type?: string; $value: unknown; unit?: string } {
    switch (type) {
        case 'color':
            return { $type: 'color', $value: dtcgColor(key) ?? key };
        case 'font-family': {
            const families = splitFontFamilies(key);
            return { $type: 'fontFamily', $value: families.length === 1 ? families[0] : families };
        }
        case 'font-weight':
            return { $type: 'fontWeight', $value: Number.isFinite(Number(key)) ? Number(key) : key };
        case 'opacity':
        case 'z-index':
            return { $type: 'number', $value: Number(key) };
        case 'duration':
            return { $type: 'duration', $value: { value: Number(key.replace(/ms$/, '')), unit: 'ms' } };
        case 'easing': {
            const bezier = cubicBezierOf(key);
            return bezier ? { $type: 'cubicBezier', $value: bezier } : { $value: key };
        }
        case 'shadow': {
            const layers = parseShadow(key)?.map(dtcgShadowLayer);
            if (!layers || layers.some((layer) => layer === undefined)) {
                return { $value: key };
            }
            return { $type: 'shadow', $value: layers.length === 1 ? layers[0] : layers };
        }
        case 'line-height':
            if (parseLength(key)?.unit === '') {
                return { $type: 'number', $value: Number(key) };
            }
            return dtcgDimension(key);
        default:
            return dtcgDimension(key);
    }
}

function dtcgDimension(key: string): { $type?: string; $value: unknown; unit?: string } {
    const length = parseLength(key);
    if (!length) {
        return { $value: key };
    }
    if (length.unit === 'px' || length.unit === 'rem' || (length.unit === '' && length.value === 0)) {
        return { $type: 'dimension', $value: { value: length.value, unit: length.unit || 'px' } };
    }
    return { $type: 'number', $value: length.value, unit: length.unit };
}

/** Cor no formato 2025.10: `{ colorSpace, components, alpha?, hex }`. Fora do sRGB, fica em OKLCH. */
function dtcgColor(key: string): Record<string, unknown> | undefined {
    const info = colorInfo(key);
    if (!info) {
        return undefined;
    }
    const alpha = info.alpha < 1 ? { alpha: info.alpha } : {};
    if (info.wideGamut) {
        const [l, c, h] = info.oklch;
        return { colorSpace: 'oklch', components: [round(l), round(c), Number.isNaN(h) ? 'none' : round(h)], ...alpha };
    }
    return { colorSpace: 'srgb', components: info.srgb.map(round), ...alpha, hex: info.hex!.slice(0, 7) };
}

function dtcgShadowLayer(layer: ShadowLayer): Record<string, unknown> | undefined {
    const parts = [layer.offsetX, layer.offsetY, layer.blur, layer.spread].map((p) => dtcgDimension(p === '0' ? '0px' : p));
    const color = dtcgColor(layer.color);
    if (parts.some((p) => p.$type !== 'dimension') || !color) {
        return undefined;
    }
    const [offsetX, offsetY, blur, spread] = parts.map((p) => p.$value);
    return { color, offsetX, offsetY, blur, spread, ...(layer.inset ? { inset: true } : {}) };
}

function round(n: number): number {
    return Math.round(n * 10000) / 10000;
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
function extensionOf(token: DtcgToken): unknown {
    const extensions = token.$extensions;
    return typeof extensions === 'object' && extensions !== null && Object.hasOwn(extensions, EXTENSION) ? extensions[EXTENSION] : undefined;
}

/** Todos os tokens de uma árvore, em ordem, com o tipo herdado dos grupos. */
function* tokensOf(tree: DtcgTree, trail: string[] = [], type?: string): Generator<{ path: string[]; token: DtcgToken; type?: string }> {
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
function handWritten(tree: DtcgTree): string[] {
    return [...tokensOf(tree)].filter(({ token }) => extensionOf(token) === undefined).map(({ path: trail }) => trail.join('.'));
}

// ─── CSS, SCSS e Less ───────────────────────────────────────────────────────

interface FlatToken {
    name: string;
    category: string;
    /** Valor final em CSS, ou o nome do token apontado (alias). */
    value: string;
    alias?: string;
}

/** Lista plana a partir da árvore DTCG: o CSS sai sempre do mesmo lugar que o JSON. */
function flatten(tree: DtcgTree): FlatToken[] {
    const flat: FlatToken[] = [];
    for (const { path: trail, token, type } of tokensOf(tree)) {
        const name = trail.join('-');
        const category = trail[0]!;
        const reference = typeof token.$value === 'string' ? /^\{([^}]+)\}$/.exec(token.$value)?.[1] : undefined;
        if (reference) {
            flat.push({ name, category, value: '', alias: reference.split('.').join('-') });
            continue;
        }
        const extension = extensionOf(token) as { css?: string } | undefined;
        const value = extension?.css ?? cssValueOf(token.$value, type);
        if (value !== undefined) {
            flat.push({ name, category, value });
        }
    }
    return flat;
}

type Syntax = 'css' | 'scss' | 'less';

function declarationLine(token: FlatToken, syntax: Syntax): string {
    switch (syntax) {
        case 'css':
            return `  --${token.name}: ${token.alias ? `var(--${token.alias})` : token.value};`;
        case 'scss':
            return `$${token.name}: ${token.alias ? `$${token.alias}` : token.value};`;
        case 'less':
            return `@${token.name}: ${token.alias ? `@${token.alias}` : token.value};`;
    }
}

const HEADER = '/* Generated by TokenTidy from tokens.tokens.json. Edit the JSON and run `tokentidy generate` again. */';
/** Primeira linha do README gerado: é como o TokenTidy reconhece o próprio arquivo antes de apagar ou substituir. */
const README_MARKER = '<!-- Generated by TokenTidy. Run `tokentidy generate` again to update. -->';

/** Um bloco por categoria, com o nome da categoria em comentário: o arquivo se lê como um índice. */
function stylesheet(tokens: readonly FlatToken[], syntax: Syntax): string {
    const sections = [...Map.groupBy(tokens, (t) => t.category)].map(([category, ofCategory]) =>
        [syntax === 'css' ? `  /* ${category} */` : `// ${category}`, ...ofCategory.map((t) => declarationLine(t, syntax))].join('\n'));
    const body = sections.join('\n\n');
    return syntax === 'css' ? `${HEADER}\n:root {\n${body}\n}\n` : `${HEADER}\n${body}\n`;
}

export interface WriteOptions {
    /** Pasta de saída, absoluta. */
    outDir: string;
    mode: 'extend' | 'new';
    /** Linguagens de estilo do projeto: decidem se `_tokens.scss` e `_tokens.less` são gerados. */
    styleLanguages: readonly string[];
    splitThreshold: number;
}

export interface OutputFile {
    /** Caminho absoluto. */
    file: string;
    content: string;
}

/** Monta os arquivos de saída (sem escrever): o `--dry-run` mostra exatamente isto. */
export function renderOutput(tree: DtcgTree, options: WriteOptions): OutputFile[] {
    const flat = sortForReading(flatten(tree));
    const at = (name: string) => path.join(options.outDir, name);
    const files: OutputFile[] = [{ file: at(DTCG_FILE), content: `${JSON.stringify(tree, null, 2)}\n` }];

    const split = flat.length > options.splitThreshold;
    if (split) {
        const categories = [...new Set(flat.map((t) => t.category))];
        for (const category of categories) {
            files.push({ file: at(path.join(SPLIT_DIR, `${category}.css`)), content: stylesheet(flat.filter((t) => t.category === category), 'css') });
        }
        files.push({ file: at('tokens.css'), content: `${HEADER}\n${categories.map((c) => `@import "./${SPLIT_DIR}/${c}.css";`).join('\n')}\n` });
    } else {
        files.push({ file: at('tokens.css'), content: stylesheet(flat, 'css') });
    }
    if (options.styleLanguages.includes('scss') || options.styleLanguages.includes('sass')) {
        files.push({ file: at('_tokens.scss'), content: stylesheet(flat, 'scss') });
    }
    if (options.styleLanguages.includes('less')) {
        files.push({ file: at('_tokens.less'), content: stylesheet(flat, 'less') });
    }
    if (split) {
        files.push({ file: at('README.md'), content: readme(files.map((f) => path.relative(options.outDir, f.file).split(path.sep).join('/')), flat.length) });
    }
    return files;
}

/**
 * Ordem de leitura: categorias na ordem de `TOKEN_TYPES` e, dentro delas, medidas do menor para o maior.
 * Não dá para confiar na ordem do JSON: em objetos JavaScript, chaves que parecem inteiros (`"3"`)
 * sempre vêm antes das outras (`"2_5"`), qualquer que seja a ordem de inserção.
 */
function sortForReading(tokens: FlatToken[]): FlatToken[] {
    const measure = (t: FlatToken) => (t.alias ? undefined : lengthInPx(t.value) ?? parseLength(t.value)?.value);
    const byCategory = [...Map.groupBy(tokens, (t) => t.category)].sort(([a], [b]) => categoryRank(a) - categoryRank(b));
    return byCategory.flatMap(([, ofCategory]) => {
        const measures = ofCategory.map(measure);
        if (measures.some((m) => m === undefined)) {
            return ofCategory;
        }
        // `toSorted` é estável: medidas iguais (16px e 1rem) mantêm a ordem do JSON
        return ofCategory.map((t, i) => ({ t, m: measures[i]! })).toSorted((a, b) => a.m - b.m).map(({ t }) => t);
    });
}

function categoryRank(category: string): number {
    const index = TOKEN_TYPES.indexOf(category as TokenType);
    if (index !== -1) {
        return index;
    }
    // `text-shadow` fica junto de `shadow`; categorias de fora (modo extend) vão para o fim
    return category === 'text-shadow' ? TOKEN_TYPES.indexOf('shadow') : TOKEN_TYPES.length;
}

function readme(files: readonly string[], count: number): string {
    return `${README_MARKER}
# Design tokens

Generated by TokenTidy: ${count} tokens.

- \`${DTCG_FILE}\` is the source of truth, in the W3C Design Tokens (DTCG) format.
- \`tokens.css\` imports one file per category from \`${SPLIT_DIR}/\` and exposes every token as a CSS custom property.
- \`_tokens.scss\` / \`_tokens.less\` (when present) expose the same tokens as preprocessor variables.

Files:

${files.map((file) => `- \`${file}\``).join('\n')}
`;
}

/** Arquivo que o próprio TokenTidy escreveu (começa com o cabeçalho ou o marcador do README). */
function isGenerated(content: string): boolean {
    return content.startsWith(HEADER) || content.startsWith(README_MARKER);
}

async function readIfExists(file: string): Promise<string | undefined> {
    return readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    });
}

/**
 * Escreve os arquivos, cada um de forma atômica. Nunca substitui nem apaga arquivo de outra pessoa:
 * - um `tokens.css`/`_tokens.scss`/`README.md` sem o cabeçalho do TokenTidy interrompe tudo antes de escrever;
 * - no modo "começar do zero", um `tokens.tokens.json` com tokens escritos à mão também;
 * - sobras de uma geração anterior (`css/color.css` que não existe mais) são apagadas só se forem do TokenTidy.
 */
export async function writeOutput(files: readonly OutputFile[], options: WriteOptions): Promise<void> {
    for (const { file } of files) {
        const current = await readIfExists(file);
        if (current === undefined) {
            continue;
        }
        if (path.basename(file) === DTCG_FILE) {
            const tree = options.mode === 'new' ? await readDtcgTree(path.dirname(file)) : undefined;
            const manual = tree ? handWritten(tree) : [];
            if (manual.length > 0) {
                throw new OutputError(`${file} has tokens not generated by TokenTidy (${manual.slice(0, 3).join(', ')}${manual.length > 3 ? ', ...' : ''}); --new would delete them. Use --extend or --out.`);
            }
        } else if (!isGenerated(current)) {
            throw new OutputError(`${file} was not generated by TokenTidy; not overwriting it. Use --out to write elsewhere.`);
        }
    }

    // Sobras da geração anterior (o CSS deixou de ser dividido, o projeto parou de usar Less)
    const keep = new Set(files.map((f) => f.file));
    const splitDir = path.join(options.outDir, SPLIT_DIR);
    const split = (await readdir(splitDir).catch(() => [] as string[])).filter((name) => name.endsWith('.css')).map((name) => path.join(SPLIT_DIR, name));
    for (const name of [...GENERATED_FILES.filter((n) => n !== DTCG_FILE), ...split]) {
        const file = path.join(options.outDir, name);
        const current = keep.has(file) ? undefined : await readIfExists(file);
        if (current !== undefined && isGenerated(current)) {
            await rm(file, { force: true });
        }
    }
    // Só se ficou vazia: a pasta pode ter arquivos da pessoa
    await rmdir(splitDir).catch(() => undefined);
    for (const { file, content } of files) {
        await writeFileAtomic(file, content);
    }
}
