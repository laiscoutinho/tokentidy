/**
 * O que o `check` acrescenta depois da análise, sem escrever nada: que token serve para cada valor,
 * quais valores repetidos ainda não têm token e quais tokens ninguém usa.
 * Usa o planejamento do `fix`, para que o `check` nunca sugira um token que o `fix` não usaria.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AnalysisResult } from '../analysis/analyze.ts';
import { planFixes } from '../fix/plan.ts';
import { isInside } from '../project/scope.ts';
import { projectTokenIndex, repeatedValues } from '../token-lookup.ts';
import type { Finding, TokenSuggestion } from '../types.ts';
import { findReferences } from '../parsers/css/values.ts';
import { nearSuggestion } from './near.ts';

export interface UnusedToken {
    name: string;
    file: string;
    line: number;
}

export interface CheckResult extends AnalysisResult {
    /** Valores repetidos o bastante para virar token e sem token: a pasta gerada está desatualizada. */
    repeatedWithoutToken: Finding[];
    /** Custom properties que nenhum arquivo analisado usa; vazio em execução parcial. */
    unusedTokens: UnusedToken[];
}

export interface EnrichOptions {
    tokensDir: string;
    minOccurrences: number;
    gridBase: number;
}

export async function enrichCheck(result: AnalysisResult, options: EnrichOptions): Promise<CheckResult> {
    const { tokensDir, minOccurrences, gridBase } = options;
    const insideTokens = (file: string) => isInside(path.join(result.root, file), tokensDir);
    const unusedTokens = result.partial ? [] : findUnusedTokens(result, insideTokens);

    const index = await projectTokenIndex(result, tokensDir).catch(() => undefined);
    if (!index || index.size === 0) {
        return { ...result, repeatedWithoutToken: [], unusedTokens };
    }

    const candidates = result.findings.filter((f) => !insideTokens(f.file));
    const sources = new Map<string, string>();
    for (const file of new Set(candidates.map((f) => f.file))) {
        sources.set(file, await readFile(path.join(result.root, file), 'utf8'));
    }
    const relative = (file: string) => path.relative(result.root, path.join(tokensDir, file)).split(path.sep).join('/');
    const plan = planFixes(candidates, { index, sources, generatedFiles: { scss: relative('_tokens.scss'), less: relative('_tokens.less') } });

    const suggestions = new Map<Finding, TokenSuggestion>();
    for (const { replacements } of plan.files) {
        for (const { finding, token } of replacements) {
            suggestions.set(finding, { token, match: 'exact' });
        }
    }
    for (const { finding, reason, alternatives } of plan.skipped) {
        if (reason === 'ambiguous-token' && alternatives) {
            suggestions.set(finding, { token: alternatives[0]!, match: 'exact', alternatives: alternatives.slice(1) });
        }
    }
    for (const finding of plan.withoutToken) {
        const near = nearSuggestion(finding, index, { gridBase, ...(result.rootFontSize ? { rootFontSize: result.rootFontSize.px } : {}) });
        if (near) {
            suggestions.set(finding, near);
        }
    }

    return {
        ...result,
        findings: result.findings.map((f) => {
            const suggestion = suggestions.get(f);
            return suggestion ? { ...f, suggestion } : f;
        }),
        repeatedWithoutToken: repeatedValues(plan.withoutToken, index, minOccurrences),
        unusedTokens,
    };
}

/**
 * Só custom properties: `$x` e `@x` também aparecem em `@include`, `@if` e mapas, que não viram referência
 * aqui, e sem isso o aviso seria falso. O uso dentro de outro token (`--a: var(--b)`) conta.
 */
function findUnusedTokens(result: AnalysisResult, insideTokens: (file: string) => boolean): UnusedToken[] {
    const used = new Set(result.references.map((r) => r.name));
    for (const definition of result.definitions) {
        for (const { name } of findReferences(definition.value)) {
            used.add(name);
        }
    }
    const seen = new Set<string>();
    const unused: UnusedToken[] = [];
    for (const d of result.definitions) {
        if (d.syntax === 'custom-property' && !used.has(d.name) && !insideTokens(d.file) && !seen.has(d.name)) {
            seen.add(d.name);
            unused.push({ name: d.name, file: d.file, line: d.line });
        }
    }
    return unused;
}
