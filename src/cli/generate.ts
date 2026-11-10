// Comando `generate`: transforma valores repetidos em tokens (DTCG + CSS, e SCSS/Less quando o projeto usa).
import path from 'node:path';
import type { Command } from 'commander';

import type { AnalysisResult } from '../analysis/analyze.ts';
import { CONFIG_FILE, integerAtLeast, loadConfig } from '../project/config.ts';
import { assertInsideRoot } from '../safe-write.ts';
import { describe } from '../generate/diagnosis.ts';
import type { GuardedGroup } from '../consolidate/consolidate.ts';
import type { GenerationResult } from '../generate/generate.ts';
import { findProjectRoot, isInside } from '../project/scope.ts';
import { EXIT, JSON_SCHEMA_VERSION, UsageError } from './errors.ts';
import { displayPath, link, oneLine, printable, printDiagnostics } from './print.ts';

interface GenerateOptions {
    minOccurrences?: string;
    out?: string;
    config?: string;
    extend?: boolean;
    shared?: string;
    new?: boolean;
    dryRun?: boolean;
    json?: boolean;
}

export function registerGenerate(program: Command): void {
    program
        .command('generate')
        .description('Turn repeated hardcoded values into design tokens (DTCG JSON + CSS, plus SCSS/Less when the project uses them)')
        .argument('[paths...]', 'files or folders to analyze (default: current folder)')
        .option('--min-occurrences <n>', 'uses needed for a value to become a token (default 2)')
        .option('--out <dir>', 'output folder inside the project (default: design-tokens at the project root)')
        .option('--config <file>', `config file (default: ${CONFIG_FILE} at the project root)`)
        .option('--extend', 'keep the names of tokens generated before and add the new ones')
        .option('--shared <dir>', 'with two or more micro-frontends: values used by 2+ go to this folder, the others to each one')
        .option('--new', 'forget the tokens generated before and name everything again (hand-written tokens are still reused)')
        .option('--dry-run', 'print the files instead of writing them')
        .option('--json', 'print the result as JSON')
        .action(runGenerate);
}

