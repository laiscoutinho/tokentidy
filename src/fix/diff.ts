/**
 * Diff unificado (o formato do `git diff`) a partir das edições conhecidas. Não precisa de um algoritmo de diff
 * geral: as linhas que mudam são exatamente as que as edições tocam. A saída pode ser aplicada com `git apply`.
 */

import type { Edit } from './plan.ts';

/** Linhas de contexto em volta de cada mudança, como no `diff -u`. */
const CONTEXT = 3;

/** Aplica as edições ao texto, do fim para o começo: as posições das anteriores continuam valendo. */
export function applyEdits(source: string, edits: readonly Edit[]): string {
    let text = source;
    for (const edit of edits.toSorted((a, b) => b.offset - a.offset || b.endOffset - a.endOffset)) {
        text = text.slice(0, edit.offset) + edit.text + text.slice(edit.endOffset);
    }
    return text;
}

/** Linhas com o terminador (`\n`); a última pode não ter. */
function splitLines(text: string): string[] {
    return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

interface Region {
    /** Primeira e última linha do original tocadas (índices a partir de 0). */
    first: number;
    last: number;
    /** Linhas novas no lugar delas. */
    lines: string[];
}

/** Diff unificado de um arquivo (`file` relativo à raiz, com `/`); vazio quando as edições não mudam nada. */
export function unifiedDiff(file: string, source: string, edits: readonly Edit[]): string {
    const lines = splitLines(source);
    const starts: number[] = [];
    let position = 0;
    for (const line of lines) {
        starts.push(position);
        position += line.length;
    }
    // Depois do último `\n`, a posição ainda conta como da última linha
    const lineAt = (offset: number) => Math.max(0, starts.findLastIndex((start) => start <= offset));

    // Linhas tocadas por cada edição, juntando as que dividem uma linha ou são vizinhas (o `-` e o `+` ficam em bloco)
    const ranges: { first: number; last: number; edits: Edit[] }[] = [];
    for (const edit of edits.toSorted((a, b) => a.offset - b.offset)) {
        const first = lineAt(edit.offset);
        const last = Math.max(first, lineAt(Math.max(edit.offset, edit.endOffset - 1)));
        const previous = ranges.at(-1);
        if (previous && first <= previous.last + 1) {
            previous.last = Math.max(previous.last, last);
            previous.edits.push(edit);
        } else {
            ranges.push({ first, last, edits: [edit] });
        }
    }
    const regions: Region[] = ranges.flatMap(({ first, last, edits: inRange }) => {
        const start = lines.length > 0 ? starts[first]! : 0;
        const end = lines.length > 0 ? starts[last]! + lines[last]!.length : 0;
        const before = source.slice(start, end);
        const after = applyEdits(before, inRange.map((e) => ({ ...e, offset: e.offset - start, endOffset: e.endOffset - start })));
        return before === after ? [] : [{ first, last: lines.length > 0 ? last : -1, lines: splitLines(after) }];
    });
    if (regions.length === 0) {
        return '';
    }

    // Mudanças próximas (até 2 × contexto linhas entre elas) ficam no mesmo bloco
    const hunks = Map.groupBy(regions, (() => {
        let group = 0;
        let previous: Region | undefined;
        return (region: Region) => {
            if (previous && region.first - previous.last - 1 > 2 * CONTEXT) {
                group++;
            }
            previous = region;
            return group;
        };
    })());

    const out = [`--- a/${file}`, `+++ b/${file}`];
    let delta = 0;
    for (const group of hunks.values()) {
        const from = Math.max(0, group[0]!.first - CONTEXT);
        const to = Math.min(lines.length - 1, group.at(-1)!.last + CONTEXT);
        const body: string[] = [];
        let oldCount = 0;
        let newCount = 0;
        const context = (index: number) => {
            body.push(...lineOut(' ', lines[index]!));
            oldCount++;
            newCount++;
        };
        let cursor = from;
        for (const region of group) {
            for (; cursor < region.first; cursor++) {
                context(cursor);
            }
            for (let index = region.first; index <= region.last; index++) {
                body.push(...lineOut('-', lines[index]!));
                oldCount++;
            }
            for (const line of region.lines) {
                body.push(...lineOut('+', line));
                newCount++;
            }
            cursor = region.last + 1;
        }
        for (; cursor <= to; cursor++) {
            context(cursor);
        }
        // Sem linhas no original, o início é a linha antes do bloco (0), como no `diff`
        const oldStart = oldCount === 0 ? from : from + 1;
        const newStart = newCount === 0 ? from + delta : from + delta + 1;
        out.push(`@@ -${hunkRange(oldStart, oldCount)} +${hunkRange(newStart, newCount)} @@`, ...body);
        delta += newCount - oldCount;
    }
    return `${out.join('\n')}\n`;
}

function hunkRange(start: number, count: number): string {
    return count === 1 ? `${start}` : `${start},${count}`;
}

/** Linha do diff sem o `\n`; sem ele no arquivo, a marca que o `patch` e o `git apply` esperam. */
function lineOut(prefix: string, line: string): string[] {
    return line.endsWith('\n')
        ? [`${prefix}${line.slice(0, -1)}`]
        : [`${prefix}${line}`, '\\ No newline at end of file'];
}
