/**
 * Tipo de um token escrito à mão pelo nome dele (`--space-4: 16px` → espaçamento).
 * O nome não é palpite: é a equipe declarando o que o token é, como o `$type` do DTCG.
 * Só afirma quando o nome aponta um único tipo e o valor combina com ele; em qualquer dúvida, nada.
 */

import {
    tokenize, isTokenComma, isTokenDimension, isTokenEOF, isTokenFunction, isTokenIdent, isTokenNumber, isTokenString, isTokenWhitespace,
} from '@csstools/css-tokenizer';

import type { TokenType } from '../types.ts';
import { colorInfo } from './color-info.ts';
import { parseShadow, splitFontFamilies } from './normalize.ts';

/**
 * Partes do nome e o tipo que cada uma declara. Os compostos vêm antes e consomem as partes,
 * para `letter-spacing` não contar também como `spacing`. `size` fica de fora de propósito:
 * no Open Props `--size-*` é espaçamento, aqui `size` é o tipo dos elementos quadrados.
 */
const COMPOUNDS: ReadonlyArray<readonly [readonly string[], TokenType]> = [
    [['font', 'size'], 'font-size'],
    [['text', 'size'], 'font-size'],
    [['line', 'height'], 'line-height'],
    [['letter', 'spacing'], 'letter-spacing'],
    [['font', 'weight'], 'font-weight'],
    [['font', 'family'], 'font-family'],
    [['border', 'radius'], 'radius'],
    [['border', 'width'], 'border-width'],
    [['stroke', 'width'], 'border-width'],
    [['z', 'index'], 'z-index'],
];

const WORDS = new Map<string, TokenType>([
    ['space', 'spacing'], ['spaces', 'spacing'], ['spacing', 'spacing'], ['spacer', 'spacing'], ['spacers', 'spacing'],
    ['gap', 'spacing'], ['gutter', 'spacing'], ['inset', 'spacing'], ['stack', 'spacing'],
    ['border', 'border-width'], ['stroke', 'border-width'],
    ['radius', 'radius'], ['radii', 'radius'], ['rounded', 'radius'], ['corner', 'radius'],
    ['fs', 'font-size'], ['text', 'font-size'], ['fontsize', 'font-size'],
    ['leading', 'line-height'], ['lineheight', 'line-height'],
    ['tracking', 'letter-spacing'], ['letterspacing', 'letter-spacing'],
    ['weight', 'font-weight'], ['fontweight', 'font-weight'],
    ['font', 'font-family'], ['family', 'font-family'], ['typeface', 'font-family'],
    ['shadow', 'shadow'], ['shadows', 'shadow'], ['elevation', 'shadow'],
    ['z', 'z-index'], ['zindex', 'z-index'], ['layer', 'z-index'],
    ['opacity', 'opacity'], ['alpha', 'opacity'],
    ['duration', 'duration'],
    ['ease', 'easing'], ['easing', 'easing'],
    ['breakpoint', 'breakpoint'], ['breakpoints', 'breakpoint'], ['bp', 'breakpoint'], ['screen', 'breakpoint'],
    ['container', 'container'],
    ['color', 'color'], ['colour', 'color'],
]);

/** Unidades de comprimento (as relativas ao viewport e `%` não são decisões de escala: ficam de fora). */
const LENGTH_UNITS = new Set(['px', 'rem', 'em', 'pt', 'ch', 'ex', 'pc', 'cm', 'mm', 'in', 'q']);
const WEIGHT_KEYWORDS = new Set(['normal', 'bold', 'lighter', 'bolder']);
const EASING_KEYWORDS = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end']);
const EASING_FUNCTIONS = new Set(['cubic-bezier', 'steps', 'linear']);

