/**
 * Tokens que o projeto já tem e onde cada um funciona. Usado pelo `generate` (reutilizar em vez de criar)
 * e pelo `fix` (trocar o valor solto pelo token).
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
            reusable.push({ definition, type, key: normalizeValue(type, definition.value) });
        }
    }
    return reusable;
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
