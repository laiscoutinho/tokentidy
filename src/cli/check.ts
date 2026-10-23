// Comando `check`: lista os valores soltos. Violações falham o CI (exit 1); revisões só aparecem.
import type { Command } from 'commander';

import { analyzePaths } from '../analysis/analyze.ts';
import type { AnalysisResult } from '../analysis/analyze.ts';
import { CONFIG_FILE, loadConfig } from '../project/config.ts';
import type { Config } from '../project/config.ts';
import { findProjectRoot } from '../project/scope.ts';
import { EXIT } from './errors.ts';
import { display, oneLine, printable, printCheckSummary, printDiagnostics } from './print.ts';

/**
 * Raiz do projeto, configuração e análise: o que `check` e `generate` fazem igual.
 * A configuração vem da raiz (ou de `--config`), não da pasta passada: `check src/` usa a do projeto.
 */
export async function analyzeProject(paths: readonly string[], configFile?: string): Promise<{ result: AnalysisResult; config: Config }> {
    const root = await findProjectRoot(paths);
    const { config } = await loadConfig(root, configFile);
    const result = await analyzePaths(paths, { root, ignore: config.ignore, includeMinified: config.includeMinified });
    return { result, config };
}

export function registerCheck(program: Command): void {
    program
        .command('check')
        .description('List hardcoded visual values in stylesheets (CSS, SCSS, Sass, Less) and inline styles (HTML, JSX, Angular)')
        .argument('[paths...]', 'files or folders to analyze (default: current folder)')
        .option('--config <file>', `config file (default: ${CONFIG_FILE} at the project root)`)
        .option('--json', 'print the result as JSON')
        .action(async (paths: string[], options: { config?: string; json?: boolean }) => {
            const { result } = await analyzeProject(paths.length > 0 ? paths : ['.'], options.config);
            const failed = result.findings.length > 0 || result.errors.length > 0;
            process.exitCode = failed ? EXIT.findings : EXIT.ok;

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            // Um item por linha, campos separados por tab: fácil de usar com grep/sort/awk
            const lines = [
                ...result.findings.map((item) => ({ item, severity: 'violation' })),
                ...result.review.map((item) => ({ item, severity: 'review' })),
            ].sort((a, b) => (a.item.file < b.item.file ? -1 : a.item.file > b.item.file ? 1 : 0)
                || a.item.line - b.item.line || a.item.column - b.item.column);
            for (const { item, severity } of lines) {
                console.log(`${display(result, item.file)}:${item.line}:${item.column}\t${severity}\t${item.rule}\t${printable(item.property)}\t${printable(oneLine(item.value))}`);
            }
            printDiagnostics(result);
            printCheckSummary(result);
        });
}
