// Comando `validate`: confere os arquivos DTCG e os resolvers. Problemas falham o CI (exit 1).
import type { Command } from 'commander';

import { CONFIG_FILE, loadConfig } from '../project/config.ts';
import { findProjectRoot } from '../project/scope.ts';
import { EXIT, JSON_SCHEMA_VERSION } from './errors.ts';
import { displayPath, oneLine, printable } from './print.ts';

interface ValidateCommandOptions {
    config?: string;
    json?: boolean;
}

export function registerValidate(program: Command): void {
    program
        .command('validate')
        .description('Check DTCG token files and resolver files against the 2025.10 schema and the reference rules (broken aliases, cycles, types)')
        .argument('[paths...]', 'files or folders to check (default: current folder)')
        .option('--config <file>', `config file (default: ${CONFIG_FILE} at the project root)`)
        .option('--json', 'print the result as JSON')
        .action(runValidate);
}

async function runValidate(paths: string[], options: ValidateCommandOptions): Promise<void> {
    const given = paths.length > 0 ? paths : ['.'];
    const root = await findProjectRoot(given);
    const { config } = await loadConfig(root, options.config);
    const { discoverTokenFiles, validateTokenFiles } = await import('../validate/validate.ts');
    const files = await discoverTokenFiles(given, { root, ignore: config.ignore });
    const result = await validateTokenFiles(files, root);
    process.exitCode = result.problems.length > 0 ? EXIT.findings : EXIT.ok;

    if (options.json) {
        console.log(JSON.stringify({ schemaVersion: JSON_SCHEMA_VERSION, ...result }, null, 2));
        return;
    }
    if (result.problems.length > 0) {
        process.stdout.write(`${result.problems.map((p) => [displayPath(`${root}/${p.file}`), 'error', p.rule, printable(oneLine(p.path)), printable(oneLine(p.message))].join('\t')).join('\n')}\n`);
    }
    if (result.files.length === 0) {
        console.error('No token files found (*.tokens.json, *.resolver.json)');
        return;
    }
    const count = result.problems.length;
    console.error(`${result.files.length} ${result.files.length === 1 ? 'file' : 'files'} checked; ${count} ${count === 1 ? 'problem' : 'problems'}`);
}
