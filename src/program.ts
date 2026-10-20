// A CLI: argumentos, saída e exit code. Sem lógica de análise.
import path from 'node:path';
import { styleText } from 'node:util';
import { Command, CommanderError } from 'commander';

import { pkg } from './package-info.ts';
import { analyzeDirectory } from './analyze.ts';
import { bannerText } from './banner.ts';

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

Exit codes: 0 no hardcoded values, 1 hardcoded values or files with syntax errors, 2 usage error.`);

program
    .command('check')
    .description('List hardcoded visual values (colors, spacing, typography) in CSS and SCSS files')
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

        // Caminho relativo à pasta atual: o terminal e o editor transformam `arquivo:linha:coluna` em link
        const display = (file: string) => path.relative(process.cwd(), path.join(result.root, file));

        // Um achado por linha, campos separados por tab: fácil de usar com grep/sort/awk
        for (const f of result.findings) {
            console.log(`${display(f.file)}:${f.line}:${f.column}\t${f.kind}\t${f.property}\t${oneLine(f.value)}`);
        }
        for (const e of result.errors) {
            console.error(`${display(e.file)}:${e.line}:${e.column}\tsyntax error\t${e.message}`);
        }
    });

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
