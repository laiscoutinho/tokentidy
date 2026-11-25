/**
 * Valor igual a um token só em um tema: `#ffffff` com `--bg: #fff` no `:root` e `--bg: #111` em `.dark`.
 * O `fix` não troca (no escuro a cor mudaria), mas o token provavelmente é o certo: o `check` mostra para a pessoa decidir.
 */

import { isTestPath } from '../project/scanner.ts';
import { isGlobal, resolvesUnder } from '../token-index.ts';
import type { Finding, ReviewItem, TokenDefinition } from '../types.ts';
import { normalizeFinding, normalizeValue } from '../values/normalize.ts';

interface ThemedToken {
    name: string;
    global: TokenDefinition;
    others: TokenDefinition[];
}

/** Custom properties com um valor global e outro valor em algum seletor (tema). */
function themedTokens(definitions: readonly TokenDefinition[]): ThemedToken[] {
    const custom = definitions.filter((d) => d.syntax === 'custom-property' && d.selector !== undefined && !isTestPath(d.file) && !d.value.includes('var('));
    const themed: ThemedToken[] = [];
    for (const [name, sameName] of Map.groupBy(custom, (d) => d.name)) {
        const global = sameName.find((d) => isGlobal(d.selector));
        const others = sameName.filter((d) => !isGlobal(d.selector) && d.value.trim() !== global?.value.trim());
        if (global && others.length > 0) {
            themed.push({ name, global, others });
        }
    }
    return themed;
}

export function themeOnlyMatches(findings: readonly Finding[], definitions: readonly TokenDefinition[]): ReviewItem[] {
    const themed = themedTokens(definitions);
    if (themed.length === 0) {
        return [];
    }
    const review: ReviewItem[] = [];
    for (const finding of findings) {
        const key = normalizeFinding(finding);
        const token = themed.find(({ global, others }) => normalizeValue(finding.type, global.value) === key
            // Dentro do próprio tema o valor é o do tema: ali `var()` daria outra cor
            && !others.some((other) => resolvesUnder(finding.selector, other.selector!, [])));
        if (!token) {
            continue;
        }
        const { type: _, suggestion: __, ...at } = finding;
        const elsewhere = token.others.map((d) => `${d.selector} sets ${d.value.trim()}`).join(', ');
        review.push({
            ...at,
            type: finding.type,
            rule: 'token/theme-only',
            message: `same as ${token.name} in ${token.global.selector}, but ${elsewhere}: use the token only if this value should follow the theme`,
            token: token.name,
            themes: [token.global, ...token.others].map((d) => ({ selector: d.selector!, value: d.value.trim() })),
        });
    }
    return review;
}
