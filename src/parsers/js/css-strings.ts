/**
 * CSS em template literal sem tag: `const STYLES = \`.a { outline: 3px solid #00a32a; }\``, ou um
 * `<style>…</style>` dentro de HTML montado no JavaScript. Sem tag não há certeza de que o texto é CSS,
 * então ele só é lido quando parece uma folha de estilo de verdade: o parser de CSS aceita, há regra com
 * propriedade de design e nada fica solto fora das regras. Esse CSS costuma ir para um iframe ou outra
 * janela, onde os tokens podem não estar carregados: o host é `css-string`, que o `fix` só reporta.
 */

import postcss from 'postcss';
import type * as t from '@babel/types';

import { rulesForProperty } from '../../analysis/rules.ts';
import type { FileCollector } from '../collector.ts';
import { templateText, walkSection } from './css-in-js.ts';

const STYLE_SECTION = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
/** Atalho antes do parser: sem `{` seguido de `prop:` não há regra. */
const MAY_BE_CSS = /\{[^{}]*?[a-z-]+\s*:/i;

export function walkCssString(collector: FileCollector, template: t.TemplateLiteral): void {
    const built = templateText(collector.source, template);
    if (!built || !MAY_BE_CSS.test(built.text)) {
        return;
    }
    const sections = [...built.text.matchAll(STYLE_SECTION)];
    if (sections.length > 0) {
        for (const section of sections) {
            const from = section.index + section[0].indexOf('>') + 1;
            const to = from + section[1]!.length;
            if (looksLikeStylesheet(built.text.slice(from, to))) {
                walkSection(collector, built, from, to, 'css-string');
            }
        }
        return;
    }
    if (looksLikeStylesheet(built.text)) {
        walkSection(collector, built, 0, built.text.length, 'css-string');
    }
}

/**
 * CSS de verdade: o parser estrito aceita, a raiz só tem regras, at-rules e comentários, toda declaração
 * tem nome de propriedade, e ao menos uma é de design (cor, medida). GraphQL, JS e texto com `{}` falham aqui.
 */
export function looksLikeStylesheet(text: string): boolean {
    let root: postcss.Root;
    try {
        root = postcss.parse(text);
    } catch {
        return false;
    }
    if (root.nodes.some((node) => node.type === 'decl')) {
        return false;
    }
    let rules = 0;
    let design = 0;
    let valid = true;
    root.walk((node) => {
        if (node.type === 'rule') {
            rules += 1;
        } else if (node.type === 'decl') {
            if (!/^(--[\w-]+|-?[a-z][a-z-]*)$/i.test(node.prop)) {
                valid = false;
            } else if (rulesForProperty(node.prop.toLowerCase()).length > 0) {
                design += 1;
            }
        }
    });
    return valid && rules > 0 && design > 0;
}