async function runGenerate(paths: string[], options: GenerateOptions): Promise<void> {
    if (options.extend && options.new) {
        throw new UsageError('--extend and --new cannot be used together');
    }
    // Erros de uso antes da análise: em projeto grande, ela leva segundos
    const given = paths.length > 0 ? paths : ['.'];
    const root = await findProjectRoot(given);
    const { config } = await loadConfig(root, options.config);
    if (options.minOccurrences !== undefined) {
        config.minOccurrences = integerAtLeast(options.minOccurrences, 2, '--min-occurrences');
    }
    const outDir = options.out ? path.resolve(options.out) : path.resolve(root, config.output);
    await assertInsideRoot(outDir, root);

    const { generateTokens } = await import('../generate/generate.ts');
    const dtcgTree = await import('../generate/output/dtcg-tree.ts');
    const { renderOutput } = await import('../generate/output/render-files.ts');
    const { moduleLanguages, writeOutput } = await import('../generate/output/write-files.ts');
    const previous = await dtcgTree.readDtcgTree(outDir);
    const mode = previous ? await chooseMode(path.join(outDir, dtcgTree.DTCG_FILE), options) : 'extend';
    const existingTree = mode === 'extend' ? previous : undefined;
    const { analyzePaths } = await import('../analysis/analyze.ts');
    const result = await analyzePaths(given, { root, ignore: config.ignore, includeMinified: config.includeMinified });
    // Os tokens da própria pasta de saída entram pelo JSON (mantêm o nome), não como "tokens do projeto"
    const insideOut = (file: string) => isInside(path.join(result.root, file), outDir);

    if (options.shared !== undefined) {
        const { runGenerateShared } = await import('./generate-shared.ts');
        await runGenerateShared(root, given, result, config, { ...options, shared: options.shared });
        return;
    }

    const { automaticConsolidations } = await import('../consolidate/automatic.ts');
    const { groups: consolidation, consolidations } = await automaticConsolidations(root, result, config);

    const { findThemes, themeTokens } = await import('../generate/themes.ts');
    const themes = config.semanticTokens ? findThemes(result.findings, consolidations) : undefined;

    const generation = generateTokens(result.findings, {
        consolidations,
        ...(themes ? { required: themes.required } : {}),
        minOccurrences: config.minOccurrences,
        gridBase: config.gridBase,
        semanticTokens: config.semanticTokens,
        mode,
        // A fonte raiz da configuração vale mais que a detectada no CSS
        ...(config.rootFontSize ?? result.rootFontSize?.px ? { rootFontSize: config.rootFontSize ?? result.rootFontSize!.px } : {}),
        definitions: result.definitions.filter((d) => !insideOut(d.file)),
        references: result.references,
        ownTokens: existingTree ? dtcgTree.ownTokensOf(existingTree) : [],
    });

    const themed = themeTokens(themes?.candidates ?? [], generation.tokens);
    // O token do tema substitui o alias de mesmo nome: o valor padrão é o mesmo, mas agora ele muda com o modo
    const themedNames = new Set(themed.light.map((alias) => alias.name));
    generation.aliases = [...generation.aliases.filter((alias) => !themedNames.has(alias.name)), ...themed.light];
    const { buildThemeOutput } = await import('../generate/output/theme-files.ts');
    const theme = await buildThemeOutput(outDir, { ...themed, selectors: themes?.selectors ?? [], media: themes?.media === true }, mode === 'extend');

    const writeOptions = { outDir, mode, styleLanguages: result.styleLanguages, splitThreshold: config.splitThreshold, modules: await moduleLanguages(result.findings, outDir), ...(theme ? { theme } : {}) };
    const tree = dtcgTree.buildDtcgTree(generation, existingTree);
    const files = generation.tokens.length > 0 || existingTree ? renderOutput(tree, writeOptions) : [];
    if (!options.dryRun && files.length > 0) {
        await writeOutput(files, writeOptions);
    }
    process.exitCode = result.errors.length > 0 ? EXIT.findings : EXIT.ok;

    if (options.json) {
        const { root, filesAnalyzed, errors, warnings, skipped } = result;
        console.log(JSON.stringify({
            schemaVersion: JSON_SCHEMA_VERSION, root, filesAnalyzed, mode, config, dryRun: options.dryRun === true,
            files: files.map((f) => f.file), ...generation,
            themes: themed.dark.map((alias, i) => ({ path: alias.path, light: themed.light[i]!.target, dark: alias.target })),
            consolidated: consolidation.map(({ id, type, label, to, from, changes, blocked, kept }) => ({
                id, type, label, to, from: from.map((value) => ({ key: value.key, count: value.findings.length })), applied: changes.length,
                blocked: blocked.map(({ finding, guard, reason }) => ({ file: finding.file, line: finding.line, value: finding.value, guard, reason })), kept,
            })),
            errors, warnings, skipped,
        }, null, 2));
        return;
    }

    for (const file of files) {
        if (options.dryRun) {
            // Mesmo formato do `head` com vários arquivos: cabeçalho e conteúdo
            console.log(`==> ${displayPath(file.file)} <==\n${file.content}`);
        } else {
            console.log(displayPath(file.file));
        }
    }
    printConsolidation(consolidation);
    printGenerationSummary(result, generation, config.minOccurrences);
    printDiagnostics(result);
}

/**
 * Com tokens gerados antes na pasta de saída, gerar pede uma decisão: manter os nomes ou começar do zero.
 * Tokens escritos à mão no projeto não entram na pergunta: são reutilizados nos dois modos.
 * Em terminal interativo, pergunta. Fora dele (CI, hook, pipe) nunca espera resposta: exige `--extend` ou `--new`.
 */
