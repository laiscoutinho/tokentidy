/**
 * O que conta como valor solto: quais propriedades olhar e que tipo de valor procurar em cada uma.
 * Só dados e consultas, sem parser. Todos os parsers (CSS, HTML, JSX, Angular) consultam daqui.
 */

import type { TokenType } from '../types.ts';

/**
 * Que tipo de valor procurar dentro da propriedade:
 * - `color`: cores em qualquer sintaxe (`#fff`, `red`, `rgb()`, `oklch()`...);
 * - `length`: medidas com as unidades de `LENGTH_UNITS` (`16px`, `1.5rem`);
 * - `radius`: medidas absolutas (`50%`, o círculo, é forma e não token);
 * - `line-height`: medidas ou números sem unidade (`1.5`);
 * - `font-weight`: números (`700`) e `bold`;
 * - `font-family`: a lista inteira de fontes, como um valor só;
 * - `font`: o shorthand, classificado pela posição (peso, tamanho, `/altura de linha`, família);
 * - `shadow`: a sombra inteira, como um valor só;
 * - `drop-shadow`: o conteúdo de cada `drop-shadow()` de um `filter`, como uma sombra;
 * - `duration`: tempo em `s`/`ms`;
 * - `easing`: `cubic-bezier()`.
 */
export type ValueMatcher =
    | 'color' | 'length' | 'radius' | 'line-height' | 'font-weight' | 'font-family' | 'font'
    | 'shadow' | 'drop-shadow' | 'duration' | 'easing';

export interface PropertyRule {
    /** Tipo de token dos valores encontrados (o shorthand `font` decide por posição). */
    type: TokenType;
    match: ValueMatcher;
    /** Id da regra de revisão: o valor vai para `review` (não falha o CI) em vez de ser violação. */
    review?: ReviewRule;
}

/**
 * Regras de revisão: o valor pode ser uma decisão de design, mas o contexto não basta para afirmar.
 * - `size/no-context`: largura ou altura (o papel depende do layout);
 * - `value/hack`: truque de CSS (`1ms`, `0.1px`, `-9999em`, visually-hidden), com o motivo em `analysis/hacks.ts`.
 */
export type ReviewRule = 'size/no-context' | 'value/hack';

export const REVIEW_RULES: readonly ReviewRule[] = ['size/no-context', 'value/hack'];

/** Ordem dos tipos na saída: cores, espaço e tamanho, forma, tipografia, efeitos e movimento. */
export const TOKEN_TYPES: readonly TokenType[] = [
    'color', 'spacing', 'size', 'radius', 'border-width',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'shadow', 'duration', 'easing',
];

/** Ids que um comentário de ignorar pode citar. */
export function knownRules(): Set<string> {
    return new Set([...TOKEN_TYPES.map(violationRule), ...REVIEW_RULES]);
}

/** Id da regra de violação de um tipo de token: `color/hardcoded`. */
export function violationRule(type: TokenType): string {
    return `${type}/hardcoded`;
}

/** Unidades de medida reportadas. `%`, `vw`, `vh` etc. ficam de fora: são relativas ao layout, não valores de design. */
export const LENGTH_UNITS: ReadonlySet<string> = new Set(['px', 'rem', 'em', 'pt']);

/** Unidades de tempo reportadas em transições e animações. */
export const TIME_UNITS: ReadonlySet<string> = new Set(['ms', 's']);

/** Cores que não são violação. (`currentcolor` e cores de sistema já não são reconhecidas como cor literal.) */
export const COLOR_EXCEPTIONS: ReadonlySet<string> = new Set(['transparent']);

/**
 * Peso de fonte em palavra reportado: `bold` (= 700), `bolder` e `lighter` (relativos ao pai, mas ainda uma escolha de peso
 * que um token do projeto deveria fazer). `normal` não é reportado: é o padrão.
 */
export const FONT_WEIGHT_KEYWORDS: ReadonlySet<string> = new Set(['bold', 'bolder', 'lighter']);

/** Famílias genéricas e palavras globais do CSS: uma `font-family` só com elas não é violação. */
export const NON_SPECIFIC_FONT_FAMILIES: ReadonlySet<string> = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
    'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong',
    'inherit', 'initial', 'unset', 'revert', 'revert-layer',
]);

/**
 * Funções cujo conteúdo nunca é analisado: `var(--x, #fff)` já usa token, e o fallback é responsabilidade dele;
 * `calc()`, `clamp()`, `min()` e `max()` são conta de layout, não decisão de design.
 */
export const IGNORED_FUNCTIONS: ReadonlySet<string> = new Set(['var', 'env', 'url', 'attr', 'calc', 'clamp', 'min', 'max', '-webkit-calc']);

