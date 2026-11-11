/**
 * Tokens que podem substituir um valor solto, com o valor EXATO: o mesmo tipo e a mesma chave normalizada do `generate`.
 * Vêm de dois lugares: o que o projeto já define à mão e o que o `generate` escreveu na pasta de tokens.
 */

import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { classifyDefinitions, scopedOverrides } from './token-index.ts';
import type { RejectionReason } from './token-index.ts';
import { ownTokensOf, readDtcgTree, treeTokensOf } from './generate/output/dtcg-tree.ts';
import { parseDtcg } from './parsers/dtcg.ts';
import { isResolverFileName, isTokenFileName, listFiles } from './project/scanner.ts';
import { DARK_FILE } from './generate/output/theme-files.ts';
import { moduleAccess } from './generate/output/token-module.ts';
import type { ModuleAccess } from './generate/output/token-module.ts';
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

/** Como o token é escrito: `var(--x)`, `$x` (SCSS/Sass), `@x` (Less) ou `theme.a.b` (tema JS: só sugestão). */
export type CandidateForm = 'custom-property' | 'scss' | 'less' | 'js-theme';

export interface Candidate {
    type: TokenType;
    key: string;
    source: CandidateSource;
    form: CandidateForm;
    /** Nome com o prefixo (`--color-primary`, `$primary`, `@primary`). */
    name: string;
    /** Token escrito à mão: arquivo e linha da definição (em SCSS/Less, decide se ela é visível no arquivo do valor). */
    definition?: Pick<TokenDefinition, 'file' | 'line' | 'loadedBy'>;
    /** Alias: as ocorrências para as quais ele foi criado. */
    occurrences?: readonly TreeOccurrence[];
    /** Quantas vezes o token já é usado no projeto: desempate entre tokens à mão com o mesmo valor. */
    uses: number;
    /** Redefinição de tema: o token só vale, com este valor, dentro destes seletores. */
    scope?: { selector: string; rivals: readonly string[] };
    /**
     * Token de um DTCG escrito à mão sem CSS com o mesmo nome no projeto: o arquivo DTCG.
     * `var(--x)` só resolve depois de compilar o arquivo para CSS e carregar o resultado.
     */
    uncompiledFrom?: string;
}

export interface IndexInput {
    /** Definições do projeto, fora da pasta de tokens. */
    definitions: readonly TokenDefinition[];
    references: readonly TokenReference[];
    /** Tokens da pasta de tokens (`treeTokensOf`). */
    generated: readonly TreeToken[];
    /** Quais arquivos de saída existem: sem `tokens.css`, `var(--x)` de um token gerado não resolveria. */
    outputs: { css: boolean; scss: boolean; less: boolean; module?: boolean };
    /** Nomes sem prefixo de tokens marcados `$deprecated`: nunca são oferecidos. */
    deprecated?: ReadonlySet<string>;
}

export interface RejectedToken {
    name: string;
    reason: RejectionReason;
    /** `family`: o tipo que o nome declara. */
    declared?: TokenType;
    definition: Pick<TokenDefinition, 'file' | 'line'>;
}

export interface TokenIndex {
    /** Candidatos para um valor, em ordem de preferência. */
    lookup(type: TokenType, key: string): readonly Candidate[];
    /** Todos os candidatos de um tipo: base da sugestão por proximidade. */
    ofType(type: TokenType): readonly Candidate[];
    /** Tokens do projeto com este valor que não servem: o nome diz outro tipo ou foram definidos em teste. */
    rejected(type: TokenType, key: string): readonly RejectedToken[];
    /** Como ler o valor no módulo gerado (`tokens.ts`), para onde `var()` não funciona. */
    module(type: TokenType, key: string): ModuleAccess | undefined;
    size: number;
}

const SOURCE_RANK: Record<CandidateSource, number> = { alias: 0, project: 1, generated: 2 };
const FORM_RANK: Record<CandidateForm, number> = { 'custom-property': 0, scss: 1, less: 2, 'js-theme': 3 };

