// Parser de templates Angular: `style="..."`, `[style.x]="..."`, `[style]="{...}"` e `[ngStyle]="{...}"`.
// Usa o parser oficial (@angular/compiler), o mesmo que o Angular usa para compilar: entende os blocos
// (`@if`, `@for`), as diretivas estruturais (`*ngIf`) e as expressões de binding, com a posição de cada literal.

import {
    BindingType,
    Conditional,
    LiteralMap,
    LiteralPrimitive,
    TmplAstRecursiveVisitor,
    parseTemplate,
    tmplAstVisitAll,
} from '@angular/compiler';
import type { AST, TmplAstBoundAttribute, TmplAstElement } from '@angular/compiler';

import { FileCollector, elementSelector, toKebabCase } from './collector.ts';
import type { ParseResult } from './collector.ts';
import { walkDeclarationList } from './css.ts';

export function parseAngularTemplate(source: string, file: string): ParseResult {
    const collector = new FileCollector(file, source);
    walkAngularTemplate(collector, source, 0);
    return collector.result;
}

/** Analisa um template que começa na posição `baseOffset` do arquivo (o `.html` inteiro ou o `template:` do componente). */
export function walkAngularTemplate(collector: FileCollector, template: string, baseOffset: number): void {
    const parsed = parseTemplate(template, collector.file, { preserveWhitespaces: true });
    // Erro no template não impede analisar o que foi entendido; registra só o primeiro, como nos outros parsers
    const firstError = parsed.errors?.[0];
    if (firstError) {
        collector.error(baseOffset + firstError.span.start.offset, firstError.msg);
    }
    tmplAstVisitAll(new StyleVisitor(collector, template, baseOffset), parsed.nodes);
}

/** Visita todos os elementos do template (inclusive dentro de blocos e `<ng-template>`). */
class StyleVisitor extends TmplAstRecursiveVisitor {
    readonly #collector: FileCollector;
    readonly #template: string;
    readonly #base: number;

    constructor(collector: FileCollector, template: string, base: number) {
        super();
        this.#collector = collector;
        this.#template = template;
        this.#base = base;
    }

    override visitElement(element: TmplAstElement): void {
        const selector = elementSelector(element.name, element.attributes);

        const style = element.attributes.find((attr) => attr.name === 'style');
        if (style?.valueSpan) {
            const start = style.valueSpan.start.offset;
            const end = style.valueSpan.end.offset;
            walkDeclarationList(this.#collector, this.#template.slice(start, end), this.#base + start, 'angular-template', selector);
        }

        const bindings = element.inputs.flatMap((input) => this.#styleBindings(input));
        // Vizinhos: o que está nos bindings literais do mesmo elemento (`[style.width.px]` + `[style.height.px]`)
        const siblings = new Map(bindings.map((b) => [b.property, b.impliedUnit ? `${b.text}${b.impliedUnit}` : b.text]));
        for (const binding of bindings) {
            this.#collector.declaration({
                property: binding.property,
                value: binding.text,
                offset: this.#base + binding.offset,
                host: 'angular-template',
                siblings,
                selector,
                ...(binding.impliedUnit ? { impliedUnit: binding.impliedUnit } : {}),
                ...(binding.numeric ? { numeric: true } : {}),
                ...(binding.unitSuffix ? { unitSuffix: { offset: this.#base + binding.unitSuffix.offset, endOffset: this.#base + binding.unitSuffix.endOffset } } : {}),
            });
        }
        super.visitElement(element);
    }

    /** Valores literais de um binding de estilo, com a propriedade CSS de cada um. */
    #styleBindings(input: TmplAstBoundAttribute): StyleBinding[] {
        const ast = unwrap(input.value);
        // `[style.font-size.px]="14"`: o Angular já separa o nome da unidade
        if (input.type === BindingType.Style) {
            const found = this.#literals(ast, toKebabCase(input.name), input.unit ?? undefined);
            return this.#withSuffix(found, ast, input.keySpan.end.offset, input.unit);
        }
        // `[style]="{...}"` e `[ngStyle]="{...}"`: chave (com unidade opcional: `'width.px'`) → valor
        if ((input.name === 'style' || input.name === 'ngStyle') && ast instanceof LiteralMap) {
            return ast.keys.flatMap((key, i) => {
                if (key.kind !== 'property') {
                    return [];
                }
                const [name = '', unit] = key.key.split('.');
                const value = ast.values[i]!;
                // Chave entre aspas (`'width.px'`): a unidade termina antes da aspa de fechamento
                const keyEnd = key.sourceSpan.end - (key.quoted ? 1 : 0);
                return this.#withSuffix(this.#literals(value, toKebabCase(name), unit), value, keyEnd, unit);
            });
        }
        return [];
    }

    /**
     * Posição da unidade no nome (`.px`), para o autofix tirar junto com o número. Só com um literal único:
     * num ternário (`a ? 16 : 24`) a unidade vale para os dois lados e não pode sair por causa de um deles.
     */
    #withSuffix(bindings: StyleBinding[], ast: AST, nameEnd: number, unit: string | null | undefined): StyleBinding[] {
        const suffix = `.${unit}`;
        const only = bindings[0];
        if (!unit || bindings.length !== 1 || !only?.impliedUnit || !(ast instanceof LiteralPrimitive)
            || this.#template.slice(nameEnd - suffix.length, nameEnd) !== suffix) {
            return bindings;
        }
        return [{ ...only, unitSuffix: { offset: nameEnd - suffix.length, endOffset: nameEnd } }];
    }

    /** Literais de uma expressão: o próprio literal ou os dois lados de um ternário (`ok ? '#000' : '#111'`). */
    #literals(ast: AST, property: string, unit: string | undefined): StyleBinding[] {
        if (ast instanceof Conditional) {
            return [...this.#literals(ast.trueExp, property, unit), ...this.#literals(ast.falseExp, property, unit)];
        }
        if (!(ast instanceof LiteralPrimitive)) {
            return [];
        }
        const { start, end } = ast.sourceSpan;
        if (typeof ast.value === 'number') {
            const text = this.#template.slice(start, end);
            return [{ property, text, offset: start, numeric: true, ...(unit ? { impliedUnit: unit } : {}) }];
        }
        if (typeof ast.value !== 'string') {
            return [];
        }
        // String: o conteúdo fica entre as aspas. Com escape (`'\''`) o texto do arquivo difere do valor; fica de fora.
        const text = this.#template.slice(start + 1, end - 1);
        return text === ast.value ? [{ property, text, offset: start + 1 }] : [];
    }
}

interface StyleBinding {
    property: string;
    /** Texto do valor como está no template. */
    text: string;
    /** Posição no template. */
    offset: number;
    impliedUnit?: string;
    /** Número da expressão (não string). */
    numeric?: boolean;
    /** Posição da unidade no nome do binding (`.px`), no template. */
    unitSuffix?: { offset: number; endOffset: number };
}

/** `ASTWithSource` embrulha a expressão; o nó que interessa está em `.ast`. */
function unwrap(ast: AST): AST {
    return 'ast' in ast && ast.ast instanceof Object ? (ast.ast as AST) : ast;
}
