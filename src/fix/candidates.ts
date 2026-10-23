/**
 * Tokens que podem substituir um valor solto, com o valor EXATO: o mesmo tipo e a mesma chave normalizada do `generate`.
 * Vêm de dois lugares: o que o projeto já define à mão e o que o `generate` escreveu na pasta de tokens.
 */

import { reusableDefinitions } from '../token-index.ts';
import type { TreeOccurrence, TreeToken } from '../generate/output/dtcg-tree.ts';
import { normalizeValue } from '../values/normalize.ts';
import type { TokenDefinition, TokenReference, TokenType } from '../types.ts';

/**
 * De onde vem o token. A ordem é a de preferência:
 * - `alias`: alias semântico gerado para aquela ocorrência (`color.text.danger`);
 * - `project`: token escrito à mão no projeto (é a decisão da equipe);
 * - `generated`: token primitivo gerado pelo `generate`.
 */
export type CandidateSource = 'alias' | 'project' | 'generated';

/** Como o token é escrito: `var(--x)`, `$x` (SCSS/Sass) ou `@x` (Less). */
export type CandidateForm = 'custom-property' | 'scss' | 'less';

export interface Candidate {
    type: TokenType;
    key: string;
    source: CandidateSource;
    form: CandidateForm;
    /** Nome com o prefixo (`--color-primary`, `$primary`, `@primary`). */
    name: string;
    /** Variável escrita à mão: arquivo e linha da definição (decide se ela é visível no arquivo do valor). */
    definition?: Pick<TokenDefinition, 'file' | 'line'>;
    /** Alias: as ocorrências para as quais ele foi criado. */
    occurrences?: readonly TreeOccurrence[];
    /** Quantas vezes o token já é usado no projeto: desempate entre tokens à mão com o mesmo valor. */
    uses: number;
}

export interface IndexInput {
    /** Definições do projeto, fora da pasta de tokens. */
    definitions: readonly TokenDefinition[];
    references: readonly TokenReference[];
    /** Tokens da pasta de tokens (`treeTokensOf`). */
    generated: readonly TreeToken[];
    /** Quais arquivos de saída existem: sem `tokens.css`, `var(--x)` de um token gerado não resolveria. */
    outputs: { css: boolean; scss: boolean; less: boolean };
}

export interface TokenIndex {
    /** Candidatos para um valor, em ordem de preferência. */
    lookup(type: TokenType, key: string): readonly Candidate[];
    size: number;
}

const SOURCE_RANK: Record<CandidateSource, number> = { alias: 0, project: 1, generated: 2 };
const FORM_RANK: Record<CandidateForm, number> = { 'custom-property': 0, scss: 1, less: 2 };

/** Seletores que valem para a página inteira: custom property definida neles é global. */
const GLOBAL_SELECTORS = new Set([':root', 'html', 'body']);

/** Caminho que vira nome sem escape (`color.brand-500` → `--color-brand-500`). */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function buildTokenIndex(input: IndexInput): TokenIndex {
    const candidates: Candidate[] = [];
    const uses = new Map<string, number>();
    for (const ref of input.references) {
        uses.set(ref.name, (uses.get(ref.name) ?? 0) + 1);
    }

    // Todas as definições de cada custom property: um nome redefinido com outro valor é variável de tema
    const byName = Map.groupBy(input.definitions.filter((d) => d.syntax === 'custom-property'), (d) => d.name);
    const seen = new Set<string>();
    for (const { definition, type, key } of reusableDefinitions(input.definitions, input.references)) {
        const base = { type, key, source: 'project' as const, name: definition.name, uses: uses.get(definition.name) ?? 0 };
        if (definition.syntax === 'custom-property') {
            const all = byName.get(definition.name) ?? [];
            const global = all.some((d) => isGlobal(d.selector));
            const fixed = all.every((d) => normalizeValue(type, d.value) === key);
            const id = `${type}\u0000${definition.name}`;
            if (global && fixed && !seen.has(id)) {
                seen.add(id);
                candidates.push({ ...base, form: 'custom-property' });
            }
        } else if ((definition.syntax === 'scss-variable' || definition.syntax === 'less-variable') && definition.selector === undefined) {
            // Variável dentro de uma regra só existe ali: só as de nível de arquivo
            candidates.push({
                ...base,
                form: definition.syntax === 'scss-variable' ? 'scss' : 'less',
                definition: { file: definition.file, line: definition.line },
            });
        }
    }

    const byPath = new Map(input.generated.map((t) => [t.path.join('.'), t]));
    for (const token of input.generated) {
        if (!token.path.every((segment) => SAFE_SEGMENT.test(segment))) {
            continue;
        }
        const target = token.target ? byPath.get(token.target.join('.')) : token;
        if (!target?.type || target.key === undefined) {
            continue;
        }
        const name = token.path.join('-');
        const base = {
            type: target.type,
            key: target.key,
            source: token.target ? 'alias' as const : 'generated' as const,
            uses: 0,
            ...(token.target ? { occurrences: token.occurrences } : {}),
        };
        if (input.outputs.css) {
            candidates.push({ ...base, form: 'custom-property', name: `--${name}` });
        }
        if (input.outputs.scss) {
            candidates.push({ ...base, form: 'scss', name: `$${name}` });
        }
        if (input.outputs.less) {
            candidates.push({ ...base, form: 'less', name: `@${name}` });
        }
    }

    // Ordem estável: origem, mais usado, forma; o resto mantém a ordem de definição
    const sorted = candidates
        .map((candidate, order) => ({ candidate, order }))
        .sort((a, b) => SOURCE_RANK[a.candidate.source] - SOURCE_RANK[b.candidate.source]
            || b.candidate.uses - a.candidate.uses
            || FORM_RANK[a.candidate.form] - FORM_RANK[b.candidate.form]
            || a.order - b.order)
        .map(({ candidate }) => candidate);
    const index = Map.groupBy(sorted, (c) => `${c.type}\u0000${c.key}`);
    return {
        lookup: (type, key) => index.get(`${type}\u0000${key}`) ?? [],
        size: sorted.length,
    };
}

function isGlobal(selector: string | undefined): boolean {
    return selector !== undefined && selector.split(',').every((part) => GLOBAL_SELECTORS.has(part.trim()));
}
