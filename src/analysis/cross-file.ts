/**
 * O que só se resolve com todos os arquivos lidos: objetos de estilo importados de outro arquivo. O resultado entra pelo coletor do arquivo onde o valor está escrito.
 */

import path from 'node:path';

import type { ParseResult } from '../parsers/collector.ts';

export function linkAcrossFiles(results: readonly ParseResult[]): void {
    const links = results.flatMap((result) => result.styleLinks ? [result.styleLinks] : []);
    const byFile = new Map(links.map((link) => [link.file, link]));
    for (const link of links) {
        for (const request of link.imports) {
            const target = resolveImport(link.file, request.source, byFile);
            target?.emit(request);
        }
    }
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

function resolveImport<T>(from: string, source: string, files: ReadonlyMap<string, T>): T | undefined {
    if (!source.startsWith('.')) {
        return undefined;
    }
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), source));
    // TypeScript em ESM importa `./x.js` e o arquivo é `./x.ts`
    const bases = [base, base.replace(/\.(js|jsx|mjs)$/, '')];
    for (const candidate of bases) {
        for (const extension of EXTENSIONS) {
            const found = files.get(`${candidate}${extension}`);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}
