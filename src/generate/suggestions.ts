/** Sugestões do `generate`: valores fora da grade e o mesmo tamanho escrito em unidades diferentes. */

import { formatNumber, lengthInPx, parseLength } from '../values/normalize.ts';
import type { TokenType } from '../types.ts';

export interface Suggestion {
    kind: 'off-grid' | 'same-size-different-unit';
    type: TokenType;
    message: string;
    /** Valores envolvidos (chaves normalizadas). */
    values: string[];
}

/** Valor considerado nas sugestões: o tipo do token e a chave normalizada. */
export interface SuggestionInput {
    type: TokenType;
    key: string;
}

/**
 * Sugestões que a pessoa decide (nada é mudado sozinho):
 * - espaçamento/tamanho fora da grade (`13px` com grade de 4px);
 * - o mesmo tamanho em unidades diferentes (`16px` e `1rem`, com fonte raiz de 16px).
 */
export function findSuggestions(values: readonly SuggestionInput[], rootFontSize: number, gridBase: number): Suggestion[] {
    const suggestions: Suggestion[] = [];

    for (const { type, key } of values) {
        if (type !== 'spacing' && type !== 'size') {
            continue;
        }
        const px = lengthInPx(key, rootFontSize);
        // Até 2px é linha fina (borda, ajuste óptico): não é espaçamento de layout
        if (px === undefined || px <= 2 || px % gridBase === 0) {
            continue;
        }
        const lower = Math.floor(px / gridBase) * gridBase;
        const upper = lower + gridBase;
        suggestions.push({
            kind: 'off-grid',
            type,
            message: `${key} is off the ${gridBase}px grid (nearest: ${formatNumber(lower)}px or ${formatNumber(upper)}px)`,
            values: [key],
        });
    }

    const byTypeAndPx = new Map<string, Set<string>>();
    for (const { type, key } of values) {
        const unit = parseLength(key)?.unit;
        const px = lengthInPx(key, rootFontSize);
        if (px === undefined || (unit !== 'px' && unit !== 'rem')) {
            continue;
        }
        const id = `${type}\u0000${formatNumber(px)}`;
        byTypeAndPx.set(id, (byTypeAndPx.get(id) ?? new Set()).add(key));
    }
    for (const [id, keys] of byTypeAndPx) {
        if (keys.size > 1) {
            const type = id.split('\u0000')[0] as TokenType;
            const values = [...keys].sort();
            suggestions.push({
                kind: 'same-size-different-unit',
                type,
                message: `${values.join(' and ')} are the same ${type} at a ${formatNumber(rootFontSize)}px root font size; consider using one unit`,
                values,
            });
        }
    }
    return suggestions;
}
