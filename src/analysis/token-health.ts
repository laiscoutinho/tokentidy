/**
 * Avisos sobre o uso dos tokens: nome quase igual a um token que existe, token depreciado e fallback que
 * discorda do token. Nada aqui é violação: o código pode estar certo, e o exit code não muda.
 */

import { findValues } from '../parsers/css/values.ts';
import { bareName, deprecatedTokens } from '../token-lookup.ts';
import type { AnalysisWarning, TokenDefinition, TokenReference, TokenType } from '../types.ts';
import { lengthInPx, normalizeValue } from '../values/normalize.ts';
import { rulesForProperty } from './rules.ts';
import type { ValueMatcher } from './rules.ts';

/** Mais que isto deixa de ser erro de digitação e passa a ser outro nome. */
const MAX_TYPO_DISTANCE = 2;
/** Em nome curto, duas letras de diferença já são outro nome (`--gap` e `--bg`). */
const MIN_TYPO_LENGTH = 5;

export function tokenWarnings(
    references: readonly TokenReference[],
    definitions: readonly TokenDefinition[],
    isReported: (item: { file: string }) => boolean,
): AnalysisWarning[] {
    const reported = references.filter(isReported);
    return [...typoWarnings(reported, definitions), ...deprecationWarnings(reported, definitions), ...fallbackWarnings(reported, definitions)];
}

/**
 * Só `--x`: `$x` e `@x` inexistentes já quebram o build, e variáveis de `@each`/mixin apareceriam como desconhecidas.
 * Só avisa com um candidato único: `--spacing-5` perto de `--spacing-4` e de `--spacing-6` é escala, não erro de digitação.
 */
function typoWarnings(references: readonly TokenReference[], definitions: readonly TokenDefinition[]): AnalysisWarning[] {
    const known = new Set(definitions.filter((d) => d.syntax === 'custom-property' || d.syntax === 'dtcg')
        .map((d) => (d.syntax === 'dtcg' ? `--${bareName(d.name)}` : d.name)));
    const closest = new Map<string, string | undefined>();
    const warnings: AnalysisWarning[] = [];
    for (const ref of references) {
        if (!ref.name.startsWith('--') || known.has(ref.name) || ref.name.length - 2 < MIN_TYPO_LENGTH) {
            continue;
        }
        if (!closest.has(ref.name)) {
            closest.set(ref.name, closestName(ref.name, known));
        }
        const suggestion = closest.get(ref.name);
        if (suggestion) {
            warnings.push({ file: ref.file, line: ref.line, column: ref.column, rule: 'token/unknown', message: `${ref.name} is not defined; did you mean ${suggestion}?` });
        }
    }
    return warnings;
}

function closestName(name: string, known: ReadonlySet<string>): string | undefined {
    let best: string | undefined;
    let bestDistance = MAX_TYPO_DISTANCE + 1;
    let tied = false;
    for (const candidate of known) {
        if (Math.abs(candidate.length - name.length) > MAX_TYPO_DISTANCE) {
            continue;
        }
        const distance = editDistance(name, candidate);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
            tied = false;
        } else if (distance === bestDistance) {
            tied = true;
        }
    }
    return tied ? undefined : best;
}

/** Distância de Levenshtein: quantas letras inserir, apagar ou trocar para ir de um texto ao outro. */
export function editDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[b.length]!;
}

function deprecationWarnings(references: readonly TokenReference[], definitions: readonly TokenDefinition[]): AnalysisWarning[] {
    const deprecated = deprecatedTokens(definitions);
    if (deprecated.size === 0) {
        return [];
    }
    return references.flatMap((ref) => {
        const definition = deprecated.get(bareName(ref.name));
        if (!definition) {
            return [];
        }
        const reason = typeof definition.deprecated === 'string' ? `: ${definition.deprecated}` : '';
        return [{ file: ref.file, line: ref.line, column: ref.column, rule: 'token/deprecated', message: `${ref.name} is deprecated${reason}` }];
    });
}

/** Valor fixo que ocupa o texto inteiro: `12px` sim, `calc(1px + 2px)` e `1px solid red` não. */
function wholeValue(text: string, match: ValueMatcher): boolean {
    const found = findValues(text, match);
    return found.length === 1 && found[0]!.start === 0 && found[0]!.end === text.length;
}

function sameValue(type: TokenType, a: string, b: string): boolean {
    const [keyA, keyB] = [normalizeValue(type, a), normalizeValue(type, b)];
    if (keyA === keyB) {
        return true;
    }
    const [pxA, pxB] = [lengthInPx(keyA), lengthInPx(keyB)];
    return pxA !== undefined && pxA === pxB;
}

/**
 * `var(--x, 12px)` com `--x: 16px`: quando o token falhar, a tela muda de medida sem ninguém perceber.
 * Com tema (mais de uma definição), basta concordar com uma. Fallback ou definição com outra variável não dá para comparar.
 */
function fallbackWarnings(references: readonly TokenReference[], definitions: readonly TokenDefinition[]): AnalysisWarning[] {
    const byName = Map.groupBy(definitions.filter((d) => d.syntax === 'custom-property'), (d) => d.name);
    const warnings: AnalysisWarning[] = [];
    for (const ref of references) {
        const owned = byName.get(ref.name);
        const { fallback } = ref;
        if (fallback === undefined || !owned || /var\(|[$@]/.test(fallback) || owned.some((d) => /var\(|[$@]/.test(d.value))) {
            continue;
        }
        const rule = rulesForProperty(ref.property, new Map(), ref.selector)
            .find((r) => wholeValue(fallback, r.match) && owned.every((d) => wholeValue(d.value.trim(), r.match)));
        if (rule && !owned.some((d) => sameValue(rule.type, fallback, d.value.trim()))) {
            warnings.push({
                file: ref.file, line: ref.line, column: ref.column, rule: 'token/fallback-mismatch',
                message: `fallback ${fallback} differs from ${ref.name} (${owned[0]!.value.trim()}, ${owned[0]!.file}:${owned[0]!.line})`,
            });
        }
    }
    return warnings;
}
