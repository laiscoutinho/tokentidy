/**
 * Custom properties locais: `.card { --gap: 12px }` é um valor solto com nome, não um token do projeto.
 * Decidir exige o projeto inteiro: o mesmo nome pode estar definido em `:root` (aí é tema, não valor solto)
 * e o tipo vem de onde o nome é usado (`gap: var(--gap)` → espaçamento).
 */

import { REVIEW_MESSAGES } from '../parsers/collector.ts';
import type { CustomPropertyCandidate } from '../parsers/collector.ts';
import { findValues } from '../parsers/css/values.ts';
import type { ValueMatch } from '../parsers/css/values.ts';
import { rulesForProperty, violationRule } from './rules.ts';
import type { PropertyRule } from './rules.ts';
import { createPositionLookup } from '../parsers/position.ts';
import type { Finding, ReviewItem, TokenReference } from '../types.ts';

export interface LocalPropertiesResult {
    findings: Finding[];
    review: ReviewItem[];
    /** Candidatos que viraram achado ou revisão: saem das definições, porque não são tokens do projeto. */
    local: Set<CustomPropertyCandidate>;
}

/**
 * Classifica as custom properties definidas fora de bloco de tokens:
 * - redefinição de um nome que um bloco de tokens já define (`.card { --color-primary: red }`): tema, fica de fora;
 * - tipo pelo uso (`var(--gap)` em `gap` → `spacing`); usos que discordam e não se resolvem pelo valor → revisão;
 * - sem uso: cor é cor; medida vai para revisão (`custom-property/unknown-use`); o resto (`1fr 2fr`, `""`) fica de fora.
 */
export function resolveLocalProperties(
    candidates: readonly CustomPropertyCandidate[], references: readonly TokenReference[],
): LocalPropertiesResult {
    const result: LocalPropertiesResult = { findings: [], review: [], local: new Set() };
    const tokenNames = new Set(candidates.filter((c) => c.tokenBlock).map((c) => c.name));
    const usedIn = new Map<string, Set<string>>();
    for (const reference of references) {
        if (reference.name.startsWith('--')) {
            let properties = usedIn.get(reference.name);
            if (!properties) {
                properties = new Set();
                usedIn.set(reference.name, properties);
            }
            properties.add(reference.property);
        }
    }

    for (const candidate of candidates) {
        if (candidate.tokenBlock || tokenNames.has(candidate.name)) {
            continue;
        }
        const rules = [...usedIn.get(candidate.name) ?? []].flatMap((property) => rulesForProperty(property));
        const decision = decide(candidate.value, rules);
        if (!decision) {
            continue;
        }
        result.local.add(candidate);
        const positionOf = createPositionLookup(candidate.value);
        for (const match of decision.matches) {
            const type = match.type ?? decision.rule.type;
            const inValue = positionOf(match.start);
            const item = {
                file: candidate.file,
                line: candidate.line + inValue.line - 1,
                column: inValue.line === 1 ? candidate.column + inValue.column - 1 : inValue.column,
                offset: candidate.offset + match.start,
                endOffset: candidate.offset + match.end,
                rule: decision.rule.review ?? violationRule(type),
                property: candidate.name,
                value: match.text,
                host: candidate.host,
                ...(candidate.selector === undefined ? {} : { selector: candidate.selector }),
                ...(candidate.atRules ? { atRules: candidate.atRules } : {}),
                ...(match.function === undefined ? {} : { function: match.function }),
            };
            const review = decision.rule.review;
            if (review) {
                // Sem uso, o tipo seria chute: a revisão fica sem tipo
                result.review.push({ ...item, ...(review === 'custom-property/unknown-use' ? {} : { type }), message: REVIEW_MESSAGES[review] });
            } else {
                result.findings.push({ ...item, type });
            }
        }
    }
    return result;
}

/** Regra que vale para o valor e os trechos encontrados; `undefined` quando não há valor solto. */
function decide(value: string, rules: readonly PropertyRule[]): { rule: PropertyRule; matches: ValueMatch[] } | undefined {
    // Só regras de violação: o uso em `width` sem contexto não diz o tipo
    const candidates = rules.filter((rule) => !rule.review);
    const matching = candidates
        .map((rule) => ({ rule, matches: findValues(value, rule.match) }))
        .filter((m) => m.matches.length > 0);
    const types = new Set(matching.map((m) => m.rule.type));
    if (types.size === 1) {
        return matching[0];
    }
    if (types.size > 1 || rules.length > 0) {
        // Usos com tipos diferentes, ou uso que não aceita o valor: a pessoa decide
        return reviewOf(value);
    }
    const colors = findValues(value, 'color');
    if (colors.length > 0) {
        return { rule: { type: 'color', match: 'color' }, matches: colors };
    }
    return reviewOf(value);
}

function reviewOf(value: string): { rule: PropertyRule; matches: ValueMatch[] } | undefined {
    const lengths = findValues(value, 'length');
    return lengths.length > 0
        ? { rule: { type: 'spacing', match: 'length', review: 'custom-property/unknown-use' }, matches: lengths }
        : undefined;
}
