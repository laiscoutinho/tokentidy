// O que conta como valor solto: quais propriedades olhar e que tipo de valor procurar em cada uma.
// Só dados e consultas, sem parser. Todos os parsers (CSS, HTML, JSX, Angular) consultam daqui.

import { tokenize, isTokenIdent, isTokenWhitespace, isTokenComment } from '@csstools/css-tokenizer';

import type { TokenType } from './types.ts';

/**
 * Que tipo de valor procurar dentro da propriedade:
 * - `color`: cores em qualquer sintaxe (`#fff`, `red`, `rgb()`, `oklch()`...);
 * - `length`: medidas com as unidades de `LENGTH_UNITS` (`16px`, `1.5rem`);
 * - `radius`: medidas e porcentagens (`50%` é o círculo);
 * - `line-height`: medidas ou números sem unidade (`1.5`);
 * - `font-weight`: números (`700`) e `bold`;
 * - `font-family`: a lista inteira de fontes, como um valor só;
 * - `font`: o shorthand, classificado pela posição (peso, tamanho, `/altura de linha`, família);
 * - `shadow`: a sombra inteira, como um valor só;
 * - `opacity`: número ou porcentagem entre 0 e 1 (exclusivo);
 * - `duration`: tempo em `s`/`ms`;
 * - `easing`: `cubic-bezier()`;
 * - `z-index`: inteiro.
 */
export type ValueMatcher =
    | 'color' | 'length' | 'radius' | 'line-height' | 'font-weight' | 'font-family' | 'font'
    | 'shadow' | 'opacity' | 'duration' | 'easing' | 'z-index';

export interface PropertyRule {
    /** Tipo de token dos valores encontrados (o shorthand `font` decide por posição). */
    type: TokenType;
    match: ValueMatcher;
    /** Id da regra de revisão: o valor vai para `review` (não falha o CI) em vez de ser violação. */
    review?: ReviewRule;
}

/**
 * Regras de revisão: o valor pode ser uma decisão de design, mas o contexto não basta para afirmar.
 * - `size/no-context`: largura ou altura sem o contexto que diz o papel (container, quadrado);
 * - `breakpoint/plain-css`: breakpoint em CSS puro, onde `var()` não funciona em media query;
 * - `custom-property/unknown-use`: custom property local com medida, sem uso que diga o tipo.
 */
export type ReviewRule = 'size/no-context' | 'breakpoint/plain-css' | 'custom-property/unknown-use';

export const REVIEW_RULES: readonly ReviewRule[] = ['size/no-context', 'breakpoint/plain-css', 'custom-property/unknown-use'];

/** Ordem dos tipos na saída: cores, espaço e tamanho, forma, tipografia, efeitos e movimento, camadas, breakpoints. */
export const TOKEN_TYPES: readonly TokenType[] = [
    'color', 'spacing', 'size', 'container', 'radius', 'border-width',
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'shadow', 'opacity', 'duration', 'easing', 'z-index', 'breakpoint',
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

/**
 * `z-index` de 0, 1 e -1 é ajuste local de empilhamento ("fica na frente do vizinho"), não uma camada da interface.
 * A partir de 2 (em módulo), o valor costuma ser uma camada (modal, dropdown, toast) e vale virar token.
 */
export const MIN_LAYER_Z_INDEX = 2;

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
    ].map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'spacing', match: 'length' }]]),

    ...['border-radius', ...CORNERS.map((corner) => `border-${corner}-radius`)]
        .map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'radius', match: 'radius' }]]),

    // A sombra é um valor só (deslocamento, desfoque, cor): a cor dentro dela não vira token separado
    ['box-shadow', [{ type: 'shadow', match: 'shadow' }]],
    ['text-shadow', [{ type: 'shadow', match: 'shadow' }]],

    ['font', [{ type: 'font-size', match: 'font' }]],
    ['font-size', [{ type: 'font-size', match: 'length' }]],
    ['font-family', [{ type: 'font-family', match: 'font-family' }]],
    ['font-weight', [{ type: 'font-weight', match: 'font-weight' }]],
    ['line-height', [{ type: 'line-height', match: 'line-height' }]],
    ['letter-spacing', [{ type: 'letter-spacing', match: 'length' }]],

    ...['opacity', 'fill-opacity', 'stroke-opacity', 'flood-opacity', 'stop-opacity']
        .map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'opacity', match: 'opacity' }]]),

    ...['transition', 'animation'].map((prop): [string, readonly PropertyRule[]] =>
        [prop, [{ type: 'duration', match: 'duration' }, { type: 'easing', match: 'easing' }]]),
    ...['transition-duration', 'transition-delay', 'animation-duration', 'animation-delay']
        .map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'duration', match: 'duration' }]]),
    ...['transition-timing-function', 'animation-timing-function']
        .map((prop): [string, readonly PropertyRule[]] => [prop, [{ type: 'easing', match: 'easing' }]]),

    ['z-index', [{ type: 'z-index', match: 'z-index' }]],
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
 * - `@font-face`: as declarações definem a fonte (`font-family`, `font-weight` do arquivo), não aplicam;
 * - `@keyframes`: `opacity` entre quadros é coreografia da animação. Cores e medidas continuam valendo.
 */
