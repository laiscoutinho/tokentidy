// Execução do `fix`: analisa, planeja, confere as trocas em memória e só então escreve.
// Cada arquivo passa por quatro portas antes de ser escrito: não é link simbólico, fica dentro do projeto,
// não mudou desde a leitura e continua com a sintaxe válida depois da troca.

import { existsSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzeScope } from '../analyze.ts';
import type { AnalysisResult, ScopeAnalysisOptions } from '../analyze.ts';
import { assertInsideRoot, OutsideRootError, writeFileAtomic } from '../fs-safe.ts';
import { readDtcgTree, treeTokensOf } from '../generate/output.ts';
import { isInside } from '../scope.ts';
import type { Scope } from '../scope.ts';
import type { Finding } from '../types.ts';
import { buildTokenIndex } from './candidates.ts';
import { applyEdits, unifiedDiff } from './diff.ts';
import { planFixes } from './plan.ts';
import type { FilePlan, Replacement, SkippedValue, SkipReason } from './plan.ts';

export interface FixOptions extends ScopeAnalysisOptions {
    /** Pasta dos tokens gerados (absoluta): fonte de tokens e nunca editada. */
    tokensDir: string;
    /** Mostra o diff sem escrever. */
    dryRun?: boolean;
}

export interface FileFix {
    file: string;
    replacements: Replacement[];
    /** Diff unificado da mudança. */
    diff: string;
}

export interface FixResult {
    root: string;
    dryRun: boolean;
    files: FileFix[];
    skipped: SkippedValue[];
    /** Valores sem token com o mesmo valor. */
    withoutToken: Finding[];
    /** Quantos tokens podiam ser usados (0: o projeto não tem tokens nem pasta gerada). */
    tokens: number;
    /** Análise do projeto depois das trocas: o que ainda falta (`findings`), erros e avisos. */
    after: AnalysisResult;
}

/** Motivos que valem para o arquivo inteiro. */
type FileReason = Extract<SkipReason, 'symlink' | 'outside-root' | 'changed-on-disk' | 'breaks-syntax'>;

const MESSAGES: Record<FileReason, string> = {
    'symlink': 'the file is a symbolic link; fix the file it points to',
    'outside-root': 'the file resolves outside the project',
    'changed-on-disk': 'the file changed while tokentidy was running; run fix again',
    'breaks-syntax': 'the fixed file would not parse; edit it by hand',
};

export async function fixScope(scope: Scope, options: FixOptions): Promise<FixResult> {
    const { root } = scope;
    const { tokensDir, dryRun = false, ...analysisOptions } = options;
    await assertInsideRoot(tokensDir, root);
    const before = await analyzeScope(scope, analysisOptions);
    // A pasta de tokens é a saída do `generate`: fonte de tokens, nunca alvo de troca
    const insideTokens = (file: string) => isInside(path.join(root, file), tokensDir);

    const tree = await readDtcgTree(tokensDir);
    const index = buildTokenIndex({
        definitions: before.definitions.filter((d) => !insideTokens(d.file)),
        references: before.references,
        generated: tree ? treeTokensOf(tree) : [],
        outputs: {
            css: existsSync(path.join(tokensDir, 'tokens.css')),
            scss: existsSync(path.join(tokensDir, '_tokens.scss')),
            less: existsSync(path.join(tokensDir, '_tokens.less')),
        },
    });
    const findings = before.findings.filter((f) => !insideTokens(f.file));

    // Lê cada arquivo e confere as posições: o trecho tem que ser exatamente o valor encontrado
    const sources = new Map<string, string>();
    const refused = new Map<string, FileReason>();
    for (const [file, ofFile] of Map.groupBy(findings, (f) => f.file)) {
        const absolute = path.join(root, file);
        const source = await readFile(absolute, 'utf8');
        sources.set(file, source);
        const reason = await refusal(absolute, root)
            ?? (ofFile.every((f) => source.slice(f.offset, f.endOffset) === f.value) ? undefined : 'changed-on-disk');
        if (reason) {
            refused.set(file, reason);
        }
    }

    const relative = (file: string) => path.relative(root, path.join(tokensDir, file)).split(path.sep).join('/');
    const plan = planFixes(findings, { index, sources, generatedFiles: { scss: relative('_tokens.scss'), less: relative('_tokens.less') } });
    const skipped = [...plan.skipped];
    let files = plan.files.filter((filePlan) => {
        const reason = refused.get(filePlan.file);
        if (reason) {
            skipped.push(...skipAll(filePlan, reason));
        }
        return !reason;
    });

    // Analisa o projeto com os arquivos corrigidos em memória; arquivo com mais erros de sintaxe que antes não é escrito
    const errorsBefore = errorCounts(before);
    let fixed = new Map(files.map((f) => [f.file, applyEdits(sources.get(f.file)!, f.edits)]));
    let after = await analyzeScope(scope, { ...analysisOptions, sources: fixed });
    for (;;) {
        const errorsAfter = errorCounts(after);
        const broken = files.filter((f) => (errorsAfter.get(f.file) ?? 0) > (errorsBefore.get(f.file) ?? 0));
        if (broken.length === 0) {
            break;
        }
        for (const filePlan of broken) {
            skipped.push(...skipAll(filePlan, 'breaks-syntax'));
        }
        files = files.filter((f) => !broken.includes(f));
        fixed = new Map(files.map((f) => [f.file, fixed.get(f.file)!]));
        after = await analyzeScope(scope, { ...analysisOptions, sources: fixed });
    }

    if (!dryRun) {
        let changed = false;
        for (const filePlan of [...files]) {
            const absolute = path.join(root, filePlan.file);
            // Relê logo antes de escrever: um editor ou formatter pode ter salvo o arquivo nesse meio-tempo
            const current = await readFile(absolute, 'utf8').catch(() => undefined);
            if (current !== sources.get(filePlan.file)) {
                skipped.push(...skipAll(filePlan, 'changed-on-disk'));
                files = files.filter((f) => f !== filePlan);
                changed = true;
                continue;
            }
            await writeFileAtomic(absolute, fixed.get(filePlan.file)!);
        }
        if (changed) {
            after = await analyzeScope(scope, analysisOptions);
        }
    }

    return {
        root,
        dryRun,
        files: files.map((f) => ({ file: f.file, replacements: f.replacements, diff: unifiedDiff(f.file, sources.get(f.file)!, f.edits) })),
        skipped: skipped.sort((a, b) => (a.finding.file < b.finding.file ? -1 : a.finding.file > b.finding.file ? 1 : 0)
            || a.finding.offset - b.finding.offset),
        withoutToken: plan.withoutToken,
        tokens: index.size,
        after: { ...after, findings: after.findings.filter((f) => !insideTokens(f.file)) },
    };
}

/** Link simbólico ou arquivo fora do projeto (por uma pasta que é link): não é escrito. */
async function refusal(absolute: string, root: string): Promise<FileReason | undefined> {
    if ((await lstat(absolute)).isSymbolicLink()) {
        return 'symlink';
    }
    try {
        await assertInsideRoot(absolute, root);
    } catch (error) {
        if (error instanceof OutsideRootError) {
            return 'outside-root';
        }
        throw error;
    }
    return undefined;
}

function skipAll(filePlan: FilePlan, reason: FileReason): SkippedValue[] {
    return filePlan.replacements.map(({ finding }) => ({ finding, reason, message: MESSAGES[reason] }));
}

function errorCounts(result: AnalysisResult): Map<string, number> {
    const counts = new Map<string, number>();
    for (const error of result.errors) {
        counts.set(error.file, (counts.get(error.file) ?? 0) + 1);
    }
    return counts;
}
