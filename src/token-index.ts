/**
 * Tokens que o projeto já tem e onde cada um funciona. Definição única de "token utilizável":
 * `generate` (reutilizar em vez de criar) e `fix` (trocar o valor pelo token) precisam concordar,
 * senão um valor fica sem token novo e também sem troca.
 */

import { rulesForProperty } from './analysis/rules.ts';
import { normalizeValue } from './values/normalize.ts';
import { colorInfo } from './values/color-info.ts';
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
 * Token sem uso e com valor ambíguo (`$base: 16px`: tamanho de fonte? espaçamento?) não entra:
 * reutilizar por palpite seria uma afirmação falsa.
 * Tokens que apontam para outros (`--a: var(--b)`) também não: o valor final depende de outro arquivo.
 * Custom property só entra se vale no documento todo e tem um único valor: redefinida com outro valor é
 * variável de tema, e trocar o valor solto por ela mudaria a aparência no outro tema.
 * SCSS/Less só de nível de arquivo: dentro de uma regra, a variável só existe ali.
 */
export function reusableDefinitions(definitions: readonly TokenDefinition[], references: readonly TokenReference[]): ReusableDefinition[] {
    const usedAs = new Map<string, Set<TokenType>>();
    for (const ref of references) {
        const types = usedAs.get(ref.name) ?? new Set();
        for (const rule of rulesForProperty(ref.property)) {
            types.add(rule.type);
        }
        usedAs.set(ref.name, types);
    }

    const customProperties = Map.groupBy(definitions.filter((d) => d.syntax === 'custom-property'), (d) => d.name);
    const reusable: ReusableDefinition[] = [];
    for (const definition of definitions) {
        if (/var\(|^[$@]|\$|\{.*\}/.test(definition.value)) {
            continue;
        }
        const types = new Set(usedAs.get(definition.name) ?? []);
        const dtcgType = definition.dtcgType ? DTCG_TYPES.get(definition.dtcgType) : undefined;
        if (dtcgType) {
            types.add(dtcgType);
        }
        if (types.size === 0 && colorInfo(definition.value)) {
            types.add('color');
        }
        for (const type of types) {
            const key = normalizeValue(type, definition.value);
            if (dependable(definition, type, key, customProperties.get(definition.name) ?? [])) {
                reusable.push({ definition, type, key });
            }
        }
    }
    return reusable;
}

function dependable(definition: TokenDefinition, type: TokenType, key: string, sameName: readonly TokenDefinition[]): boolean {
    switch (definition.syntax) {
        case 'custom-property':
            return sameName.some((d) => isGlobal(d.selector)) && sameName.every((d) => normalizeValue(type, d.value) === key);
        case 'scss-variable':
        case 'less-variable':
            return definition.selector === undefined;
        case 'dtcg':
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
            // O nome no código depende de como o projeto compila o arquivo DTCG: não dá para usar direto
            return false;
    }
}
