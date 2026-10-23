// Geração de tokens: agrupa os valores soltos que são EXATAMENTE iguais (depois da normalização),
// decide quais viram token e dá um nome a cada um.
// - Só vira token o valor que aparece pelo menos `minOccurrences` vezes no mesmo tipo de token:
//   valor usado uma vez só não é uma decisão de design repetida;
// - valor que o projeto já tem como token é reutilizado (mesmo que apareça uma vez só); se o token existente
//   não funciona onde o valor está (`$cor` num template), vira token CSS com o existente como equivalente;
// - o que é parecido mas não igual (`15px` e `16px`, `16px` e `1rem`) vira sugestão, nunca grupo.
// Cada token guarda todas as ocorrências (arquivo, posição, host): é a base do autofix.

import { TOKEN_TYPES } from '../rules.ts';
import { reusableDefinitions, usableIn } from '../token-index.ts';
import { DEFAULT_ROOT_FONT_SIZE, colorInfo, formatNumber, lengthInPx, normalizeFinding, parseLength, splitFontFamilies } from '../suggest/normalize.ts';
import type { Finding, TokenDefinition, TokenReference, TokenType } from '../types.ts';
import { diagnose } from './diagnosis.ts';
import type { TypeDiagnosis } from './diagnosis.ts';
import { nameGroups } from './naming.ts';
import type { NamingInput } from './naming.ts';
import { semanticAliases } from './semantic.ts';
import type { SemanticAlias } from './semantic.ts';

/** Ordem dos tipos na saída (definida em `rules.ts`, junto dos tipos). */
export { TOKEN_TYPES };

export interface GeneratedToken {
    /** Caminho no DTCG (`['color', 'indigo', '600']`). */
    path: string[];
    /** Nome em CSS, sem o `--` (`color-indigo-600`). */
    name: string;
    type: TokenType;
    /** Forma normalizada: a chave que junta as grafias. */
    key: string;
    /** Valor do token em CSS, na forma canônica (`#ffffff`, `16px`, `200ms`). */
    value: string;
    /** Quantas vezes o valor aparece no código. */
    count: number;
    /** Todas as grafias encontradas, da mais usada para a menos usada. */
    spellings: string[];
    /** Onde o valor aparece: o que o autofix vai trocar. */
    occurrences: Finding[];
    /** Já existia em um token gerado antes pelo TokenTidy (modo extend): o nome foi mantido. */
    kept?: boolean;
    /** Tokens do projeto com o mesmo valor, mas que não servem em todos os arquivos (ex.: `$cor` não funciona em JSX). */
    equivalents?: TokenDefinition[];
}

/** Valor que o projeto já tem como token: a correção é usar o token, não criar outro. */
export interface ReusedToken {
    definition: TokenDefinition;
    type: TokenType;
    key: string;
    count: number;
    occurrences: Finding[];
}

/** Valor repetido menos vezes que o mínimo: fica de fora, mas é informado. */
export interface BelowThreshold {
    type: TokenType;
    key: string;
    count: number;
    occurrences: Finding[];
}

export interface Suggestion {
    kind: 'off-grid' | 'same-size-different-unit';
    type: TokenType;
    message: string;
    /** Valores envolvidos (chaves normalizadas). */
    values: string[];
}

export interface GenerationOptions {
    minOccurrences: number;
    gridBase: number;
    rootFontSize?: number;
    semanticTokens: boolean;
    /**
     * `extend`: mantém os nomes que o TokenTidy gerou antes; `new`: esquece a saída anterior do TokenTidy.
     * Os tokens escritos à mão no projeto são decisões reais: valem nos dois modos.
     */
    mode: 'extend' | 'new';
    /** Tokens do projeto (fora da pasta de saída), para reutilizar. */
    definitions?: readonly TokenDefinition[];
    references?: readonly TokenReference[];
    /** Tokens gerados antes pelo TokenTidy na pasta de saída: mantêm o nome no modo extend. */
    ownTokens?: readonly OwnToken[];
}

/** Token já existente na pasta de saída (lido do `tokens.tokens.json`). */
export interface OwnToken {
    path: string[];
    type: TokenType;
    key: string;
}

export interface GenerationResult {
    tokens: GeneratedToken[];
    aliases: SemanticAlias[];
    reused: ReusedToken[];
    belowThreshold: BelowThreshold[];
    suggestions: Suggestion[];
    /** Tamanho e consistência da escala de cada tipo. */
    diagnosis: TypeDiagnosis[];
    /** Fonte raiz usada para comparar `rem` com `px`. */
    rootFontSize: number;
}

interface Group {
    type: TokenType;
    key: string;
    findings: Finding[];
}

