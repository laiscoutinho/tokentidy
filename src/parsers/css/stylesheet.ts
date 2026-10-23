/**
 * Parser de folhas de estilo (CSS, SCSS, Sass e Less): percorre as declarações e entrega cada uma ao coletor.
 * Os quatro parsers devolvem a mesma árvore do PostCSS (regras, at-rules, declarações), então o percurso é um só;
 * muda apenas como achar o texto original do valor (ver `valueOf`).
 * Também serve para CSS dentro de outros arquivos: `<style>` do HTML e `styles` de componentes Angular.
 */

import { createRequire } from 'node:module';
import { tokenize, isTokenDimension, isTokenPercentage, isTokenWhitespace } from '@csstools/css-tokenizer';
import postcss, { CssSyntaxError } from 'postcss';
import type { AtRule, Container, Declaration as PostcssDeclaration, Root } from 'postcss';

import { isSkippedInAtRule } from '../../analysis/rules.ts';
import { FileCollector, offsetAt } from '../collector.ts';
import type { ParseResult } from '../collector.ts';
import type { Host } from '../../types.ts';
import { atRuleNamesOf, atRulesOf, selectorOf, splitSelectors } from './declaration-context.ts';

export type StyleSyntax = 'css' | 'scss' | 'sass' | 'less';

/**
 * Os parsers de SCSS, Sass e Less são carregados só quando aparece um arquivo da sintaxe.
 * `createRequire` em vez de `import()`: o parse é síncrono e o módulo fica em cache depois do primeiro uso.
 */
const require = createRequire(import.meta.url);

function parserFor(syntax: StyleSyntax): (css: string) => Root {
    switch (syntax) {
        case 'css':
            return (css) => postcss.parse(css);
        case 'scss':
            return (css) => (require('postcss-scss') as typeof import('postcss-scss')).parse(css);
        case 'less':
            return (css) => (require('postcss-less') as typeof import('postcss-less')).parse(css) as unknown as Root;
        case 'sass':
            /**
             * `sass-parser` é o único parser da sintaxe indentada que guarda posições; o próprio time do Sass
             * ainda o marca como experimental. Ele devolve nós compatíveis com o PostCSS.
             */
            return (css) => (require('sass-parser') as typeof import('sass-parser')).sass.parse(css) as unknown as Root;
    }
}

/**
 * Analisa o conteúdo de um arquivo de estilo.
 * Erro de sintaxe não lança exceção: volta em `errors`, para a análise dos outros arquivos continuar.
 */
export function parseCss(source: string, file: string, syntax: StyleSyntax): ParseResult {
    const collector = new FileCollector(file, source);
    // O PostCSS descarta o BOM do início do arquivo e conta os offsets sem ele
    const bom = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    walkStylesheet(collector, source.slice(bom), bom, syntax);
    return collector.result;
}

