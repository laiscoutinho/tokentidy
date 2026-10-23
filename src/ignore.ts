// Comentários de ignorar: a pessoa aceita um valor solto de propósito, numa linha, para regras nomeadas.
//   /* tokentidy-ignore-line color/hardcoded -- cor da marca do parceiro */
//   // tokentidy-ignore-next-line spacing/hardcoded, radius/hardcoded -- ajuste do Safari
// Uma busca no texto serve a todos os hosts (CSS, SCSS, HTML, JSX): cada parser expõe comentários de um jeito.
// Diretiva sem id de regra não ignora nada (e é avisada): ignorar "tudo" esconderia mais do que a pessoa quis.

import { createPositionLookup } from './position.ts';
import { knownRules } from './rules.ts';
import type { AnalysisWarning } from './types.ts';

export const IGNORE_MARKER = 'tokentidy-ignore';

export interface IgnoreDirective {
    file: string;
    /** Onde o comentário está. */
    line: number;
    column: number;
    /** Linha a que a diretiva se aplica. */
    target: number;
    rules: string[];
    /** Regras que ignoraram pelo menos um achado. */
    used: Set<string>;
}

// Só depois de abrir um comentário na mesma linha: `/*`, `//`, `<!--` (e `{/*` do JSX, que contém `/*`).
// `\s--\s` separa o motivo; `*/` e `-->` fecham o comentário.
const DIRECTIVE = /(?:\/\*+|\/\/|<!--)[ \t]*tokentidy-ignore(-line|-next-line)?(?![\w-])([^\n]*)/g;

/** Diretivas de um arquivo e avisos sobre as que nunca terão efeito. Custo zero quando o arquivo não tem o marcador. */
export function parseIgnoreDirectives(source: string, file: string): { directives: IgnoreDirective[]; warnings: AnalysisWarning[] } {
    const directives: IgnoreDirective[] = [];
    const warnings: AnalysisWarning[] = [];
    if (!source.includes(IGNORE_MARKER)) {
        return { directives, warnings };
    }
    const positionOf = createPositionLookup(source);
    const known = knownRules();
    for (const match of source.matchAll(DIRECTIVE)) {
        const at = positionOf(match.index + match[0].indexOf(IGNORE_MARKER));
        const warn = (rule: string, message: string) => warnings.push({ file, ...at, rule, message });
        const variant = match[1];
        const body = (match[2] ?? '').split(/\*\/|-->/)[0]!;
        const rules = body.split(/\s--(?:\s|$)/)[0]!.split(/[\s,]+/).filter(Boolean);
        if (!variant || rules.length === 0) {
            warn('ignore/too-broad', 'ignore comment without rule ids ignores nothing: use tokentidy-ignore-line or tokentidy-ignore-next-line followed by rule ids (e.g. color/hardcoded)');
            continue;
        }
        for (const rule of rules.filter((r) => !known.has(r))) {
            warn('ignore/unknown-rule', `unknown rule "${rule}"`);
        }
        directives.push({
            file, ...at, target: variant === '-line' ? at.line : at.line + 1,
            rules: rules.filter((r) => known.has(r)), used: new Set(),
        });
    }
    return { directives, warnings };
}

/** Separa o que as diretivas ignoram. Marca as regras usadas, para `unusedDirectives` avisar das outras. */
export function applyIgnores<T extends { line: number; rule: string }>(items: readonly T[], directives: readonly IgnoreDirective[]): { kept: T[]; ignored: number } {
    if (directives.length === 0) {
        return { kept: [...items], ignored: 0 };
    }
    const kept: T[] = [];
    let ignored = 0;
    for (const item of items) {
        const directive = directives.find((d) => d.target === item.line && d.rules.includes(item.rule));
        if (directive) {
            directive.used.add(item.rule);
            ignored++;
        } else {
            kept.push(item);
        }
    }
    return { kept, ignored };
}

/** Regras citadas que não ignoraram nada: o valor mudou ou a diretiva ficou na linha errada. */
export function unusedDirectives(directives: readonly IgnoreDirective[]): AnalysisWarning[] {
    return directives.flatMap((d) => d.rules.filter((rule) => !d.used.has(rule)).map((rule) => ({
        file: d.file, line: d.line, column: d.column, rule: 'ignore/unused',
        message: `nothing to ignore for ${rule} on line ${d.target}`,
    })));
}
