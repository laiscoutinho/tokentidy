/**
 * Modelo de elemento: para cada regra, o valor de cada lado, de cada cor e de cada medida, e as ligações entre regras
 * (estado e base, pai e filho). As guardas comparam esse modelo antes e depois de uma troca.
 */

import { rulesForProperty } from '../analysis/rules.ts';
import type { ElementFact, Finding, TokenDefinition, TokenReference } from '../types.ts';
import { normalizeFinding, normalizeValue } from '../values/normalize.ts';
import { compoundsOf, describeSelector } from './selectors.ts';
import type { SelectorInfo } from './selectors.ts';

export interface Slot {
    /** Valor normalizado. */
    value: string;
    /** Achados que escrevem o valor; vazio quando o valor vem de um token já usado (não pode mudar). */
    findings: Finding[];
}

export interface ModelRule extends SelectorInfo {
    selector: string;
    atRules: string;
    slots: Map<string, Slot>;
}

export interface Model {
    rules: ModelRule[];
    /** Estado e base da mesma cor: `[.btn:hover, .btn]`. */
    statePairs: [ModelRule, ModelRule][];
    /** A primeira base de cada estado de `statePairs`. */
    baseOf: Map<ModelRule, ModelRule>;
    /** Pai direto ou mais próximo conhecido de cada regra, do mais próximo para o mais distante. */
    parents: Map<ModelRule, ModelRule[]>;
    /** Lados do mesmo ternário. */
    branches: [Finding, Finding][];
    /** Fundo da página (`body`, `html`, `:root`), para o último recurso do contraste. */
    page: ModelRule[];
}

const SIDES = ['top', 'right', 'bottom', 'left'];
const INLINE_HOSTS = new Set<Finding['host']>(['html', 'jsx', 'angular-template']);
const PAGE_SELECTORS = new Set(['body', 'html', ':root']);

/** Em que lados cai cada posição do atalho, com a regra do CSS (1, 2, 3 ou 4 valores). */
function shorthandSides(index: number, count: number): string[] {
    const table: Record<number, string[][]> = {
        1: [SIDES],
        2: [['top', 'bottom'], ['left', 'right']],
        3: [['top'], ['left', 'right'], ['bottom']],
        4: [['top'], ['right'], ['bottom'], ['left']],
    };
    return table[count]?.[index] ?? [];
}

/** Nome das posições no modelo para um valor; vazio se não for algo que as guardas comparam. */
export function slotsOf(finding: Pick<Finding, 'type' | 'property' | 'part'>): string[] {
    const { type, property, part } = finding;
    if (type === 'color') {
        return property === 'color' ? ['text'] : /^background(-color)?$/.test(property) ? ['bg'] : /^(border|outline)(-|$)/.test(property) ? ['border'] : [];
    }
    if (type === 'radius') {
        return part ? [] : ['radius'];
    }
    if (type === 'border-width' || type === 'font-size' || type === 'line-height') {
        return [type];
    }
    if (type !== 'spacing') {
        return [];
    }
    const [box = '', axis = ''] = property.split('-');
    if (box === 'padding' || box === 'margin') {
        if (axis === '') {
            return shorthandSides(part?.index ?? 0, part?.count ?? 1).map((side) => `${box}-${side}`);
        }
        if (axis === 'inline' || axis === 'block') {
            const sides = axis === 'inline' ? ['left', 'right'] : ['top', 'bottom'];
            return (part ? [sides[part.index]!] : sides).map((side) => `${box}-${side}`);
        }
        return SIDES.includes(axis) ? [`${box}-${axis}`] : [];
    }
    if (property === 'gap') {
        return part ? [part.index === 0 ? 'row-gap' : 'column-gap'] : ['row-gap', 'column-gap'];
    }
    return property === 'row-gap' || property === 'column-gap' ? [property] : [];
}

class ModelBuilder {
    readonly rules = new Map<string, ModelRule>();

    ruleFor(selector: string, atRules: string, file: string): ModelRule {
        // O mesmo seletor em dois arquivos são duas regras: com CSS Modules ou componentes, são elementos diferentes
        const id = `${file}\u0000${atRules}\u0000${selector}`;
        let rule = this.rules.get(id);
        if (!rule) {
            rule = { selector, atRules, slots: new Map(), ...describeSelector(selector) };
            this.rules.set(id, rule);
        }
        return rule;
    }
}

