/**
 * Tokens que o projeto já tem e onde cada um funciona. Definição única de "token utilizável":
 * `generate` (reutilizar em vez de criar) e `fix` (trocar o valor pelo token) precisam concordar,
 * senão um valor fica sem token novo e também sem troca.
 */

import { rulesForProperty } from './analysis/rules.ts';
import { normalizeValue } from './values/normalize.ts';
import { colorInfo } from './values/color-info.ts';
import { hasSizeWord, typeFromName } from './values/type-from-name.ts';
import { isTestPath } from './project/scanner.ts';
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
 * Tokens do projeto que podem substituir um valor solto. O tipo vem, nesta ordem, de:
 * - o que a equipe declarou: `$type` do DTCG, o tipo do tema JS ou o nome, quando ele aponta um único tipo que combina
 *   com o valor (`--space-4: 16px` → espaçamento, `$border-width: 1px` → espessura de borda). A declaração vale mais
 *   que o uso: `$border-width` usado num `margin` continua espessura de borda, e não vira espaçamento;
 * - onde o token é usado (`var(--x)` em `padding` → espaçamento), quando o nome não diz o tipo. Nome com `size` solto
 *   (`--dimension-size-md`) é tamanho de elemento: só vira espaçamento se for usado mais como espaçamento que como tamanho;
 * - o próprio valor, quando ele não deixa dúvida (uma cor).
 * Token sem uso, com nome que não diz o tipo e valor ambíguo (`$base: 16px`) não entra: seria uma afirmação falsa.
 * Tokens que apontam para outros (`--a: var(--b)`) também não: o valor final depende de outro arquivo.
 * Custom property só entra se vale no documento todo e tem um único valor: redefinida com outro valor é
 * variável de tema, e trocar o valor solto por ela mudaria a aparência no outro tema.
 * SCSS/Less só de nível de arquivo: dentro de uma regra, a variável só existe ali.
 * Token definido em teste, fixture ou story nunca entra: é entrada de teste, não decisão de design.
 */
export function reusableDefinitions(definitions: readonly TokenDefinition[], references: readonly TokenReference[]): ReusableDefinition[] {
    return classifyDefinitions(definitions, references).reusable;
}

/** Por que um token com o valor certo não serve: o nome diz outro tipo (`family`) ou ele vem de teste (`test-source`). */
export type RejectionReason = 'family' | 'test-source';

export interface RejectedDefinition extends ReusableDefinition {
    reason: RejectionReason;
    /** `family`: o tipo que o nome (ou o `$type`) declara. */
    declared?: TokenType;
}

/** Tokens que servem e os que, com o mesmo valor, foram recusados (para o `fix` dizer por que não trocou). */
export function classifyDefinitions(definitions: readonly TokenDefinition[], references: readonly TokenReference[]): {
    reusable: ReusableDefinition[];
    rejected: RejectedDefinition[];
} {
    const usedAs = usageTypes(references);
    const customProperties = Map.groupBy(definitions.filter((d) => d.syntax === 'custom-property'), (d) => d.name);
    const reusable: ReusableDefinition[] = [];
    const rejected: RejectedDefinition[] = [];
    for (const definition of definitions) {
        const { types, refused, declared } = typesOf(definition, usedAs);
        const fromTest = isTestPath(definition.file);
        for (const type of types) {
            const key = normalizeValue(type, definition.value);
            if (!dependable(definition, type, key, customProperties.get(definition.name) ?? [])) {
                continue;
            }
            if (fromTest) {
                rejected.push({ definition, type, key, reason: 'test-source' });
            } else {
                reusable.push({ definition, type, key });
            }
        }
        for (const type of refused) {
            const key = normalizeValue(type, definition.value);
            if (dependable(definition, type, key, customProperties.get(definition.name) ?? [])) {
                rejected.push({ definition, type, key, reason: fromTest ? 'test-source' : 'family', ...(declared ? { declared } : {}) });
            }
        }
    }
    return { reusable, rejected };
}