const SIDES = ['top', 'right', 'bottom', 'left', 'block', 'block-start', 'block-end', 'inline', 'inline-start', 'inline-end'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left', 'start-start', 'start-end', 'end-start', 'end-end'];

const color: PropertyRule = { type: 'color', match: 'color' };
const borderWidth: PropertyRule = { type: 'border-width', match: 'length' };

/** Propriedades com regra fixa, que não dependem do contexto. */
const FIXED_RULES = new Map<string, readonly PropertyRule[]>([
    ...['color', 'background', 'background-color', 'background-image',
        'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color',
        'caret-color', 'accent-color', 'scrollbar-color',
        'border-color', ...SIDES.map((side) => `border-${side}-color`),
        'outline-color', 'column-rule-color',
        'text-decoration', 'text-decoration-color', 'text-emphasis', 'text-emphasis-color',
    ].map((prop): [string, readonly PropertyRule[]] => [prop, [color]]),

    // Shorthands de borda: a largura e a cor são decisões diferentes, cada uma vira o seu token
    ...['border', ...SIDES.map((side) => `border-${side}`), 'outline', 'column-rule']
        .map((prop): [string, readonly PropertyRule[]] => [prop, [borderWidth, color]]),
    ...['border-width', ...SIDES.map((side) => `border-${side}-width`), 'outline-width', 'column-rule-width']
        .map((prop): [string, readonly PropertyRule[]] => [prop, [borderWidth]]),

    ...['margin', 'padding', ...SIDES.flatMap((side) => [`margin-${side}`, `padding-${side}`]),
        'gap', 'row-gap', 'column-gap', 'grid-gap', 'grid-row-gap', 'grid-column-gap',
        'border-spacing', 'scroll-margin', 'scroll-padding',
        ...SIDES.flatMap((side) => [`scroll-margin-${side}`, `scroll-padding-${side}`]),
    ].map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'spacing', match: 'length' }]]),

    ...['border-radius', ...CORNERS.map((corner) => `border-${corner}-radius`)]
        .map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'radius', match: 'radius' }]]),

    // A sombra é um valor só (deslocamento, desfoque, cor): a cor dentro dela não vira token separado
    ['box-shadow', [{ type: 'shadow', match: 'shadow' }]],
    ['text-shadow', [{ type: 'shadow', match: 'shadow' }]],
    // `filter: drop-shadow(0 2px 4px rgba(0, 0, 0, .2))`: a sombra (com a cor) é uma decisão; `blur()` e `brightness()` são efeito
    ['filter', [{ type: 'shadow', match: 'drop-shadow' }]],

    ['font', [{ type: 'font-size', match: 'font' }]],
    ['font-size', [{ type: 'font-size', match: 'length' }]],
    ['font-family', [{ type: 'font-family', match: 'font-family' }]],
    ['font-weight', [{ type: 'font-weight', match: 'font-weight' }]],
    ['line-height', [{ type: 'line-height', match: 'line-height' }]],
    ['letter-spacing', [{ type: 'letter-spacing', match: 'length' }]],


    ...['transition', 'animation'].map((prop): [string, readonly PropertyRule[]] =>
        [prop, [{ type: 'duration', match: 'duration' }, { type: 'easing', match: 'easing' }]]),
    ...['transition-duration', 'transition-delay', 'animation-duration', 'animation-delay']
        .map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'duration', match: 'duration' }]]),
    ...['transition-timing-function', 'animation-timing-function']
        .map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'easing', match: 'easing' }]]),

]);

/** Larguras e alturas que viram revisão quando não há contexto (container, quadrado) para decidir o papel. */
const SIZE_PROPERTIES = new Set([
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'inline-size', 'block-size', 'min-inline-size', 'min-block-size', 'max-inline-size', 'max-block-size',
]);

const SIZE_REVIEW: readonly PropertyRule[] = [{ type: 'size', match: 'length', review: 'size/no-context' }];

/** Prefixos de fabricante: `-webkit-box-shadow` segue a regra de `box-shadow`. */
const VENDOR_PREFIX = /^-(webkit|moz|ms|o)-/;

/**
 * Declarações que não são uso de design dentro de certas at-rules:
 * - `@font-face`: as declarações definem a fonte (`font-family`, `font-weight` do arquivo), não aplicam.
 */
const SKIPPED_IN_AT_RULE = new Map<string, ReadonlySet<string> | 'all'>([
    ['font-face', 'all'],
]);

/** A declaração está numa at-rule em que não é uso de design (ver `SKIPPED_IN_AT_RULE`). `atRuleNames` sem `@`. */
export function isSkippedInAtRule(property: string, atRuleNames: readonly string[]): boolean {
    return atRuleNames.some((name) => {
        const skipped = SKIPPED_IN_AT_RULE.get(name.toLowerCase().replace(VENDOR_PREFIX, ''));
        return skipped === 'all' || (skipped !== undefined && skipped.has(property.toLowerCase().replace(VENDOR_PREFIX, '')));
    });
}

/** Declarações da mesma regra (ou do mesmo `style=""`): propriedade em kebab-case → valor. */
export type Siblings = ReadonlyMap<string, string>;

/**
 * Diz o que procurar em uma propriedade CSS (em kebab-case). Lista vazia: a propriedade não é analisada.
 * Definições de token (`--cor: #fff`, `$cor: #fff`) também devolvem lista vazia: são os próprios tokens.
 *
 * Largura, altura, min/max e `flex-basis` sempre vão para revisão (`size/no-context`): `width: 300px` pode ser
 * container, ícone ou só layout, e o código sozinho não diz qual. Reportar como violação daria falso positivo.
 * Prefixo de fabricante não muda a regra (`-webkit-box-shadow` = `box-shadow`).
 */
export function rulesForProperty(property: string): readonly PropertyRule[] {
    const prop = property.toLowerCase().replace(VENDOR_PREFIX, '');
    return FIXED_RULES.get(prop) ?? (SIZE_PROPERTIES.has(prop) ? SIZE_REVIEW : []);
}
