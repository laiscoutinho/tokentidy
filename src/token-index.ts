/**
 * Tokens que o projeto já tem e onde cada um funciona. Definição única de "token utilizável":
 * `generate` (reutilizar em vez de criar) e `fix` (trocar o valor pelo token) precisam concordar,
 * senão um valor fica sem token novo e também sem troca.
 */

import { rulesForProperty } from './analysis/rules.ts';
import { normalizeValue } from './values/normalize.ts';
import { colorInfo } from './values/color-info.ts';
import { typeFromName } from './values/type-from-name.ts';
import type { Host, TokenDefinition, TokenReference, TokenType } from './types.ts';

export interface ReusableDefinition {
    definition: TokenDefinition;
    type: TokenType;
    key: string;
}

const GLOBAL_SELECTORS = new Set([':root', 'html', 'body']);

// Map: `$type` vem de arquivo do usuário, e `constructor`/`__proto__` não podem cair no Object.prototype
export const DTCG_TYPES = new Map<string, TokenType>([
    ['color', 'color'], ['fontFamily', 'font-family'], ['fontWeight', 'font-weight'], ['duration', 'duration'],
    ['cubicBezier', 'easing'], ['shadow', 'shadow'],
]);

/**
 * Tokens do projeto que podem substituir um valor solto. O tipo vem de onde o token é usado
 * (`var(--x)` em `padding` → espaçamento) ou do próprio valor quando ele não deixa dúvida (uma cor).
 * Sem uso, o nome decide quando declara um único tipo e o valor combina (`--space-4: 16px` → espaçamento):
 * o nome é a equipe dizendo o que o token é. Token sem uso, com nome que não diz o tipo e valor ambíguo
 * (`$base: 16px`: tamanho de fonte? espaçamento?) não entra: reutilizar por palpite seria uma afirmação falsa.
 * Tokens que apontam para outros (`--a: var(--b)`) também não: o valor final depende de outro arquivo.
 * Custom property só entra se vale no documento todo e tem um único valor: redefinida com outro valor é
 * variável de tema, e trocar o valor solto por ela mudaria a aparência no outro tema.
 * SCSS/Less só de nível de arquivo: dentro de uma regra, a variável só existe ali.
 */
export function reusableDefinitions(definitions: readonly TokenDefinition[], references: readonly TokenReference[]): ReusableDefinition[] {
    const usedAs = usageTypes(references);
    const customProperties = Map.groupBy(definitions.filter((d) => d.syntax === 'custom-property'), (d) => d.name);
    const reusable: ReusableDefinition[] = [];
    for (const definition of definitions) {
        for (const type of typesOf(definition, usedAs)) {
            const key = normalizeValue(type, definition.value);
            if (dependable(definition, type, key, customProperties.get(definition.name) ?? [])) {
                reusable.push({ definition, type, key });
            }
        }
    }
    return reusable;
}

function usageTypes(references: readonly TokenReference[]): Map<string, Set<TokenType>> {
    const usedAs = new Map<string, Set<TokenType>>();
    for (const ref of references) {
        const types = usedAs.get(ref.name) ?? new Set();
        for (const rule of rulesForProperty(ref.property)) {
            types.add(rule.type);
        }
        usedAs.set(ref.name, types);
    }
    return usedAs;
}

