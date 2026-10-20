// Junta as etapas: encontra os arquivos, lê cada um e manda para o parser da sua extensão.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { scanDirectory } from './scanner.ts';
import type { AnalysisError, Finding } from './types.ts';
import type { ParseResult } from './parsers/css.ts';

export interface AnalysisResult {
    root: string;
    /** Quantos arquivos foram de fato analisados (os de extensões ainda sem parser não contam). */
    filesAnalyzed: number;
    findings: Finding[];
    errors: AnalysisError[];
}

type Parser = (source: string, file: string) => ParseResult;

/**
 * Parser de cada extensão, carregado só quando aparece um arquivo dela:
 * quem roda num projeto sem CSS não paga o tempo de carregar o PostCSS.
 * JSX/TSX e Angular entram aqui nas próximas fases.
 */
const PARSERS: Record<string, () => Promise<Parser>> = {
    '.css': async () => {
        const { parseCss } = await import('./parsers/css.ts');
        return (source, file) => parseCss(source, file, 'css');
    },
    '.scss': async () => {
        const { parseCss } = await import('./parsers/css.ts');
        return (source, file) => parseCss(source, file, 'scss');
    },
};

/** Analisa um diretório e devolve os valores soltos encontrados, em ordem de arquivo e posição. */
export async function analyzeDirectory(dir: string): Promise<AnalysisResult> {
    const scan = await scanDirectory(dir);
    // Ordem estável: o glob não garante ordem, e a saída precisa ser a mesma em toda execução
    const files = scan.files.toSorted();
    const loaded = new Map<string, Parser>();
    const findings: Finding[] = [];
    const errors: AnalysisError[] = [];
    let filesAnalyzed = 0;

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        const load = PARSERS[ext];
        if (!load) {
            continue;
        }
        let parse = loaded.get(ext);
        if (!parse) {
            parse = await load();
            loaded.set(ext, parse);
        }

        const source = await readFile(path.join(scan.root, file), 'utf8');
        // Caminho com `/` em qualquer SO, para o --json ser igual no Windows e no Linux
        const result = parse(source, file.split(path.sep).join('/'));
        findings.push(...result.findings);
        errors.push(...result.errors);
        filesAnalyzed++;
    }

    return { root: scan.root, filesAnalyzed, findings, errors };
}
