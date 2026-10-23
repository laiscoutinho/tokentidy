// Encontra valores soltos dentro do VALOR de uma propriedade (ex.: "4px 8px", "1px solid #ccc").
// Não sabe de arquivo nem de PostCSS: recebe só o texto do valor. Assim os parsers de HTML,
// JSX (style={{ margin: '4px 8px' }}) e Angular reaproveitam a mesma análise.

import {
    tokenize,
    isTokenAtKeyword,
    isTokenComma,
    isTokenDelim,
    isTokenDimension,
    isTokenIdent,
    isTokenNumber,
    isTokenOpenCurly,
    isTokenPercentage,
} from '@csstools/css-tokenizer';
import type { CSSToken } from '@csstools/css-tokenizer';
import {
    parseListOfComponentValues,
    isFunctionNode,
    isSimpleBlockNode,
    isTokenNode,
    isWhiteSpaceOrCommentNode,
} from '@csstools/css-parser-algorithms';
import type { ComponentValue, FunctionNode } from '@csstools/css-parser-algorithms';
import { color } from '@csstools/css-color-parser';

import {
    COLOR_EXCEPTIONS,
    FONT_WEIGHT_KEYWORDS,
    IGNORED_FUNCTIONS,
    LENGTH_UNITS,
    MIN_LAYER_Z_INDEX,
    NON_SPECIFIC_FONT_FAMILIES,
    TIME_UNITS,
} from '../rules.ts';
import type { ValueMatcher } from '../rules.ts';
import type { TokenType } from '../types.ts';

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
            visit(nodes, match, report, undefined);
    }
    return results;
}

type Report = (start: number, end: number, extra?: { type?: TokenType; function?: string }) => void;

function visit(nodes: ComponentValue[], match: ValueMatcher, report: Report, fn: string | undefined): void {
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
            // `color-mix()` mistura cores que são decisões separadas: cada uma vira o seu achado
            if (match === 'color' && name === 'color-mix') {
                visit(node.value, match, report, name);
                continue;
            }
            // Função de cor completa (`rgb(0 0 0 / .2)`) vira um valor só
            if (match === 'color' && isLiteralColor(node)) {
                report(...range(node.tokens()), withFunction(fn));
                continue;
            }
            if (match === 'easing' && name === 'cubic-bezier') {
                if (isLiteralCubicBezier(node)) {
                    report(...range(node.tokens()), withFunction(fn));
                }
                continue;
            }
            // Outras funções (calc, gradientes, funções do SCSS): olha os argumentos
            visit(node.value, match, report, name);
            continue;
        }

        if (isSimpleBlockNode(node)) {
            // `{...}` em valor só aparece na interpolação do SCSS (`#{$x * 2}`): é código, não valor
            if (!isTokenOpenCurly(node.startToken)) {
                visit(node.value, match, report, fn);
            }
            continue;
        }

        if (isTokenNode(node) && matchesToken(node.value, node, match)) {
            report(...range([node.value]), withFunction(fn));
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

/** `cubic-bezier()` com os 4 números escritos (sem variável dentro). */
function isLiteralCubicBezier(node: FunctionNode): boolean {
    const numbers = node.value.filter((child) => isTokenNode(child) && isTokenNumber(child.value));
    const others = node.value.filter((child) => !isWhiteSpaceOrCommentNode(child) && !(isTokenNode(child) && (isTokenNumber(child.value) || isTokenComma(child.value))));
    return numbers.length === 4 && others.length === 0;
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

/** Valor que já vem de um token: `var()`, `$var` (SCSS) ou `@var` (Less). */
function isVariable(node: ComponentValue): boolean {
    if (isFunctionNode(node)) {
        return node.getName().toLowerCase() === 'var';
    }
    return isTokenNode(node) && (isTokenAtKeyword(node.value) || (isTokenDelim(node.value) && node.value[4].value === '$'));
}

/**
 * `font-family` é reportada inteira (a lista de fontes é um token só),
 * a menos que use variável ou função, ou só tenha famílias genéricas (`sans-serif`, `inherit`).
 */
function findFontFamily(nodes: ComponentValue[], report: Report, type?: TokenType): void {
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
        report(...range([...first.tokens(), ...last.tokens()]), type ? { type } : undefined);
    }
}

/** Palavras do shorthand `font` antes do tamanho que não são peso: estilo, variante e largura. */
const FONT_PREFIX_KEYWORDS = new Set([
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
function findFontShorthand(nodes: ComponentValue[], report: Report): void {
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
            report(...range([token]), { type: 'font-weight' });
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
        report(...range([size.value]), { type: 'font-size' });
    }
    // `$size` chega em dois pedaços (`$` + `size`)
    i += isTokenNode(size) && isTokenDelim(size.value) && size.value[4].value === '$' ? 2 : 1;

    const slash = content[i];
    if (slash && isTokenNode(slash) && isTokenDelim(slash.value) && slash.value[4].value === '/') {
        const lineHeight = content[i + 1];
        if (lineHeight && isTokenNode(lineHeight) && (isLength(lineHeight.value) || isNonZeroNumber(lineHeight.value))) {
            report(...range([lineHeight.value]), { type: 'line-height' });
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
function findShadow(nodes: ComponentValue[], report: Report): void {
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
        report(...range([...first.tokens(), ...last.tokens()]));
    }
}

function containsVariable(node: ComponentValue): boolean {
    if (isFunctionNode(node) || isSimpleBlockNode(node)) {
        return node.value.some((child) => isVariable(child) || containsVariable(child));
    }
    return false;
}

/** Intervalo [início, fim) de uma sequência de tokens. No tokenizer o fim é inclusivo, por isso o +1. */
function range(tokens: CSSToken[]): [number, number] {
    return [tokens[0]![2], tokens.at(-1)![3] + 1];
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