/** Tipos de uma definição literal; vazio se ela aponta para outro token ou se nada diz o que ela é. */
function typesOf(definition: TokenDefinition, usedAs: ReadonlyMap<string, ReadonlySet<TokenType>>): Set<TokenType> {
    if (/var\(|^[$@]|\$|\{.*\}/.test(definition.value)) {
        return new Set();
    }
    const types = new Set(usedAs.get(definition.name) ?? []);
    const dtcgType = definition.dtcgType ? DTCG_TYPES.get(definition.dtcgType) : undefined;
    if (dtcgType) {
        types.add(dtcgType);
    }
    if (definition.declaredType) {
        types.add(definition.declaredType);
    }
    // Sem uso e sem tipo declarado, o nome é a declaração da equipe (`--space-4: 16px`, `space.4` no DTCG)
    const named = types.size === 0 ? typeFromName(definition.name, definition.value) : undefined;
    if (named) {
        types.add(named);
    }
    if (types.size === 0 && colorInfo(definition.value)) {
        types.add('color');
    }
    return types;
}

/** Definição que só vale dentro de um escopo (`.dark { --bg: #000 }`). */
export interface ScopedDefinition extends ReusableDefinition {
    scope: string;
    /** Outros escopos do mesmo nome: um mais específico (`.dark .sidebar`) ganha deste. */
    rivals: string[];
}

/**
 * Custom properties com mais de um valor (variáveis de tema). Fora dos escopos elas continuam sem servir:
 * o valor muda com o tema. Dentro de `.dark`, `var(--bg)` resolve para o valor de `.dark`, e a troca é exata.
 */
export function scopedOverrides(definitions: readonly TokenDefinition[], references: readonly TokenReference[]): ScopedDefinition[] {
    const usedAs = usageTypes(references);
    const scoped: ScopedDefinition[] = [];
    for (const sameName of Map.groupBy(definitions.filter((d) => d.syntax === 'custom-property'), (d) => d.name).values()) {
        if (new Set(sameName.map((d) => d.value)).size < 2) {
            continue;
        }
        for (const definition of sameName.filter((d) => d.selector !== undefined && !isGlobal(d.selector))) {
            const rivals = sameName.filter((d) => d !== definition && d.selector !== undefined && !isGlobal(d.selector)).map((d) => d.selector!);
            for (const type of typesOf(definition, usedAs)) {
                scoped.push({ definition, type, key: normalizeValue(type, definition.value), scope: definition.selector!, rivals });
            }
        }
    }
    return scoped;
}

/** Cada parte do seletor do valor está sob `scope`, e nenhum escopo mais específico define o token ali. */
export function resolvesUnder(selector: string | undefined, scope: string, rivals: readonly string[]): boolean {
    // Vírgula dentro de `:is()` não separa regras: em vez de interpretar, não afirma nada
    if (selector === undefined || selector.includes('(')) {
        return false;
    }
    const under = (part: string, candidate: string) => candidate.split(',').map((s) => s.trim()).some((s) => isUnder(part, s));
    const longerRivals = rivals.filter((rival) => rival.length > scope.length);
    return selector.split(',').map((part) => part.trim()).every((part) => under(part, scope) && !longerRivals.some((rival) => under(part, rival)));
}

/** `.dark .card`, `.dark:hover` e `html.dark .card` estão sob `.dark`; `.darker .card` não. */
function isUnder(part: string, scope: string): boolean {
    if (part.startsWith(scope) && /^($|[\s>~+:])/.test(part.slice(scope.length))) {
        return true;
    }
    const [first = ''] = part.split(/[\s>~+]/);
    return /^[.[]/.test(scope) && !/\s/.test(scope) && first.endsWith(scope);
}

function dependable(definition: TokenDefinition, type: TokenType, key: string, sameName: readonly TokenDefinition[]): boolean {
    switch (definition.syntax) {
        case 'custom-property':
            return sameName.some((d) => isGlobal(d.selector)) && sameName.every((d) => normalizeValue(type, d.value) === key);
        case 'scss-variable':
        case 'less-variable':
            return definition.selector === undefined;
        case 'dtcg':
        case 'js-theme':
            return true;
    }
}

/** Basta uma parte global (`:root, [data-theme=light]`): uma redefinição com outro valor já tira o token. */
function isGlobal(selector: string | undefined): boolean {
    return selector !== undefined && selector.split(',').some((part) => GLOBAL_SELECTORS.has(part.trim()));
}

/** Onde cada tipo de token funciona: `var(--x)` em qualquer lugar; `$x` só em SCSS/Sass; `@x` só em Less. */
export function usableIn(definition: TokenDefinition, host: Host): boolean {
    switch (definition.syntax) {
        case 'custom-property':
            return true;
        case 'scss-variable':
            return host === 'scss' || host === 'sass';
        case 'less-variable':
            return host === 'less';
        case 'dtcg':
        case 'js-theme':
            // DTCG: o nome no código depende de como o projeto o compila. Tema JS: só existe onde o `theme` chega
            return false;
    }
}