async function chooseMode(dtcgFile: string, options: GenerateOptions): Promise<'extend' | 'new'> {
    if (options.extend) {
        return 'extend';
    }
    if (options.new) {
        return 'new';
    }
    if (options.dryRun) {
        // Nada é escrito: estender é a leitura sem efeito colateral
        console.error('Existing token files found; showing --extend (use --new to preview starting over)');
        return 'extend';
    }
    const list = `  ${link(dtcgFile)}`;
    if (!process.stdin.isTTY || !process.stderr.isTTY || options.json) {
        throw new UsageError(`Existing token files found:\n${list}\nUse --extend to reuse them or --new to start over.`);
    }
    const { createInterface } = await import('node:readline/promises');
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
        for (;;) {
            const answer = (await prompt.question(`Existing token files found:\n${list}\nExtend them (e) or start over (n)? [e/n] `)).trim().toLowerCase();
            if (answer === 'e' || answer === 'extend') {
                return 'extend';
            }
            if (answer === 'n' || answer === 'new') {
                return 'new';
            }
        }
    } finally {
        prompt.close();
    }
}

function printConsolidation(groups: readonly GuardedGroup[]): void {
    for (const group of groups) {
        if (group.changes.length > 0) {
            const absorbed = group.from.map((value) => `${printable(value.key)} ×${value.findings.length}`).join(', ');
            console.error(`consolidated\t${group.type}\t${printable(group.label)}: ${absorbed} → ${printable(group.to)}`);
        }
        for (const { finding, reason } of group.blocked) {
            console.error(`blocked\t${group.type}\t${printable(finding.file)}:${finding.line}\t${printable(finding.value)}\t${printable(reason)}`);
        }
    }
}

/** Resumo no stderr: o stdout fica só com os arquivos, para scripts. */
function printGenerationSummary(result: AnalysisResult, generation: GenerationResult, minOccurrences: number): void {
    const { tokens, aliases, reused, belowThreshold, suggestions, diagnosis } = generation;
    const created = tokens.filter((t) => !t.kept).length;
    console.error(`${created} new ${created === 1 ? 'token' : 'tokens'}, ${tokens.length - created} kept, ${aliases.length} semantic ${aliases.length === 1 ? 'alias' : 'aliases'}`);
    if (reused.length > 0) {
        console.error(`${reused.length} values already have a token in the project:`);
        for (const r of reused) {
            const where = displayPath(path.join(result.root, r.definition.file));
            console.error(`  ${printable(r.key)}\t${printable(r.definition.name)}\t${where}:${r.definition.line} (${r.count} ${r.count === 1 ? 'use' : 'uses'})`);
        }
    }
    // Os aliases dão nome de papel ao primitivo (`color.text.danger` → `color.red.600`) e são o que o `fix` escreve ali
    if (aliases.length > 0) {
        console.error(`${aliases.length} semantic ${aliases.length === 1 ? 'alias names' : 'aliases name'} the role of a value:`);
        for (const alias of aliases) {
            console.error(`  ${printable(alias.path.join('.'))} -> ${printable(alias.target.join('.'))}\t(${alias.count} ${alias.count === 1 ? 'use' : 'uses'})`);
        }
    }
    // Listados um a um: um valor usado uma vez não virou token por decisão (minOccurrences), não por ter passado despercebido
    if (belowThreshold.length > 0) {
        console.error(`${belowThreshold.length} ${belowThreshold.length === 1 ? 'value' : 'values'} used fewer than ${minOccurrences} times ${belowThreshold.length === 1 ? 'was' : 'were'} not turned into tokens:`);
        for (const value of belowThreshold) {
            const first = value.occurrences[0]!;
            console.error(`  ${value.type}\t${printable(oneLine(value.key))}\t${displayPath(path.join(result.root, first.file))}:${first.line}:${first.column} (${value.count} ${value.count === 1 ? 'use' : 'uses'})`);
        }
    }
    for (const d of diagnosis) {
        console.error(`diagnosis\t${d.type}\t${describe(d)}`);
    }
    for (const s of suggestions) {
        console.error(`suggestion\t${s.type}\t${printable(s.message)}`);
    }
}