/** Agrupa os achados e decide o destino de cada grupo. Mesma entrada, mesma saída. */
export function generateTokens(findings: readonly Finding[], options: GenerationOptions): GenerationResult {
    const rootFontSize = options.rootFontSize ?? DEFAULT_ROOT_FONT_SIZE;
    const groups = groupFindings(findings);
    const definitions = reusableDefinitions(options.definitions ?? [], options.references ?? []);
    const own = new Map((options.mode === 'extend' ? options.ownTokens ?? [] : []).map((t) => [`${t.type}\u0000${t.key}`, t]));

    const reused: ReusedToken[] = [];
    const belowThreshold: BelowThreshold[] = [];
    const accepted: { group: Group; equivalents: TokenDefinition[]; kept?: OwnToken }[] = [];

    for (const group of groups) {
        const kept = own.get(`${group.type}\u0000${group.key}`);
        const matches = definitions.filter((d) => d.type === group.type && d.key === group.key).map((d) => d.definition);
        const hosts = new Set(group.findings.map((f) => f.host));
        const usable = matches.find((d) => [...hosts].every((host) => usableIn(d, host)));
        if (usable && !kept) {
            reused.push({ definition: usable, type: group.type, key: group.key, count: group.findings.length, occurrences: group.findings });
        } else if (kept || matches.length > 0 || group.findings.length >= options.minOccurrences) {
            // Com token equivalente no projeto (ex.: `$roxo`, que não funciona em template/JSX), a decisão de design
            // já existe: vira token CSS mesmo com poucos usos, e o equivalente fica registrado
            accepted.push({ group, equivalents: matches, ...(kept ? { kept } : {}) });
        } else {
            belowThreshold.push({ type: group.type, key: group.key, count: group.findings.length, occurrences: group.findings });
        }
    }

    // Nomes: os já existentes ficam; os novos não podem repetir um nome existente
    const naming = accepted.map(({ group }) => ({ type: group.type, key: group.key, property: mostCommon(group.findings.map((f) => f.property)) }));
    const names = nameGroups(naming, { rootFontSize, gridBase: options.gridBase });
    const taken = new Set((options.mode === 'extend' ? options.ownTokens ?? [] : []).map((t) => t.path.join('-')));

    const tokens: GeneratedToken[] = accepted.map(({ group, equivalents, kept }, i) => {
        // Valor de um DTCG escrito à mão: o token CSS leva o caminho dele (`color.primary` → `--color-primary`,
        // convenção do Style Dictionary), em vez de um segundo nome para a mesma decisão
        const dtcg = equivalents.find((d) => d.syntax === 'dtcg' && DTCG_SEGMENTS.test(d.name));
        let path = kept?.path ?? dtcg?.name.split('.') ?? names.get(naming[i] as NamingInput)!;
        if (!kept) {
            path = freeName(path, taken);
        }
        taken.add(path.join('-'));
        const spellings = countSpellings(group.findings);
        return {
            path,
            name: path.join('-'),
            type: group.type,
            key: group.key,
            value: tokenValue(group.type, group.key, spellings),
            count: group.findings.length,
            spellings,
            occurrences: group.findings,
            ...(kept ? { kept: true } : {}),
            ...(equivalents.length > 0 ? { equivalents } : {}),
        };
    });
    tokens.sort(compareTokens(rootFontSize));

    return {
        tokens,
        aliases: options.semanticTokens ? semanticAliases(tokens, options.minOccurrences) : [],
        reused,
        belowThreshold,
        suggestions: suggest(tokens, belowThreshold, rootFontSize, options.gridBase),
        diagnosis: diagnose([...tokens, ...reused], belowThreshold, TOKEN_TYPES),
        rootFontSize,
    };
}