function selectorParts(selector: string | undefined, host: Finding['host']): string[] {
    if (!selector) {
        return [];
    }
    const parts = selector.split(',').map((part) => part.trim()).filter(Boolean);
    // Estilo inline em `<div>`: sem classe, não dá para dizer que dois `<div>` são o mesmo elemento
    return INLINE_HOSTS.has(host) ? parts.filter((part) => /[.#]/.test(part)) : parts;
}

/** Valor literal de cada token com um valor só: `.a { padding: var(--x) }` também conta como relação. */
function tokenValues(definitions: readonly TokenDefinition[]): Map<string, string | undefined> {
    const values = new Map<string, string | undefined>();
    for (const { name, value } of definitions) {
        values.set(name, values.has(name) && values.get(name) !== value ? undefined : value);
    }
    return values;
}

export interface ModelInput {
    findings: readonly Finding[];
    references?: readonly TokenReference[];
    definitions?: readonly TokenDefinition[];
    elements?: readonly ElementFact[];
}

export function buildModel(input: ModelInput): Model {
    const builder = new ModelBuilder();
    const sorted = input.findings.toSorted((a, b) => a.offset - b.offset);
    for (const finding of sorted) {
        const value = normalizeFinding(finding);
        for (const part of selectorParts(finding.selector, finding.host)) {
            const rule = builder.ruleFor(part, (finding.atRules ?? []).join(' '), finding.file);
            for (const name of slotsOf(finding)) {
                // Na mesma regra, a última declaração ganha
                rule.slots.set(name, { value, findings: [finding] });
            }
        }
    }

    const tokens = tokenValues(input.definitions ?? []);
    for (const reference of input.references ?? []) {
        const literal = tokens.get(reference.name);
        const [only, ...others] = rulesForProperty(reference.property);
        if (literal === undefined || !only || others.length > 0 || /var\(|^[$@{]/.test(literal)) {
            continue;
        }
        for (const part of selectorParts(reference.selector, 'css')) {
            const rule = builder.ruleFor(part, '', reference.file);
            for (const name of slotsOf({ type: only.type, property: reference.property })) {
                if (!rule.slots.has(name)) {
                    rule.slots.set(name, { value: normalizeValue(only.type, literal), findings: [] });
                }
            }
        }
    }

    return link([...builder.rules.values()], sorted, input.elements ?? []);
}

function link(rules: ModelRule[], findings: readonly Finding[], elements: readonly ElementFact[]): Model {
    const bySelector = Map.groupBy(rules, (rule) => `${rule.atRules}\u0000${rule.selector}`);
    const named = (selector: string, atRules: string) => bySelector.get(`${atRules}\u0000${selector}`) ?? [];
    const statePairs: [ModelRule, ModelRule][] = [];
    const seen = new Set<string>();
    // `indexOf` por par deixava o modelo quadrático em projetos grandes
    const index = new Map(rules.map((rule, i) => [rule, i]));
    const pair = (state: ModelRule, base: ModelRule) => {
        const id = `${index.get(state)}:${index.get(base)}`;
        if (state !== base && !seen.has(id)) {
            seen.add(id);
            statePairs.push([state, base]);
        }
    };

    const plain = Map.groupBy(rules.filter((r) => !r.state), (r) => `${r.atRules}\u0000${r.base}\u0000${r.variant?.name ?? ''}`);
    for (const rule of rules.filter((r) => r.state)) {
        for (const base of plain.get(`${rule.atRules}\u0000${rule.base}\u0000${rule.variant?.name ?? ''}`) ?? []) {
            pair(rule, base);
        }
    }

    const parents = new Map<ModelRule, ModelRule[]>();
    const addParent = (rule: ModelRule, parent: ModelRule) => {
        const list = parents.get(rule) ?? [];
        if (rule !== parent && !list.includes(parent)) {
            list.push(parent);
            parents.set(rule, list);
        }
    };

    for (const rule of rules) {
        const compounds = compoundsOf(rule.selector);
        for (let i = compounds.length - 1; i > 0; i--) {
            named(compounds.slice(0, i).join(' '), rule.atRules).forEach((parent) => addParent(rule, parent));
            named(compounds[i - 1]!, rule.atRules).forEach((parent) => addParent(rule, parent));
        }
    }

    for (const element of elements) {
        const atRules = '';
        const on = (classes: readonly string[]) => classes.flatMap((name) => named(`.${name}`, atRules));
        // Classe ligada por condição: estado das fixas e das outras condicionais
        for (const conditional of on(element.conditional)) {
            on(element.classes).forEach((base) => pair(conditional, base));
            on(element.conditional).forEach((other) => {
                if (index.get(conditional)! < index.get(other)!) {
                    pair(conditional, other);
                }
            });
        }
        for (const child of on([...element.classes, ...element.conditional])) {
            element.ancestors.forEach((classes) => on(classes).forEach((parent) => addParent(child, parent)));
        }
    }

    const branches = [...Map.groupBy(findings.filter((f) => f.branch !== undefined), (f) => `${f.file}\u0000${f.branch}\u0000${f.type}`).values()]
        .flatMap((group): [Finding, Finding][] => (group.length === 2 ? [[group[0]!, group[1]!]] : []));

    const baseOf = new Map<ModelRule, ModelRule>();
    for (const [state, base] of statePairs) {
        if (!baseOf.has(state)) {
            baseOf.set(state, base);
        }
    }
    return { rules, statePairs, baseOf, parents, branches, page: rules.filter((r) => PAGE_SELECTORS.has(r.selector)) };
}