/** Caminho que vira nome sem escape (`color.brand-500` → `--color-brand-500`). */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function buildTokenIndex(input: IndexInput): TokenIndex {
    const candidates: Candidate[] = [];
    const uses = new Map<string, number>();
    for (const ref of input.references) {
        uses.set(ref.name, (uses.get(ref.name) ?? 0) + 1);
    }

    const seen = new Set<string>();
    const { reusable, rejected } = classifyDefinitions(input.definitions, input.references);
    // Nomes que já existem como CSS: um DTCG com o mesmo caminho é a mesma decisão, já compilada
    const generatedNames = new Set(input.outputs.css ? input.generated.filter((t) => t.path.every((s) => SAFE_SEGMENT.test(s))).map((t) => `--${t.path.join('-')}`) : []);
    const cssNames = new Set([
        ...reusable.filter((r) => r.definition.syntax === 'custom-property').map((r) => r.definition.name),
        ...generatedNames,
    ]);
    for (const { definition, type, key } of reusable) {
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
                definition: { file: definition.file, line: definition.line, ...(definition.loadedBy ? { loadedBy: definition.loadedBy } : {}) },
            });
        } else if (definition.syntax === 'dtcg' && !definition.package && definition.name.split('.').every((segment) => SAFE_SEGMENT.test(segment))) {
            /**
             * DTCG escrito à mão: no CSS o nome é o caminho com hífens (`color.primary` → `--color-primary`),
             * a convenção do Style Dictionary e o nome que o `generate` dá ao compilar o arquivo
             */
            const name = `--${definition.name.split('.').join('-')}`;
            const id = `${type}\u0000${name}`;
            // Com CSS do mesmo nome, quem entra é a custom property (o que existe na página)
            if (!seen.has(id) && !cssNames.has(name)) {
                seen.add(id);
                candidates.push({
                    ...base, name, uses: uses.get(name) ?? 0, form: 'custom-property',
                    definition: { file: definition.file, line: definition.line }, uncompiledFrom: definition.file,
                });
            }
        } else if (definition.syntax === 'js-theme') {
            candidates.push({ ...base, form: 'js-theme', definition: { file: definition.file, line: definition.line } });
        }
    }

    for (const { definition, type, key, scope, rivals } of scopedOverrides(input.definitions, input.references)) {
        candidates.push({
            type, key, source: 'project', form: 'custom-property', name: definition.name, uses: uses.get(definition.name) ?? 0,
            definition: { file: definition.file, line: definition.line }, scope: { selector: scope, rivals },
        });
    }

    const byPath = new Map(input.generated.map((t) => [t.path.join('.'), t]));
    // Só primitivos: no módulo o alias semântico é o mesmo valor, e um caminho basta
    const modules = new Map(input.outputs.module
        ? input.generated.filter((t) => !t.target && t.type && t.key !== undefined).map((t) => [`${t.type}\u0000${t.key}`, t.path] as const)
        : []);
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
    const refused = Map.groupBy(
        rejected.filter((r) => !input.deprecated?.has(bareName(r.definition.name))).map((r): RejectedToken & { id: string } => ({
            id: `${r.type}\u0000${r.key}`, name: r.definition.syntax === 'dtcg' ? `--${r.definition.name.split('.').join('-')}` : r.definition.name,
            reason: r.reason, ...(r.declared ? { declared: r.declared } : {}), definition: { file: r.definition.file, line: r.definition.line },
        })),
        (r) => r.id,
    );
    const byType = Map.groupBy(sorted, (c) => c.type);
    return {
        lookup: (type, key) => index.get(`${type}\u0000${key}`) ?? [],
        ofType: (type) => byType.get(type) ?? [],
        rejected: (type, key) => (refused.get(`${type}\u0000${key}`) ?? []).map(({ id: _id, ...token }) => token),
        module: (type, key) => {
            const trail = modules.get(`${type}\u0000${key}`);
            return trail ? moduleAccess(trail) : undefined;
        },
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

/**
 * Índice do projeto: o que ele define à mão e, se a pasta de tokens for saída do `generate`, o que ele escreveu nela.
 * A pasta só é saída do `generate` quando o `tokens.tokens.json` dela tem tokens com a extensão do TokenTidy.
 * Uma pasta escrita à mão (`--tokens tokens` com `tokens.css` e `*.json` da equipe) é fonte de tokens do projeto:
 * descartar as definições dela deixaria o `fix` sem nenhum token.
 */
export async function projectTokenIndex(
    analysis: { root: string; definitions: readonly TokenDefinition[]; references: readonly TokenReference[] },
    tokensDir: string,
): Promise<TokenIndex> {
    const tree = await readDtcgTree(tokensDir);
    if (!tree || ownTokensOf(tree).length === 0) {
        const definitions = [...analysis.definitions, ...await looseDtcgFiles(analysis, tokensDir)];
        return buildTokenIndex({
            definitions,
            references: analysis.references,
            generated: [],
            outputs: { css: false, scss: false, less: false },
            deprecated: new Set(deprecatedTokens(definitions).keys()),
        });
    }
    // O escuro entra depois: `.dark .card` usa o mesmo token semântico, que ali vale o valor escuro
    const dark = await readDtcgTree(tokensDir, DARK_FILE);
    return buildTokenIndex({
        definitions: analysis.definitions.filter((d) => !isInside(path.join(analysis.root, d.file), tokensDir)),
        references: analysis.references,
        generated: [...treeTokensOf(tree), ...(dark ? treeTokensOf(dark) : [])],
        outputs: {
            css: existsSync(path.join(tokensDir, 'tokens.css')),
            scss: existsSync(path.join(tokensDir, '_tokens.scss')),
            less: existsSync(path.join(tokensDir, '_tokens.less')),
            module: existsSync(path.join(tokensDir, 'tokens.ts')) || existsSync(path.join(tokensDir, 'tokens.js')),
        },
        deprecated: new Set(deprecatedTokens(analysis.definitions).keys()),
    });
}

/**
 * DTCG da pasta de tokens com nome sem `.tokens` (`tokens/tokens.json`): a análise do projeto não lê `.json` qualquer,
 * mas a pasta foi apontada pelo usuário. Só entram arquivos que têm algum `$value`; os outros JSON não dizem nada.
 */
async function looseDtcgFiles(analysis: { root: string; definitions: readonly TokenDefinition[] }, tokensDir: string): Promise<TokenDefinition[]> {
    if (!(await stat(tokensDir).catch(() => undefined))?.isDirectory()) {
        return [];
    }
    const known = new Set(analysis.definitions.map((d) => d.file));
    const found: TokenDefinition[] = [];
    for await (const relative of listFiles(tokensDir)) {
        const name = path.basename(relative);
        const file = path.relative(analysis.root, path.join(tokensDir, relative)).split(path.sep).join('/');
        if (!name.toLowerCase().endsWith('.json') || isTokenFileName(name) || isResolverFileName(name) || known.has(file) || file.startsWith('..')) {
            continue;
        }
        const source = await readFile(path.join(tokensDir, relative), 'utf8').catch(() => undefined);
        if (source !== undefined) {
            found.push(...parseDtcg(source, file).definitions);
        }
    }
    return found;
}

/** Valores que o `generate` transformaria em token e que ainda não têm nenhum. */
export function repeatedValues(withoutToken: readonly Finding[], index: TokenIndex, minOccurrences: number): Finding[] {
    return [...Map.groupBy(withoutToken, (f) => `${f.type}\u0000${normalizeFinding(f)}`).values()]
        .filter((group) => group.length >= minOccurrences && index.lookup(group[0]!.type, normalizeFinding(group[0]!)).length === 0)
        .flat();
}

/** Valores sem token usados menos vezes que o mínimo do `generate`: ficam soltos por decisão, e a saída diz isso. */
export function belowThresholdValues(withoutToken: readonly Finding[], minOccurrences: number): Finding[] {
    return [...Map.groupBy(withoutToken, (f) => `${f.type}\u0000${normalizeFinding(f)}`).values()]
        .filter((group) => group.length < minOccurrences)
        .flat();
}
