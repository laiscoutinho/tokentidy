/**
 * Comando `fix`: troca valores soltos por tokens com exatamente o mesmo valor.
 * Exit code como o `eslint --fix`: diz se o código ficou limpo, não se algo mudou.
 */
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';

import { CONFIG_FILE, loadConfig } from '../project/config.ts';
import type { FixResult } from '../fix/apply.ts';
import { collectFiles, findProjectRoot } from '../project/scope.ts';
import { normalizeFinding } from '../values/normalize.ts';
import type { Finding } from '../types.ts';
import { createPrompt, groupLines } from './approximate.ts';
import { EXIT, JSON_SCHEMA_VERSION, UsageError } from './errors.ts';
import { display, displayPath, oneLine, printable, printDiagnostics } from './print.ts';

interface FixCommandOptions {
    config?: string;
    tokens?: string;
    dryRun?: boolean;
    json?: boolean;
    approximate?: boolean;
    yes?: boolean;
    /** `--no-input` do commander: `false` quando a flag é passada. */
    input?: boolean;
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
        .option('--approximate', 'also replace values close to a token, when the coherence guards allow it')
        .option('--yes', 'with --approximate: apply every change that passes the guards, without asking')
        .option('--no-input', 'with --approximate: never ask; only list the changes')
        .action(runFix);
}

async function runFix(paths: string[], options: FixCommandOptions): Promise<void> {
    const noInput = options.input === false;
    if ((options.yes || noInput) && !options.approximate) {
        throw new UsageError('--yes and --no-input only apply to --approximate');
    }
    if (options.yes && noInput) {
        throw new UsageError('--yes and --no-input cannot be used together');
    }
    const interactive = process.stdin.isTTY && process.stderr.isTTY && !options.json;
    if (options.approximate && !options.yes && !noInput && !interactive) {
        throw new UsageError('fix --approximate needs an answer and this is not a terminal: use --yes to apply what passes the guards or --no-input to only list it');
    }
    const given = paths.length > 0 ? paths : ['.'];
    // Uma pasta pedida pelo nome e ausente é erro de digitação, não "projeto sem tokens"
    if (options.tokens && !(await stat(path.resolve(options.tokens)).catch(() => undefined))?.isDirectory()) {
        throw new UsageError(`Tokens folder not found: ${options.tokens}`);
    }
    // A raiz contém também a pasta de tokens: num monorepo, `fix apps/checkout --tokens packages/tokens` sobe até a raiz comum
    const root = await findProjectRoot(options.tokens ? [...given, options.tokens] : given);
    const { config } = await loadConfig(root, options.config);
    const scopeOptions = { ignore: config.ignore, includeMinified: config.includeMinified };
    const scope = await collectFiles(given, root, scopeOptions);
    const tokensDir = options.tokens ? path.resolve(options.tokens) : path.resolve(root, config.output);

    const { fixScope } = await import('../fix/apply.ts');
    const where = (finding: Finding) => `${displayPath(path.join(root, finding.file))}:${finding.line}:${finding.column}`;
    const prompt = options.approximate && !options.yes && !noInput ? await createPrompt(where) : undefined;
    let result: FixResult;
    try {
        result = await fixScope(scope, {
            ...scopeOptions, tokensDir, dryRun: options.dryRun === true, minOccurrences: config.minOccurrences,
            ...(options.approximate ? {
                approximate: {
                    mode: options.yes ? 'yes' as const : noInput ? 'list' as const : 'ask' as const,
                    gridBase: config.gridBase, colorTolerance: config.colorTolerance,
                    ...(config.rootFontSize ? { rootFontSize: config.rootFontSize } : {}),
                    ...(prompt ? { decide: prompt.decide } : {}),
                },
            } : {}),
        });
    } finally {
        prompt?.close();
    }
    const { after } = result;
    process.exitCode = after.findings.length > 0 || after.errors.length > 0 ? EXIT.findings : EXIT.ok;

    if (options.json) {
        console.log(JSON.stringify({
            schemaVersion: JSON_SCHEMA_VERSION,
            root: result.root,
            dryRun: result.dryRun,
            files: result.files.map(({ file, replacements, diff }) => ({
                file,
                replacements: replacements.map(({ finding, token, source, text, reason, definedAt, alternatives }) => ({
                    line: finding.line, column: finding.column, type: finding.type, property: finding.property,
                    value: finding.value, token, source, text, reason,
                    ...(definedAt ? { definedAt } : {}),
                    ...(alternatives ? { alternatives } : {}),
                })),
                ...(result.dryRun ? { diff } : {}),
            })),
            skippedValues: result.skipped.map(({ finding, reason, message, alternatives }) => ({
                file: finding.file, line: finding.line, column: finding.column, type: finding.type,
                property: finding.property, value: finding.value, reason, message,
                ...(alternatives ? { alternatives } : {}),
            })),
            ...(result.approximate ? {
                approximate: result.approximate.map(({ id, type, label, to, token, status, from, changes, blocked, kept }) => ({
                    id, type, label, to, token, status, from: from.map((value) => ({ key: value.key, count: value.findings.length })), changes: changes.length,
                    blocked: blocked.map(({ finding, guard, reason }) => ({ file: finding.file, line: finding.line, value: finding.value, guard, reason })), kept,
                })),
            } : {}),
            withoutToken: result.withoutToken.length,
            repeatedWithoutToken: result.repeatedWithoutToken.map((finding) => ({
                file: finding.file, line: finding.line, column: finding.column, type: finding.type,
                property: finding.property, value: finding.value,
            })),
            remaining: after.findings,
            errors: after.errors,
            warnings: after.warnings,
            skipped: after.skipped,
        }, null, 2));
        return;
    }

    for (const group of result.approximate ?? []) {
        // Listar é a saída do `--no-input`; nos outros modos o bloco já apareceu ou só interessa o bloqueado
        if (noInput || group.status === 'blocked') {
            (noInput ? console.log : console.error)(groupLines(group, where).join('\n'));
        }
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
    if (result.tokens > 0 && result.repeatedWithoutToken.length > 0) {
        const values = new Set(result.repeatedWithoutToken.map((f) => `${f.type}\u0000${normalizeFinding(f)}`)).size;
        // Com `--approximate` já ligado, sugerir a mesma opção seria ruído
        const approximate = result.approximate ? '' : ', or fix --approximate for values close to a token';
        console.error(`${values} repeated ${values === 1 ? 'value has' : 'values have'} no token yet; run tokentidy generate --extend${approximate}`);
    }
    // `var(--x)` de um token gerado só resolve se o `tokens.css` estiver carregado na página
    const generatedVar = result.files.some((f) => f.replacements.some((r) => r.source !== 'project' && r.token.startsWith('--')));
    if (generatedVar) {
        console.error(`Generated tokens are used as var(); make sure the app loads ${displayPath(path.join(tokensDir, 'tokens.css'))} (import it in the global stylesheet or add it to the build)`);
    }
}