/** Analisa uma folha de estilo que começa na posição `baseOffset` do arquivo (o arquivo todo ou um `<style>`). */
export function walkStylesheet(collector: FileCollector, css: string, baseOffset: number, syntax: StyleSyntax): void {
    let root: Root;
    try {
        root = parserFor(syntax)(css);
    } catch (error) {
        const position = syntaxErrorPosition(error);
        if (!position) {
            throw error;
        }
        collector.error(baseOffset + offsetAt(css, position.line, position.column), position.message);
        return;
    }

    const host: Host = syntax;
    const siblingsCache = new Map<Container, Map<string, string>>();

    root.walk((node) => {
        if (node.type === 'atrule' && syntax === 'less' && (node as LessAtRule).variable) {
            // Less: `@cor: #fff;` é uma at-rule com `variable: true`
            const less = node as LessAtRule;
            collector.definition(`@${less.name}`, 'less-variable', less.value ?? '', baseOffset + (node.source?.start?.offset ?? 0), selectorOf(node));
            return;
        }
        if (node.type === 'atrule') {
            const name = node.name.toLowerCase();
            if (BREAKPOINT_AT_RULES.has(name)) {
                const params = paramsOf(node, css);
                if (params) {
                    collector.breakpoint(name, params.text, baseOffset + params.offset, host, selectorOf(node));
                }
            }
            return;
        }
        if (node.type !== 'decl') {
            return;
        }
        const value = valueOf(node, css, syntax);
        if (!value) {
            return;
        }
        const offset = baseOffset + value.offset;
        const prop = node.prop;
        const selector = selectorOf(node);
        const atRules = atRulesOf(node);

        if (prop.startsWith('--')) {
            collector.definition(prop, 'custom-property', value.text, baseOffset + (node.source?.start?.offset ?? 0), selector);
            collector.customProperty({
                name: prop, value: value.text, offset, host, tokenBlock: isTokenBlock(node, selector),
                ...(selector === undefined ? {} : { selector }),
                ...(atRules.length ? { atRules } : {}),
            });
            return;
        }
        if (prop.startsWith('$')) {
            collector.definition(prop, 'scss-variable', value.text, baseOffset + (node.source?.start?.offset ?? 0), selector);
            return;
        }

        const property = prop.toLowerCase();
        if (isSkippedInAtRule(property, atRuleNamesOf(node))) {
            return;
        }
        if (property === 'font-size' && (selector === 'html' || selector === ':root') && atRules.length === 0) {
            const px = rootFontSizePx(value.text);
            if (px !== undefined) {
                collector.rootFontSize(px, offset);
            }
        }

        collector.declaration({
            property,
            value: value.text,
            offset,
            host,
            siblings: siblingsOf(node.parent, css, syntax, siblingsCache),
            ...(selector === undefined ? {} : { selector }),
            atRules,
        });
    });
}

/** At-rules cuja condição tem breakpoints (`@media (min-width: 768px)`, `@container (width > 400px)`). */
const BREAKPOINT_AT_RULES: ReadonlySet<string> = new Set(['media', 'container']);

/** Texto original da condição de uma at-rule e sua posição. `undefined` se a posição não bater com o texto. */
function paramsOf(node: AtRule, css: string): { text: string; offset: number } | undefined {
    const start = node.source?.start?.offset;
    const text = (node.raws as { params?: { raw?: string } }).params?.raw ?? node.params;
    if (start === undefined || !text) {
        return undefined;
    }
    const offset = start + 1 + node.name.length + (node.raws.afterName?.length ?? 0);
    // Os parsers de SCSS, Sass e Less guardam a condição de jeitos diferentes: só usa o que bate com o arquivo
    return css.slice(offset, offset + text.length) === text ? { text, offset } : undefined;
}

/**
 * Bloco de tokens: onde uma custom property com valor literal É o token, não um valor solto.
 * - `:root` e `html`, com ou sem qualificador (`:root[data-theme="dark"]`, `html.dark`);
 * - regra só com custom properties que não é `:host` (tema por classe: `.dark { --bg: #000 }`).
 * Declaração fora de regra (topo do arquivo) também conta: não pertence a nenhum componente.
 */
function isTokenBlock(node: PostcssDeclaration, selector: string | undefined): boolean {
    if (selector === undefined) {
        return true;
    }
    const parts = splitSelectors(selector);
    if (parts.every((part) => /^(:root|html)(?![\w-])/i.test(part))) {
        return true;
    }
    const onlyCustomProperties = (node.parent?.nodes ?? []).every((child) => child.type !== 'decl' || child.prop.startsWith('--'));
    return onlyCustomProperties && !/:host(?![\w-])/i.test(selector);
}

/**
 * Analisa uma lista de declarações solta, sem seletor: o conteúdo de `style="color: red; padding: 4px"`.
 * `selector` descreve o elemento (`button.remove`), para a análise de contexto.
 */
