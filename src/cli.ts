#!/usr/bin/env node

import { styleText } from 'node:util';
import { Command } from 'commander';

import { pkg } from './package-info.ts';
import { scanDirectory } from './scanner.ts';
import { bannerText } from './banner.ts';

const program = new Command();

program
    .name('tokentidy')
    .description(pkg.description)
    .version(pkg.version)
    .addHelpText('beforeAll', bannerText)
    .addHelpText('after', `
Exemplos:
  $ tokentidy check ./src
  $ tokentidy check ./src --json`);

program
    .command('check')
    .description('Varre um diretório e conta os arquivos que podem ser analisados')
    .argument('<dir>', 'diretório do projeto a ser analisado')
    .option('--json', 'imprime o resultado em JSON')
    .action(async (dir: string, options: { json?: boolean }) => {
        const result = await scanDirectory(dir);

        if (options.json) {
            console.log(JSON.stringify({ root: result.root, total: result.total, byExtension: result.byExtension }, null, 2));
            return;
        }

        // Uma linha por extensão, sem enfeites: fácil de ler e de usar com grep/sort/awk
        for (const [ext, count] of Object.entries(result.byExtension)) {
            console.log(`${ext}\t${count}`);
        }
        console.log(`total\t${result.total}`);
    });

// Sem nenhum comando, mostra o banner e a ajuda
if (process.argv.length <= 2) {
    program.help();
}

// Ponto único de saída: erros vão para stderr e definem o exit code
program.parseAsync(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(styleText('red', `Erro: ${message}`, { stream: process.stderr }));
    process.exitCode = 1;
});
