/** Leitura do texto em volta de um valor: operadores de conta (SCSS/Less) e as aspas certas para JS e Angular. */

import type { Finding } from '../types.ts';

/**
 * Valor ao lado de um operador (`16px * 2`, `$a + 8px`, `12px/1.5`): no SCSS/Less é conta feita no build.
 * O `-` só conta com espaço depois (`$a - 8px`); colado é o sinal do número.
 */
export function nextToOperator(source: string, start: number, end: number): boolean {
    let before = start - 1;
    while (before >= 0 && (source[before] === ' ' || source[before] === '\t')) {
        before--;
    }
    let after = end;
    while (after < source.length && (source[after] === ' ' || source[after] === '\t')) {
        after++;
    }
    const isOperator = (index: number, minusIsOperator: boolean) => {
        const char = source[index];
        return char === '*' || char === '/' || char === '+' || char === '%' || (char === '-' && minusIsOperator);
    };
    /**
     * Antes do valor: `$a - 16px` é conta, `$a -16px` não chega aqui (o `-` é parte do valor).
     * Depois: `16px - $a` é conta, `16px -$a` é uma lista de dois valores.
     */
    const spaceAfter = (index: number) => source[index + 1] === ' ' || source[index + 1] === '\t';
    return isOperator(before, before < start - 1) || isOperator(after, spaceAfter(after));
}

/** Aspas mais usadas nos valores de objetos do arquivo (`padding: '8px'`); empate fica com a simples. */
export function jsQuote(source: string): string {
    const single = source.match(/:\s*'/g)?.length ?? 0;
    const double = source.match(/:\s*"/g)?.length ?? 0;
    return double > single ? '"' : "'";
}

/**
 * Aspas para uma string dentro de uma expressão do Angular. No `[ngStyle]="{'width.px': 16}"`, as mesmas da chave;
 * no `[style.width.px]="16"`, as que não delimitam o atributo.
 */
export function angularQuote(source: string, finding: Finding): string {
    const afterName = finding.unitSuffix ? source[finding.unitSuffix.endOffset] : undefined;
    if (afterName === "'" || afterName === '"') {
        return afterName;
    }
    const delimiter = /^\]?\s*=\s*(["'])/.exec(source.slice(finding.unitSuffix?.endOffset ?? finding.offset))?.[1]
        ?? delimiterBefore(source, finding.offset);
    return delimiter === "'" ? '"' : "'";
}

/** Aspas que abrem o atributo em volta de `offset` (sem a unidade no nome, não há outra referência). */
function delimiterBefore(source: string, offset: number): string | undefined {
    const equals = source.lastIndexOf('=', offset);
    return /^=\s*(["'])/.exec(source.slice(equals))?.[1];
}
