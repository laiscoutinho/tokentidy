/**
 * Tokens que podem substituir um valor solto, com o valor EXATO: o mesmo tipo e a mesma chave normalizada do `generate`.
 * Vêm de dois lugares: o que o projeto já define à mão e o que o `generate` escreveu na pasta de tokens.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { reusableDefinitions } from './token-index.ts';
import { readDtcgTree, treeTokensOf } from './generate/output/dtcg-tree.ts';
import type { TreeOccurrence, TreeToken } from './generate/output/dtcg-tree.ts';
import { isInside } from './project/scope.ts';
import type { Finding, TokenDefinition, TokenReference, TokenType } from './types.ts';
import { normalizeFinding } from './values/normalize.ts';

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
    /** Token escrito à mão: arquivo e linha da definição (em SCSS/Less, decide se ela é visível no arquivo do valor). */
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
    /** Nomes sem prefixo de tokens marcados `$deprecated`: nunca são oferecidos. */
    deprecated?: ReadonlySet<string>;
}

export interface TokenIndex {
    /** Candidatos para um valor, em ordem de preferência. */
    lookup(type: TokenType, key: string): readonly Candidate[];
    /** Todos os candidatos de um tipo: base da sugestão por proximidade. */
    ofType(type: TokenType): readonly Candidate[];
    size: number;
}

const SOURCE_RANK: Record<CandidateSource, number> = { alias: 0, project: 1, generated: 2 };
const FORM_RANK: Record<CandidateForm, number> = { 'custom-property': 0, scss: 1, less: 2 };

/** Caminho que vira nome sem escape (`color.brand-500` → `--color-brand-500`). */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function buildTokenIndex(input: IndexInput): TokenIndex {
    const candidates: Candidate[] = [];
    const uses = new Map<string, number>();
    for (const ref of input.references) {
        uses.set(ref.name, (uses.get(ref.name) ?? 0) + 1);
    }

    const seen = new Set<string>();
    for (const { definition, type, key } of reusableDefinitions(input.definitions, input.references)) {
        const base = { type, key, source: 'project' as const, name: definition.name, uses: uses.get(definition.name) ?? 0 };
        if (definition.syntax === 'custom-property') {
            // A mesma custom property em `:root` e em `html`, com o mesmo valor, é um token só
            const id = `${type}\u0000${definition.name}`;
            if (!seen.has(id)) {
                seen.add(id);
                candidates.push({ ...base, form: 'custom-property', definition: { file: definition.file, line: definition.line } });
            }
        } else if (definition.syntax === 'scss-variable' || definition.syntax === 'less-variable') {
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
        .map(({ candidate }) => candidate)
        .filter((candidate) => !input.deprecated?.has(bareName(candidate.name)));
    const index = Map.groupBy(sorted, (c) => `${c.type}\u0000${c.key}`);
    const byType = Map.groupBy(sorted, (c) => c.type);
    return {
        lookup: (type, key) => index.get(`${type}\u0000${key}`) ?? [],
        ofType: (type) => byType.get(type) ?? [],
        size: sorted.length,
    };
}

/** Nome sem o prefixo da linguagem: `--a-b`, `$a-b`, `@a-b` e o caminho DTCG `a.b` são o mesmo token. */
export function bareName(name: string): string {
    return name.replace(/^(--|\$|@)/, '').replaceAll('.', '-');
}

/** Tokens marcados `$deprecated` no DTCG, pelo nome sem prefixo. */
export function deprecatedTokens(definitions: readonly TokenDefinition[]): Map<string, TokenDefinition> {
    return new Map(definitions.filter((d) => d.deprecated !== undefined).map((d) => [bareName(d.name), d]));
}

/** Índice do projeto: o que ele define à mão (fora da pasta de tokens) e o que o `generate` escreveu nela. */
export async function projectTokenIndex(
    analysis: { root: string; definitions: readonly TokenDefinition[]; references: readonly TokenReference[] },
    tokensDir: string,
): Promise<TokenIndex> {
    const tree = await readDtcgTree(tokensDir);
    return buildTokenIndex({
        definitions: analysis.definitions.filter((d) => !isInside(path.join(analysis.root, d.file), tokensDir)),
        references: analysis.references,
        generated: tree ? treeTokensOf(tree) : [],
        outputs: {
            css: existsSync(path.join(tokensDir, 'tokens.css')),
            scss: existsSync(path.join(tokensDir, '_tokens.scss')),
            less: existsSync(path.join(tokensDir, '_tokens.less')),
        },
        deprecated: new Set(deprecatedTokens(analysis.definitions).keys()),
    });
}

/** Valores que o `generate` transformaria em token e que ainda não têm nenhum. */
export function repeatedValues(withoutToken: readonly Finding[], index: TokenIndex, minOccurrences: number): Finding[] {
    return [...Map.groupBy(withoutToken, (f) => `${f.type}\u0000${normalizeFinding(f)}`).values()]
        .filter((group) => group.length >= minOccurrences && index.lookup(group[0]!.type, normalizeFinding(group[0]!)).length === 0)
        .flat();
}
