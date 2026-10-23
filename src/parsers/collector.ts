// Acumula o que os parsers encontram em um arquivo. Todo parser (folha de estilo, HTML, JSX, Angular)
// chega no mesmo ponto: uma declaração `propriedade: valor` com a posição do valor no arquivo.
// Daqui em diante o caminho é um só: regras → valores → achados.

import { createPositionLookup } from '../position.ts';
import { rulesForProperty, violationRule } from '../rules.ts';
import type { PropertyRule, Siblings } from '../rules.ts';
import type { AnalysisError, DefinitionSyntax, Finding, Host, ReviewItem, TokenDefinition, TokenReference } from '../types.ts';
import { findReferences, findValues } from './css-values.ts';
import type { ValueMatch } from './css-values.ts';

/** Explicação de cada regra de revisão, para quem lê a saída. */
export const REVIEW_MESSAGES: Readonly<Record<NonNullable<PropertyRule['review']>, string>> = {
    'size/no-context': 'size without context: a token only if it is a container width or a square element',
    'breakpoint/plain-css': 'breakpoint in plain CSS: var() does not work in media queries',
    'custom-property/unknown-use': 'local custom property with a literal; no use tells its token type',
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
        this.result.declarations++;
        for (const name of findReferences(value)) {
            this.result.references.push({
                name, property, file: this.file, line: this.#positionOf(offset).line,
                ...(decl.selector === undefined ? {} : { selector: decl.selector }),
            });
        }

        // Número que o host lê como medida (`padding: 8` no React = 8px): analisa como se a unidade
        // estivesse escrita, mas o trecho do achado continua sendo só o número que está no arquivo.
        const text = decl.impliedUnit ? `${value}${decl.impliedUnit}` : value;

        for (const rule of rulesForProperty(property, decl.siblings)) {
            this.#report(decl, rule, findValues(text, rule.match).map((match) => ({
                ...match, end: Math.min(match.end, value.length),
            })));
        }
    }

    /**
     * Medidas na condição de `@media`/`@container` (`(min-width: 768px)`): breakpoints.
     * Em CSS puro vão para revisão: `var()` não funciona em media query, então não há token para usar ainda.
     */
    breakpoint(atRule: string, params: string, offset: number, host: Host, selector?: string): void {
        const rule: PropertyRule = host === 'css'
            ? { type: 'breakpoint', match: 'length', review: 'breakpoint/plain-css' }
            : { type: 'breakpoint', match: 'length' };
        this.#report(
            { property: `@${atRule}`, value: params, offset, host, siblings: new Map(), ...(selector === undefined ? {} : { selector }) },
            rule,
            findValues(params, 'length'),
        );
    }

    customProperty(candidate: Omit<CustomPropertyCandidate, 'file' | 'line' | 'column'>): void {
        (this.result.customProperties ??= []).push({ ...candidate, file: this.file, ...this.#positionOf(candidate.offset) });
    }

    #report(decl: Declaration, rule: PropertyRule, matches: readonly ValueMatch[]): void {
        for (const match of matches) {
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
                ...(match.function === undefined ? {} : { function: match.function }),
                ...(decl.impliedUnit ? { impliedUnit: decl.impliedUnit } : {}),
            };
            if (rule.review) {
                this.result.review.push({ ...item, message: REVIEW_MESSAGES[rule.review] });
            } else {
                this.result.findings.push(item);
            }
        }
    }

    definition(name: string, syntax: DefinitionSyntax, value: string, offset: number, selector?: string): void {
        this.result.definitions.push({
            name, syntax, value: value.trim(), file: this.file, ...this.#positionOf(offset),
            ...(selector === undefined ? {} : { selector }),
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

/** `marginTop` → `margin-top`; `WebkitTransition` → `-webkit-transition`; `msFlex` → `-ms-flex`. Já em kebab-case, não muda. */
export function toKebabCase(name: string): string {
    const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return /^ms[A-Z]/.test(name) ? `-${kebab}` : kebab;
}
