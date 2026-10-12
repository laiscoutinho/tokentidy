import { existsSync, statSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import path from 'node:path';

// Extensões que o TokenTidy analisa (estilos e arquivos que podem ter estilo inline)
export const SUPPORTED_EXTENSIONS = ['.css', '.scss', '.html', '.js', '.jsx', '.ts', '.tsx'] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

const IGNORED_DIRS = ['node_modules', 'dist', 'build', '.git', 'coverage'];

export interface ScanResult {
    root: string;
    total: number;
    byExtension: Record<SupportedExtension, number>;
    files: string[];
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
        throw new Error(`Diretório não encontrado: ${dir}`);
    }
    if (!statSync(root).isDirectory()) {
        throw new Error(`Não é um diretório: ${dir}`);
    }

    const patterns = SUPPORTED_EXTENSIONS.map((ext) => `**/*${ext}`);
    // fs.glob é embutido no Node; o exclude também impede de entrar nas pastas ignoradas
    const files: string[] = [];
    const matches = glob(patterns, {
        cwd: root,
        exclude: (entry) => IGNORED_DIRS.includes(path.basename(entry)),
    });
    for await (const file of matches) {
        files.push(file);
    }

    const byExtension = Object.fromEntries(SUPPORTED_EXTENSIONS.map((ext) => [ext, 0])) as Record<SupportedExtension, number>;
    for (const file of files) {
        const ext = path.extname(file);
        if (isSupportedExtension(ext)) {
            byExtension[ext] += 1;
        }
    }

    return { root, total: files.length, byExtension, files };
}
