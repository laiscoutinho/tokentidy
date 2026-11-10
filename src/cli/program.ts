// A CLI: monta os comandos (um módulo por comando em `cli/`) e trata os erros. Sem lógica de análise.
import { styleText } from 'node:util';
import { Command, CommanderError } from 'commander';

import { pkg } from './package-info.ts';
import { bannerText } from './banner.ts';
import { registerCheck } from './check.ts';
import { EXIT } from './errors.ts';
import { registerFix } from './fix.ts';
import { registerGenerate } from './generate.ts';
import { printable } from './print.ts';
import { registerValidate } from './validate.ts';

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
  $ tokentidy fix --approximate --no-input
  $ tokentidy generate --shared packages/tokens
  $ tokentidy validate design-tokens

Exit codes: 0 ok, 1 hardcoded values found (check), left after fix, global token collisions between micro-frontends (check), invalid token files (validate), or files with syntax errors, 2 usage error.`);

registerCheck(program);
registerGenerate(program);
registerFix(program);
registerValidate(program);

// Ponto único de saída: erros vão para stderr e definem o exit code
async function main(): Promise<void> {
    // `tokentidy --help | head -1`: quem lê fechou o pipe; não é erro nosso, e o exit code continua valendo
    process.stdout.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EPIPE') {
            throw error;
        }
    });
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
        // Linha a linha: a mensagem pode ter mais de uma, e `printable` escaparia a quebra
        console.error(styleText('red', `Error: ${message.split('\n').map(printable).join('\n')}`, { stream: process.stderr }));
        process.exitCode = EXIT.error;
    }
}

await main();
