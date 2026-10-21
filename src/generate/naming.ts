// Nomes dos tokens primitivos. Cada nome precisa ser VERDADEIRO sobre o valor:
// - escalas conhecidas (as do Tailwind, que muita gente já lê sem consultar) só quando o valor bate
//   ou fica perto do degrau, e sempre na mesma ordem dos valores (`sm` < `md` < `lg`);
// - quando nenhum degrau serve, o nome usa o próprio número (`font-size-13`), que nunca mente;
// - cores pela família de matiz e luminosidade no OKLCH, o espaço em que a luminosidade
//   percebida é uniforme (`#4f46e5` → `indigo-600`).

import type { TokenType } from '../types.ts';
import { colorInfo, cubicBezierOf, formatNumber, lengthInPx, parseLength, parseShadow } from '../suggest/normalize.ts';

/** Grupo de valores iguais, do ponto de vista do nome. */
export interface NamingInput {
    type: TokenType;
    key: string;
    /** Propriedade mais usada (diferencia `box-shadow` de `text-shadow`). */
    property: string;
}

export interface NamingContext {
    rootFontSize: number;
    gridBase: number;
}

type Scale = readonly (readonly [string, number])[];

// Escalas do Tailwind CSS v4 (em px), referência de mercado para nomes de tokens
const FONT_SIZE: Scale = [
    ['xs', 12], ['sm', 14], ['base', 16], ['lg', 18], ['xl', 20], ['2xl', 24], ['3xl', 30], ['4xl', 36],
    ['5xl', 48], ['6xl', 60], ['7xl', 72], ['8xl', 96], ['9xl', 128],
];
const RADIUS: Scale = [['xs', 2], ['sm', 4], ['md', 6], ['lg', 8], ['xl', 12], ['2xl', 16], ['3xl', 24], ['4xl', 32]];
const CONTAINER: Scale = [
    ['3xs', 256], ['2xs', 288], ['xs', 320], ['sm', 384], ['md', 448], ['lg', 512], ['xl', 576],
    ['2xl', 672], ['3xl', 768], ['4xl', 896], ['5xl', 1024], ['6xl', 1152], ['7xl', 1280],
];
/** Sombras pelo desfoque (blur) da primeira camada: é o que faz uma sombra parecer "maior". */
const SHADOW_BLUR: Scale = [['2xs', 1], ['xs', 2], ['sm', 3], ['md', 6], ['lg', 15], ['xl', 25], ['2xl', 50]];
const LINE_HEIGHT: Scale = [['none', 1], ['tight', 1.25], ['snug', 1.375], ['normal', 1.5], ['relaxed', 1.625], ['loose', 2]];
const LETTER_SPACING_EM: Scale = [['tighter', -0.05], ['tight', -0.025], ['normal', 0], ['wide', 0.025], ['wider', 0.05], ['widest', 0.1]];
const FONT_WEIGHT: Record<string, string> = {
    100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black',
};
const EASING: Record<string, string> = {
    'cubic-bezier(0.25, 0.1, 0.25, 1)': 'ease',
    'cubic-bezier(0.4, 0, 1, 1)': 'in',
    'cubic-bezier(0, 0, 0.2, 1)': 'out',
    'cubic-bezier(0.4, 0, 0.2, 1)': 'in-out',
};

/** Matiz (graus no OKLCH) no centro de cada família de cor, medido na paleta do Tailwind v4. */
const HUE_FAMILIES: readonly (readonly [string, number])[] = [
    ['rose', 12], ['red', 25], ['orange', 50], ['amber', 75], ['yellow', 95], ['lime', 128], ['green', 148],
    ['emerald', 163], ['teal', 182], ['cyan', 205], ['sky', 235], ['blue', 260], ['indigo', 277],
    ['violet', 293], ['purple', 303], ['fuchsia', 325], ['pink', 352],
];
/** Luminosidade OKLCH de cada degrau (50 é o mais claro). */
const LIGHTNESS_STEPS: Scale = [
    ['50', 0.975], ['100', 0.945], ['200', 0.9], ['300', 0.83], ['400', 0.71], ['500', 0.6],
    ['600', 0.52], ['700', 0.45], ['800', 0.38], ['900', 0.3], ['950', 0.2],
];
/** Abaixo deste croma a cor é percebida como cinza. */
const GRAY_CHROMA = 0.02;

/**
 * Dá nome a todos os grupos de um tipo. Devolve o caminho do token (`['color', 'indigo', '600']`):
 * no DTCG vira grupos aninhados; no CSS, `--color-indigo-600`.
 */
export function nameGroups(groups: readonly NamingInput[], context: NamingContext): Map<NamingInput, string[]> {
    const names = new Map<NamingInput, string[]>();
    const byType = Map.groupBy(groups, (g) => g.type);
    for (const [type, ofType] of byType) {
        for (const [group, path] of nameType(type, ofType, context)) {
            names.set(group, path);
        }
    }
    return uniqueNames(names);
}

