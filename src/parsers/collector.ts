/**
 * Acumula o que os parsers encontram em um arquivo. Todo parser (folha de estilo, HTML, JSX, Angular)
 * chega no mesmo ponto: uma declaração `propriedade: valor` com a posição do valor no arquivo.
 * Daqui em diante o caminho é um só: regras → valores → achados.
 */

import { createPositionLookup } from './position.ts';
import { hackOf } from '../analysis/hacks.ts';
import { rulesForProperty, violationRule } from '../analysis/rules.ts';
import type { PropertyRule, Siblings } from '../analysis/rules.ts';
import type { AnalysisError, DefinitionSyntax, ElementFact, Finding, Host, ReviewItem, TokenDefinition, TokenReference, TokenType } from '../types.ts';
import { findReferences, findValues } from './css/values.ts';
import type { ValueMatch } from './css/values.ts';
import type { StyleSink } from './js/style-sinks.ts';

/** Explicação de cada regra de revisão, para quem lê a saída. */
export const REVIEW_MESSAGES: Readonly<Record<NonNullable<PropertyRule['review']>, string>> = {
    'size/no-context': 'width or height: a token only if this size is a design decision (a container, an icon)',
    'value/hack': 'CSS trick, not a design value',
};

/** Tamanho da fonte raiz definido no projeto (`html { font-size: 62.5% }`), em px. Base para converter `rem`. */
export interface RootFontSize {
    px: number;
    file: string;
    line: number;
}

/**
 * Custom property definida com valor literal (`--gap: 12px`). Se é token do projeto ou valor solto
 * de um componente depende de outros arquivos (onde o nome é usado e definido): decidido em `local-properties.ts`.
 */
export interface CustomPropertyCandidate {
    name: string;
    value: string;
    /** Posição do valor no arquivo. */
    offset: number;
    line: number;
    column: number;
    file: string;
    host: Host;
    selector?: string;
    atRules?: string[];
    /** Está num bloco de tokens (`:root`, `html`, ou uma regra só de custom properties que não é `:host`). */
    tokenBlock: boolean;
}

/** O que muda como um arquivo é lido, vindo da configuração. */
export interface ParseOptions {
    /** Props de componente que recebem valor de CSS; sem a opção, a lista padrão. */
    componentProps?: ReadonlySet<string>;
    /** Destinos de estilo de bibliotecas, além dos padrões (`styleSinks`). */
    styleSinks?: readonly StyleSink[];
}

export interface ParseResult {
    findings: Finding[];
    /** Valores que pedem revisão: não falham o CI e não viram token. */
    review: ReviewItem[];
    errors: AnalysisError[];
    definitions: TokenDefinition[];
    references: TokenReference[];
    /** Quantas declarações comuns (não definições de token) o arquivo tem. Zero = arquivo só de tokens. */
    declarations: number;
    rootFontSize?: RootFontSize;
    /** Templates externos de componentes Angular (`templateUrl`), relativos à raiz. */
    templateUrls?: string[];
    customProperties?: CustomPropertyCandidate[];
    /** Elementos com classes, para as guardas de coerência. */
    elements?: ElementFact[];
    /** Objetos de estilo importados e exportados por este arquivo. */
    styleLinks?: StyleLinks;
}

/** Pedido para analisar um objeto exportado por outro arquivo. */
export interface StyleRequest {
    source: string;
    name: string;
    path: string[];
    selector?: string;
    kind: 'style' | 'css-object' | 'sx' | 'dom';
}

export interface StyleLinks {
    file: string;
    imports: StyleRequest[];
    emit: (request: StyleRequest) => void;
}

/** Uma declaração `propriedade: valor`, venha de onde vier. */
export interface Declaration {
    /** Em kebab-case (`margin-top`). */
    property: string;
    /** Texto do valor exatamente como está no arquivo. */
    value: string;
    /** Posição do valor no arquivo. */
    offset: number;
    host: Host;
    siblings: Siblings;
    selector?: string;
    atRules?: string[];
    impliedUnit?: string;
    unitSuffix?: { offset: number; endOffset: number };
    numeric?: boolean;
    /** Posição do ternário de onde o valor veio. */
    branch?: number;
    /** Expressão que envolve o valor quando o parser de valores não a vê (`@include`): o `fix` a trata como função do build. */
    enclosing?: string;
}

