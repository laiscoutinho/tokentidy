// Saída de texto: caminhos, links e resumos. Todo texto que vem de arquivos do usuário passa por `printable()`.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AnalysisResult } from '../analysis/analyze.ts';

// Controles C0/C1 (ESC inicia sequências ANSI e OSC) e marcas bidi (mudam a ordem do texto na tela, "Trojan Source")
const UNSAFE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/**
 * Texto seguro para o terminal: caracteres de controle viram `\uXXXX` visível em vez de serem removidos,
 * para a pessoa ver que eles estão no arquivo. O JSON mantém o texto exato.
 */
export function printable(text: string): string {
    return text.replace(UNSAFE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Valores que ocupam várias linhas no arquivo (ex.: lista de fontes) viram uma linha só. */
export function oneLine(value: string): string {
    return value.replace(/[ \t\r\n\f]+/g, ' ');
}

/** Caminho relativo à pasta atual: o terminal e o editor transformam `arquivo:linha:coluna` em link. */
export function displayPath(file: string): string {
    return printable(path.relative(process.cwd(), file) || '.');
}

/** Caminho de um arquivo do resultado (relativo à raiz) para exibição. */
export function display(result: Pick<AnalysisResult, 'root'>, file: string): string {
    return displayPath(path.join(result.root, file));
}

/** Caminho clicável: em terminal, link OSC 8 (abre o arquivo com Ctrl+clique). */
export function link(file: string): string {
    const shown = displayPath(file);
    if (!process.stderr.isTTY) {
        return shown;
    }
    return `\u001b]8;;${pathToFileURL(file).href}\u001b\\${shown}\u001b]8;;\u001b\\`;
}

/**
 * Tudo que não é dado vai para o stderr, no formato `arquivo:linha:coluna` dos achados:
 * erros de sintaxe, avisos dos comentários de ignorar, arquivos pulados e caminhos sem arquivo suportado.
 */
export function printDiagnostics(result: AnalysisResult): void {
    for (const e of result.errors) {
        console.error(`${display(result, e.file)}:${e.line}:${e.column}\tsyntax error\t${printable(oneLine(e.message))}`);
    }
    for (const w of result.warnings) {
        console.error(`${display(result, w.file)}:${w.line}:${w.column}\twarning\t${w.rule}\t${printable(w.message)}`);
    }
    // Ignorados pela configuração foram pedidos pela pessoa: não poluem a saída
    for (const s of result.skipped.filter((item) => item.reason !== 'ignored')) {
        console.error(`${display(result, s.file)}\tskipped\t${s.reason}`);
    }
    for (const given of result.unmatched) {
        console.error(`No supported files in ${printable(given)}`);
    }
}

/** `3 violations, 2 review in 4 files`: só quando há algo a dizer. */
export function printCheckSummary(result: AnalysisResult): void {
    const { findings, review, ignored, skipped } = result;
    if (findings.length + review.length + ignored + skipped.length === 0) {
        return;
    }
    const files = new Set([...findings, ...review].map((item) => item.file)).size;
    const parts = [`${findings.length} ${findings.length === 1 ? 'violation' : 'violations'}, ${review.length} review in ${files} ${files === 1 ? 'file' : 'files'}`];
    if (ignored > 0) {
        parts.push(`${ignored} ignored by comment`);
    }
    if (skipped.length > 0) {
        parts.push(`${skipped.length} ${skipped.length === 1 ? 'file' : 'files'} skipped`);
    }
    console.error(parts.join('; '));
}
