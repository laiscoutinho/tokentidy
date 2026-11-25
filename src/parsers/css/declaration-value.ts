/** Texto original de uma declaração, suas irmãs na mesma regra e o tamanho de fonte da raiz. */

import { tokenize, isTokenDimension, isTokenPercentage, isTokenWhitespace } from '@csstools/css-tokenizer';
import type { Container, Declaration as PostcssDeclaration } from 'postcss';

import type { StyleSyntax } from './stylesheet.ts';

interface SassDeclaration extends PostcssDeclaration {
    expression?: { source?: { start?: { offset: number }; end?: { offset: number } } };
}

/**
 * Texto original do valor e sua posição na folha de estilo.
 * - CSS, SCSS e Less: o PostCSS tira comentários de `decl.value`; o texto original fica em `raws.value.raw`.
 * - Sass: o `sass-parser` reescreve o valor (`#FFF` vira `#ffffff`), mas guarda a posição da expressão original.
 */
export function valueOf(decl: PostcssDeclaration, css: string, syntax: StyleSyntax): { text: string; offset: number } | undefined {
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
export function siblingsOf(parent: Container | undefined, css: string, syntax: StyleSyntax, cache: Map<Container, Map<string, string>>): Map<string, string> {
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
export function rootFontSizePx(value: string): number | undefined {
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