const SKIPPED_IN_AT_RULE = new Map<string, ReadonlySet<string> | 'all'>([
    ['font-face', 'all'],
    ['keyframes', new Set(['opacity'])],
]);

/** A declaração está numa at-rule em que não é uso de design (ver `SKIPPED_IN_AT_RULE`). `atRuleNames` sem `@`. */
export function isSkippedInAtRule(property: string, atRuleNames: readonly string[]): boolean {
    return atRuleNames.some((name) => {
        const skipped = SKIPPED_IN_AT_RULE.get(name.toLowerCase().replace(VENDOR_PREFIX, ''));
        return skipped === 'all' || (skipped !== undefined && skipped.has(property.toLowerCase().replace(VENDOR_PREFIX, '')));
    });
}

/** Larguras que, num bloco centralizado (`margin: 0 auto`), definem a largura de um container. */
const CONTAINER_PROPERTIES = new Set(['max-width', 'width', 'max-inline-size', 'inline-size']);

/** Largura ↔ altura: com o mesmo valor nas duas, o elemento é quadrado (ícone, avatar). */
const SQUARE_COUNTERPARTS = new Map([
    ['width', 'height'], ['height', 'width'],
    ['inline-size', 'block-size'], ['block-size', 'inline-size'],
]);

/** Declarações da mesma regra (ou do mesmo `style=""`): propriedade em kebab-case → valor. */
export type Siblings = ReadonlyMap<string, string>;

/**
 * Diz o que procurar em uma propriedade CSS (em kebab-case). Lista vazia: a propriedade não é analisada.
 * Definições de token (`--cor: #fff`, `$cor: #fff`) também devolvem lista vazia: são os próprios tokens.
 *
 * Largura e altura só entram quando as declarações vizinhas deixam o papel claro;
 * fora disso, `width: 300px` pode ser qualquer coisa, e reportar geraria falso positivo:
 * - container: `max-width` (ou `width`) com margem horizontal `auto`;
 * - tamanho: `width` e `height` com o mesmo valor (elemento quadrado).
 * Sem esse contexto, a medida vai para revisão (`size/no-context`).
 * Prefixo de fabricante não muda a regra (`-webkit-box-shadow` = `box-shadow`).
 */
export function rulesForProperty(property: string, siblings: Siblings = new Map()): readonly PropertyRule[] {
    const written = property.toLowerCase();
    const prop = written.replace(VENDOR_PREFIX, '');
    const fixed = FIXED_RULES.get(prop);
    if (fixed) {
        return fixed;
    }
    if (CONTAINER_PROPERTIES.has(prop) && isHorizontallyCentered(siblings)) {
        return [{ type: 'container', match: 'length' }];
    }
    const counterpart = SQUARE_COUNTERPARTS.get(prop);
    const value = siblings.get(written);
    if (counterpart && value !== undefined && sameValue(siblings.get(counterpart), value)) {
        return [{ type: 'size', match: 'length' }];
    }
    return SIZE_PROPERTIES.has(prop) ? SIZE_REVIEW : [];
}

function sameValue(a: string | undefined, b: string): boolean {
    return a !== undefined && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Margem horizontal `auto` dos dois lados: o bloco está centralizado na página ou no pai. */
export function isHorizontallyCentered(siblings: Siblings): boolean {
    const margin = siblings.get('margin');
    if (margin !== undefined) {
        // Shorthand: 1 valor = todos os lados; 2 = vertical horizontal; 3 = topo horizontal base; 4 = topo direita base esquerda
        const parts = words(margin);
        const right = parts.length === 4 ? parts[1] : parts[parts.length === 1 ? 0 : 1];
        const left = parts.length === 4 ? parts[3] : right;
        if (right === 'auto' && left === 'auto') {
            return true;
        }
    }
    if (words(siblings.get('margin-inline') ?? '').every((part) => part === 'auto') && siblings.has('margin-inline')) {
        return true;
    }
    const pairs = [['margin-left', 'margin-right'], ['margin-inline-start', 'margin-inline-end']] as const;
    return pairs.some(([a, b]) => words(siblings.get(a) ?? '')[0] === 'auto' && words(siblings.get(b) ?? '')[0] === 'auto');
}

/** Partes de um valor separadas por espaço, em minúsculas (`0 AUTO` → `['0', 'auto']`). */
function words(value: string): string[] {
    const parts: string[] = [];
    let current = '';
    for (const token of tokenize({ css: value })) {
        if (isTokenWhitespace(token) || isTokenComment(token)) {
            if (current) {
                parts.push(current);
            }
            current = '';
        } else if (token[0] !== 'EOF-token') {
            current += isTokenIdent(token) ? token[4].value.toLowerCase() : token[1];
        }
    }
    if (current) {
        parts.push(current);
    }
    return parts;
}