export function walkDeclarationList(collector: FileCollector, text: string, baseOffset: number, host: Host, selector: string | undefined): void {
    let root: Root;
    try {
        root = postcss.parse(text);
    } catch (error) {
        if (error instanceof CssSyntaxError) {
            collector.error(baseOffset + offsetAt(text, error.line ?? 1, error.column ?? 1), error.reason);
            return;
        }
        throw error;
    }
    const siblings = siblingsOf(root, text, 'css', new Map());
    for (const node of root.nodes) {
        if (node.type !== 'decl') {
            continue;
        }
        const value = valueOf(node, text, 'css');
        if (!value || node.prop.startsWith('--')) {
            continue;
        }
        collector.declaration({
            property: node.prop.toLowerCase(),
            value: value.text,
            offset: baseOffset + value.offset,
            host,
            siblings,
            ...(selector === undefined ? {} : { selector }),
        });
    }
}

interface LessAtRule extends AtRule {
    variable?: boolean;
    value?: string;
}

interface SassDeclaration extends PostcssDeclaration {
    expression?: { source?: { start?: { offset: number }; end?: { offset: number } } };
}

/**
 * Texto original do valor e sua posição na folha de estilo.
 * - CSS, SCSS e Less: o PostCSS tira comentários de `decl.value`; o texto original fica em `raws.value.raw`.
 * - Sass: o `sass-parser` reescreve o valor (`#FFF` vira `#ffffff`), mas guarda a posição da expressão original.
 */
function valueOf(decl: PostcssDeclaration, css: string, syntax: StyleSyntax): { text: string; offset: number } | undefined {
    const start = decl.source?.start?.offset;
    if (start === undefined) {
        return undefined;
    }
    if (syntax === 'sass') {
        const range = (decl as SassDeclaration).expression?.source;
        const from = range?.start?.offset;
        const to = range?.end?.offset;
        return from === undefined || to === undefined ? undefined : { text: css.slice(from, to), offset: from };
    }
    const text = decl.raws.value?.raw ?? decl.value;
    return { text, offset: start + decl.prop.length + (decl.raws.between?.length ?? 0) };
}

/** Declarações irmãs (mesma regra), para as regras que dependem de contexto (`max-width` + `margin: 0 auto`). */
function siblingsOf(parent: Container | undefined, css: string, syntax: StyleSyntax, cache: Map<Container, Map<string, string>>): Map<string, string> {
    if (!parent) {
        return new Map();
    }
    let siblings = cache.get(parent);
    if (!siblings) {
        siblings = new Map();
        for (const child of parent.nodes ?? []) {
            if (child.type === 'decl') {
                const value = valueOf(child, css, syntax);
                if (value) {
                    siblings.set(child.prop.toLowerCase(), value.text);
                }
            }
        }
        cache.set(parent, siblings);
    }
    return siblings;
}

/** `html { font-size: X }` em px: `62.5%` → 10, `10px` → 10. `rem`/`em` na raiz são relativos ao padrão do navegador (16px). */
function rootFontSizePx(value: string): number | undefined {
    const token = tokenize({ css: value }).find((t) => !isTokenWhitespace(t));
    if (token && isTokenPercentage(token) && token[4].value > 0) {
        return (token[4].value / 100) * 16;
    }
    if (!token || !isTokenDimension(token) || token[4].value <= 0) {
        return undefined;
    }
    const factor: Record<string, number> = { px: 1, rem: 16, em: 16 };
    const unit = factor[token[4].unit.toLowerCase()];
    return unit === undefined ? undefined : token[4].value * unit;
}

/** Posição de um erro de sintaxe, nos formatos do PostCSS e do `sass-parser`. */
function syntaxErrorPosition(error: unknown): { line: number; column: number; message: string } | undefined {
    if (error instanceof CssSyntaxError) {
        return { line: error.line ?? 1, column: error.column ?? 1, message: error.reason };
    }
    // O `sass-parser` lança o erro do Sass compilado de Dart: a posição só aparece no fim da mensagem (`- 5:5  root stylesheet`)
    if (error instanceof Error && 'dartException' in error) {
        const [first = 'Syntax error', ...rest] = error.message.split('\n');
        const location = rest.map((line) => line.trim()).find((line) => line.startsWith('- '));
        const [line, column] = (location?.slice(2).split(/\s/)[0] ?? '1:1').split(':').map(Number);
        return { line: line || 1, column: column || 1, message: first.replace(/^Error: /, '') };
    }
    return undefined;
}