function nameType(type: TokenType, groups: readonly NamingInput[], context: NamingContext): Map<NamingInput, string[]> {
    const px = (g: NamingInput) => lengthInPx(g.key, context.rootFontSize);
    const gridSlug = (g: NamingInput) => {
        const value = px(g);
        return value === undefined ? slug(g.key) : slug(formatNumber(value / context.gridBase));
    };
    switch (type) {
        case 'color':
            return nameColors(groups);
        case 'spacing':
        case 'size':
            return simple(groups, (g) => [type, gridSlug(g)]);
        case 'border-width':
            return simple(groups, (g) => [type, slug(px(g) === undefined ? g.key : formatNumber(px(g)!))]);
        case 'container':
            return byScale(groups, type, CONTAINER, px, Infinity);
        case 'radius': {
            const special = (g: NamingInput) => (g.key === '50%' ? 'circle' : (px(g) ?? 0) >= 999 ? 'full' : undefined);
            const named = simple(groups.filter((g) => special(g) !== undefined), (g) => [type, special(g)!]);
            const rest = byScale(groups.filter((g) => special(g) === undefined), type, RADIUS, px, 0.25);
            return new Map([...named, ...rest]);
        }
        case 'font-size':
            return byScale(groups, type, FONT_SIZE, px, 0.1);
        case 'font-weight':
            return simple(groups, (g) => [type, FONT_WEIGHT[g.key] ?? slug(g.key)]);
        case 'line-height': {
            const unitless = groups.filter((g) => parseLength(g.key)?.unit === '');
            const lengths = groups.filter((g) => parseLength(g.key)?.unit !== '');
            return new Map([
                ...byScale(unitless, type, LINE_HEIGHT, (g) => parseLength(g.key)?.value, 0),
                ...simple(lengths, (g) => [type, gridSlug(g)]),
            ]);
        }
        case 'letter-spacing':
            return byScale(groups, type, LETTER_SPACING_EM, (g) => (parseLength(g.key)?.unit === 'em' ? parseLength(g.key)!.value : undefined), 0);
        case 'font-family':
            return simple(groups, (g) => [type, slug(g.key.split(',')[0]!.trim())]);
        case 'shadow':
            return nameShadows(groups);
        case 'opacity':
            return simple(groups, (g) => [type, slug(formatNumber(Number(g.key) * 100))]);
        case 'duration':
            return simple(groups, (g) => [type, slug(g.key.replace(/ms$/, ''))]);
        case 'easing': {
            let next = 1;
            return simple(groups, (g) => [type, EASING[g.key] ?? (cubicBezierOf(g.key) ? String(next++) : slug(g.key))]);
        }
        case 'z-index':
            return simple(groups, (g) => [type, slug(g.key)]);
    }
}

function simple(groups: readonly NamingInput[], name: (g: NamingInput) => string[]): Map<NamingInput, string[]> {
    return new Map(groups.map((g) => [g, name(g)]));
}

/**
 * Nomes de uma escala. Primeiro, valores exatos ficam com o seu degrau. Depois, cada um dos outros
 * fica com o degrau mais próximo se ele estiver livre, dentro da tolerância e na ordem certa
 * em relação aos já nomeados. Sem degrau que sirva, o nome é o próprio valor.
 * `tolerance`: diferença relativa aceita (0.1 = 10%); 0 = só exato; Infinity = qualquer distância.
 */
function byScale(
    groups: readonly NamingInput[], type: string, scale: Scale,
    measure: (g: NamingInput) => number | undefined, tolerance: number,
): Map<NamingInput, string[]> {
    const names = new Map<NamingInput, string[]>();
    const measured = groups
        .map((group) => ({ group, value: measure(group) }))
        .filter((m): m is { group: NamingInput; value: number } => m.value !== undefined)
        .sort((a, b) => a.value - b.value);
    const taken = new Map<number, number>(); // índice do degrau → valor

    for (const { group, value } of measured) {
        const exact = scale.findIndex(([, step]) => step === value);
        if (exact !== -1) {
            taken.set(exact, value);
            names.set(group, [type, scale[exact]![0]]);
        }
    }
    for (const { group, value } of measured) {
        if (names.has(group)) {
            continue;
        }
        const nearest = nearestIndex(scale, value);
        const step = scale[nearest]![1];
        const close = tolerance === Infinity || Math.abs(value - step) <= Math.abs(step) * tolerance;
        const ordered = [...taken].every(([index, other]) => (index < nearest ? other < value : other > value));
        if (close && !taken.has(nearest) && ordered) {
            taken.set(nearest, value);
            names.set(group, [type, scale[nearest]![0]]);
        }
    }
    for (const group of groups) {
        if (!names.has(group)) {
            const value = measure(group);
            names.set(group, [type, slug(value === undefined || type === 'letter-spacing' || type === 'line-height' ? group.key : formatNumber(value))]);
        }
    }
    return names;
}

