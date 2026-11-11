// Comando `check`: lista os valores soltos. Violações falham o CI (exit 1); revisões só aparecem.
import type { Command } from 'commander';

import path from 'node:path';

import { analyzePaths } from '../analysis/analyze.ts';
import type { AnalysisResult } from '../analysis/analyze.ts';
import { CONFIG_FILE, loadConfig } from '../project/config.ts';
import type { Config } from '../project/config.ts';
import { findProjectRoot } from '../project/scope.ts';
import type { Finding } from '../types.ts';
import { normalizeFinding } from '../values/normalize.ts';
import { EXIT, JSON_SCHEMA_VERSION, UsageError } from './errors.ts';
import { display, oneLine, printable, printCheckSummary, printDiagnostics } from './print.ts';

interface CheckOptions {
    config?: string;
    json?: boolean;
    baseline?: string;
    printBaseline?: boolean;
    summary?: boolean;
    format?: string;
}

/**
 * Raiz do projeto, configuração e análise: o que `check` e `generate` fazem igual.
 * A configuração vem da raiz (ou de `--config`), não da pasta passada: `check src/` usa a do projeto.
 */
export async function analyzeProject(paths: readonly string[], configFile?: string): Promise<{ result: AnalysisResult; config: Config }> {
    const root = await findProjectRoot(paths);
    const { config } = await loadConfig(root, configFile);
    const result = await analyzePaths(paths, { root, ignore: config.ignore, includeMinified: config.includeMinified, ...(config.componentProps ? { componentProps: config.componentProps } : {}) });
    return { result, config };
}

export function registerCheck(program: Command): void {
    program
        .command('check')
        .description('List hardcoded visual values in stylesheets (CSS, SCSS, Sass, Less), HTML, JS/TS styles and CSS-in-JS, and Angular')
        .argument('[paths...]', 'files or folders to analyze (default: current folder)')
        .option('--config <file>', `config file (default: ${CONFIG_FILE} at the project root)`)
        .option('--json', 'print the result as JSON')
        .option('--baseline <file>', 'only report violations that are not in this baseline file')
        .option('--print-baseline', 'print a baseline of the current violations to stdout and exit 0')
        .option('--summary', 'print, per token type, how many values are hardcoded and how many uses go through a token')
        .option('--format <format>', 'output format: text or github (annotations for GitHub Actions)', 'text')
        .action(runCheck);
}

