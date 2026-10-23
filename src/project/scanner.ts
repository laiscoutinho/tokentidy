import { existsSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';

/**
 * Extensões que o TokenTidy analisa (estilos e arquivos que podem ter estilo inline).
 * `.pcss`/`.postcss` são CSS com plugins do PostCSS: a sintaxe é a do CSS.
 */
export const SUPPORTED_EXTENSIONS = [
    '.css', '.pcss', '.postcss', '.scss', '.sass', '.less', '.html', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/**
 * Linguagens de interface que ainda não têm parser. Os arquivos aparecem na lista de ignorados,
 * para ninguém achar que um `.vue` sem achados está limpo.
 */
export const UNSUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.vue', '.svelte', '.styl', '.stylus']);

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'out']);

/** Arquivos que não são código de interface escrito pela pessoa: declarações de tipo, testes e stories. */
const IGNORED_FILE = /\.d\.[cm]?ts$|\.(spec|test|stories)\.[^.]+$/;

/** Minificado pelo nome (`app.min.css`). O conteúdo também é conferido na análise (ver `isMinified`). */
const MINIFIED_NAME = /\.min\.[^.]+$/;

/** Tokens no formato DTCG (`*.tokens.json` ou `*.tokens`), a especificação de design tokens do W3C. */
const TOKEN_FILE = /\.tokens(\.json)?$/;

/** Por que um arquivo do escopo não foi analisado. `ignored`: casou com `ignore` da configuração. */
export type SkipReason = 'minified' | 'unsupported' | 'ignored';

export interface SkippedFile {
    file: string;
    reason: SkipReason;
}

export interface ScanResult {
    root: string;
    total: number;
    byExtension: Record<SupportedExtension, number>;
    files: string[];
    /** Arquivos de tokens DTCG: não são analisados como código, mas contam como tokens já existentes. */
    tokenFiles: string[];
    /** Arquivos encontrados e não analisados, com o motivo. */
    skipped: SkippedFile[];
}

/** O que fazer com um arquivo encontrado. `other`: não é interface (`.md`, `.png`), nem aparece na saída. */
export type FileKind = 'supported' | 'token' | 'minified' | 'unsupported' | 'other';

export function isSupportedExtension(ext: string): ext is SupportedExtension {
    return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Classifica um arquivo pelo nome. `explicit`: a pessoa passou o arquivo na linha de comando,
 * então testes e stories entram (ela pediu); minificado continua fora, mas é listado.
 */
export function classifyFile(name: string, explicit = false): FileKind {
    const base = path.basename(name);
    const ext = path.extname(base).toLowerCase();
    if (TOKEN_FILE.test(base)) {
        return 'token';
    }
    if (UNSUPPORTED_EXTENSIONS.has(ext)) {
        return 'unsupported';
    }
    if (!isSupportedExtension(ext)) {
        return 'other';
    }
    if (MINIFIED_NAME.test(base)) {
        return 'minified';
    }
    return !explicit && IGNORED_FILE.test(base) ? 'other' : 'supported';
}

/**
 * Arquivos dentro de uma pasta, relativos a ela (com o separador do SO).
 * Não entra em pastas de build e dependências, em pastas ocultas (`.git`, `.cache`, `.storybook`)
 * nem em links simbólicos: um link pode apontar para fora do projeto ou para uma pasta acima (loop).
 */
export async function* listFiles(dir: string): AsyncGenerator<string> {
    /**
     * Um padrão só e o filtro de extensão depois: com um padrão por extensão o fs.glob
     * percorria a árvore uma vez para cada um (medido: ~45% mais lento em 1.400 arquivos).
     */
    const entries = glob('**/*', {
        cwd: dir,
        withFileTypes: true,
        exclude: (entry) => entry.isSymbolicLink()
            || (entry.isDirectory() && (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.'))),
    });
    for await (const entry of entries) {
        if (entry.isFile()) {
            yield path.relative(dir, path.join(entry.parentPath, entry.name));
        }
    }
}

/**
 * Varre um diretório e conta quantos arquivos suportados existem por extensão.
 * Lança um erro se o caminho não existir ou não for um diretório.
 */
export async function scanDirectory(dir: string): Promise<ScanResult> {
    const root = path.resolve(dir);

    if (!existsSync(root)) {
        throw new Error(`Directory not found: ${dir}`);
    }
    if (!statSync(root).isDirectory()) {
        throw new Error(`Not a directory: ${dir}`);
    }

    const files: string[] = [];
    const tokenFiles: string[] = [];
    const skipped: SkippedFile[] = [];
    for await (const relative of listFiles(root)) {
        const kind = classifyFile(relative);
        if (kind === 'supported') {
            files.push(relative);
        } else if (kind === 'token') {
            tokenFiles.push(relative);
        } else if (kind !== 'other') {
            skipped.push({ file: relative, reason: kind });
        }
    }

    const byExtension = Object.fromEntries(SUPPORTED_EXTENSIONS.map((ext) => [ext, 0])) as Record<SupportedExtension, number>;
    for (const file of files) {
        byExtension[path.extname(file).toLowerCase() as SupportedExtension] += 1;
    }

    return { root, total: files.length, byExtension, files, tokenFiles, skipped };
}
