/**
 * `check --summary`: por tipo, quantos valores estão soltos e quantos usos já passam por um token.
 * Fica em dois números de propósito: uma nota única esconderia onde está a dívida (cor em dia, espaçamento não).
 */

import type { AnalysisResult } from '../analysis/analyze.ts';
import { rulesForProperty } from '../analysis/rules.ts';
import { reusableDefinitions } from '../token-index.ts';
import type { TokenReference, TokenType } from '../types.ts';
import { colorInfo } from '../values/color-info.ts';

export interface TypeSummary {
    type: TokenType;
    hardcoded: number;
    tokenized: number;
}

export function summarize(analysis: Pick<AnalysisResult, 'findings' | 'definitions' | 'references'>): TypeSummary[] {
    const totals = new Map<TokenType, TypeSummary>();
    const entry = (type: TokenType) => {
        let summary = totals.get(type);
        if (!summary) {
            summary = { type, hardcoded: 0, tokenized: 0 };
            totals.set(type, summary);
        }
        return summary;
    };

    for (const finding of analysis.findings) {
        entry(finding.type).hardcoded++;
    }

    const definedAs = typesOfDefinitions(analysis);
    // Nome sem definição no projeto (custom property local, typo) não é uso de token
    const known = new Set(analysis.definitions.map((definition) => definition.name));
    for (const reference of analysis.references) {
        const type = known.has(reference.name) ? typeOfReference(reference, definedAs) : undefined;
        if (type) {
            entry(type).tokenized++;
        }
    }
    return [...totals.values()].sort((a, b) => (a.type < b.type ? -1 : 1));
}

function typesOfDefinitions(analysis: Pick<AnalysisResult, 'definitions' | 'references'>): Map<string, Set<TokenType>> {
    const types = new Map<string, Set<TokenType>>();
    for (const { definition, type } of reusableDefinitions(analysis.definitions, analysis.references)) {
        // Usado em `border`, um token parece cor e espessura ao mesmo tempo: o valor dele desempata
        if ((type === 'color') !== (colorInfo(definition.value) !== undefined)) {
            continue;
        }
        const ofName = types.get(definition.name) ?? new Set();
        ofName.add(type);
        types.set(definition.name, ofName);
    }
    return types;
}

/** A propriedade decide (`padding` → espaçamento); em `border`, que aceita vários tipos, decide a definição do token. */
function typeOfReference(reference: TokenReference, definedAs: ReadonlyMap<string, ReadonlySet<TokenType>>): TokenType | undefined {
    const byProperty = new Set(rulesForProperty(reference.property).map((rule) => rule.type));
    const candidates = byProperty.size === 1 ? byProperty : definedAs.get(reference.name);
    return candidates?.size === 1 ? [...candidates][0] : undefined;
}
