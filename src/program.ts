// A CLI: argumentos, saída e exit code. Sem lógica de análise.
import path from 'node:path';
import { styleText } from 'node:util';
import { Command, CommanderError } from 'commander';

import { pathToFileURL } from 'node:url';

import { pkg } from './package-info.ts';
import { analyzeDirectory } from './analyze.ts';
import type { AnalysisResult } from './analyze.ts';
import { bannerText } from './banner.ts';
import { CONFIG_FILE, integerAtLeast, loadConfig } from './config.ts';
import type { GenerationResult } from './generate/generate.ts';

/** Códigos de saída: o CI e os hooks decidem por eles. */
const EXIT = { ok: 0, findings: 1, error: 2 } as const;

const program = new Command();

program
    .name('tokentidy')
    .description(pkg.description)
    .version(pkg.version)
    // Erros do commander (opção desconhecida, argumento faltando) viram exceção em vez de process.exit()
    .exitOverride()
    .addHelpText('beforeAll', bannerText)
    .addHelpText('after', `
Examples:
  $ tokentidy check ./src
  $ tokentidy check ./src --json
  $ tokentidy generate . --dry-run
  $ tokentidy generate . --min-occurrences 3 --extend

Exit codes: 0 ok, 1 hardcoded values found (check) or files with syntax errors, 2 usage error.`);

program
    .command('check')
    .description('List hardcoded visual values in stylesheets (CSS, SCSS, Sass, Less) and inline styles (HTML, JSX, Angular)')
    .argument('<dir>', 'project directory to analyze')
    .option('--json', 'print the result as JSON')
    .action(async (dir: string, options: { json?: boolean }) => {
        const result = await analyzeDirectory(dir);
        const failed = result.findings.length > 0 || result.errors.length > 0;
        process.exitCode = failed ? EXIT.findings : EXIT.ok;

        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        // Um achado por linha, campos separados por tab: fácil de usar com grep/sort/awk
        for (const f of result.findings) {
            console.log(`${display(result, f.file)}:${f.line}:${f.column}\t${f.type}\t${f.property}\t${oneLine(f.value)}`);
        }
        printErrors(result);
    });

