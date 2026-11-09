/**
 * `check --format github`: comandos de workflow que viram anotações no diff do pull request.
 * O valor vem do arquivo analisado: sem o escape, uma quebra de linha nele criaria outro comando.
 */

import type { AnalysisError, Finding, ReviewItem } from '../types.ts';

/** Regra do runner do GitHub para a mensagem. */
function escapeData(text: string): string {
    return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Nas propriedades, `:` e `,` também separam campos. */
function escapeProperty(text: string): string {
    return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function annotation(level: 'error' | 'notice', file: string, line: number, column: number, title: string, message: string): string {
    return `::${level} file=${escapeProperty(file)},line=${line},col=${column},title=${escapeProperty(title)}::${escapeData(message)}`;
}

function findingMessage({ type, value, property, suggestion }: Finding): string {
    const hardcoded = `Hardcoded ${type} in ${property}: ${value}`;
    return suggestion ? `${hardcoded}. Use ${suggestion.token}${suggestion.match === 'exact' ? '' : ' (closest token)'}` : hardcoded;
}

export interface GithubInput {
    findings: readonly Finding[];
    review: readonly ReviewItem[];
    errors: readonly AnalysisError[];
}

/** Violações e erros são `error`; revisões, `notice`, porque não falham o CI. */
export function githubAnnotations({ findings, review, errors }: GithubInput, pathOf: (file: string) => string): string[] {
    return [
        ...errors.map((item) => annotation('error', pathOf(item.file), item.line, item.column, 'syntax-error', item.message)),
        ...findings.map((item) => annotation('error', pathOf(item.file), item.line, item.column, item.rule, findingMessage(item))),
        ...review.map((item) => annotation('notice', pathOf(item.file), item.line, item.column, item.rule, item.message)),
    ];
}