/** Partes do nome em minúsculas: sem prefixo, separado por `-`, `_`, `.` e camelCase (`--fontSize-md` → `font size md`). */
export function nameParts(name: string): string[] {
    return name
        .replace(/^(--|\$|@)/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .split(/[-_.\s]+/)
        .map((part) => part.toLowerCase())
        .filter(Boolean);
}

/** Tipos que o nome declara (vazio, um ou mais: mais de um é ambíguo). */
export function typesInName(name: string): Set<TokenType> {
    const parts = nameParts(name);
    const used = new Array<boolean>(parts.length).fill(false);
    const types = new Set<TokenType>();
    for (const [words, type] of COMPOUNDS) {
        for (let i = 0; i + words.length <= parts.length; i++) {
            if (words.every((word, j) => parts[i + j] === word && !used[i + j])) {
                types.add(type);
                words.forEach((_, j) => { used[i + j] = true; });
            }
        }
    }
    parts.forEach((part, i) => {
        const type = used[i] ? undefined : WORDS.get(part);
        if (type) {
            types.add(type);
        }
    });
    return types;
}

/**
 * Tipo de um token pelo nome, se o nome apontar um só tipo e o valor combinar com ele.
 * `--space-4: 16px` → `spacing`; `--card-16: 16px` (nome sem tipo) e `--space-x: #fff` (valor que não combina) → nada.
 */
export function typeFromName(name: string, value: string): TokenType | undefined {
    const types = typesInName(name);
    if (types.size !== 1) {
        return undefined;
    }
    const [type] = types as unknown as [TokenType];
    return fits(type, value) ? type : undefined;
}

/** O valor tem a forma que o tipo pede. */
function fits(type: TokenType, value: string): boolean {
    switch (type) {
        case 'spacing':
        case 'radius':
        case 'font-size':
        case 'letter-spacing':
        case 'border-width':
        case 'breakpoint':
        case 'container':
        case 'size':
            return single(value, (t) => isTokenDimension(t) && LENGTH_UNITS.has(t[4].unit.toLowerCase()));
        case 'line-height':
            return single(value, (t) => isTokenNumber(t) || (isTokenDimension(t) && LENGTH_UNITS.has(t[4].unit.toLowerCase())));
        case 'font-weight':
            return single(value, (t) => (isTokenNumber(t) && t[4].value >= 1 && t[4].value <= 1000)
                || (isTokenIdent(t) && WEIGHT_KEYWORDS.has(t[4].value.toLowerCase())));
        case 'z-index':
            return single(value, (t) => isTokenNumber(t) && Number.isInteger(t[4].value));
        case 'opacity':
            return single(value, (t) => isTokenNumber(t) && t[4].value >= 0 && t[4].value <= 1);
        case 'duration':
            return single(value, (t) => isTokenDimension(t) && ['ms', 's'].includes(t[4].unit.toLowerCase()));
        case 'easing':
            return single(value, (t) => isTokenIdent(t) && EASING_KEYWORDS.has(t[4].value.toLowerCase()))
                || startsWithFunction(value, EASING_FUNCTIONS);
        case 'shadow':
            return parseShadow(value) !== undefined;
        case 'font-family':
            return fontList(value);
        case 'color':
            return colorInfo(value) !== undefined;
    }
}

type Token = ReturnType<typeof tokenize>[number];

/** O valor é um único token CSS que passa no teste. */
function single(value: string, test: (token: Token) => boolean): boolean {
    const tokens = tokenize({ css: value }).filter((t) => !isTokenWhitespace(t) && !isTokenEOF(t));
    return tokens.length === 1 && test(tokens[0]!);
}

/** Lista de fontes: só nomes, textos entre aspas e vírgulas, e não é uma cor (`black`). */
function fontList(value: string): boolean {
    const tokens = tokenize({ css: value }).filter((t) => !isTokenWhitespace(t) && !isTokenEOF(t));
    return tokens.length > 0
        && tokens.every((t) => isTokenIdent(t) || isTokenString(t) || isTokenComma(t))
        && splitFontFamilies(value).length > 0
        && colorInfo(value) === undefined;
}

function startsWithFunction(value: string, names: ReadonlySet<string>): boolean {
    const first = tokenize({ css: value.trim() })[0];
    return first !== undefined && isTokenFunction(first) && names.has(first[4].value.toLowerCase());
}