program
    .command('generate')
    .description('Turn repeated hardcoded values into design tokens (DTCG JSON + CSS, plus SCSS/Less when the project uses them)')
    .argument('<dir>', 'project directory to analyze')
    .option('--min-occurrences <n>', 'uses needed for a value to become a token (default 2)')
    .option('--out <dir>', 'output folder (default: design-tokens inside the project)')
    .option('--config <file>', `config file (default: ${CONFIG_FILE} in the project)`)
    .option('--extend', 'reuse the project\'s existing tokens and add the new ones')
    .option('--new', 'ignore existing tokens and generate from scratch (overwrites the output folder)')
    .option('--dry-run', 'print the files instead of writing them')
    .option('--json', 'print the result as JSON')
    .action(async (dir: string, options: GenerateOptions) => {
        const result = await analyzeDirectory(dir);
        const { config } = await loadConfig(result.root, options.config);
        if (options.minOccurrences !== undefined) {
            config.minOccurrences = integerAtLeast(options.minOccurrences, 2, '--min-occurrences');
        }
        const outDir = options.out ? path.resolve(options.out) : path.resolve(result.root, config.output);
        const outRelative = path.relative(result.root, outDir).split(path.sep).join('/');
        const insideOut = (file: string) => outRelative !== '' && !outRelative.startsWith('..') && (file === outRelative || file.startsWith(`${outRelative}/`));

        const mode = await chooseMode(result, options);
        const { generateTokens } = await import('./generate/generate.ts');
        const output = await import('./generate/output.ts');
        const existingTree = mode === 'extend' ? await output.readDtcgTree(outDir) : undefined;

        const generation = generateTokens(result.findings, {
            minOccurrences: config.minOccurrences,
            gridBase: config.gridBase,
            semanticTokens: config.semanticTokens,
            mode,
            // A fonte raiz da configuração vale mais que a detectada no CSS
            ...(config.rootFontSize ?? result.rootFontSize?.px ? { rootFontSize: config.rootFontSize ?? result.rootFontSize!.px } : {}),
            // Os tokens da própria pasta de saída entram pelo JSON (mantêm o nome), não como "tokens do projeto"
            definitions: result.definitions.filter((d) => !insideOut(d.file)),
            references: result.references,
            ownTokens: existingTree ? output.ownTokensOf(existingTree) : [],
        });

        const writeOptions = { outDir, mode, styleLanguages: result.styleLanguages, splitThreshold: config.splitThreshold };
        const tree = output.buildDtcgTree(generation, existingTree);
        const files = generation.tokens.length > 0 || existingTree ? output.renderOutput(tree, writeOptions) : [];
        if (!options.dryRun && files.length > 0) {
            await output.writeOutput(files, writeOptions);
        }
        process.exitCode = result.errors.length > 0 ? EXIT.findings : EXIT.ok;

        if (options.json) {
            const { root, filesAnalyzed, errors } = result;
            console.log(JSON.stringify({
                root, filesAnalyzed, mode, config, dryRun: options.dryRun === true,
                files: files.map((f) => f.file), ...generation, errors,
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
        printGenerationSummary(generation, config.minOccurrences);
        printErrors(result);
    });

interface GenerateOptions {
    minOccurrences?: string;
    out?: string;
    config?: string;
    extend?: boolean;
    new?: boolean;
    dryRun?: boolean;
    json?: boolean;
}

/**
 * Com arquivos de tokens no projeto, gerar pede uma decisão: estender o que existe ou começar do zero.
 * Em terminal interativo, pergunta. Fora dele (CI, hook, pipe) nunca espera resposta:
 * exige `--extend` ou `--new`. Sem arquivos de tokens, não há o que decidir.
 */
async function chooseMode(result: AnalysisResult, options: GenerateOptions): Promise<'extend' | 'new'> {
    if (options.extend && options.new) {
        throw new UsageError('--extend and --new cannot be used together');
    }
    if (options.extend || result.tokenFiles.length === 0) {
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
    const list = result.tokenFiles.map((file) => `  ${link(path.join(result.root, file))}`).join('\n');
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

/** Erro de uso: mensagem no stderr e exit code 2. */
class UsageError extends Error {}

/** Caminho clicável: relativo à pasta atual e, em terminal, com link OSC 8 (abre o arquivo com Ctrl+clique). */
function link(file: string): string {
    const shown = displayPath(file);
    if (!process.stderr.isTTY) {
        return shown;
    }
    return `\u001b]8;;${pathToFileURL(file).href}\u001b\\${shown}\u001b]8;;\u001b\\`;
}

function displayPath(file: string): string {
    return path.relative(process.cwd(), file) || '.';
}

/** Resumo no stderr: o stdout fica só com os arquivos, para scripts. */
function printGenerationSummary(generation: GenerationResult, minOccurrences: number): void {
    const { tokens, aliases, reused, belowThreshold, suggestions } = generation;
    const created = tokens.filter((t) => !t.kept).length;
    console.error(`${created} new tokens, ${tokens.length - created} kept, ${aliases.length} semantic aliases`);
    if (reused.length > 0) {
        console.error(`${reused.length} values already have a token in the project:`);
        for (const r of reused) {
            console.error(`  ${r.key}\t${r.definition.name}\t${displayPath(r.definition.file)}:${r.definition.line} (${r.count} ${r.count === 1 ? 'use' : 'uses'})`);
        }
    }
    if (belowThreshold.length > 0) {
        console.error(`${belowThreshold.length} values used fewer than ${minOccurrences} times were not turned into tokens`);
    }
    for (const s of suggestions) {
        console.error(`suggestion\t${s.type}\t${s.message}`);
    }
}

/** Arquivos com erro de sintaxe vão para o stderr, no mesmo formato `arquivo:linha:coluna` dos achados. */
function printErrors(result: AnalysisResult): void {
    for (const e of result.errors) {
        console.error(`${display(result, e.file)}:${e.line}:${e.column}\tsyntax error\t${e.message}`);
    }
}

/** Caminho relativo à pasta atual: o terminal e o editor transformam `arquivo:linha:coluna` em link. */
function display(result: AnalysisResult, file: string): string {
    return path.relative(process.cwd(), path.join(result.root, file));
}

/** Valores que ocupam várias linhas no arquivo (ex.: lista de fontes) viram uma linha só na saída de texto. */
function oneLine(value: string): string {
    return value.replace(/\s+/g, ' ');
}

// Ponto único de saída: erros vão para stderr e definem o exit code
async function main(): Promise<void> {
    // Sem nenhum comando, mostra o banner e a ajuda
    if (process.argv.length <= 2) {
        program.outputHelp();
        return;
    }
    try {
        await program.parseAsync(process.argv);
    } catch (error) {
        if (error instanceof CommanderError) {
            // O commander já imprimiu a mensagem; --help e --version chegam aqui com exitCode 0
            process.exitCode = error.exitCode === 0 ? EXIT.ok : EXIT.error;
            return;
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(styleText('red', `Error: ${message}`, { stream: process.stderr }));
        process.exitCode = EXIT.error;
    }
}

await main();