async function runCheck(paths: string[], options: CheckOptions): Promise<void> {
    if (options.baseline !== undefined && options.printBaseline) {
        throw new UsageError('--baseline and --print-baseline cannot be used together');
    }
    if (options.format !== 'text' && options.format !== 'github') {
        throw new UsageError(`Unknown format: ${printable(String(options.format))} (use text or github)`);
    }
    if (options.format === 'github' && (options.json || options.summary || options.printBaseline)) {
        throw new UsageError('--format github cannot be used with --json, --summary or --print-baseline');
    }
    if (options.summary && options.printBaseline) {
        throw new UsageError('--summary and --print-baseline cannot be used together');
    }
    const { result: analysis, config } = await analyzeProject(paths.length > 0 ? paths : ['.'], options.config);

    if (options.printBaseline) {
        const { createBaseline } = await import('../check/baseline.ts');
        console.log(JSON.stringify(createBaseline(analysis.findings), null, 2));
        printDiagnostics(analysis);
        return;
    }

    if (options.summary && analysis.partial) {
        throw new UsageError('--summary describes the whole project; run it without paths');
    }
    // Conta antes do baseline: aceitar a dívida não a faz sumir da medição
    const summary = options.summary ? (await import('../check/summary.ts')).summarize(analysis) : undefined;

    let baselined = 0;
    let scoped = analysis;
    if (options.baseline !== undefined) {
        const { applyBaseline, readBaseline } = await import('../check/baseline.ts');
        const outcome = applyBaseline(analysis.findings, await readBaseline(options.baseline), { partial: analysis.partial });
        baselined = outcome.baselined;
        scoped = { ...analysis, findings: outcome.findings, warnings: [...analysis.warnings, ...outcome.stale] };
    }

    const { enrichCheck } = await import('../check/enrich.ts');
    const result = await enrichCheck(scoped, {
        tokensDir: path.resolve(analysis.root, config.output),
        minOccurrences: config.minOccurrences,
        gridBase: config.gridBase,
    });
    const { analyzeMicroFrontends, detectProjects } = await import('../check/microfrontends.ts');
    const projects = await detectProjects(paths.length > 0 ? paths : ['.'], analysis.root);
    const microFrontends = projects.length >= 2 ? await analyzeMicroFrontends(analysis, projects) : [];
    const collisions = microFrontends.some((issue) => issue.severity === 'violation');
    process.exitCode = result.findings.length > 0 || result.errors.length > 0 || collisions ? EXIT.findings : EXIT.ok;

    if (options.json) {
        // `elements` é insumo interno das guardas, e pode ser enorme
        const { elements: _elements, ...data } = result;
        console.log(JSON.stringify({
            schemaVersion: JSON_SCHEMA_VERSION,
            ...data,
            ...(options.baseline === undefined ? {} : { baselined }),
            ...(summary ? { summary } : {}),
            ...(projects.length >= 2 ? { microFrontends: { projects, issues: microFrontends } } : {}),
        }, null, 2));
        return;
    }

    if (options.format === 'github') {
        const { githubAnnotations } = await import('../check/github.ts');
        // Relativo à pasta atual: no Actions é a raiz do repositório, que pode não ser a do projeto
        const annotations = githubAnnotations({ ...result, microFrontends }, (file) => display(result, file).replaceAll('\\', '/'));
        if (annotations.length > 0) {
            process.stdout.write(`${annotations.join('\n')}\n`);
        }
        printDiagnostics(result);
        printCheckSummary(result, baselined);
        return;
    }

    if (summary) {
        for (const { type, hardcoded, tokenized } of summary) {
            console.log(`${type}\t${hardcoded}\t${tokenized}`);
        }
        printDiagnostics(result);
        return;
    }

    // Um item por linha, campos separados por tab: fácil de usar com grep/sort/awk
    const lines = [
        ...result.findings.map((item) => ({ item, severity: 'violation' })),
        ...result.review.map((item) => ({ item, severity: 'review' })),
        ...result.aliasHints.map((hint) => ({ item: { ...hint, rule: 'token/prefer-alias', value: hint.token, suggestion: { token: hint.alias, match: 'exact' as const } }, severity: 'suggestion' })),
        ...microFrontends.map((item) => ({ item, severity: item.severity as string })),
    ].sort((a, b) => (a.item.file < b.item.file ? -1 : a.item.file > b.item.file ? 1 : 0)
        || a.item.line - b.item.line || a.item.column - b.item.column);
    // Uma escrita só: milhares de `console.log` custam mais que a análise em projeto grande
    if (lines.length > 0) {
        process.stdout.write(`${lines.map(({ item, severity }) => {
            const columns = `${display(result, item.file)}:${item.line}:${item.column}\t${severity}\t${item.rule}\t${printable(item.property)}\t${printable(oneLine(item.value))}`;
            const suggestion = 'suggestion' in item ? (item as Finding).suggestion : undefined;
            if ('detail' in item) {
                return `${columns}\t${printable(item.detail)}`;
            }
            return suggestion ? `${columns}\t${suggestionText(suggestion, 'type' in item && item.type === 'color')}` : columns;
        }).join('\n')}\n`);
    }
    printDiagnostics(result);
    printCheckSummary(result, baselined);
    if (projects.length >= 2) {
        const count = (rule: string) => microFrontends.filter((issue) => issue.rule === rule).length;
        console.error(`${projects.length} micro-frontends: ${count('mfe/root-collision')} global token collisions, ${count('mfe/drift')} role drifts, ${count('mfe/version-mismatch')} design-system version mismatches`);
    }
    if (result.repeatedWithoutToken.length > 0) {
        const values = new Set(result.repeatedWithoutToken.map((f) => `${f.type}\u0000${normalizeFinding(f)}`)).size;
        console.error(`${values} repeated ${values === 1 ? 'value has' : 'values have'} no token yet; run tokentidy generate --extend`);
    }
    if (result.unusedTokens.length > 0) {
        console.error(`${result.unusedTokens.length} custom ${result.unusedTokens.length === 1 ? 'property is' : 'properties are'} never used in the analyzed files (see --json)`);
    }
}

/** `--x`; empate: `--a (or --b)`; próximo: `--spacing-4 (+1px)` ou `--brand (ΔE 0.012)`. */
function suggestionText(suggestion: NonNullable<Finding['suggestion']>, isColor: boolean): string {
    const { token, match, distance = 0, alternatives } = suggestion;
    if (match === 'exact') {
        return printable(alternatives?.length ? `${token} (or ${alternatives.join(', ')})` : token);
    }
    return printable(isColor ? `${token} (ΔE ${distance})` : `${token} (${distance > 0 ? '+' : ''}${distance}px)`);
}
