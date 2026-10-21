import { existsSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';

// Extensões que o TokenTidy analisa (estilos e arquivos que podem ter estilo inline)
export const SUPPORTED_EXTENSIONS = [
    '.css', '.scss', '.sass', '.less', '.html', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

const IGNORED_DIRS = ['node_modules', 'dist', 'build', '.git', 'coverage', '.angular', '.next', '.nuxt', 'out'];

/**
 * Arquivos que não são código de interface escrito pela pessoa:
 * declarações de tipo, testes e arquivos minificados (gerados por build).
 */
const IGNORED_FILE = /\.d\.[cm]?ts$|\.(spec|test|stories)\.[^.]+$|\.min\.[^.]+$/;

/** Tokens no formato DTCG (`*.tokens.json` ou `*.tokens`), a especificação de design tokens do W3C. */
const TOKEN_FILE = /\.tokens(\.json)?$/;

export interface ScanResult {
    root: string;
    total: number;
    byExtension: Record<SupportedExtension, number>;
    files: string[];
    /** Arquivos de tokens DTCG: não são analisados como código, mas contam como tokens já existentes. */
    tokenFiles: string[];
}

export function isSupportedExtension(ext: string): ext is SupportedExtension {
    return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
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

    // Um padrão só e o filtro de extensão aqui: com um padrão por extensão o fs.glob
    // percorria a árvore uma vez para cada um (medido: ~45% mais lento em 1.400 arquivos).
    // O exclude também impede de entrar nas pastas ignoradas.
    const files: string[] = [];
    const tokenFiles: string[] = [];
    const entries = glob('**/*', {
        cwd: root,
        withFileTypes: true,
        exclude: (entry) => entry.isDirectory() && IGNORED_DIRS.includes(entry.name),
    });
    for await (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }
        const relative = path.relative(root, path.join(entry.parentPath, entry.name));
        if (TOKEN_FILE.test(entry.name)) {
            tokenFiles.push(relative);
        } else if (isSupportedExtension(path.extname(entry.name).toLowerCase()) && !IGNORED_FILE.test(entry.name)) {
            files.push(relative);
        }
    }

    const byExtension = Object.fromEntries(SUPPORTED_EXTENSIONS.map((ext) => [ext, 0])) as Record<SupportedExtension, number>;
    for (const file of files) {
        byExtension[path.extname(file).toLowerCase() as SupportedExtension] += 1;
    }

    return { root, total: files.length, byExtension, files, tokenFiles };
}
