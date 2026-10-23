/** Perguntas sobre os tokens e nós do tokenizer de CSS (é cor? é medida? é variável?), usadas por toda a análise de valores. */

import { isTokenAtKeyword, isTokenComma, isTokenDelim, isTokenDimension, isTokenIdent, isTokenNumber } from '@csstools/css-tokenizer';
import type { CSSToken } from '@csstools/css-tokenizer';
import { isFunctionNode, isSimpleBlockNode, isTokenNode, isWhiteSpaceOrCommentNode } from '@csstools/css-parser-algorithms';
import type { ComponentValue, FunctionNode } from '@csstools/css-parser-algorithms';
import { color } from '@csstools/css-color-parser';

import { COLOR_EXCEPTIONS, FONT_WEIGHT_KEYWORDS, LENGTH_UNITS } from '../../analysis/rules.ts';
import type { TokenType } from '../../types.ts';

/** Registra um trecho encontrado: [início, fim) relativo ao texto do valor. */
export type Report = (start: number, end: number, extra?: { type?: TokenType; function?: string }) => void;

export function isLiteralColor(node: ComponentValue): boolean {
    if (isTokenNode(node) && isTokenIdent(node.value) && COLOR_EXCEPTIONS.has(node.value[4].value.toLowerCase())) {
        return false;
    }
    return color(node) !== false;
}

export function isLength(token: CSSToken): boolean {
    return isTokenDimension(token) && token[4].value !== 0 && LENGTH_UNITS.has(token[4].unit.toLowerCase());
}

export function isNonZeroNumber(token: CSSToken): boolean {
    return isTokenNumber(token) && token[4].value !== 0;
}

export function isWeightKeyword(token: CSSToken): boolean {
    return isTokenIdent(token) && FONT_WEIGHT_KEYWORDS.has(token[4].value.toLowerCase());
}

/** `cubic-bezier()` com os 4 números escritos (sem variável dentro). */
export function isLiteralCubicBezier(node: FunctionNode): boolean {
    const numbers = node.value.filter((child) => isTokenNode(child) && isTokenNumber(child.value));
    const others = node.value.filter((child) => !isWhiteSpaceOrCommentNode(child) && !(isTokenNode(child) && (isTokenNumber(child.value) || isTokenComma(child.value))));
    return numbers.length === 4 && others.length === 0;
}

export function isScssVariableName(nodes: ComponentValue[], i: number): boolean {
    const node = nodes[i];
    const previous = nodes[i - 1];
    if (!node || !previous || !isTokenNode(previous) || !isTokenDelim(previous.value) || previous.value[4].value !== '$') {
        return false;
    }
    // Colado no `$` (sem espaço): `$cor` é variável, `$ cor` não é
    const first = node.tokens()[0];
    return first !== undefined && first[2] === previous.value[3] + 1;
}

/** Valor que já vem de um token: `var()`, `$var` (SCSS) ou `@var` (Less). */
export function isVariable(node: ComponentValue): boolean {
    if (isFunctionNode(node)) {
        return node.getName().toLowerCase() === 'var';
    }
    return isTokenNode(node) && (isTokenAtKeyword(node.value) || (isTokenDelim(node.value) && node.value[4].value === '$'));
}

export function containsVariable(node: ComponentValue): boolean {
    if (isFunctionNode(node) || isSimpleBlockNode(node)) {
        return node.value.some((child) => isVariable(child) || containsVariable(child));
    }
    return false;
}

/** Intervalo [início, fim) de uma sequência de tokens. No tokenizer o fim é inclusivo, por isso o +1. */
export function sourceRangeOf(tokens: CSSToken[]): [number, number] {
    return [tokens[0]![2], tokens.at(-1)![3] + 1];
}
