/**
 * Tokens de design systems instalados: segue `@import`/`@use`/`@forward` até `node_modules` e lê só esses arquivos.
 * Só as definições importam: o CSS do pacote não é código do projeto, e nada nele vira achado.
 * Leitura por texto, como em `fix/imports.ts`: um import falso dentro de um comentário só custa abrir um arquivo.
 */

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { ParseResult } from '../parsers/collector.ts';
import type { TokenDefinition } from '../types.ts';
import { isInside } from '../project/scope.ts';

const STATEMENT = /@(use|forward|import)\s+(?:\([^)]*\)\s*)?(?:url\(\s*)?(['"])([^'"]+)\2([^;\n]*)/g;
export const LOADS_STYLES = /@(use|forward|import)\b/;

const EXTENSIONS = ['.scss', '.sass', '.less', '.css'];
/** Teto: pacote com milhares de parciais não pode travar um hook de pre-commit. */
const MAX_FILES = 500;
const MAX_BYTES = 2_000_000;

interface Loaded {
    definitions: TokenDefinition[];
    /** Arquivos que este carrega, e se as variáveis deles ficam visíveis a quem carrega este. */
    loads: { file: string; visible: boolean }[];
}

type Parse = (source: string, file: string, kind: string) => Promise<ParseResult>;

interface Statement {
    rule: string;
    url: string;
    /** `$x` funciona direto: `@import`, `@use … as *`, e `@forward`, que repassa para quem carrega. */
    visible: boolean;
}

function statementsOf(source: string): Statement[] {
    return [...source.matchAll(STATEMENT)].flatMap(([, rule = '', , url = '', rest = '']) => (
        /^[a-z]+:|^\/|\.\.\//i.test(url.replace(/^~/, '')) && !url.startsWith('.') ? [] : [{ rule, url, visible: rule !== 'use' || /\bas\s+\*/.test(rest) }]
    ));
}

/** Nome do arquivo como um `@use` o escreveria: com extensão, partial `_x` ou pasta com `_index`. */
function fileCandidates(base: string): string[] {
    if (EXTENSIONS.includes(path.extname(base).toLowerCase())) {
        return [base];
    }
    const dir = path.dirname(base);
    const name = path.basename(base);
    return EXTENSIONS.flatMap((ext) => [`${base}${ext}`, path.join(dir, `_${name}${ext}`), path.join(base, `_index${ext}`), path.join(base, `index${ext}`)]);
}

async function firstFile(candidates: readonly string[]): Promise<string | undefined> {
    for (const candidate of candidates) {
        const info = await stat(candidate).catch(() => undefined);
        if (info?.isFile() && info.size <= MAX_BYTES) {
            return candidate;
        }
    }
    return undefined;
}

/** `sass`/`style` do `package.json`: o que `@import 'pacote'` resolve quando não há subcaminho. */
async function packageEntry(dir: string): Promise<string | undefined> {
    const manifest = await readFile(path.join(dir, 'package.json'), 'utf8').then((text) => JSON.parse(text) as Record<string, unknown>).catch(() => undefined);
    for (const field of ['sass', 'less', 'style']) {
        const entry = manifest?.[field];
        if (typeof entry === 'string' && !entry.includes('..')) {
            const file = await firstFile([path.join(dir, entry)]);
            if (file) {
                return file;
            }
        }
    }
    return firstFile(fileCandidates(path.join(dir, 'index')));
}

/** Procura em cada `node_modules` subindo a árvore: em monorepo o pacote fica na raiz do workspace. */
async function resolvePackage(url: string, from: string): Promise<string | undefined> {
    const segments = url.split('/');
    const size = url.startsWith('@') ? 2 : 1;
    if (segments.length < size || segments.some((segment) => segment === '..' || segment === '')) {
        return undefined;
    }
    for (let dir = from; ; dir = path.dirname(dir)) {
        const modules = path.join(dir, 'node_modules');
        const packageDir = path.join(modules, ...segments.slice(0, size));
        if (existsSync(packageDir)) {
            const found = segments.length === size ? await packageEntry(packageDir) : await firstFile(fileCandidates(path.join(modules, ...segments)));
            if (found) {
                return found;
            }
        }
        if (dir === path.dirname(dir)) {
            return undefined;
        }
    }
}

function packageName(file: string): string {
    const after = file.split(`node_modules${path.sep}`).at(-1)!.split(path.sep);
    return after[0]!.startsWith('@') ? after.slice(0, 2).join('/') : after[0]!;
}

function packageRoot(file: string): string {
    const marker = `node_modules${path.sep}`;
    return file.slice(0, file.lastIndexOf(marker) + marker.length) + packageName(file).split('/').join(path.sep);
}

class PackageReader {
    readonly #cache = new Map<string, Loaded>();
    readonly #root: string;
    readonly #parse: Parse;

    constructor(root: string, parse: Parse) {
        this.#root = root;
        this.#parse = parse;
    }

    /** O arquivo e o que ele carrega, sem repetir leitura. */
    async load(absolute: string): Promise<void> {
        const pending = [absolute];
        for (let file = pending.pop(); file !== undefined && this.#cache.size < MAX_FILES; file = pending.pop()) {
            if (this.#cache.has(file)) {
                continue;
            }
            const loaded: Loaded = { definitions: [], loads: [] };
            this.#cache.set(file, loaded);
            const source = await readFile(file, 'utf8').catch(() => undefined);
            if (source === undefined) {
                continue;
            }
            const relative = path.relative(this.#root, file).split(path.sep).join('/');
            const result = await this.#parse(source, relative, path.extname(file).toLowerCase()).catch(() => undefined);
            const name = packageName(file);
            loaded.definitions = (result?.definitions ?? []).map((d) => ({ ...d, package: name }));
            for (const { url, visible } of statementsOf(source)) {
                const target = await this.#target(url, file);
                if (target) {
                    loaded.loads.push({ file: target, visible });
                    pending.push(target);
                }
            }
        }
    }

    /** Relativo dentro do próprio pacote; senão, outro pacote. */
    async #target(url: string, from: string): Promise<string | undefined> {
        const clean = url.replace(/^~/, '');
        if (!url.startsWith('~')) {
            const local = await firstFile(fileCandidates(path.resolve(path.dirname(from), clean)));
            if (local) {
                return isInside(local, packageRoot(from)) ? local : undefined;
            }
        }
        return clean.startsWith('.') ? undefined : resolvePackage(clean, path.dirname(from));
    }

    /** Todas as definições alcançadas por `start`; `visible` marca as que chegam sem namespace. */
    reach(start: string, startVisible: boolean, visit: (definition: TokenDefinition, visible: boolean) => void): void {
        const seen = new Map<string, boolean>();
        const stack: [string, boolean][] = [[start, startVisible]];
        for (let item = stack.pop(); item; item = stack.pop()) {
            const [file, visible] = item;
            const before = seen.get(file);
            if (before === true || before === visible) {
                continue;
            }
            seen.set(file, visible);
            const loaded = this.#cache.get(file);
            if (!loaded) {
                continue;
            }
            loaded.definitions.forEach((definition) => visit(definition, visible));
            stack.push(...loaded.loads.map(({ file: next, visible: passes }): [string, boolean] => [next, visible && passes]));
        }
    }
}

/** Definições de pacotes que os arquivos carregam, cada uma com quem a enxerga sem namespace. */
export async function packageDefinitions(styles: ReadonlyMap<string, string>, root: string, parse: Parse): Promise<TokenDefinition[]> {
    const reader = new PackageReader(root, parse);
    const found = new Map<TokenDefinition, Set<string>>();
    for (const [file, source] of styles) {
        const from = path.dirname(path.join(root, file));
        for (const { url, visible } of statementsOf(source)) {
            // Sem `~`, um arquivo local com esse nome ganha: é o que os compiladores fazem
            if (url.startsWith('.') || (!url.startsWith('~') && await firstFile(fileCandidates(path.resolve(from, url))))) {
                continue;
            }
            const target = await resolvePackage(url.replace(/^~/, ''), from);
            if (!target) {
                continue;
            }
            await reader.load(target);
            reader.reach(target, visible, (definition, seen) => {
                const loaders = found.get(definition) ?? new Set<string>();
                if (seen) {
                    loaders.add(file);
                }
                found.set(definition, loaders);
            });
        }
    }
    return [...found].map(([definition, loaders]) => ({ ...definition, loadedBy: [...loaders].sort() }));
}
