// Imports de SCSS/Sass/Less: que arquivos uma folha de estilo já carrega e onde entra um import novo.
// Leitura por texto, sem resolver caminhos de build (`includePaths`, pacotes): o que não dá para resolver
// conta como "não carregado", e o `fix` não usa uma variável que talvez não exista.

import path from 'node:path';

export type Preprocessor = 'scss' | 'sass' | 'less';

/** Arquivo carregado por um `@use`/`@forward`/`@import`, e se as variáveis dele ficam visíveis sem namespace. */
export interface LoadedFile {
    /** Relativo à raiz, sem extensão e sem o `_` de partial (`styles/variables`). */
    id: string;
    /** `@import` ou `@use … as *`: `$x` funciona direto. Com `@use` comum seria `variables.$x`. */
    global: boolean;
}

const STATEMENT = /@(use|forward|import)\s+(?:\([^)]*\)\s*)?(['"])([^'"]+)\2([^;\n]*)/g;

/** Identidade de um arquivo de estilo para comparar imports: sem extensão e sem `_` (`a/_b.scss` → `a/b`). */
export function styleId(file: string): string {
    const parsed = path.posix.parse(file);
    const name = parsed.name.replace(/^_/, '');
    return path.posix.join(parsed.dir, name);
}

/** Arquivos que `file` (relativo à raiz) carrega, com caminho relativo resolvido a partir da pasta dele. */
export function loadedFiles(source: string, file: string): LoadedFile[] {
    const loaded: LoadedFile[] = [];
    for (const match of source.matchAll(STATEMENT)) {
        const [, rule, , url = '', rest = ''] = match;
        // Pacote (`@use 'sass:math'`, `~lib`) ou URL: não é arquivo do projeto
        if (/^[a-z]+:|^~|^\//i.test(url)) {
            continue;
        }
        const id = styleId(path.posix.join(path.posix.dirname(file), url));
        const global = rule === 'import' || /\bas\s+\*/.test(rest);
        loaded.push({ id, global });
    }
    return loaded;
}

/** URL relativa de `file` para `target` (ambos relativos à raiz), como se escreve num import (`../tokens/x`). */
export function importUrl(file: string, target: string): string {
    const relative = path.posix.relative(path.posix.dirname(file), target);
    return relative.startsWith('.') ? relative : `./${relative}`;
}

/**
 * Texto e posição do import que carrega os tokens gerados. Entra depois do `@charset` e dos `@use`/`@forward`
 * do topo (o Sass exige `@use` antes de qualquer outra regra), ou no começo do arquivo.
 */
export function importInsertion(source: string, language: Preprocessor, tokensFile: string, file: string): { offset: number; text: string } {
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const statement = language === 'less'
        ? `@import (reference) '${importUrl(file, tokensFile)}';`
        : `@use '${importUrl(file, styleId(tokensFile))}' as *${language === 'sass' ? '' : ';'}`;
    const leading = language === 'less' ? /^@(charset|import)\b/ : /^@(charset|use|forward)\b/;

    let offset = source.startsWith('﻿') ? 1 : 0;
    let insertAt: number | undefined;
    for (;;) {
        const rest = source.slice(offset);
        const space = /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/.exec(rest);
        const start = offset + (space?.[0].length ?? 0);
        if (!leading.test(source.slice(start))) {
            break;
        }
        // Fim da instrução: `;` (ou o fim da linha no Sass indentado), e depois o fim da linha
        const terminator = language === 'sass' ? source.indexOf('\n', start) : source.indexOf(';', start);
        const lineEnd = source.indexOf('\n', terminator === -1 ? start : terminator);
        if (lineEnd === -1) {
            return { offset: source.length, text: `${eol}${statement}${eol}` };
        }
        offset = lineEnd + 1;
        insertAt = offset;
    }
    return { offset: insertAt ?? (source.startsWith('﻿') ? 1 : 0), text: `${statement}${eol}` };
}
