// Junta as etapas: encontra os arquivos, lê cada um e manda para o parser da sua extensão.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { applyIgnores, parseIgnoreDirectives, unusedDirectives } from './ignore.ts';
import type { IgnoreDirective } from './ignore.ts';
import { resolveLocalProperties } from './local-properties.ts';
import { collectFiles } from './scope.ts';
import type { Scope, ScopeOptions } from './scope.ts';
import type { SkippedFile } from './scanner.ts';
import type { AnalysisError, AnalysisWarning, Finding, ReviewItem, TokenDefinition, TokenReference } from './types.ts';
import type { ParseResult, RootFontSize } from './parsers/collector.ts';
import type { StyleSyntax } from './parsers/css.ts';

export interface AnalysisResult {
    root: string;
    /** Quantos arquivos foram de fato analisados. */
    filesAnalyzed: number;
    /** Violações: falham o CI e alimentam o `generate`. */
    findings: Finding[];
    /** Valores para revisão: aparecem na saída, mas não falham o CI nem viram token. */
    review: ReviewItem[];
    /** Achados e revisões ignorados por comentário (`tokentidy-ignore-line`). */
    ignored: number;
    errors: AnalysisError[];
    /** Avisos sobre comentários de ignorar sem efeito. */
    warnings: AnalysisWarning[];
    /** Arquivos encontrados e não analisados (minificados, linguagens sem suporte, ignorados pela configuração). */
    skipped: SkippedFile[];
    /** Caminhos passados sem nenhum arquivo suportado (como foram escritos). */
    unmatched: string[];
    /** Tokens que o projeto já define (`--x`, `$x`, `@x`). */
    definitions: TokenDefinition[];
    /** Usos de tokens (`var(--x)`, `$x`, `@x`). */
    references: TokenReference[];
    /** `html { font-size }` do projeto, se houver. Sem ele, `1rem` = 16px (padrão dos navegadores). */
    rootFontSize?: RootFontSize;
    /** Linguagens de estilo que o projeto usa: decide em que formato os tokens são gerados. */
    styleLanguages: StyleSyntax[];
    /**
     * Arquivos dedicados a tokens: DTCG (`*.tokens.json`) e folhas de estilo que só definem
     * variáveis (`:root { --x: ... }`, `_variables.scss`). Com eles, gerar tokens pede uma decisão:
     * estender o que existe ou começar do zero.
     */
    tokenFiles: string[];
}

export interface AnalyzeOptions extends ScopeOptions {
    /** Raiz do projeto (caminhos da saída relativos a ela). Padrão: a pasta passada, em `analyzeDirectory`. */
    root?: string;
}

type Parser = (source: string, file: string) => ParseResult | Promise<ParseResult>;

const STYLE_SYNTAX = new Map<string, StyleSyntax>([
    ['.css', 'css'], ['.pcss', 'css'], ['.postcss', 'css'], ['.scss', 'scss'], ['.sass', 'sass'], ['.less', 'less'],
]);
const SCRIPT_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

/** Linha média acima disto: arquivo minificado (regra `minified_files?` do GitHub Linguist). */
const MINIFIED_AVERAGE_LINE = 110;

export function isMinified(source: string): boolean {
    const lines = source.split('\n');
    return source.length > 0 && source.length / lines.length > MINIFIED_AVERAGE_LINE;
}

/**
 * Parser de cada tipo de arquivo, carregado só quando aparece um arquivo dele:
 * quem roda num projeto sem Angular não paga o tempo de carregar o compilador do Angular.
 */
async function loadParser(kind: string): Promise<Parser> {
    const syntax = STYLE_SYNTAX.get(kind);
    if (syntax) {
        const { parseCss } = await import('./parsers/css.ts');
        return (source, file) => parseCss(source, file, syntax);
    }
    if (kind === 'script') {
        return (await import('./parsers/script.ts')).parseScript;
    }
    if (kind === 'angular') {
        return (await import('./parsers/angular.ts')).parseAngularTemplate;
    }
    return (await import('./parsers/html.ts')).parseHtml;
}

/** Analisa um diretório e devolve os valores soltos encontrados, em ordem de arquivo e posição. A pasta é a raiz. */
export async function analyzeDirectory(dir: string, options: ScopeOptions = {}): Promise<AnalysisResult> {
    const root = path.resolve(dir);
    const info = await stat(root).catch(() => undefined);
    if (!info) {
        throw new Error(`Directory not found: ${dir}`);
    }
    if (!info.isDirectory()) {
        throw new Error(`Not a directory: ${dir}`);
    }
    return analyzePaths([root], { ...options, root });
}

/**
 * Analisa arquivos e pastas de um mesmo projeto. Os caminhos da saída são relativos a `options.root`
 * (padrão: a pasta comum aos caminhos); a CLI passa a raiz do projeto (ver `findProjectRoot`).
 */
export async function analyzePaths(paths: readonly string[], options: AnalyzeOptions = {}): Promise<AnalysisResult> {
    const root = options.root ?? path.resolve(paths.length === 1 ? paths[0]! : '.');
    return analyzeScope(await collectFiles(paths, root, options), options);
}

