// Normalização: escreve cada valor de um jeito único, para que grafias diferentes do mesmo
// valor (`#FFF`, `white`, `rgb(255,255,255)`) caiam na mesma chave.
// Regra de ouro: só junta o que é EXATAMENTE igual para o navegador. Nada de "parecido":
// - `15px` e `16px` nunca se juntam (a diferença pode ser intencional);
// - `16px` e `1rem` nunca se juntam: `rem` acompanha a fonte do usuário e `px` não. Viram sugestão, não grupo;
// - `pt` → `px` se junta, porque a conversão é fixa no CSS (1pt = 4/3 px), não depende de nada.

import { tokenize, isTokenDimension, isTokenIdent, isTokenNumber, isTokenPercentage, isTokenWhitespace } from '@csstools/css-tokenizer';
import type { CSSToken } from '@csstools/css-tokenizer';
import {
    isFunctionNode, isTokenNode, isWhiteSpaceOrCommentNode, parseCommaSeparatedListOfComponentValues, parseComponentValue,
} from '@csstools/css-parser-algorithms';
import { color, colorDataFitsRGB_Gamut, serializeOKLCH, serializeRGB } from '@csstools/css-color-parser';
import type { ColorData } from '@csstools/css-color-parser';

import type { Finding, TokenType } from '../types.ts';

/** Fonte raiz padrão dos navegadores: `1rem` = 16px quando o projeto não muda `html { font-size }`. */
export const DEFAULT_ROOT_FONT_SIZE = 16;

/** Chave de um achado: o valor normalizado, com a unidade implícita do host (`padding: 8` no React = `8px`). */
export function normalizeFinding(finding: Pick<Finding, 'type' | 'value' | 'impliedUnit'>): string {
    return normalizeValue(finding.type, finding.impliedUnit ? `${finding.value}${finding.impliedUnit}` : finding.value);
}

/** Devolve a forma canônica de um valor, usada como chave para agrupar. */
export function normalizeValue(type: TokenType, value: string): string {
    switch (type) {
        case 'color':
            return normalizeColor(value);
        case 'font-family':
            return normalizeFontFamily(value);
        case 'font-weight':
            return normalizeFontWeight(value);
        case 'shadow':
            return normalizeShadow(value);
        case 'easing':
            return normalizeEasing(value);
        case 'opacity':
            return normalizeOpacity(value);
        case 'duration':
            return normalizeDuration(value);
        case 'spacing': {
            // Margem negativa (`-8px`) é a mesma decisão de espaçamento que `8px`, só aplicada ao contrário:
            // o token é `8px` e o uso vira `calc(-1 * var(--spacing-2))`
            const key = normalizeNumeric(value);
            return key.startsWith('-') ? key.slice(1) : key;
        }
        default:
            return normalizeNumeric(value);
    }
}

// ─── Cores ──────────────────────────────────────────────────────────────────

/** Cor como o projeto a interpretaria: canais sRGB (0–255), opacidade e coordenadas OKLCH. */
export interface ColorInfo {
    /** `#rrggbb` ou `#rrggbbaa`; ausente quando a cor está fora do sRGB. */
    hex?: string;
    /** sRGB de 0 a 1, para o DTCG. */
    srgb: [number, number, number];
    alpha: number;
    /** OKLCH: luminosidade (0–1), croma e matiz em graus (`NaN` em cinzas). Base para dar nome à cor. */
    oklch: [number, number, number];
    /** Fora do sRGB (ex.: `oklch()` muito saturado): o valor fica em `oklch()` para não perder precisão. */
    wideGamut: boolean;
}

function parseColorData(value: string): ColorData | undefined {
    const node = parseComponentValue(tokenize({ css: value.trim() }));
    return (node && color(node)) || undefined;
}

/** Interpreta uma cor CSS. `undefined` se não for uma cor fixa (`currentColor`, `var()`). */
export function colorInfo(value: string): ColorInfo | undefined {
    const data = parseColorData(value);
    if (!data) {
        return undefined;
    }
    const rgb = numbersIn(serializeRGB(data).toString());
    const oklch = numbersIn(serializeOKLCH(data).toString());
    const alpha = Math.round(Math.min(1, Math.max(0, Number.isFinite(data.alpha) ? (data.alpha as number) : 1)) * 1000) / 1000;
    const wideGamut = !colorDataFitsRGB_Gamut(data);
    const channels = [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0] as const;
    const info: ColorInfo = {
        srgb: [channels[0] / 255, channels[1] / 255, channels[2] / 255],
        alpha,
        oklch: [oklch[0] ?? 0, oklch[1] ?? 0, oklch[2] ?? Number.NaN],
        wideGamut,
    };
    if (!wideGamut) {
        const hex = channels.map((c) => c.toString(16).padStart(2, '0')).join('');
        // Opacidade em hex tem 256 níveis: arredonda para o mais próximo, como o navegador
        info.hex = alpha < 1 ? `#${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : `#${hex}`;
    }
    return info;
}

