/**
 * Valores reportados inteiros: a lista de `font-family`, as partes do shorthand `font`
 * e as sombras (deslocamento, desfoque e cor formam uma decisão só).
 */

import { isTokenComma, isTokenDelim, isTokenIdent } from '@csstools/css-tokenizer';
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
    let i = 0;

    // Antes do tamanho: palavras de estilo e o peso
    for (; i < content.length; i++) {
        const node = content[i]!;
        if (!isTokenNode(node)) {
            break;
        }
        const token = node.value;
        if (isNonZeroNumber(token) || isWeightKeyword(token)) {
            report(...sourceRangeOf([token]), { type: 'font-weight' });
            continue;
        }
        if (isTokenIdent(token) && FONT_PREFIX_KEYWORDS.has(token[4].value.toLowerCase())) {
            continue;
        }
        break;
    }

    // Tamanho: o primeiro item que não é estilo nem peso (pode ser variável: `$size`)
    const size = content[i];
    if (!size) {
        return;
    }
    if (isTokenNode(size) && isLength(size.value)) {
        report(...sourceRangeOf([size.value]), { type: 'font-size' });
    }
    // `$size` chega em dois pedaços (`$` + `size`)
    i += isTokenNode(size) && isTokenDelim(size.value) && size.value[4].value === '$' ? 2 : 1;

    const slash = content[i];
    if (slash && isTokenNode(slash) && isTokenDelim(slash.value) && slash.value[4].value === '/') {
        const lineHeight = content[i + 1];
        if (lineHeight && isTokenNode(lineHeight) && (isLength(lineHeight.value) || isNonZeroNumber(lineHeight.value))) {
            report(...sourceRangeOf([lineHeight.value]), { type: 'line-height' });
        }
        i += 2;
        if (lineHeight && isTokenNode(lineHeight) && isTokenDelim(lineHeight.value) && lineHeight.value[4].value === '$') {
            i++;
        }
    }

    findFontFamily(content.slice(i), report, 'font-family');
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
