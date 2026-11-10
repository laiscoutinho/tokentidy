/**
 * `tokens.ts`/`tokens.js`: os mesmos tokens como objetos, para onde o JavaScript lê o valor (canvas, gráficos)
 * e `var()` não funciona. Sai da mesma árvore DTCG que o CSS.
 */

import { cssValueOf } from '../../parsers/dtcg.ts';
import { extensionOf, tokensOf } from './dtcg-tree.ts';
import type { DtcgTree } from './dtcg-tree.ts';

export type ModuleLanguage = 'ts' | 'js';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const INTEGER = /^(?:0|[1-9]\d*)$/;
const RESERVED = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
    'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this',
    'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'await',
]);

/** Primeiro nível do caminho, que vira `export const`: `font-size` → `fontSize`. */
function exportName(segment: string): string {
    const camel = segment.replace(/[^A-Za-z0-9_$]+(.)?/g, (_, next: string | undefined) => (next ?? '').toUpperCase());
    return IDENTIFIER.test(camel) && !RESERVED.has(camel) ? camel : `_${camel}`;
}

function quoted(value: string, quote: string): string {
    const body = JSON.stringify(value).slice(1, -1).replaceAll('\\"', '"');
    return `${quote}${body.replaceAll(quote, `\\${quote}`)}${quote}`;
}

export interface ModuleAccess {
    /** O que se importa: `color`. */
    root: string;
    /** O resto do caminho: `.indigo[600]`. */
    rest: string;
}

/** Como o código lê o token: `color.indigo[600]`. */
export function moduleAccess(trail: readonly string[], quote = "'"): ModuleAccess {
    const rest = trail.slice(1).map((segment) => {
        if (INTEGER.test(segment)) {
            return `[${segment}]`;
        }
        return IDENTIFIER.test(segment) ? `.${segment}` : `[${quoted(segment, quote)}]`;
    });
    return { root: exportName(trail[0]!), rest: rest.join('') };
}

interface Group {
    children: Map<string, Group | string>;
}

function renderGroup(group: Group, depth: number): string {
    const indent = '  '.repeat(depth + 1);
    const lines = [...group.children].map(([key, child]) => {
        const name = INTEGER.test(key) || IDENTIFIER.test(key) ? key : quoted(key, "'");
        return `${indent}${name}: ${typeof child === 'string' ? quoted(child, "'") : renderGroup(child, depth + 1)},`;
    });
    return `{\n${lines.join('\n')}\n${'  '.repeat(depth)}}`;
}

/** Valor final de cada token: no módulo não existe `var()`, então o alias já sai resolvido. */
function resolvedValues(tree: DtcgTree): { trail: string[]; value: string }[] {
    const tokens = [...tokensOf(tree)];
    const byPath = new Map(tokens.map((entry) => [entry.path.join('.'), entry]));
    const reference = (value: unknown) => (typeof value === 'string' ? /^\{([^}]+)\}$/.exec(value)?.[1] : undefined);
    const resolved: { trail: string[]; value: string }[] = [];
    for (const entry of tokens) {
        let current: typeof entry | undefined = entry;
        // O limite corta uma referência circular escrita à mão: um ciclo não tem valor
        for (let hops = 0; current && reference(current.token.$value) && hops < tokens.length; hops += 1) {
            current = byPath.get(reference(current.token.$value)!);
        }
        if (!current || reference(current.token.$value)) {
            continue;
        }
        const value = (extensionOf(current.token) as { css?: string } | undefined)?.css ?? cssValueOf(current.token.$value, current.type);
        if (value !== undefined) {
            resolved.push({ trail: entry.path, value });
        }
    }
    return resolved;
}

export function renderTokenModule(tree: DtcgTree, language: ModuleLanguage, header: string): string {
    const suffix = language === 'ts' ? ' as const' : '';
    const roots = new Map<string, Group | string>();
    for (const { trail, value } of resolvedValues(tree)) {
        const root = exportName(trail[0]!);
        if (trail.length === 1) {
            roots.set(root, value);
            continue;
        }
        let group = roots.get(root) as Group | undefined;
        if (!group) {
            group = { children: new Map() };
            roots.set(root, group);
        }
        for (const segment of trail.slice(1, -1)) {
            let next = group.children.get(segment) as Group | undefined;
            if (!next) {
                next = { children: new Map() };
                group.children.set(segment, next);
            }
            group = next;
        }
        group.children.set(trail.at(-1)!, value);
    }
    const blocks = [...roots].map(([name, value]) => `export const ${name} = ${typeof value === 'string' ? quoted(value, "'") : renderGroup(value, 0)}${suffix};`);
    return `${header}\n${blocks.join('\n\n')}\n`;
}