/** Números de uma cor serializada (`rgb(255, 0, 0)`, `oklch(0.6 0.2 30 / 0.5)`); `NaN` vira NaN. */
function numbersIn(serialized: string): number[] {
    return (serialized.match(/-?[\d.]+(?:e-?\d+)?|NaN/gi) ?? []).map(Number);
}

/**
 * Cor no sRGB vira hex completo em minúsculas (`#FFF`, `white` e `rgb(255 255 255)` → `#ffffff`):
 * é a grafia mais comum em projetos e a que o DTCG usa no campo `hex`.
 * Cor fora do sRGB vira `oklch()`, para não perder precisão.
 */
function normalizeColor(value: string): string {
    const data = parseColorData(value);
    if (!data) {
        return value.trim().toLowerCase();
    }
    const info = colorInfo(value)!;
    return info.hex ?? serializeOKLCH(data).toString();
}

// ─── Tipografia ─────────────────────────────────────────────────────────────

/** Lista de fontes: sem aspas, sem espaços extras e em minúsculas (`"Inter", Arial` → `inter, arial`). */
function normalizeFontFamily(value: string): string {
    return splitFontFamilies(value).map((family) => family.toLowerCase()).join(', ');
}

/** `"Inter", Arial, sans-serif` → `['Inter', 'Arial', 'sans-serif']`. */
export function splitFontFamilies(value: string): string[] {
    return value
        .split(',')
        .map((family) => family.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' '))
        .filter(Boolean);
}

/** `normal` e `400` são o mesmo peso; `bold` e `700` também (definição do CSS). */
function normalizeFontWeight(value: string): string {
    const keyword = value.trim().toLowerCase();
    if (keyword === 'normal') {
        return '400';
    }
    if (keyword === 'bold') {
        return '700';
    }
    return normalizeNumeric(value);
}

// ─── Medidas e números ──────────────────────────────────────────────────────

/** Formata um número sem ruído de ponto flutuante (`10.666666666` → `10.6667`). */
export function formatNumber(n: number): string {
    return String(Math.round(n * 10000) / 10000);
}

function firstToken(value: string): CSSToken | undefined {
    return tokenize({ css: value }).find((t) => !isTokenWhitespace(t));
}

