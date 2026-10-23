// A CLI: monta os comandos (um módulo por comando em `cli/`) e trata os erros. Sem lógica de análise.
import { styleText } from 'node:util';
import { Command, CommanderError } from 'commander';

import { pkg } from './package-info.ts';
import { bannerText } from './banner.ts';
import { registerCheck } from './cli/check.ts';
import { EXIT } from './cli/errors.ts';
import { registerFix } from './cli/fix.ts';
import { registerGenerate } from './cli/generate.ts';
import { printable } from './cli/print.ts';

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
  $ tokentidy check
  $ tokentidy check src/components src/Card.css --json
  $ tokentidy generate --dry-run
  $ tokentidy generate --min-occurrences 3 --extend
  $ tokentidy fix --dry-run
  $ tokentidy fix src/components

Exit codes: 0 ok, 1 hardcoded values found (check) or left after fix, or files with syntax errors, 2 usage error.`);

registerCheck(program);
registerGenerate(program);
registerFix(program);

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
        console.error(styleText('red', `Error: ${printable(message)}`, { stream: process.stderr }));
        process.exitCode = EXIT.error;
    }
}

await main();
