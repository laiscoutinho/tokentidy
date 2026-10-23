// Comando `generate`: transforma valores repetidos em tokens (DTCG + CSS, e SCSS/Less quando o projeto usa).
import path from 'node:path';
import type { Command } from 'commander';

import type { AnalysisResult } from '../analysis/analyze.ts';
import { CONFIG_FILE, integerAtLeast } from '../project/config.ts';
import { assertInsideRoot } from '../safe-write.ts';
import { describe } from '../generate/diagnosis.ts';
import type { GenerationResult } from '../generate/generate.ts';
import { isInside } from '../project/scope.ts';
import { analyzeProject } from './check.ts';
import { EXIT, UsageError } from './errors.ts';
import { displayPath, link, printable, printDiagnostics } from './print.ts';

interface GenerateOptions {
    minOccurrences?: string;
    out?: string;
    config?: string;
    extend?: boolean;
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
        .option('--new', 'forget the tokens generated before and name everything again (hand-written tokens are still reused)')
        .option('--dry-run', 'print the files instead of writing them')
        .option('--json', 'print the result as JSON')
        .action(runGenerate);
}

async function runGenerate(paths: string[], options: GenerateOptions): Promise<void> {
    if (options.extend && options.new) {
        throw new UsageError('--extend and --new cannot be used together');
    }
    const { result, config } = await analyzeProject(paths.length > 0 ? paths : ['.'], options.config);
    if (options.minOccurrences !== undefined) {
        config.minOccurrences = integerAtLeast(options.minOccurrences, 2, '--min-occurrences');
    }
    const outDir = options.out ? path.resolve(options.out) : path.resolve(result.root, config.output);
    await assertInsideRoot(outDir, result.root);

    const { generateTokens } = await import('../generate/generate.ts');
    const dtcgTree = await import('../generate/output/dtcg-tree.ts');
    const { renderOutput } = await import('../generate/output/render-files.ts');
    const { writeOutput } = await import('../generate/output/write-files.ts');
    const previous = await dtcgTree.readDtcgTree(outDir);
    const mode = previous ? await chooseMode(path.join(outDir, dtcgTree.DTCG_FILE), options) : 'extend';
    const existingTree = mode === 'extend' ? previous : undefined;
    // Os tokens da própria pasta de saída entram pelo JSON (mantêm o nome), não como "tokens do projeto"
    const insideOut = (file: string) => isInside(path.join(result.root, file), outDir);

    const generation = generateTokens(result.findings, {
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

    const writeOptions = { outDir, mode, styleLanguages: result.styleLanguages, splitThreshold: config.splitThreshold };
    const tree = dtcgTree.buildDtcgTree(generation, existingTree);
    const files = generation.tokens.length > 0 || existingTree ? renderOutput(tree, writeOptions) : [];
    if (!options.dryRun && files.length > 0) {
        await writeOutput(files, writeOptions);
    }
    process.exitCode = result.errors.length > 0 ? EXIT.findings : EXIT.ok;

    if (options.json) {
        const { root, filesAnalyzed, errors, warnings, skipped } = result;
        console.log(JSON.stringify({
            root, filesAnalyzed, mode, config, dryRun: options.dryRun === true,
            files: files.map((f) => f.file), ...generation, errors, warnings, skipped,
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

/** Resumo no stderr: o stdout fica só com os arquivos, para scripts. */
function printGenerationSummary(result: AnalysisResult, generation: GenerationResult, minOccurrences: number): void {
    const { tokens, aliases, reused, belowThreshold, suggestions, diagnosis } = generation;
    const created = tokens.filter((t) => !t.kept).length;
    console.error(`${created} new tokens, ${tokens.length - created} kept, ${aliases.length} semantic aliases`);
    if (reused.length > 0) {
        console.error(`${reused.length} values already have a token in the project:`);
        for (const r of reused) {
            const where = displayPath(path.join(result.root, r.definition.file));
            console.error(`  ${printable(r.key)}\t${printable(r.definition.name)}\t${where}:${r.definition.line} (${r.count} ${r.count === 1 ? 'use' : 'uses'})`);
        }
    }
    if (belowThreshold.length > 0) {
        console.error(`${belowThreshold.length} values used fewer than ${minOccurrences} times were not turned into tokens`);
    }
    for (const d of diagnosis) {
        console.error(`diagnosis\t${d.type}\t${describe(d)}`);
    }
    for (const s of suggestions) {
        console.error(`suggestion\t${s.type}\t${printable(s.message)}`);
    }
}
