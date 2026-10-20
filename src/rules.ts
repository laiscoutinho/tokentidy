// O que conta como valor solto: quais propriedades olhar e que tipo de valor procurar em cada uma.
// Só dados e consultas, sem parser. Os parsers (CSS agora, JSX e Angular depois) consultam daqui.

import type { FindingKind } from './types.ts';

/**
 * Que tipo de valor procurar dentro da propriedade:
 * - `color`: cores em qualquer sintaxe (`#fff`, `red`, `rgb()`, `oklch()`...);
 * - `length`: medidas com as unidades de `LENGTH_UNITS` (`16px`, `1.5rem`);
 * - `line-height`: medidas ou números sem unidade (`1.5`);
 * - `font-weight`: números (`700`) e `bold`;
 * - `font-family`: a lista inteira de fontes, como um valor só;
 * - `font`: medidas, números e `bold` dentro do shorthand.
 */
export type ValueMatcher = 'color' | 'length' | 'line-height' | 'font-weight' | 'font-family' | 'font';

export interface PropertyRule {
    kind: FindingKind;
    match: ValueMatcher;
}

/** Unidades de medida reportadas. `%`, `vw`, `vh` etc. ficam de fora: são relativas ao layout, não valores de design. */
export const LENGTH_UNITS: ReadonlySet<string> = new Set(['px', 'rem', 'em', 'pt']);

/** Cores que não são violação. (`currentcolor` e cores de sistema já não são reconhecidas como cor literal.) */
export const COLOR_EXCEPTIONS: ReadonlySet<string> = new Set(['transparent']);

/** Peso de fonte em palavra que equivale a um número fixo (`bold` = 700). `normal`, `bolder` e `lighter` não são reportados. */
export const FONT_WEIGHT_KEYWORDS: ReadonlySet<string> = new Set(['bold']);

/** Famílias genéricas e palavras globais do CSS: uma `font-family` só com elas não é violação. */
export const NON_SPECIFIC_FONT_FAMILIES: ReadonlySet<string> = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
    'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong',
    'inherit', 'initial', 'unset', 'revert', 'revert-layer',
]);

/** Funções cujo conteúdo nunca é analisado: `var(--x, #fff)` já usa token, e o fallback é responsabilidade dele. */
export const IGNORED_FUNCTIONS: ReadonlySet<string> = new Set(['var', 'env', 'url', 'attr']);

const SIDES = ['top', 'right', 'bottom', 'left', 'block', 'block-start', 'block-end', 'inline', 'inline-start', 'inline-end'];

const COLOR_PROPERTIES = new Set([
    'color', 'background', 'background-color', 'background-image',
    'border', 'border-color', ...SIDES.flatMap((side) => [`border-${side}`, `border-${side}-color`]),
    'outline', 'outline-color', 'box-shadow', 'text-shadow',
    'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color',
    'caret-color', 'accent-color', 'scrollbar-color', 'column-rule', 'column-rule-color',
    'text-decoration', 'text-decoration-color', 'text-emphasis', 'text-emphasis-color',
]);

const SPACING_PROPERTIES = new Set([
    'margin', 'padding', ...SIDES.flatMap((side) => [`margin-${side}`, `padding-${side}`]),
    'gap', 'row-gap', 'column-gap', 'grid-gap', 'grid-row-gap', 'grid-column-gap',
]);

const TYPOGRAPHY_PROPERTIES: Record<string, ValueMatcher> = {
    'font': 'font',
    'font-size': 'length',
    'font-family': 'font-family',
    'font-weight': 'font-weight',
    'line-height': 'line-height',
    'letter-spacing': 'length',
};

/**
 * Diz o que procurar em uma propriedade CSS (em kebab-case), ou `undefined` se ela não é analisada.
 * Definições de token (`--cor: #fff`, `$cor: #fff`) também devolvem `undefined`: são os próprios tokens.
 */
export function ruleForProperty(property: string): PropertyRule | undefined {
    const prop = property.toLowerCase();

    if (COLOR_PROPERTIES.has(prop)) {
        return { kind: 'color', match: 'color' };
    }
    if (SPACING_PROPERTIES.has(prop)) {
        return { kind: 'spacing', match: 'length' };
    }
    const typography = TYPOGRAPHY_PROPERTIES[prop];
    if (typography) {
        return { kind: 'typography', match: typography };
    }
    return undefined;
}
