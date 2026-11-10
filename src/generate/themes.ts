/**
 * Temas: a mesma cor de papel com um valor no modo claro e outro no escuro (`.card` e `.dark .card`).
 * Vira um token semântico com um valor por modo. Como nos aliases, só o que é inequívoco:
 * dois valores no mesmo papel e no mesmo modo não têm um nome certo, e nada é gerado.
 */

import { compoundsOf, describeSelector } from '../coherence/selectors.ts';
import type { Finding } from '../types.ts';
import { normalizeFinding } from '../values/normalize.ts';
import type { GeneratedToken } from './generate.ts';
import { roleOf, semanticPath } from './semantic.ts';
import type { SemanticAlias } from './semantic.ts';

const DARK_CLASS = /\.(?:dark(?:-mode|-theme)?|(?:theme|mode)-dark)(?![\w-])/;
const DARK_ATTRIBUTE = /\[data-[\w-]*(?:theme|mode|scheme)=["']?dark["']?\]/;
const DARK_MEDIA = /^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/;

/** O seletor do tema escuro, se esta parte for um: `:host-context(.dark)` no CSS global é só `.dark`. */
function darkSelector(compound: string): string | undefined {
    const probe = /^:host-context\((.+)\)$/.exec(compound)?.[1] ?? compound;
    // `.dark:hover .x` é um estado de quem tem a classe, não o tema
    return !/:(?!root)/.test(probe) && (DARK_CLASS.test(probe) || DARK_ATTRIBUTE.test(probe)) ? probe : undefined;
}

interface ModeContext {
    mode: 'light' | 'dark';
    /** O seletor sem o tema: `.dark .card` → `.card`. */
    base: string;
    selector?: string;
    media?: boolean;
}

function modeOf(finding: Finding): ModeContext | undefined {
    if (!finding.selector || finding.selector.includes(',')) {
        return undefined;
    }
    const atRules = finding.atRules ?? [];
    // Dentro de `@media (min-width)` o valor é de um tamanho de tela, não de um tema
    if (atRules.length > 1 || (atRules[0] !== undefined && !DARK_MEDIA.test(atRules[0]))) {
        return undefined;
    }
    const compounds = compoundsOf(finding.selector);
    const selector = darkSelector(compounds[0] ?? '');
    if (atRules.length === 1) {
        return selector ? undefined : { mode: 'dark', base: finding.selector, media: true };
    }
    if (!selector) {
        return { mode: 'light', base: finding.selector };
    }
    return { mode: 'dark', base: compounds.slice(1).join(' ') || ':root', selector };
}

/** O nome vem do papel e do componente: `.card` no fundo → `color.bg.card`. */
function themePath(property: string, base: string): string[] | undefined {
    const semantic = semanticPath(property, base);
    if (semantic) {
        return semantic;
    }
    const role = roleOf(property);
    const { base: plain, state, variant } = describeSelector(base);
    const name = /^[.#]?([A-Za-z][\w-]*)/.exec(compoundsOf(plain).at(-1) ?? '')?.[1]?.toLowerCase();
    if (!role || !name) {
        return undefined;
    }
    return ['color', role, name, ...(variant ? [variant.name] : []), ...(state ? [state.split(' ')[0]!] : [])];
}

interface ModeValue {
    key: string;
    findings: Finding[];
}

export interface ThemeCandidate {
    path: string[];
    light: ModeValue;
    dark: ModeValue;
}

export interface ThemeScan {
    candidates: ThemeCandidate[];
    selectors: string[];
    media: boolean;
    /** Valores que precisam de um primitivo, mesmo usados uma vez só: o par já é a prova da decisão. */
    required: Set<string>;
}

export function findThemes(findings: readonly Finding[], consolidations?: ReadonlyMap<Finding, string>): ThemeScan {
    const keyOf = (finding: Finding) => consolidations?.get(finding) ?? normalizeFinding(finding);
    const groups = new Map<string, { path: string[]; light: Finding[]; dark: Finding[] }>();
    const contexts = new Map<Finding, ModeContext>();
    for (const finding of findings) {
        const context = finding.type === 'color' ? modeOf(finding) : undefined;
        const path = context ? themePath(finding.property, context.base) : undefined;
        if (!context || !path) {
            continue;
        }
        contexts.set(finding, context);
        const id = path.join('.');
        const group = groups.get(id) ?? { path, light: [], dark: [] };
        group[context.mode].push(finding);
        groups.set(id, group);
    }

    const candidates: ThemeCandidate[] = [];
    for (const { path, light, dark } of groups.values()) {
        const lightKeys = new Set(light.map(keyOf));
        const darkKeys = new Set(dark.map(keyOf));
        if (lightKeys.size === 1 && darkKeys.size === 1 && keyOf(light[0]!) !== keyOf(dark[0]!)) {
            candidates.push({ path, light: { key: keyOf(light[0]!), findings: light }, dark: { key: keyOf(dark[0]!), findings: dark } });
        }
    }
    candidates.sort((a, b) => (a.path.join('.') < b.path.join('.') ? -1 : 1));
    const usedDark = candidates.flatMap((c) => c.dark.findings.map((f) => contexts.get(f)!));
    return {
        candidates,
        selectors: [...new Set(usedDark.flatMap((c) => c.selector ?? []))].sort(),
        media: usedDark.some((c) => c.media),
        required: new Set(candidates.flatMap((c) => [`color\u0000${c.light.key}`, `color\u0000${c.dark.key}`])),
    };
}

export interface ThemeTokens {
    /** Valor padrão (claro) e valor no escuro, ambos apontando para primitivos. */
    light: SemanticAlias[];
    dark: SemanticAlias[];
}

/** Liga cada candidato aos primitivos gerados. Caminho que já é de um primitivo fica de fora: um nó não pode ser os dois. */
export function themeTokens(candidates: readonly ThemeCandidate[], tokens: readonly GeneratedToken[]): ThemeTokens {
    const primitive = new Map(tokens.filter((t) => t.type === 'color').map((t) => [t.key, t]));
    const taken = (path: readonly string[]) => tokens.some((t) => {
        const [a, b] = [t.path.join('.'), path.join('.')];
        return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
    });
    const result: ThemeTokens = { light: [], dark: [] };
    for (const { path, light, dark } of candidates) {
        const [lightTarget, darkTarget] = [primitive.get(light.key), primitive.get(dark.key)];
        if (!lightTarget || !darkTarget || taken(path)) {
            continue;
        }
        const alias = (target: GeneratedToken, value: ModeValue): SemanticAlias => ({ path, name: path.join('-'), target: target.path, count: value.findings.length, occurrences: value.findings });
        result.light.push(alias(lightTarget, light));
        result.dark.push(alias(darkTarget, dark));
    }
    return result;
}
