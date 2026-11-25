// Comando `generate`: transforma valores repetidos em tokens. Sempre CSS; DTCG, SCSS, Less e módulo JS/TS sob pedido.
import path from 'node:path';
import type { Command } from 'commander';

import { CONFIG_FILE, analysisOptions, integerAtLeast, loadConfig } from '../project/config.ts';
import { assertInsideRoot } from '../safe-write.ts';
import type { GenerationResult } from '../generate/generate.ts';
import { findProjectRoot, isInside } from '../project/scope.ts';
import { EXIT, JSON_SCHEMA_VERSION, UsageError } from './errors.ts';
import { count, paint } from './human.ts';
import { displayPath, link, printHumanDiagnostics } from './print.ts';

interface GenerateOptions {
    minOccurrences?: string;
    out?: string;
    config?: string;
    extend?: boolean;
    shared?: string;
    new?: boolean;
    dryRun?: boolean;
    json?: boolean;
    dtcg?: boolean;
    scss?: boolean;
    less?: boolean;
    ts?: boolean;
    js?: boolean;
}

export function registerGenerate(program: Command): void {
    program
        .command('generate')
        .description('Turn repeated hardcoded values into design tokens, written as CSS custom properties in tokens.css')
        .argument('[paths...]', 'files or folders to analyze (default: current folder)')
        .option('--min-occurrences <n>', 'uses needed for a value to become a token (default 3)')
        .option('--out <dir>', 'output folder inside the project (default: design-tokens at the project root)')
        .option('--config <file>', `config file (default: ${CONFIG_FILE} at the project root)`)
        .option('--extend', 'keep the names of tokens generated before and add the new ones')
        .option('--shared <dir>', 'with two or more micro-frontends: values used by 2+ go to this folder, the others to each one')
        .option('--new', 'forget the tokens generated before and name everything again (hand-written tokens are still reused)')
        .option('--dtcg', 'also write tokens.tokens.json (W3C Design Tokens format, for Style Dictionary, Tokens Studio, Figma)')
        .option('--scss', 'also write _tokens.scss with Sass variables')
        .option('--less', 'also write _tokens.less with Less variables')
        .option('--ts', 'also write tokens.ts, for values read by TypeScript (canvas, charts)')
        .option('--js', 'also write tokens.js, for values read by JavaScript (canvas, charts)')
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
    const { chosenFormats, writeOutput } = await import('../generate/output/write-files.ts');
    const { readTokenState } = await import('../generate/output/css-state.ts');
    const previous = await readTokenState(outDir);
    const mode = previous ? await chooseMode(outDir, options) : 'extend';
    const existingTree = mode === 'extend' ? previous?.tree : undefined;
    const { analyzePaths } = await import('../analysis/analyze.ts');
    const result = await analyzePaths(given, { root, ...analysisOptions(config) });
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
    const theme = await buildThemeOutput(outDir, { ...themed, selectors: themes?.selectors ?? [], media: themes?.media === true }, mode === 'extend', previous?.dark);

    const { formats, modules } = await chosenFormats(outDir, options);
    const writeOptions = { outDir, mode, formats, modules, splitThreshold: config.splitThreshold, ...(theme ? { theme } : {}) };
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

    if (options.dryRun) {
        for (const file of files) {
            // Mesmo formato do `head` com vários arquivos: cabeçalho e conteúdo
            console.log(`==> ${displayPath(file.file)} <==\n${file.content}`);
        }
    } else if (!process.stdout.isTTY) {
        // Em pipe, os arquivos escritos são o dado; no terminal, a frase abaixo basta
        for (const file of files) {
            console.log(displayPath(file.file));
        }
    }
    printHumanDiagnostics(result);
    printGenerationSummary(outDir, files, generation, config.minOccurrences, options.dryRun === true);
}

/** Uma frase: quantos tokens, onde estão e o próximo passo. O conteúdo está nos arquivos. */
function printGenerationSummary(outDir: string, written: readonly { file: string; content: string }[], generation: GenerationResult, minOccurrences: number, dryRun: boolean): void {
    // O total é o que está no CSS: inclui os tokens que a pessoa escreveu ali à mão
    const declared = new Set(written.filter((f) => f.file.endsWith('.css')).flatMap((f) => [...f.content.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1])));
    const total = Math.max(declared.size, generation.tokens.length + generation.aliases.length);
    const files = written.map((f) => f.file);
    // Valor que já tem token declarado não vira token novo: o `fix` troca pelo que existe
    const reused = generation.reused.length > 0 ? `${count(generation.reused.length, 'value')} already ${generation.reused.length === 1 ? 'has a token, so no new one was made for it' : 'have a token, so no new one was made for them'}.` : undefined;
    if (files.length === 0) {
        console.error(`No value is used ${minOccurrences} or more times without a token, so no token was created.`);
        if (reused) {
            console.error(`  ${reused}`);
        }
        return;
    }
    const created = generation.tokens.filter((t) => !t.kept).length;
    const names = files.map((file) => path.relative(outDir, file).split(path.sep).join('/')).filter((name) => !name.startsWith(`css/`) && name !== 'README.md');
    const folder = `${displayPath(outDir)}/`;
    const what = `${count(total, 'token')}${created < generation.tokens.length ? ` (${created} new)` : ''}`;
    console.error(paint('green', dryRun ? `Would write ${what} to ${folder} (${names.join(', ')}).` : `✔ ${what} saved in ${link(outDir, folder)} (${names.join(', ')}).`));
    if (reused) {
        console.error(`  ${reused}`);
    }
    if (!dryRun) {
        console.error(`  Next: run ${paint('cyan', 'tokentidy fix')} to use them in your code.`);
    }
}

/**
 * Com tokens gerados antes na pasta de saída, gerar pede uma decisão: manter os nomes ou começar do zero.
 * Tokens escritos à mão no projeto não entram na pergunta: são reutilizados nos dois modos.
 * Em terminal interativo, pergunta. Fora dele (CI, hook, pipe) nunca espera resposta: exige `--extend` ou `--new`.
 */
async function chooseMode(outDir: string, options: GenerateOptions): Promise<'extend' | 'new'> {
    if (options.extend) {
        return 'extend';
    }
    if (options.new) {
        return 'new';
    }
    if (options.dryRun) {
        // Nada é escrito: estender é a leitura sem efeito colateral
        console.error('Tokens generated before were found; showing --extend (use --new to preview starting over)');
        return 'extend';
    }
    const list = `  ${link(outDir)}`;
    if (!process.stdin.isTTY || !process.stderr.isTTY || options.json) {
        throw new UsageError(`Tokens generated before were found in:\n${list}\nUse --extend to keep their names and add the new ones, or --new to start over.`);
    }
    const { createInterface } = await import('node:readline/promises');
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
        for (;;) {
            const answer = (await prompt.question(`Tokens generated before were found in:\n${list}\nKeep their names and add the new ones (e), or start over (n)? [e/n] `)).trim().toLowerCase();
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