/** Junta os achados por tipo e valor normalizado, na ordem da primeira ocorrência. */
function groupFindings(findings: readonly Finding[]): Group[] {
    const groups = new Map<string, Group>();
    // Em ordem de arquivo e posição: empates (grafia mais usada, ordem das ocorrências) não dependem da ordem de entrada
    const sorted = findings.toSorted((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.offset - b.offset);
    for (const finding of sorted) {
        const key = normalizeFinding(finding);
        const id = `${finding.type}\u0000${key}`;
        let group = groups.get(id);
        if (!group) {
            group = { type: finding.type, key, findings: [] };
            groups.set(id, group);
        }
        group.findings.push(finding);
    }
    return [...groups.values()];
}

/** Grafias da mais usada para a menos usada; empate fica com a que apareceu primeiro. */
function countSpellings(findings: readonly Finding[]): string[] {
    const counts = new Map<string, number>();
    for (const f of findings) {
        const text = f.impliedUnit ? `${f.value}${f.impliedUnit}` : f.value;
        counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).map(([text]) => text);
}

function mostCommon(items: readonly string[]): string {
    const counts = new Map<string, number>();
    for (const item of items) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/**
 * Valor do token: a forma canônica. A exceção é a lista de fontes, em que a chave fica em minúsculas
 * só para comparar: o token usa a grafia mais comum do projeto (`Inter`, não `inter`).
 */
function tokenValue(type: TokenType, key: string, spellings: readonly string[]): string {
    if (type === 'font-family') {
        return splitFontFamilies(spellings[0] ?? key).map((family) => (/[^\w-]/.test(family) ? `"${family}"` : family)).join(', ');
    }
    return key;
}

/** Nome livre: se já existe, ganha sufixo (`-2`, `-3`). */
function freeName(path: string[], taken: ReadonlySet<string>): string[] {
    if (!taken.has(path.join('-'))) {
        return path;
    }
    for (let n = 2; ; n++) {
        const candidate = [...path.slice(0, -1), `${path.at(-1)}-${n}`];
        if (!taken.has(candidate.join('-'))) {
            return candidate;
        }
    }
}

/**
 * Ordem de saída: por tipo; medidas do menor para o maior (a escala se lê de cima para baixo);
 * cores por família e luminosidade; o resto pelo nome. O desempate final pelo nome deixa a saída estável.
 */
function compareTokens(rootFontSize: number): (a: GeneratedToken, b: GeneratedToken) => number {
    const rank = (t: GeneratedToken) => TOKEN_TYPES.indexOf(t.type);
    const size = (t: GeneratedToken): number | undefined => {
        if (t.type === 'color') {
            const info = colorInfo(t.key);
            return info ? -info.oklch[0] : undefined;
        }
        return lengthInPx(t.key, rootFontSize) ?? parseLength(t.key)?.value;
    };
    return (a, b) => {
        if (a.type !== b.type) {
            return rank(a) - rank(b);
        }
        if (a.type === 'color' && a.path[1] !== b.path[1]) {
            return a.name < b.name ? -1 : 1;
        }
        const sa = size(a);
        const sb = size(b);
        if (sa !== undefined && sb !== undefined && sa !== sb) {
            return sa - sb;
        }
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    };
}

// ─── Tokens existentes ──────────────────────────────────────────────────────

/** Caminho DTCG que vira nome CSS sem escape (`color.brand-500`). Outros caracteres: o token recebe um nome gerado. */
const DTCG_SEGMENTS = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

// ─── Sugestões ──────────────────────────────────────────────────────────────

/**
 * Sugestões que a pessoa decide (nada é mudado sozinho):
 * - espaçamento/tamanho fora da grade (`13px` com grade de 4px);
 * - o mesmo tamanho em unidades diferentes (`16px` e `1rem`, com fonte raiz de 16px).
 */
function suggest(tokens: readonly GeneratedToken[], below: readonly BelowThreshold[], rootFontSize: number, gridBase: number): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const all = [...tokens.map((t) => ({ type: t.type, key: t.key })), ...below.map((b) => ({ type: b.type, key: b.key }))];

    for (const { type, key } of all) {
        if (type !== 'spacing' && type !== 'size') {
            continue;
        }
        const px = lengthInPx(key, rootFontSize);
        // Até 2px é linha fina (borda, ajuste óptico): não é espaçamento de layout
        if (px === undefined || px <= 2 || px % gridBase === 0) {
            continue;
        }
        const lower = Math.floor(px / gridBase) * gridBase;
        const upper = lower + gridBase;
        suggestions.push({
            kind: 'off-grid',
            type,
            message: `${key} is off the ${gridBase}px grid (nearest: ${formatNumber(lower)}px or ${formatNumber(upper)}px)`,
            values: [key],
        });
    }

    const byTypeAndPx = new Map<string, Set<string>>();
    for (const { type, key } of all) {
        const unit = parseLength(key)?.unit;
        const px = lengthInPx(key, rootFontSize);
        if (px === undefined || (unit !== 'px' && unit !== 'rem')) {
            continue;
        }
        const id = `${type}\u0000${formatNumber(px)}`;
        byTypeAndPx.set(id, (byTypeAndPx.get(id) ?? new Set()).add(key));
    }
    for (const [id, keys] of byTypeAndPx) {
        if (keys.size > 1) {
            const type = id.split('\u0000')[0] as TokenType;
            const values = [...keys].sort();
            suggestions.push({
                kind: 'same-size-different-unit',
                type,
                message: `${values.join(' and ')} are the same ${type} at a ${formatNumber(rootFontSize)}px root font size; consider using one unit`,
                values,
            });
        }
    }
    return suggestions;
}
