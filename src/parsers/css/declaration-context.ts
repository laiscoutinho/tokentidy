/** Onde uma declaração está na folha de estilo: o seletor completo e as at-rules em volta. */

import type { AtRule, ChildNode, Node, Rule } from 'postcss';

/**
 * Seletor completo da regra, com o aninhamento do SCSS/Less/Sass resolvido:
 * `.btn { &:hover {} }` → `.btn:hover`; `.card { .title {} }` → `.card .title`.
 * At-rules no meio do caminho (`@media`) não mudam o seletor.
 */
export function selectorOf(node: ChildNode): string | undefined {
    const chain: string[][] = [];
    for (const current of ancestors(node)) {
        if (current.type === 'rule') {
            chain.unshift(splitSelectors((current as Rule).selector));
        }
    }
    if (chain.length === 0) {
        return undefined;
    }
    let resolved = chain[0]!;
    for (const level of chain.slice(1)) {
        resolved = resolved.flatMap((parent) =>
            level.map((child) => (child.includes('&') ? child.split('&').join(parent) : `${parent} ${child}`)));
    }
    return resolved.join(', ');
}

/** Separa `a, b` em `['a', 'b']`, sem quebrar vírgulas dentro de parênteses (`:is(a, b)`) ou colchetes. */
export function splitSelectors(selector: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of selector) {
        if (char === '(' || char === '[') {
            depth++;
        } else if (char === ')' || char === ']') {
            depth--;
        }
        if (char === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current.trim());
    return parts.filter(Boolean).map((part) => part.split(/\s+/).join(' '));
}

/** Regras e at-rules que contêm o nó, de dentro para fora (sem a raiz). */
function* ancestors(node: ChildNode): Generator<Node> {
    for (let current = node.parent as Node | undefined; current && current.type !== 'root' && current.type !== 'document'; current = current.parent as Node | undefined) {
        yield current;
    }
}

/** Nomes das at-rules em volta do nó (`keyframes`, `font-face`), sem o `@`. */
export function atRuleNamesOf(node: ChildNode): string[] {
    return [...ancestors(node)].filter((current) => current.type === 'atrule').map((current) => (current as AtRule).name);
}

/** At-rules em volta do nó, de fora para dentro (`@media (max-width: 600px)`). */
export function atRulesOf(node: ChildNode): string[] {
    const atRules: string[] = [];
    for (const current of ancestors(node)) {
        if (current.type === 'atrule') {
            const atRule = current as AtRule;
            atRules.unshift(`@${atRule.name}${atRule.params ? ` ${atRule.params}` : ''}`);
        }
    }
    return atRules;
}
