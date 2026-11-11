/**
 * Que token serve para um valor, e por que nenhum serve: o papel da cor, a família do nome, o token de teste
 * e os destinos em que o `var()` não entra sem cuidado. As mensagens vão para a revisão com o motivo.
 */

import type { Finding } from '../types.ts';
import type { Candidate, TokenIndex } from '../token-lookup.ts';
import { resolvesUnder } from '../token-index.ts';
import { propertyAffinity, roleFit } from './token-fit.ts';
import type { SkipReason, SkippedValue } from './plan-types.ts';

const SOURCE_RANK: Record<Candidate['source'], number> = { alias: 0, project: 1, generated: 2 };

/**
 * `found`: os tokens com este valor que valem aqui (alias desta ocorrência, escopo do seletor).
 * `candidates`: os que servem, em ordem. Cor de outro papel (`--bg-surface` num `color`) não entra;
 * com o papel certo, ela vem antes da cor sem papel.
 */
export function candidatesFor(finding: Finding, key: string, index: TokenIndex): { found: Candidate[]; candidates: Candidate[] } {
    const found = index.lookup(finding.type, key)
        .filter((c) => c.form !== 'js-theme'
            && (c.source !== 'alias' || c.occurrences?.some((o) => sameOccurrence(o, finding)))
            && (!c.scope || resolvesUnder(finding.selector, c.scope.selector, c.scope.rivals)));
    const candidates = found.filter((c) => finding.type !== 'color' || roleFit(finding.property, c.name) < 2)
        .map((candidate, order) => ({ candidate, order, fit: fit(finding, candidate) }))
        .sort((a, b) => SOURCE_RANK[a.candidate.source] - SOURCE_RANK[b.candidate.source] || a.fit - b.fit || a.order - b.order)
        .map(({ candidate }) => candidate);
    return { found, candidates };
}

/** Destinos em que a troca não é feita, mesmo com token: o motivo de cada um. */
export function hostSkip(finding: Finding): SkippedValue | undefined {
    switch (finding.host) {
        case 'angular-template':
            return finding.impliedUnit && !finding.unitSuffix
                ? skippedValue(finding, 'unit-in-binding', 'the unit in the binding name applies to more than one value; edit it by hand')
                : undefined;
        case 'component-prop':
            return skippedValue(finding, 'component-prop', `the ${finding.property} prop belongs to the component, which may not accept var(); check what it takes and edit it by hand`);
        case 'css-string':
            return skippedValue(finding, 'css-string', 'this CSS is built as a string, often for an iframe or another window where the tokens may not be loaded; edit it by hand');
        case 'svg-attribute':
            return skippedValue(finding, 'svg-attribute', 'var() in an SVG attribute does not work the same in every browser; move it to style or edit it by hand');
        default:
            return undefined;
    }
}

/** Nenhum token serve, mas o projeto tem um com este valor: o motivo vai para a revisão, com o nome do token. */
export function rejectedReason(finding: Finding, key: string, index: TokenIndex): SkippedValue | 'no-token' {
    const rejected = index.rejected(finding.type, key);
    if (rejected.length === 0) {
        return 'no-token';
    }
    const names = [...new Set(rejected.map((r) => r.name))];
    const test = rejected.filter((r) => r.reason === 'test-source');
    if (test.length === rejected.length) {
        const where = test[0]!.definition;
        return { ...skippedValue(finding, 'test-token', `${listed(names)} this value but ${names.length > 1 ? 'are' : 'is'} defined in a test, fixture or story (${where.file}:${where.line}); not a design decision`), alternatives: names };
    }
    const family = rejected.find((r) => r.reason === 'family')!;
    return {
        ...skippedValue(finding, 'token-family-mismatch', `${family.name} has this value but its name says ${family.declared ?? 'another type'}, not ${finding.type} (${finding.property}); edit it by hand or create a ${finding.type} token`),
        alternatives: names,
    };
}

export function roleMismatch(finding: Finding, found: readonly Candidate[]): SkippedValue {
    const names = [...new Set(found.map((c) => c.name))];
    return {
        ...skippedValue(finding, 'token-role-mismatch', `${listed(names)} this color but ${names.length > 1 ? 'are' : 'is'} meant for another role than ${finding.property}; edit it by hand or create a token for this role`),
        alternatives: names,
    };
}

/** Encaixe do nome na propriedade, menor é melhor: o papel da cor e a propriedade de espaçamento do nome. */
export function fit(finding: Finding, candidate: Candidate): number {
    return finding.type === 'color' ? roleFit(finding.property, candidate.name) : finding.type === 'spacing' ? propertyAffinity(finding.property, candidate.name) : 1;
}

/** Espaçamento negativo: o token tem o valor positivo (ver `normalizeValue`). */
export function isNegative(finding: Finding): boolean {
    return finding.type === 'spacing' && finding.value.trimStart().startsWith('-');
}

export function skippedValue(finding: Finding, reason: SkipReason, message: string): SkippedValue {
    return { finding, reason, message };
}

export function describeContext(finding: Finding): string {
    if (finding.property.startsWith('@')) {
        return `the ${finding.property} condition`;
    }
    if (finding.function?.startsWith('@')) {
        return `this ${finding.function} argument`;
    }
    return finding.function ? `${finding.function}()` : 'this expression';
}

/** `--a has` ou `--a, --b have`. */
function listed(names: readonly string[]): string {
    return `${names.join(', ')} ${names.length > 1 ? 'have' : 'has'}`;
}

/** O alias foi criado para esta ocorrência: mesmo arquivo, propriedade e seletor. */
function sameOccurrence(occurrence: { file: string; property: string; selector?: string }, finding: Finding): boolean {
    return occurrence.file === finding.file && occurrence.property === finding.property && occurrence.selector === finding.selector;
}
