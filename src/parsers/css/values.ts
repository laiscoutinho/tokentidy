/**
 * Encontra valores soltos dentro do VALOR de uma propriedade (ex.: "4px 8px", "1px solid #ccc").
 * Não sabe de arquivo nem de PostCSS: recebe só o texto do valor. Assim os parsers de HTML,
 * JSX (style={{ margin: '4px 8px' }}) e Angular reaproveitam a mesma análise.
 */

import { tokenize, isTokenAtKeyword, isTokenDimension, isTokenIdent, isTokenNumber, isTokenOpenCurly, isTokenPercentage } from '@csstools/css-tokenizer';
import type { CSSToken } from '@csstools/css-tokenizer';
import { parseListOfComponentValues, isFunctionNode, isSimpleBlockNode, isTokenNode, isWhiteSpaceOrCommentNode } from '@csstools/css-parser-algorithms';
import type { ComponentValue } from '@csstools/css-parser-algorithms';

import { IGNORED_FUNCTIONS, MIN_LAYER_Z_INDEX, TIME_UNITS } from '../../analysis/rules.ts';
import type { ValueMatcher } from '../../analysis/rules.ts';
import type { TokenType } from '../../types.ts';
import { findFontFamily, findFontShorthand, findShadow } from './font-and-shadow.ts';
import { isLength, isLiteralColor, isLiteralCubicBezier, isNonZeroNumber, isScssVariableName, isWeightKeyword, sourceRangeOf } from './value-tokens.ts';
import type { Report } from './value-tokens.ts';

/** Trecho do valor que é uma violação. `start`/`end` são relativos ao texto do valor (`end` exclusivo). */
export interface ValueMatch {
    start: number;
    end: number;
    text: string;
    /** Tipo de token decidido pela posição (só no shorthand `font`); sem ele, vale o tipo da regra. */
    type?: TokenType;
    /** Função mais interna em volta do valor (`calc`, `darken`). */
    function?: string;
}

/** Procura, no texto de um valor CSS, os trechos do tipo pedido. Aceita sintaxe SCSS (`$var`, `#{}`, `math.div()`) e Less (`@var`). */
export function findValues(value: string, match: ValueMatcher): ValueMatch[] {
    const nodes = parseListOfComponentValues(tokenize({ css: value }));
    const results: ValueMatch[] = [];
    const report: Report = (start, end, extra) => results.push({ start, end, text: value.slice(start, end), ...extra });

    switch (match) {
        case 'font-family':
            findFontFamily(nodes, report);
            break;
        case 'font':
            findFontShorthand(nodes, report);
            break;
        case 'shadow':
            findShadow(nodes, report);
            break;
        default:
            findInNodes(nodes, match, report, undefined);
    }
    return results;
}

function findInNodes(nodes: ComponentValue[], match: ValueMatcher, report: Report, fn: string | undefined): void {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;

        /**
         * SCSS: `$cor` chega como `$` + `cor`. A variável já é um token, então pula o nome
         * (sem isso, `$red` seria lido como a cor `red`).
         */
        if (isScssVariableName(nodes, i)) {
            continue;
        }

        if (isFunctionNode(node)) {
            const name = node.getName().toLowerCase();
            if (IGNORED_FUNCTIONS.has(name)) {
                continue;
            }
            // `color-mix()` mistura cores que são decisões separadas: cada uma vira o seu achado
            if (match === 'color' && name === 'color-mix') {
                findInNodes(node.value, match, report, name);
                continue;
            }
            // Função de cor completa (`rgb(0 0 0 / .2)`) vira um valor só
            if (match === 'color' && isLiteralColor(node)) {
                report(...sourceRangeOf(node.tokens()), withFunction(fn));
                continue;
            }
            if (match === 'easing' && name === 'cubic-bezier') {
                if (isLiteralCubicBezier(node)) {
                    report(...sourceRangeOf(node.tokens()), withFunction(fn));
                }
                continue;
            }
            // Outras funções (calc, gradientes, funções do SCSS): olha os argumentos
            findInNodes(node.value, match, report, name);
            continue;
        }

        if (isSimpleBlockNode(node)) {
            // `{...}` em valor só aparece na interpolação do SCSS (`#{$x * 2}`): é código, não valor
            if (!isTokenOpenCurly(node.startToken)) {
                findInNodes(node.value, match, report, fn);
            }
            continue;
        }

        if (isTokenNode(node) && matchesToken(node.value, node, match)) {
            report(...sourceRangeOf([node.value]), withFunction(fn));
        }
    }
}

function withFunction(fn: string | undefined): { function?: string } {
    return fn === undefined ? {} : { function: fn };
}

function matchesToken(token: CSSToken, node: ComponentValue, match: ValueMatcher): boolean {
    switch (match) {
        case 'color':
            return isLiteralColor(node);
        case 'length':
            return isLength(token);
        case 'radius':
            return isLength(token) || (isTokenPercentage(token) && token[4].value > 0);
        case 'line-height':
            return isLength(token) || isNonZeroNumber(token);
        case 'font-weight':
            return isNonZeroNumber(token) || isWeightKeyword(token);
        case 'opacity':
            return (isTokenNumber(token) && token[4].value > 0 && token[4].value < 1)
                || (isTokenPercentage(token) && token[4].value > 0 && token[4].value < 100);
        case 'duration':
            return isTokenDimension(token) && token[4].value > 0 && TIME_UNITS.has(token[4].unit.toLowerCase());
        case 'z-index':
            return isTokenNumber(token) && token[4].type === 'integer' && Math.abs(token[4].value) >= MIN_LAYER_Z_INDEX;
        case 'easing':
        case 'font':
        case 'font-family':
        case 'shadow':
            return false;
    }
}

/**
 * Tokens usados no valor: `var(--x)` → `--x`, `$x` (SCSS/Sass) → `$x`, `@x` (Less) → `@x`.
 * Serve para saber onde cada token existente é usado (e sugerir um nome que descreva esse uso).
 */
export function findReferences(value: string): string[] {
    const names: string[] = [];
    collectReferences(parseListOfComponentValues(tokenize({ css: value })), names);
    return names;
}

function collectReferences(nodes: ComponentValue[], names: string[]): void {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        if (isFunctionNode(node)) {
            const first = node.value.find((child) => !isWhiteSpaceOrCommentNode(child));
            if (node.getName().toLowerCase() === 'var' && first && isTokenNode(first) && isTokenIdent(first.value)) {
                names.push(first.value[4].value);
            }
            collectReferences(node.value, names);
        } else if (isSimpleBlockNode(node)) {
            collectReferences(node.value, names);
        } else if (isTokenNode(node) && isTokenAtKeyword(node.value)) {
            names.push(`@${node.value[4].value}`);
        } else if (isScssVariableName(nodes, i) && isTokenNode(node) && isTokenIdent(node.value)) {
            names.push(`$${node.value[4].value}`);
        }
    }
}
