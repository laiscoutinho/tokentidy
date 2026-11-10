/**
 * Valores reportados inteiros: a lista de `font-family`, as partes do shorthand `font`
 * e as sombras (deslocamento, desfoque e cor formam uma decisão só).
 */

import { isTokenComma, isTokenDelim, isTokenIdent, isTokenString } from '@csstools/css-tokenizer';
import { isFunctionNode, isTokenNode, isWhiteSpaceOrCommentNode } from '@csstools/css-parser-algorithms';
import type { ComponentValue } from '@csstools/css-parser-algorithms';

import { NON_SPECIFIC_FONT_FAMILIES } from '../../analysis/rules.ts';
import type { TokenType } from '../../types.ts';
import { containsVariable, isLength, isLiteralColor, isNonZeroNumber, isVariable, isWeightKeyword, sourceRangeOf } from './value-tokens.ts';
import type { Report } from './value-tokens.ts';

/**
 * `font-family` é reportada inteira (a lista de fontes é um token só),
 * a menos que use variável ou função, ou só tenha famílias genéricas (`sans-serif`, `inherit`).
 */
export function findFontFamily(nodes: ComponentValue[], report: Report, type?: TokenType): void {
    const content = nodes.filter((node) => !isWhiteSpaceOrCommentNode(node));
    let hasSpecificFamily = false;

    for (const node of content) {
        if (!isTokenNode(node) || isVariable(node)) {
            return; // função (var(), funções do SCSS...) ou variável
        }
        const token = node.value;
        if (isTokenIdent(token) && NON_SPECIFIC_FONT_FAMILIES.has(token[4].value.toLowerCase())) {
            continue;
        }
        if (!isTokenDelim(token) && !isTokenComma(token)) {
            hasSpecificFamily = true;
        }
    }

    const first = content[0];
    const last = content.at(-1);
    if (hasSpecificFamily && first && last) {
        report(...sourceRangeOf([...first.tokens(), ...last.tokens()]), type ? { type } : undefined);
    }
}

/** Palavras do shorthand `font` antes do tamanho que não são peso: estilo, variante e largura. */
export const FONT_PREFIX_KEYWORDS = new Set([
    'normal', 'italic', 'oblique', 'small-caps',
    'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed',
    'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded',
    'bolder', 'lighter',
]);

/**
 * Shorthand `font: [estilo] [peso] tamanho[/altura-de-linha] família`.
 * O CSS define a ordem: o que vem antes do tamanho é estilo/peso; depois da `/`, altura de linha;
 * o resto é a família. Cada parte vira o seu tipo de token, como se estivesse na propriedade própria.
 * `font: caption` (fonte do sistema) não tem tamanho e não é reportado.
 */
export function findFontShorthand(nodes: ComponentValue[], report: Report): void {
    const content = nodes.filter((node) => !isWhiteSpaceOrCommentNode(node));
    const size = sizeIndex(content);
    if (size === undefined) {
        return;
    }

    // Antes do tamanho: estilo e peso. Uma variável ali (`var(--peso)`, depois de um `fix`) só ocupa o lugar
    for (let i = 0; i < size; i++) {
        const node = content[i]!;
        if (isTokenNode(node) && !isDollar(content[i - 1]) && (isNonZeroNumber(node.value) || isWeightKeyword(node.value))) {
            report(...sourceRangeOf([node.value]), { type: 'font-weight' });
        }
    }

    const sizeNode = content[size]!;
    if (isTokenNode(sizeNode) && isLength(sizeNode.value)) {
        report(...sourceRangeOf([sizeNode.value]), { type: 'font-size' });
    }
    let i = size + (isDollar(sizeNode) ? 2 : 1);

    if (isSlash(content[i])) {
        const lineHeight = content[i + 1];
        if (lineHeight && isTokenNode(lineHeight) && (isLength(lineHeight.value) || isNonZeroNumber(lineHeight.value))) {
            report(...sourceRangeOf([lineHeight.value]), { type: 'line-height' });
        }
        i += isDollar(lineHeight) ? 3 : 2;
    }

    findFontFamily(content.slice(i), report, 'font-family');
}

const isDollar = (node: ComponentValue | undefined) => node !== undefined && isTokenNode(node) && isTokenDelim(node.value) && node.value[4].value === '$';
const isSlash = (node: ComponentValue | undefined) => node !== undefined && isTokenNode(node) && isTokenDelim(node.value) && node.value[4].value === '/';

/**
 * Onde está o tamanho, pela estrutura e não pela posição: o item antes da `/`; sem ela, o primeiro comprimento;
 * sem comprimento, o item antes da família. `$x` ocupa dois nós (`$` + `x`) e conta pelo `$`.
 */
function sizeIndex(content: readonly ComponentValue[]): number | undefined {
    const slash = content.findIndex(isSlash);
    if (slash > 0) {
        return isDollar(content[slash - 2]) ? slash - 2 : slash - 1;
    }
    const length = content.findIndex((node) => isTokenNode(node) && isLength(node.value));
    if (length >= 0) {
        return length;
    }
    // A família começa no primeiro nome que não é estilo nem peso (`font: caption` não tem tamanho)
    const family = content.findIndex((node, i) => isTokenNode(node) && !isDollar(content[i - 1])
        && ((isTokenIdent(node.value) && !FONT_PREFIX_KEYWORDS.has(node.value[4].value.toLowerCase()) && !isWeightKeyword(node.value))
            || isTokenString(node.value)));
    if (family <= 0) {
        return undefined;
    }
    return isDollar(content[family - 2]) ? family - 2 : family - 1;
}

/**
 * Sombra (`box-shadow`, `text-shadow`) reportada inteira, com todas as camadas: deslocamento, desfoque
 * e cor formam uma decisão só. Com variável em qualquer parte, o valor já depende de token e não é reportado.
 */
export function findShadow(nodes: ComponentValue[], report: Report): void {
    const content = nodes.filter((node) => !isWhiteSpaceOrCommentNode(node));
    let hasLiteral = false;
    for (const node of content) {
        if (isVariable(node) || containsVariable(node)) {
            return;
        }
        if (isFunctionNode(node)) {
            if (!isLiteralColor(node)) {
                return; // função do SCSS ou outra função que não é cor
            }
            hasLiteral = true;
            continue;
        }
        if (isTokenNode(node) && (isLength(node.value) || isLiteralColor(node))) {
            hasLiteral = true;
        }
    }
    const first = content[0];
    const last = content.at(-1);
    if (hasLiteral && first && last) {
        report(...sourceRangeOf([...first.tokens(), ...last.tokens()]));
    }
}
