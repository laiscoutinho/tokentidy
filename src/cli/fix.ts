/**
 * Comando `fix`: troca valores soltos por tokens com exatamente o mesmo valor.
 * Exit code como o `eslint --fix`: diz se o código ficou limpo, não se algo mudou.
 */
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';

import { CONFIG_FILE, analysisOptions, loadConfig } from '../project/config.ts';
import type { FixResult } from '../fix/apply.ts';
import { collectFiles, findProjectRoot } from '../project/scope.ts';
import { normalizeFinding } from '../values/normalize.ts';
import type { Finding } from '../types.ts';
import { createPrompt, groupLines } from './approximate.ts';
import { EXIT, JSON_SCHEMA_VERSION, UsageError } from './errors.ts';
import { count, paint, table, terminalWidth } from './human.ts';
import { display, displayPath, oneLine, printable, printHumanDiagnostics } from './print.ts';

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
    const scopeOptions = analysisOptions(config);
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
                replacements: replacements.map(({ finding, token, source, text, reason, definedAt, alternatives, uncompiledFrom }) => ({
                    line: finding.line, column: finding.column, type: finding.type, property: finding.property,
                    value: finding.value, token, source, text, reason,
                    ...(definedAt ? { definedAt } : {}),
                    ...(alternatives ? { alternatives } : {}),
                    ...(uncompiledFrom ? { uncompiledFrom } : {}),
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
            belowThreshold: result.belowThreshold.map((finding) => ({
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
        } else if (!process.stdout.isTTY) {
            // Em pipe, os arquivos alterados são o dado; no terminal, o resumo basta
            console.log(display(result, file.file));
        }
    }
    printHumanDiagnostics(after);
    printNotChanged(result);
    printFixSummary(result, tokensDir);
}

/** O que ficou como estava e por quê: os valores com token que não foram trocados, depois os sem token. */
function printNotChanged(result: FixResult): void {
    const lines: string[] = [];
    if (result.skipped.length > 0) {
        lines.push(`Not changed (${result.skipped.length}):`);
        lines.push(...table(['Where', 'Value', 'Why'], result.skipped.map(({ finding, message }) => [
            `${display(result, finding.file)}:${finding.line}:${finding.column}`, printable(oneLine(finding.value)), printable(message),
        ]), { max: [40, 24], stream: process.stderr, width: terminalWidth(process.stderr) }));
    }
    const without = new Set(result.withoutToken.map((f) => `${f.type}\u0000${normalizeFinding(f)}`)).size;
    if (without > 0) {
        lines.push(`${lines.length > 0 ? '\n' : ''}${count(without, 'value has', 'values have')} no token with the same value, so ${without === 1 ? 'it stays' : 'they stay'} as written.`);
        const repeated = new Set(result.repeatedWithoutToken.map((f) => `${f.type}\u0000${normalizeFinding(f)}`)).size;
        if (result.tokens > 0 && repeated > 0) {
            lines.push(`${repeated === without ? (without === 1 ? 'It repeats' : 'They repeat') : `${repeated} of them repeat`} in the code: run ${paint('cyan', 'tokentidy generate')} to create tokens for ${repeated === 1 ? 'it' : 'them'}.`);
        }
        if (result.tokens > 0 && !result.approximate) {
            lines.push(`To also replace values close to a token, run ${paint('cyan', 'tokentidy fix --approximate')}.`);
        }
    }
    if (lines.length > 0) {
        // Linha em branco antes do resumo: o que não mudou fica separado do total
        console.error(`${lines.join('\n')}\n`);
    }
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
        console.error(`No tokens found yet: run ${paint('cyan', 'tokentidy generate')} first.`);
        return;
    }
    const where = `${count(replaced, 'value')} ${result.dryRun ? 'would be replaced' : 'replaced'} in ${count(result.files.length, 'file')}.`;
    const lines = [replaced > 0 ? paint('green', result.dryRun ? where : `✔ ${where}`) : 'Nothing to replace.'];
    if (remaining > 0) {
        lines.push(`  ${count(remaining, 'hardcoded value')} ${remaining === 1 ? 'remains' : 'remain'}: run ${paint('cyan', 'tokentidy check')} to see ${remaining === 1 ? 'it' : 'them'}.`);
    }
    // `var(--x)` de um token gerado só resolve se o `tokens.css` estiver carregado na página
    const generatedVar = result.files.some((f) => f.replacements.some((r) => r.source !== 'project' && r.token.startsWith('--')));
    if (generatedVar) {
        lines.push(`  Make sure your app loads ${displayPath(path.join(tokensDir, 'tokens.css'))} (import it in the global stylesheet or add it to the build).`);
    }
    // Um DTCG escrito à mão sem CSS: `var(--x)` só resolve depois de compilado e carregado
    const uncompiled = [...new Set(result.files.flatMap((f) => f.replacements.flatMap((r) => (r.uncompiledFrom ? [r.uncompiledFrom] : []))))].sort();
    if (uncompiled.length > 0) {
        const files = uncompiled.map((file) => displayPath(path.join(result.root, file))).join(', ');
        lines.push(`  Tokens from ${files} are used as var() but no CSS defines them yet; compile ${uncompiled.length === 1 ? 'it' : 'them'} to CSS (tokentidy generate writes them with the same names, or use Style Dictionary) and load the result.`);
    }
    console.error(lines.join('\n'));
}
