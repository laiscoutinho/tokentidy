/**
 * Quanto o nome de um token combina com a propriedade onde o valor está. O valor igual não basta:
 * `--color-bg-surface: #fff` num `color` pinta o texto com a cor de fundo, e `--gap-md` num `padding`
 * escolhe o token de outra decisão quando existe um `--padding-md` com o mesmo valor.
 */

import { nameParts } from '../values/type-from-name.ts';

/** Papel de uma cor: texto e ícone (`fg`), fundo (`bg`) ou contorno (`stroke`). */
export type ColorRole = 'fg' | 'bg' | 'stroke';

const ROLE_WORDS = new Map<string, ColorRole>([
    ['foreground', 'fg'], ['fg', 'fg'], ['text', 'fg'], ['content', 'fg'], ['icon', 'fg'], ['ink', 'fg'],
    ['background', 'bg'], ['bg', 'bg'], ['surface', 'bg'], ['backdrop', 'bg'], ['canvas', 'bg'],
    ['stroke', 'stroke'], ['border', 'stroke'], ['outline', 'stroke'], ['divider', 'stroke'], ['separator', 'stroke'],
]);

const FG_PROPERTIES = new Set(['color', 'fill', 'stroke', 'caret-color', 'text-decoration-color', 'text-emphasis-color', '-webkit-text-fill-color', '-webkit-text-stroke-color']);

/** Papéis que o nome declara (vazio: cor sem papel, como `$gray-900` ou `$white`, que serve em qualquer lugar). */
export function tokenRoles(name: string): Set<ColorRole> {
    const roles = new Set<ColorRole>();
    for (const part of nameParts(name)) {
        const role = ROLE_WORDS.get(part);
        if (role) {
            roles.add(role);
        }
    }
    return roles;
}

/** Papel da cor nesta propriedade; `undefined` quando a propriedade não diz (`--x`, `accent-color`, gradiente num atributo). */
export function propertyRole(property: string): ColorRole | undefined {
    const name = property.toLowerCase();
    if (FG_PROPERTIES.has(name)) {
        return 'fg';
    }
    if (name.startsWith('background')) {
        return 'bg';
    }
    if (/^(border|outline|column-rule|box-shadow)/.test(name)) {
        return 'stroke';
    }
    return undefined;
}

/**
 * Encaixe do papel: 0 o nome diz o papel da propriedade, 1 o nome não diz papel, 2 o nome diz outro papel.
 * Com 2 o token não entra: a cor é a mesma, mas a decisão de design é outra.
 */
export function roleFit(property: string, name: string): 0 | 1 | 2 {
    const role = propertyRole(property);
    const roles = tokenRoles(name);
    if (!role || roles.size === 0) {
        return 1;
    }
    return roles.has(role) ? 0 : 2;
}

/** Palavras que dizem para qual propriedade de espaçamento o token foi feito. */
const SPACING_WORDS: ReadonlyArray<readonly [RegExp, ReadonlySet<string>]> = [
    [/^(scroll-)?padding/, new Set(['padding', 'inset'])],
    [/^(row-|column-|grid-)?gap$|^grid-(row|column)-gap$/, new Set(['gap', 'gutter'])],
    [/^(scroll-)?margin/, new Set(['margin'])],
];
const ALL_SPACING_WORDS = new Set(SPACING_WORDS.flatMap(([, words]) => [...words]));

/**
 * Encaixe do nome na propriedade de espaçamento: 0 o nome é desta propriedade (`--padding-md` num `padding`),
 * 1 o nome é genérico (`--space-4`), 2 o nome é de outra (`--gap-md` num `padding`). Fora de espaçamento, 1.
 */
export function propertyAffinity(property: string, name: string): 0 | 1 | 2 {
    const own = SPACING_WORDS.find(([pattern]) => pattern.test(property.toLowerCase()))?.[1];
    if (!own) {
        return 1;
    }
    const parts = nameParts(name);
    if (parts.some((part) => own.has(part))) {
        return 0;
    }
    return parts.some((part) => ALL_SPACING_WORDS.has(part)) ? 2 : 1;
}