/** Atalhos em que cada valor é um lado (ou eixo). */
const SIDE_SHORTHANDS = new Set(['padding', 'margin', 'gap', 'border-radius', 'padding-inline', 'padding-block', 'margin-inline', 'margin-block']);

/** Início de cada valor separado por espaço, sem contar o que está dentro de parênteses (`calc(1px + 2px)`). */
function topLevelStarts(value: string): number[] {
    const starts: number[] = [];
    let depth = 0;
    let inside = false;
    for (let i = 0; i < value.length; i++) {
        const char = value[i]!;
        const blank = depth === 0 && (char === ' ' || char === '\t' || char === '\n' || char === '\r');
        if (!blank && !inside) {
            starts.push(i);
        }
        inside = !blank;
        depth += char === '(' ? 1 : char === ')' ? -1 : 0;
    }
    return starts;
}

export class FileCollector {
    readonly file: string;
    readonly source: string;
    readonly result: ParseResult = { findings: [], review: [], errors: [], definitions: [], references: [], declarations: 0 };
    readonly #positionOf: ReturnType<typeof createPositionLookup>;

    constructor(file: string, source: string) {
        this.file = file;
        this.source = source;
        this.#positionOf = createPositionLookup(source);
    }

    /** Aplica as regras da propriedade ao valor e registra os achados e os usos de tokens. */
    declaration(decl: Declaration): void {
        const { property, value, offset } = decl;
        const index = this.result.declarations++;
        for (const { name, start, fallback } of findReferences(value)) {
            this.result.references.push({
                name, property, file: this.file, ...this.#positionOf(offset + start),
                ...(decl.selector === undefined ? {} : { selector: decl.selector }),
                ...(fallback === undefined ? {} : { fallback }),
            });
        }

        /**
         * Número que o host lê como medida (`padding: 8` no React = 8px): analisa como se a unidade
         * estivesse escrita, mas o trecho do achado continua sendo só o número que está no arquivo.
         */
        const text = decl.impliedUnit ? `${value}${decl.impliedUnit}` : value;

        for (const rule of rulesForProperty(property)) {
            this.#report(decl, rule, findValues(text, rule.match).map((match) => ({
                ...match, end: Math.min(match.end, value.length),
            })), index);
        }
    }

    customProperty(candidate: Omit<CustomPropertyCandidate, 'file' | 'line' | 'column'>): void {
        (this.result.customProperties ??= []).push({ ...candidate, file: this.file, ...this.#positionOf(candidate.offset) });
    }

    element(fact: Omit<ElementFact, 'file'>): void {
        if (fact.classes.length > 0 || fact.conditional.length > 0) {
            (this.result.elements ??= []).push({ ...fact, file: this.file });
        }
    }

    #report(decl: Declaration, rule: PropertyRule, matches: readonly ValueMatch[], declaration: number): void {
        const starts = SIDE_SHORTHANDS.has(decl.property) ? topLevelStarts(decl.value) : [];
        for (const match of matches) {
            const index = starts.findLastIndex((start) => start <= match.start);
            const start = decl.offset + match.start;
            const end = decl.offset + match.end;
            const type = match.type ?? rule.type;
            const item = {
                file: this.file,
                ...this.#positionOf(start),
                offset: start,
                endOffset: end,
                type,
                rule: rule.review ?? violationRule(type),
                property: decl.property,
                value: this.source.slice(start, end),
                host: decl.host,
                ...(decl.selector === undefined ? {} : { selector: decl.selector }),
                ...(decl.atRules?.length ? { atRules: decl.atRules } : {}),
                ...(match.function === undefined ? (decl.enclosing === undefined ? {} : { function: decl.enclosing }) : { function: match.function }),
                ...(decl.impliedUnit ? { impliedUnit: decl.impliedUnit } : {}),
                ...(decl.unitSuffix ? { unitSuffix: decl.unitSuffix } : {}),
                ...(decl.numeric ? { numeric: true as const } : {}),
                ...(decl.branch === undefined ? {} : { branch: decl.branch }),
                ...(starts.length > 1 && index >= 0 ? { part: { index, count: starts.length } } : {}),
                declaration,
            };
            // O motivo do truque é mais útil que o genérico de "tamanho sem contexto"
            const hack = rule.review === undefined || rule.review === 'size/no-context' ? hackOf(decl, type, item.value) : undefined;
            if (hack) {
                this.result.review.push({ ...item, rule: 'value/hack', message: hack });
            } else if (rule.review) {
                this.result.review.push({ ...item, message: REVIEW_MESSAGES[rule.review] });
            } else {
                this.result.findings.push(item);
            }
        }
    }

    definition(name: string, syntax: DefinitionSyntax, value: string, offset: number, selector?: string, declaredType?: TokenType): void {
        this.result.definitions.push({
            name, syntax, value: value.trim(), file: this.file, ...this.#positionOf(offset),
            ...(selector === undefined ? {} : { selector }),
            ...(declaredType ? { declaredType } : {}),
        });
    }

    rootFontSize(px: number, offset: number): void {
        // A primeira definição vale: é a que um projeto normalmente tem (uma só, no estilo global)
        this.result.rootFontSize ??= { px, file: this.file, line: this.#positionOf(offset).line };
    }

    error(offset: number, message: string): void {
        this.result.errors.push({ file: this.file, ...this.#positionOf(offset), message });
    }
}

/** Converte linha/coluna (começando em 1) de um texto em offset. Para erros de parsers que só informam linha e coluna. */
export function offsetAt(text: string, line: number, column: number): number {
    let offset = 0;
    for (let current = 1; current < line; current++) {
        const next = text.indexOf('\n', offset);
        if (next === -1) {
            break;
        }
        offset = next + 1;
    }
    return Math.min(offset + column - 1, text.length);
}

/** Descreve um elemento como seletor (`button#save.btn.primary`): é o contexto de um estilo inline. */
export function elementSelector(tagName: string, attrs: readonly { name: string; value: string }[]): string {
    const id = attrs.find((attr) => attr.name === 'id')?.value.trim();
    const classes = attrs.find((attr) => attr.name === 'class' || attr.name === 'className')?.value.split(/\s+/).filter(Boolean) ?? [];
    return `${tagName}${id ? `#${id}` : ''}${classes.map((name) => `.${name}`).join('')}`;
}

/**
 * Elementos que desenham dentro de um SVG (`<path>`, `<circle>`, gradientes): a cor ou medida deles é parte da
 * imagem, não decisão de design da interface. O `style` neles não é lido. A raiz `<svg>` continua sendo lida.
 */
const SVG_DRAWING_ELEMENTS: ReadonlySet<string> = new Set([
    'path', 'circle', 'rect', 'polygon', 'polyline', 'line', 'ellipse', 'g', 'stop', 'lineargradient', 'radialgradient',
    'use', 'symbol', 'defs', 'mask', 'clippath', 'pattern', 'text', 'tspan', 'marker', 'filter', 'image',
]);

/** O elemento desenha dentro de um SVG (ver `SVG_DRAWING_ELEMENTS`). */
export function isSvgDrawingElement(tagName: string): boolean {
    return SVG_DRAWING_ELEMENTS.has(tagName.toLowerCase());
}

/** `marginTop` → `margin-top`; `WebkitTransition` → `-webkit-transition`; `msFlex` → `-ms-flex`. Já em kebab-case, não muda. */
export function toKebabCase(name: string): string {
    const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return /^ms[A-Z]/.test(name) ? `-${kebab}` : kebab;
}