/** Medida ou número: `12.0PX` → `12px`, `.5rem` → `0.5rem`, `12pt` → `16px`, `50.0%` → `50%`. */
function normalizeNumeric(value: string): string {
    const token = firstToken(value);
    if (token && isTokenDimension(token)) {
        const unit = token[4].unit.toLowerCase();
        // 1pt = 1/72 in = 4/3 px: conversão fixa da especificação do CSS, igual em qualquer tela
        return unit === 'pt' ? `${formatNumber((token[4].value * 4) / 3)}px` : `${formatNumber(token[4].value)}${unit}`;
    }
    if (token && isTokenPercentage(token)) {
        return `${formatNumber(token[4].value)}%`;
    }
    if (token && isTokenNumber(token)) {
        return formatNumber(token[4].value);
    }
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** `50%` e `0.5` são a mesma opacidade. */
function normalizeOpacity(value: string): string {
    const token = firstToken(value);
    if (token && isTokenPercentage(token)) {
        return formatNumber(token[4].value / 100);
    }
    return normalizeNumeric(value);
}

/** `0.2s` e `200ms` são a mesma duração; a chave fica sempre em `ms`. */
function normalizeDuration(value: string): string {
    const token = firstToken(value);
    if (token && isTokenDimension(token)) {
        const unit = token[4].unit.toLowerCase();
        if (unit === 's') {
            return `${formatNumber(token[4].value * 1000)}ms`;
        }
        if (unit === 'ms') {
            return `${formatNumber(token[4].value)}ms`;
        }
    }
    return normalizeNumeric(value);
}

/** Medida em px, quando dá para saber sem depender do elemento: `px` e `rem` (com a fonte raiz). `em`, `%` e `vw` não. */
export function lengthInPx(key: string, rootFontSize = DEFAULT_ROOT_FONT_SIZE): number | undefined {
    const parsed = parseLength(key);
    if (!parsed) {
        return undefined;
    }
    if (parsed.unit === 'px') {
        return parsed.value;
    }
    if (parsed.unit === 'rem') {
        return parsed.value * rootFontSize;
    }
    return undefined;
}

/** `16px` → `{ value: 16, unit: 'px' }`; número sem unidade → `unit: ''`. */
export function parseLength(key: string): { value: number; unit: string } | undefined {
    const token = firstToken(key);
    if (!token) {
        return undefined;
    }
    if (isTokenDimension(token)) {
        return { value: token[4].value, unit: token[4].unit.toLowerCase() };
    }
    if (isTokenPercentage(token)) {
        return { value: token[4].value, unit: '%' };
    }
    if (isTokenNumber(token)) {
        return { value: token[4].value, unit: '' };
    }
    return undefined;
}

// ─── Easing e sombra ────────────────────────────────────────────────────────

/** `cubic-bezier(.4,0,.2,1)` → `cubic-bezier(0.4, 0, 0.2, 1)`. */
function normalizeEasing(value: string): string {
    const node = parseComponentValue(tokenize({ css: value.trim() }));
    if (node && isFunctionNode(node)) {
        const numbers = node.value.filter(isTokenNode).map((n) => n.value).filter(isTokenNumber).map((t) => formatNumber(t[4].value));
        return `${node.getName().toLowerCase()}(${numbers.join(', ')})`;
    }
    return value.trim().toLowerCase();
}

/** Os 4 números de um `cubic-bezier()`, para o DTCG (`cubicBezier`). */
export function cubicBezierOf(key: string): [number, number, number, number] | undefined {
    const match = /^cubic-bezier\(([^)]*)\)$/.exec(key);
    const numbers = match?.[1]?.split(',').map(Number);
    return numbers?.length === 4 && numbers.every(Number.isFinite) ? (numbers as [number, number, number, number]) : undefined;
}

/** Uma camada de sombra (`0 1px 2px rgba(0,0,0,.1)`), já interpretada. */
export interface ShadowLayer {
    inset: boolean;
    offsetX: string;
    offsetY: string;
    blur: string;
    spread: string;
    color: string;
}

/**
 * Cada camada da sombra com as medidas e a cor normalizadas, na ordem do CSS:
 * `0 4PX 6px RGBA(0,0,0,.1)` → `0 4px 6px #0000001a`. Camadas separadas por `, `.
 */
function normalizeShadow(value: string): string {
    const layers = parseShadow(value);
    if (!layers) {
        return value.trim().toLowerCase().replace(/\s+/g, ' ');
    }
    return layers
        .map((layer) => [layer.inset ? 'inset' : '', layer.offsetX, layer.offsetY, layer.blur, layer.spread, layer.color].filter(Boolean).join(' '))
        .join(', ');
}

/** Interpreta `box-shadow`/`text-shadow`. `undefined` se tiver algo que não seja medida, cor ou `inset`. */
export function parseShadow(value: string): ShadowLayer[] | undefined {
    const layers: ShadowLayer[] = [];
    for (const list of parseCommaSeparatedListOfComponentValues(tokenize({ css: value }))) {
        const lengths: string[] = [];
        let inset = false;
        let colorValue: string | undefined;
        for (const node of list.filter((n) => !isWhiteSpaceOrCommentNode(n))) {
            const text = node.toString();
            if (isTokenNode(node) && isTokenIdent(node.value) && node.value[4].value.toLowerCase() === 'inset') {
                inset = true;
                continue;
            }
            if (isTokenNode(node) && (isTokenDimension(node.value) || isTokenNumber(node.value))) {
                lengths.push(normalizeNumeric(text));
                continue;
            }
            const data = color(node);
            if (data && colorValue === undefined) {
                colorValue = normalizeColor(text);
                continue;
            }
            return undefined;
        }
        if (lengths.length < 2 || lengths.length > 4) {
            return undefined;
        }
        layers.push({
            inset,
            offsetX: lengths[0]!,
            offsetY: lengths[1]!,
            blur: lengths[2] ?? '0',
            spread: lengths[3] ?? '0',
            // Sem cor, a sombra usa `currentColor`
            color: colorValue ?? 'currentcolor',
        });
    }
    return layers.length > 0 ? layers : undefined;
}
