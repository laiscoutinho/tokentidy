// Comando `fix`: troca valores soltos por tokens com exatamente o mesmo valor.
// Exit code como o `eslint --fix`: diz se o código ficou limpo, não se algo mudou.
import path from 'node:path';
import type { Command } from 'commander';

import { CONFIG_FILE, loadConfig } from '../config.ts';
import type { FixResult } from '../fix/apply.ts';
import { collectFiles, findProjectRoot } from '../scope.ts';
import { EXIT } from './errors.ts';
import { display, displayPath, oneLine, printable, printDiagnostics } from './print.ts';

interface FixCommandOptions {
    config?: string;
    tokens?: string;
    dryRun?: boolean;
    json?: boolean;
}

export function registerFix(program: Command): void {
    program
        .command('fix')
        .description('Replace hardcoded values with tokens that have exactly the same value (project tokens first, then the generated ones)')
        .argument('[paths...]', 'files or folders to fix (default: current folder)')
        .option('--tokens <dir>', 'folder with the generated tokens (default: the output folder in the config, design-tokens)')
        .option('--config <file>', `config file (default: ${CONFIG_FILE} at the project root)`)
        .option('--dry-run', 'print a unified diff instead of writing the files')
        .option('--json', 'print the result as JSON')
        .action(runFix);
}

async function runFix(paths: string[], options: FixCommandOptions): Promise<void> {
    const given = paths.length > 0 ? paths : ['.'];
    const root = await findProjectRoot(given);
    const { config } = await loadConfig(root, options.config);
    const scopeOptions = { ignore: config.ignore, includeMinified: config.includeMinified };
    const scope = await collectFiles(given, root, scopeOptions);
    const tokensDir = options.tokens ? path.resolve(options.tokens) : path.resolve(root, config.output);

    const { fixScope } = await import('../fix/apply.ts');
    const result = await fixScope(scope, { ...scopeOptions, tokensDir, dryRun: options.dryRun === true });
    const { after } = result;
    process.exitCode = after.findings.length > 0 || after.errors.length > 0 ? EXIT.findings : EXIT.ok;

    if (options.json) {
        console.log(JSON.stringify({
            root: result.root,
            dryRun: result.dryRun,
            files: result.files.map(({ file, replacements, diff }) => ({
                file,
                replacements: replacements.map(({ finding, token, source, text }) => ({
                    line: finding.line, column: finding.column, type: finding.type, property: finding.property,
                    value: finding.value, token, source, text,
                })),
                ...(result.dryRun ? { diff } : {}),
            })),
            skippedValues: result.skipped.map(({ finding, reason, message }) => ({
                file: finding.file, line: finding.line, column: finding.column, type: finding.type,
                property: finding.property, value: finding.value, reason, message,
            })),
            withoutToken: result.withoutToken.length,
            remaining: after.findings,
            errors: after.errors,
            warnings: after.warnings,
            skipped: after.skipped,
        }, null, 2));
        return;
    }

    for (const file of result.files) {
        if (result.dryRun) {
            process.stdout.write(printableDiff(file.diff));
        } else {
            console.log(display(result, file.file));
        }
    }
    for (const { finding, reason, message } of result.skipped) {
        console.error(`${display(result, finding.file)}:${finding.line}:${finding.column}\tskipped\t${reason}\t${printable(oneLine(finding.value))}\t${printable(message)}`);
    }
    printDiagnostics(after);
    printFixSummary(result, tokensDir);
}

/**
 * O diff pode ter qualquer texto do arquivo: controles viram `\uXXXX`, menos o tab e o `\r` do fim da linha,
 * que fazem parte do conteúdo (e o `git apply` precisa deles).
 */
function printableDiff(diff: string): string {
    return diff.split('\n').map((line) => {
        const cr = line.endsWith('\r') ? '\r' : '';
        const body = cr ? line.slice(0, -1) : line;
        return body.split('\t').map(printable).join('\t') + cr;
    }).join('\n');
}

function printFixSummary(result: FixResult, tokensDir: string): void {
    const replaced = result.files.reduce((sum, f) => sum + f.replacements.length, 0);
    const remaining = result.after.findings.length;
    if (result.tokens === 0 && result.withoutToken.length > 0) {
        console.error('No tokens found in the project or in the tokens folder; run tokentidy generate first');
    }
    const verb = result.dryRun ? 'would be replaced' : 'replaced';
    const parts = [
        `${replaced} ${replaced === 1 ? 'value' : 'values'} ${verb} in ${result.files.length} ${result.files.length === 1 ? 'file' : 'files'}`,
        `${result.skipped.length} skipped`,
        `${result.withoutToken.length} without a token`,
        `${remaining} ${remaining === 1 ? 'violation remains' : 'violations remain'}`,
    ];
    console.error(parts.join('; '));
    // `var(--x)` de um token gerado só resolve se o `tokens.css` estiver carregado na página
    const generatedVar = result.files.some((f) => f.replacements.some((r) => r.source !== 'project' && r.token.startsWith('--')));
    if (generatedVar) {
        console.error(`Generated tokens are used as var(); make sure the app loads ${displayPath(path.join(tokensDir, 'tokens.css'))} (import it in the global stylesheet or add it to the build)`);
    }
}
