// Encontra valores soltos dentro do VALOR de uma propriedade (ex.: "4px 8px", "1px solid #ccc").
// Não sabe de arquivo nem de PostCSS: recebe só o texto do valor. Assim o parser de JSX
// (style={{ margin: '4px 8px' }}) e o de Angular reaproveitam a mesma análise.

import { tokenize, isTokenDelim, isTokenDimension, isTokenIdent, isTokenNumber, isTokenOpenCurly } from '@csstools/css-tokenizer';
import type { CSSToken } from '@csstools/css-tokenizer';
import {
    parseListOfComponentValues,
    isFunctionNode,
    isSimpleBlockNode,
    isTokenNode,
    isWhiteSpaceOrCommentNode,
} from '@csstools/css-parser-algorithms';
import type { ComponentValue } from '@csstools/css-parser-algorithms';
import { color } from '@csstools/css-color-parser';

import {
    COLOR_EXCEPTIONS,
    FONT_WEIGHT_KEYWORDS,
    IGNORED_FUNCTIONS,
    LENGTH_UNITS,
    NON_SPECIFIC_FONT_FAMILIES,
} from '../rules.ts';
import type { ValueMatcher } from '../rules.ts';

/** Trecho do valor que é uma violação. `start`/`end` são relativos ao texto do valor (`end` exclusivo). */
export interface ValueMatch {
    start: number;
    end: number;
    text: string;
}

/** Procura, no texto de um valor CSS, os trechos do tipo pedido. Aceita sintaxe SCSS (`$var`, `#{}`, `math.div()`). */
export function findValues(value: string, match: ValueMatcher): ValueMatch[] {
    const nodes = parseListOfComponentValues(tokenize({ css: value }));

    if (match === 'font-family') {
        return findFontFamily(value, nodes);
    }

    const results: ValueMatch[] = [];
    visit(nodes, match, (start, end) => results.push({ start, end, text: value.slice(start, end) }));
    return results;
}

type Report = (start: number, end: number) => void;

function visit(nodes: ComponentValue[], match: ValueMatcher, report: Report): void {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;

        // SCSS: `$cor` chega como `$` + `cor`. A variável já é um token, então pula o nome
        // (sem isso, `$red` seria lido como a cor `red`).
        if (isScssVariableName(nodes, i)) {
            continue;
        }

        if (isFunctionNode(node)) {
            const name = node.getName().toLowerCase();
            if (IGNORED_FUNCTIONS.has(name)) {
                continue;
            }
            // Função de cor completa (`rgb(0 0 0 / .2)`, `color-mix(...)`) vira um valor só
            if (match === 'color' && isLiteralColor(node)) {
                report(...range(node.tokens()));
                continue;
            }
            // Outras funções (calc, gradientes, funções do SCSS): olha os argumentos
            visit(node.value, match, report);
            continue;
        }

        if (isSimpleBlockNode(node)) {
            // `{...}` em valor só aparece na interpolação do SCSS (`#{$x * 2}`): é código, não valor
            if (!isTokenOpenCurly(node.startToken)) {
                visit(node.value, match, report);
            }
            continue;
        }

        if (isTokenNode(node) && matchesToken(node.value, node, match)) {
            report(...range([node.value]));
        }
    }
}

function matchesToken(token: CSSToken, node: ComponentValue, match: ValueMatcher): boolean {
    switch (match) {
        case 'color':
            return isLiteralColor(node);
        case 'length':
            return isLength(token);
        case 'line-height':
            return isLength(token) || isNonZeroNumber(token);
        case 'font-weight':
            return isNonZeroNumber(token) || isWeightKeyword(token);
        case 'font':
            return isLength(token) || isNonZeroNumber(token) || isWeightKeyword(token);
        case 'font-family':
            return false;
    }
}

function isLiteralColor(node: ComponentValue): boolean {
    if (isTokenNode(node) && isTokenIdent(node.value) && COLOR_EXCEPTIONS.has(node.value[4].value.toLowerCase())) {
        return false;
    }
    return color(node) !== false;
}

function isLength(token: CSSToken): boolean {
    return isTokenDimension(token) && token[4].value !== 0 && LENGTH_UNITS.has(token[4].unit.toLowerCase());
}

function isNonZeroNumber(token: CSSToken): boolean {
    return isTokenNumber(token) && token[4].value !== 0;
}

function isWeightKeyword(token: CSSToken): boolean {
    return isTokenIdent(token) && FONT_WEIGHT_KEYWORDS.has(token[4].value.toLowerCase());
}

function isScssVariableName(nodes: ComponentValue[], i: number): boolean {
    const node = nodes[i];
    const previous = nodes[i - 1];
    if (!node || !previous || !isTokenNode(previous) || !isTokenDelim(previous.value) || previous.value[4].value !== '$') {
        return false;
    }
    // Colado no `$` (sem espaço): `$cor` é variável, `$ cor` não é
    const first = node.tokens()[0];
    return first !== undefined && first[2] === previous.value[3] + 1;
}

/**
 * `font-family` é reportada inteira (a lista de fontes é um token só),
 * a menos que use variável ou função, ou só tenha famílias genéricas (`sans-serif`, `inherit`).
 */
function findFontFamily(value: string, nodes: ComponentValue[]): ValueMatch[] {
    const content = nodes.filter((node) => !isWhiteSpaceOrCommentNode(node));
    let hasSpecificFamily = false;

    for (const node of content) {
        if (!isTokenNode(node)) {
            return []; // função (var(), funções do SCSS...)
        }
        const token = node.value;
        if (isTokenDelim(token) && token[4].value === '$') {
            return [];
        }
        if (isTokenIdent(token) && NON_SPECIFIC_FONT_FAMILIES.has(token[4].value.toLowerCase())) {
            continue;
        }
        if (!isTokenDelim(token) && token[0] !== 'comma-token') {
            hasSpecificFamily = true;
        }
    }

    const first = content[0];
    const last = content.at(-1);
    if (!hasSpecificFamily || !first || !last) {
        return [];
    }
    const [start, end] = range([...first.tokens(), ...last.tokens()]);
    return [{ start, end, text: value.slice(start, end) }];
}

/** Intervalo [início, fim) de uma sequência de tokens. No tokenizer o fim é inclusivo, por isso o +1. */
function range(tokens: CSSToken[]): [number, number] {
    return [tokens[0]![2], tokens.at(-1)![3] + 1];
}