/** Quantas vezes cada token é usado como cada tipo; a família (`--size` de `--size-md`) soma os usos dos irmãos. */
interface Usage {
    byName: Map<string, Map<TokenType, number>>;
    byFamily: Map<string, Map<TokenType, number>>;
}

function usageTypes(references: readonly TokenReference[]): Usage {
    const usage: Usage = { byName: new Map(), byFamily: new Map() };
    const count = (map: Map<string, Map<TokenType, number>>, key: string, type: TokenType) => {
        const types = map.get(key) ?? new Map<TokenType, number>();
        types.set(type, (types.get(type) ?? 0) + 1);
        map.set(key, types);
    };
    for (const ref of references) {
        usage.byName.set(ref.name, usage.byName.get(ref.name) ?? new Map());
        for (const rule of rulesForProperty(ref.property)) {
            count(usage.byName, ref.name, rule.type);
            count(usage.byFamily, familyOf(ref.name), rule.type);
        }
    }
    return usage;
}

/** O nome sem o último pedaço: `--wpds-dimension-size-5xs` → `--wpds-dimension-size`. */
function familyOf(name: string): string {
    return name.replace(/[-_.][^-_.]*$/, '');
}

interface DefinitionTypes {
    types: Set<TokenType>;
    /** Tipos de uso que a declaração do token contradiz. */
    refused: Set<TokenType>;
    declared?: TokenType;
}

const ELEMENT_SIZES: ReadonlySet<TokenType> = new Set(['size', 'container']);

/** Tipos de uma definição literal; vazio se ela aponta para outro token ou se nada diz o que ela é. */
function typesOf(definition: TokenDefinition, usedAs: Usage): DefinitionTypes {
    if (/var\(|^[$@]|\$|\{.*\}/.test(definition.value)) {
        return { types: new Set(), refused: new Set() };
    }
    const usage = usedAs.byName.get(definition.name) ?? new Map<TokenType, number>();
    const declared = (definition.dtcgType ? DTCG_TYPES.get(definition.dtcgType) : undefined)
        ?? definition.declaredType
        ?? typeFromName(definition.name, definition.value);
    if (declared) {
        return { types: new Set([declared]), refused: new Set([...usage.keys()].filter((type) => type !== declared)), declared };
    }
    const types = new Set(usage.keys());
    const refused = new Set<TokenType>();
    if (hasSizeWord(definition.name)) {
        /**
         * `size` é tamanho de elemento: espaçamento só se for o uso principal da família inteira (o `--size-*` do
         * Open Props). Pela família, e não pelo token: `--dimension-size-5xs` usado em margens continua tamanho
         * quando os irmãos dele vão para `width` e `height`
         */
        const family = usedAs.byFamily.get(familyOf(definition.name)) ?? usage;
        const sizeUses = [...ELEMENT_SIZES].reduce((total, type) => total + (family.get(type) ?? 0), 0);
        for (const type of types) {
            const keep = ELEMENT_SIZES.has(type) || (type === 'spacing' && (family.get('spacing') ?? 0) >= sizeUses);
            if (!keep) {
                types.delete(type);
                refused.add(type);
            }
        }
    }
    if (types.size === 0 && refused.size === 0 && colorInfo(definition.value)) {
        types.add('color');
    }
    return { types, refused };
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
    definitions = definitions.filter((d) => !isTestPath(d.file));
    for (const sameName of Map.groupBy(definitions.filter((d) => d.syntax === 'custom-property'), (d) => d.name).values()) {
        if (new Set(sameName.map((d) => d.value)).size < 2) {
            continue;
        }
        for (const definition of sameName.filter((d) => d.selector !== undefined && !isGlobal(d.selector))) {
            const rivals = sameName.filter((d) => d !== definition && d.selector !== undefined && !isGlobal(d.selector)).map((d) => d.selector!);
            for (const type of typesOf(definition, usedAs).types) {
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
