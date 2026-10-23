/**
 * Escopo da análise: dos caminhos passados na linha de comando (arquivos e pastas) até a raiz do projeto
 * e a lista de arquivos. A raiz decide de onde vem a configuração e a que os caminhos da saída são relativos.
 */

import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { classifyFile, listFiles } from './scanner.ts';
import type { SkippedFile } from './scanner.ts';

/** Arquivos que marcam a raiz de um projeto. */
const ROOT_MARKERS = ['package.json', 'tokentidy.config.json', '.git'];

export interface ScopeOptions {
    /** Globs relativos à raiz (`legacy/**`): arquivos que casam ficam fora, listados como `ignored`. */
    ignore?: readonly string[];
    /** Analisa também arquivos minificados. */
    includeMinified?: boolean;
}

export interface Scope {
    root: string;
    /** Relativos à raiz, sempre com `/`, em ordem. */
    files: string[];
    tokenFiles: string[];
    skipped: SkippedFile[];
    /** Caminhos passados que não tinham nenhum arquivo suportado (como foram escritos). */
    unmatched: string[];
}

/** Caminho que não existe: erro de uso (exit 2), não "nada encontrado". */
export class ScopeError extends Error {}

/**
 * Raiz do projeto: a pasta mais próxima, subindo a partir da pasta comum aos caminhos,
 * que tem `package.json`, `tokentidy.config.json` ou `.git`. Sem nenhuma, a própria pasta comum.
 * Assim `tokentidy check src/Card.css` usa a configuração do projeto e mostra `src/Card.css`.
 */
export async function findProjectRoot(paths: readonly string[]): Promise<string> {
    const common = await commonParent(paths);
    for (let dir = common; ; dir = path.dirname(dir)) {
        if (ROOT_MARKERS.some((marker) => existsSync(path.join(dir, marker)))) {
            return dir;
        }
        if (path.dirname(dir) === dir) {
            return common;
        }
    }
}

/** Pasta que contém todos os caminhos (para um arquivo, a pasta dele). Lança `ScopeError` se algum não existir. */
async function commonParent(paths: readonly string[]): Promise<string> {
    const dirs: string[] = [];
    for (const given of paths) {
        const absolute = path.resolve(given);
        const info = await stat(absolute).catch(() => undefined);
        if (!info) {
            throw new ScopeError(`Path not found: ${given}`);
        }
        dirs.push(info.isDirectory() ? absolute : path.dirname(absolute));
    }
    return dirs.reduce((common, dir) => {
        while (!isInside(dir, common)) {
            common = path.dirname(common);
        }
        return common;
    });
}

/** `child` é `parent` ou fica dentro dele. Compara caminhos já resolvidos, sem `..`. */
export function isInside(child: string, parent: string): boolean {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Arquivos do escopo, relativos à raiz. Pastas seguem as exclusões padrão (`node_modules`, testes, ocultas);
 * um arquivo passado explicitamente entra mesmo que o nome fosse excluído numa pasta (`Button.test.tsx`).
 */
export async function collectFiles(paths: readonly string[], root: string, options: ScopeOptions = {}): Promise<Scope> {
    const files = new Set<string>();
    const tokenFiles = new Set<string>();
    const skipped = new Map<string, SkippedFile>();
    const unmatched: string[] = [];
    const ignore = options.ignore ?? [];
    const toPosix = (absolute: string) => path.relative(root, absolute).split(path.sep).join('/');
    const ignored = (file: string) => ignore.some((pattern) => path.posix.matchesGlob(file, pattern));

    for (const given of paths) {
        const absolute = path.resolve(given);
        const isDirectory = (await stat(absolute)).isDirectory();
        const candidates = [absolute];
        if (isDirectory) {
            candidates.length = 0;
            for await (const relative of listFiles(absolute)) {
                candidates.push(path.join(absolute, relative));
            }
        }
        let matched = false;
        for (const candidate of candidates) {
            const file = toPosix(candidate);
            const kind = classifyFile(candidate, !isDirectory);
            if (kind === 'other') {
                continue;
            }
            matched = true;
            if (ignored(file)) {
                skipped.set(file, { file, reason: 'ignored' });
            } else if (kind === 'supported' || (kind === 'minified' && options.includeMinified)) {
                files.add(file);
            } else if (kind === 'token') {
                tokenFiles.add(file);
            } else {
                skipped.set(file, { file, reason: kind === 'minified' ? 'minified' : 'unsupported' });
            }
        }
        if (!matched) {
            unmatched.push(given);
        }
    }

    // Ordem estável: o glob não garante ordem, e a saída precisa ser a mesma em toda execução
    return {
        root,
        files: [...files].sort(),
        tokenFiles: [...tokenFiles].sort(),
        skipped: [...skipped.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
        unmatched,
    };
}