/** Degrau mais próximo; empate fica com o menor. */
function nearestIndex(scale: Scale, value: number): number {
    let best = 0;
    for (let i = 1; i < scale.length; i++) {
        if (Math.abs(scale[i]![1] - value) < Math.abs(scale[best]![1] - value)) {
            best = i;
        }
    }
    return best;
}

// ─── Cores ──────────────────────────────────────────────────────────────────

/**
 * Família pela matiz e degrau pela luminosidade: `#ef4444` → `red-500`.
 * Cores com transparência herdam o nome da cor sólida e ganham a opacidade: `#0000001a` → `black-a10`.
 */
function nameColors(groups: readonly NamingInput[]): Map<NamingInput, string[]> {
    const names = new Map<NamingInput, string[]>();
    const solid = new Map<string, NamingInput[]>();
    const info = new Map(groups.map((g) => [g, colorInfo(g.key)]));

    for (const group of groups) {
        const color = info.get(group);
        if (!color) {
            names.set(group, ['color', slug(group.key)]);
            continue;
        }
        const family = familyOf(color.oklch);
        if (family === 'white' || family === 'black') {
            names.set(group, ['color', family]);
            continue;
        }
        solid.set(family, [...(solid.get(family) ?? []), group]);
    }

    // Degrau por luminosidade dentro de cada família, do mais claro (50) para o mais escuro (950)
    for (const [family, members] of solid) {
        const steps = byScale(members, family, LIGHTNESS_STEPS.map(([n, l]) => [n, -l] as const), (g) => -info.get(g)!.oklch[0], Infinity);
        for (const [group, [, step]] of steps) {
            const isStep = LIGHTNESS_STEPS.some(([name]) => name === step);
            names.set(group, ['color', family, isStep ? step! : formatNumber(Math.round(info.get(group)!.oklch[0] * 1000))]);
        }
    }

    // Opacidade no fim do nome: `black-a10` = preto com 10% de opacidade
    for (const [group, path] of names) {
        const alpha = info.get(group)?.alpha ?? 1;
        if (alpha < 1) {
            names.set(group, [...path.slice(0, -1), `${path.at(-1)}-a${Math.round(alpha * 100)}`]);
        }
    }
    return names;
}

/** Família de uma cor pelas coordenadas OKLCH (luminosidade, croma, matiz). */
export function familyOf([lightness, chroma, hue]: readonly [number, number, number]): string {
    if (chroma < GRAY_CHROMA || Number.isNaN(hue)) {
        if (lightness >= 0.999) {
            return 'white';
        }
        if (lightness <= 0.001) {
            return 'black';
        }
        return 'gray';
    }
    let best = HUE_FAMILIES[0]!;
    for (const family of HUE_FAMILIES) {
        if (hueDistance(hue, family[1]) < hueDistance(hue, best[1])) {
            best = family;
        }
    }
    return best[0];
}

function hueDistance(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

// ─── Sombras ────────────────────────────────────────────────────────────────

/** `box-shadow` em `shadow-*`, `text-shadow` em `text-shadow-*`, sombras internas em `shadow-inset-*`. */
function nameShadows(groups: readonly NamingInput[]): Map<NamingInput, string[]> {
    const families = Map.groupBy(groups, (g) => {
        const inset = parseShadow(g.key)?.[0]?.inset ?? false;
        return `${g.property === 'text-shadow' ? 'text-shadow' : 'shadow'}${inset ? '-inset' : ''}`;
    });
    const names = new Map<NamingInput, string[]>();
    for (const [family, members] of families) {
        const blur = (g: NamingInput) => {
            const layer = parseShadow(g.key)?.[0];
            return layer ? lengthInPx(layer.blur === '0' ? '0px' : layer.blur) : undefined;
        };
        for (const [group, path] of byScale(members, family, SHADOW_BLUR, blur, Infinity)) {
            names.set(group, path);
        }
    }
    return names;
}

// ─── Utilitários ────────────────────────────────────────────────────────────

/** Trecho de nome válido em CSS e no DTCG: `1.5` → `1_5`, `-2` → `neg-2`, `50%` → `50pct`, `Open Sans` → `open-sans`. */
export function slug(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/^-/, 'neg-')
        .replace(/%/g, 'pct')
        .replace(/\./g, '_')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'value';
}

/** Dois grupos com o mesmo nome (ex.: duas cores no mesmo degrau) ganham sufixo: `-2`, `-3`. */
function uniqueNames(names: Map<NamingInput, string[]>): Map<NamingInput, string[]> {
    const seen = new Map<string, number>();
    for (const [group, path] of names) {
        const id = path.join('-');
        const count = (seen.get(id) ?? 0) + 1;
        seen.set(id, count);
        if (count > 1) {
            names.set(group, [...path.slice(0, -1), `${path.at(-1)}-${count}`]);
        }
    }
    return names;
}
