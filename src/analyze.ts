// Junta as etapas: encontra os arquivos, lê cada um e manda para o parser da sua extensão.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { scanDirectory } from './scanner.ts';
import type { AnalysisError, Finding, TokenDefinition, TokenReference } from './types.ts';
import type { ParseResult, RootFontSize } from './parsers/collector.ts';
import type { StyleSyntax } from './parsers/css.ts';

export interface AnalysisResult {
    root: string;
    /** Quantos arquivos foram de fato analisados. */
    filesAnalyzed: number;
    findings: Finding[];
    errors: AnalysisError[];
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

type Parser = (source: string, file: string) => ParseResult | Promise<ParseResult>;

const STYLE_SYNTAX: Record<string, StyleSyntax> = { '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less' };
const SCRIPT_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

/**
 * Parser de cada tipo de arquivo, carregado só quando aparece um arquivo dele:
 * quem roda num projeto sem Angular não paga o tempo de carregar o compilador do Angular.
 */
async function loadParser(kind: string): Promise<Parser> {
    if (kind in STYLE_SYNTAX) {
        const { parseCss } = await import('./parsers/css.ts');
        const syntax = STYLE_SYNTAX[kind]!;
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

/** Analisa um diretório e devolve os valores soltos encontrados, em ordem de arquivo e posição. */
export async function analyzeDirectory(dir: string): Promise<AnalysisResult> {
    const scan = await scanDirectory(dir);
    // Ordem estável: o glob não garante ordem, e a saída precisa ser a mesma em toda execução.
    // Caminho com `/` em qualquer SO, para o --json ser igual no Windows e no Linux.
    const files = scan.files.map((file) => file.split(path.sep).join('/')).toSorted();
    const loaded = new Map<string, Parser>();
    const results: ParseResult[] = [];

    async function run(file: string, kind: string): Promise<ParseResult> {
        let parse = loaded.get(kind);
        if (!parse) {
            parse = await loadParser(kind);
            loaded.set(kind, parse);
        }
        const source = await readFile(path.join(scan.root, file), 'utf8');
        const result = await parse(source, file);
        results.push(result);
        return result;
    }

    // Scripts primeiro: os componentes Angular dizem quais `.html` são templates (`templateUrl`)
    // e precisam do parser do Angular (`[style.x]`, `@if`) em vez do parser de HTML comum.
    const angularTemplates = new Set<string>();
    for (const file of files.filter((f) => SCRIPT_EXTENSIONS.has(path.extname(f).toLowerCase()))) {
        const result = await run(file, 'script');
        for (const url of result.templateUrls ?? []) {
            angularTemplates.add(path.posix.normalize(path.posix.join(path.posix.dirname(file), url)));
        }
    }

    const styleLanguages = new Set<StyleSyntax>();
    const tokenFiles: string[] = [];
    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ext in STYLE_SYNTAX) {
            styleLanguages.add(STYLE_SYNTAX[ext]!);
            const result = await run(file, ext);
            if (result.definitions.length > 0 && result.declarations === 0) {
                tokenFiles.push(file);
            }
        } else if (ext === '.html') {
            await run(file, angularTemplates.has(file) ? 'angular' : 'html');
        }
    }

    if (scan.tokenFiles.length > 0) {
        const { parseDtcg } = await import('./parsers/dtcg.ts');
        for (const file of scan.tokenFiles.map((f) => f.split(path.sep).join('/'))) {
            const { definitions, errors } = parseDtcg(await readFile(path.join(scan.root, file), 'utf8'), file);
            results.push({ findings: [], errors, definitions, references: [], declarations: 0 });
            tokenFiles.push(file);
        }
    }

    const byPosition = (a: { file: string; line: number; column: number }, b: { file: string; line: number; column: number }) =>
        (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line || a.column - b.column;

    const rootFontSize = results.map((r) => r.rootFontSize).find((size) => size !== undefined);
    return {
        root: scan.root,
        filesAnalyzed: results.length - scan.tokenFiles.length,
        findings: results.flatMap((r) => r.findings).sort(byPosition),
        errors: results.flatMap((r) => r.errors).sort(byPosition),
        definitions: results.flatMap((r) => r.definitions).sort(byPosition),
        references: results.flatMap((r) => r.references).sort((a, b) => byPosition({ ...a, column: 0 }, { ...b, column: 0 })),
        ...(rootFontSize ? { rootFontSize } : {}),
        styleLanguages: [...styleLanguages].sort(),
        tokenFiles: tokenFiles.sort(),
    };
}