/** Analisa os arquivos de um escopo já resolvido. */
export async function analyzeScope(scope: Scope, options: ScopeOptions = {}): Promise<AnalysisResult> {
    const { root } = scope;
    const skipped = [...scope.skipped];
    const loaded = new Map<string, Parser>();
    const results: ParseResult[] = [];
    const directives = new Map<string, IgnoreDirective[]>();
    const warnings: AnalysisWarning[] = [];

    async function run(file: string, kind: string): Promise<ParseResult | undefined> {
        const source = await readFile(path.join(root, file), 'utf8');
        // Bundle gerado com outro nome (`vendor.css`): o conteúdo denuncia
        if (!options.includeMinified && isMinified(source)) {
            skipped.push({ file, reason: 'minified' });
            return undefined;
        }
        let parse = loaded.get(kind);
        if (!parse) {
            parse = await loadParser(kind);
            loaded.set(kind, parse);
        }
        const result = await parse(source, file);
        results.push(result);
        const ignore = parseIgnoreDirectives(source, file);
        directives.set(file, ignore.directives);
        warnings.push(...ignore.warnings);
        return result;
    }

    // Scripts primeiro: os componentes Angular dizem quais `.html` são templates (`templateUrl`)
    // e precisam do parser do Angular (`[style.x]`, `@if`) em vez do parser de HTML comum.
    const angularTemplates = new Set<string>();
    for (const file of scope.files.filter((f) => SCRIPT_EXTENSIONS.has(path.extname(f).toLowerCase()))) {
        const result = await run(file, 'script');
        for (const url of result?.templateUrls ?? []) {
            angularTemplates.add(path.posix.normalize(path.posix.join(path.posix.dirname(file), url)));
        }
    }

    const styleLanguages = new Set<StyleSyntax>();
    const tokenFiles: string[] = [];
    for (const file of scope.files) {
        const ext = path.extname(file).toLowerCase();
        const syntax = STYLE_SYNTAX.get(ext);
        if (syntax) {
            styleLanguages.add(syntax);
            const result = await run(file, ext);
            if (result && result.definitions.length > 0 && result.declarations === 0) {
                tokenFiles.push(file);
            }
        } else if (ext === '.html') {
            await run(file, angularTemplates.has(file) ? 'angular' : 'html');
        }
    }

    if (scope.tokenFiles.length > 0) {
        const { parseDtcg } = await import('./parsers/dtcg.ts');
        for (const file of scope.tokenFiles) {
            const { definitions, errors } = parseDtcg(await readFile(path.join(root, file), 'utf8'), file);
            results.push({ findings: [], review: [], errors, definitions, references: [], declarations: 0 });
            tokenFiles.push(file);
        }
    }

    const references = results.flatMap((r) => r.references);
    const local = resolveLocalProperties(results.flatMap((r) => r.customProperties ?? []), references);
    const definitionKey = (d: { file: string; name: string; selector?: string }) => `${d.file}\0${d.name}\0${d.selector ?? ''}`;
    const localDefinition = new Set([...local.local].map(definitionKey));

    // Comentários de ignorar valem por arquivo: aplica arquivo a arquivo e depois avisa os sem uso
    let ignored = 0;
    const filtered = <T extends { file: string; line: number; rule: string }>(items: T[]): T[] =>
        [...Map.groupBy(items, (item) => item.file)].flatMap(([file, ofFile]) => {
            const applied = applyIgnores(ofFile, directives.get(file) ?? []);
            ignored += applied.ignored;
            return applied.kept;
        });
    const findings = filtered([...results.flatMap((r) => r.findings), ...local.findings]);
    const review = filtered([...results.flatMap((r) => r.review), ...local.review]);
    warnings.push(...unusedDirectives([...directives.values()].flat()));

    const byPosition = (a: { file: string; line: number; column: number }, b: { file: string; line: number; column: number }) =>
        (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line || a.column - b.column;

    const rootFontSize = results.map((r) => r.rootFontSize).find((size) => size !== undefined);
    return {
        root,
        filesAnalyzed: results.length - scope.tokenFiles.length,
        findings: findings.sort(byPosition),
        review: review.sort(byPosition),
        ignored,
        errors: results.flatMap((r) => r.errors).sort(byPosition),
        warnings: warnings.sort(byPosition),
        skipped: skipped.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
        unmatched: scope.unmatched,
        // Custom property local que virou achado não é token do projeto
        definitions: results.flatMap((r) => r.definitions)
            .filter((d) => !(d.syntax === 'custom-property' && localDefinition.has(definitionKey(d))))
            .sort(byPosition),
        references: references.sort((a, b) => byPosition({ ...a, column: 0 }, { ...b, column: 0 })),
        ...(rootFontSize ? { rootFontSize } : {}),
        styleLanguages: [...styleLanguages].sort(),
        tokenFiles: tokenFiles.sort(),
    };
}
