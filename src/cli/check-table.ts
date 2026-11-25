// `check` para pessoas: uma tabela por arquivo e um resumo que diz o que fazer a seguir.
import type { CheckResult } from '../check/enrich.ts';
import type { MfeIssue } from '../check/microfrontends.ts';
import type { Finding } from '../types.ts';
import { normalizeFinding } from '../values/normalize.ts';
import { count, paint, table, typeLabel } from './human.ts';
import { display, oneLine, printable, printHumanDiagnostics } from './print.ts';

interface Row {
    file: string;
    line: number;
    column: number;
    cells: [string, string, string, string];
    kind: 'violation' | 'review';
    /** Declaração de onde o valor veio: valores da mesma declaração viram uma linha só. */
    declaration?: number;
}

/** Sugestão em palavras: o token, ou o mais próximo com a diferença. */
function suggestionCell(finding: Finding): string {
    const suggestion = finding.suggestion;
    if (!suggestion) {
        return '—';
    }
    const { token, match, distance = 0, alternatives } = suggestion;
    if (match === 'exact') {
        return printable(alternatives?.length ? `${token} (or ${alternatives.join(', ')})` : token);
    }
    const difference = finding.type === 'color' ? `a very similar color, ΔE ${distance}` : `${distance > 0 ? '+' : ''}${distance}px away`;
    return printable(`close: ${token} (${difference})`);
}

function rowsOf(result: CheckResult, microFrontends: readonly MfeIssue[]): Row[] {
    const at = (item: { file: string; line: number; column: number }) => ({ file: item.file, line: item.line, column: item.column });
    const value = (text: string) => printable(oneLine(text));
    return [
        ...result.findings.map((f): Row => ({ ...at(f), ...declarationOf(f), kind: 'violation', cells: [typeLabel(f.type), printable(f.property), value(f.value), suggestionCell(f)] })),
        ...result.review.map((r): Row => ({ ...at(r), ...declarationOf(r), kind: 'review', cells: [`check ${typeLabel(r.type)}`, printable(r.property), value(r.value), printable(r.message)] })),
        ...result.aliasHints.map((h): Row => ({ ...at(h), kind: 'review', cells: ['semantic name', printable(h.property), printable(h.token), `use ${printable(h.alias)}: it names the role of this color`] })),
        ...microFrontends.map((m): Row => ({ ...at(m), kind: m.severity === 'violation' ? 'violation' : 'review', cells: ['micro-frontend', printable(m.property), value(m.value), printable(m.detail)] })),
    ].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line || a.column - b.column);
}

const declarationOf = (item: { declaration?: number }) => (item.declaration === undefined ? {} : { declaration: item.declaration });

/**
 * `padding: 4px 8px 4px 8px` é uma decisão só: uma linha, com os valores juntos.
 * Tipos e sugestões diferentes (`border: 1px solid #ccc`) aparecem lado a lado, sem repetir.
 */
function mergeDeclarations(rows: readonly Row[]): Row[] {
    // Sem declaração (nome semântico, micro-frontend), cada item é a sua própria linha
    const groups = Map.groupBy(rows, (row, i) => (row.declaration === undefined ? `#${i}` : `${row.file}\u0000${row.declaration}\u0000${row.kind}`));
    return [...groups.values()].map((group) => {
        const [row] = group as [Row, ...Row[]];
        if (group.length === 1) {
            return row;
        }
        const types = [...new Set(group.map((r) => r.cells[0]))].join(', ');
        const suggestions = new Set(group.map((r) => r.cells[3]));
        const suggestion = suggestions.size === 1 ? row.cells[3] : group.map((r) => r.cells[3]).join(', ');
        return { ...row, cells: [types, row.cells[1], group.map((r) => r.cells[2]).join(' '), suggestion] };
    });
}

/** Sem `--review`, a tabela mostra só as violações; as revisões ficam no rodapé, contadas. */
export function printCheckTable(result: CheckResult, microFrontends: readonly MfeIssue[], baselined: number, showReview = false): void {
    const rows = mergeDeclarations(rowsOf(result, microFrontends).filter((row) => showReview || row.kind === 'violation'));
    const out: string[] = [];
    for (const [file, ofFile] of Map.groupBy(rows, (row) => row.file)) {
        out.push(paint(['bold', 'underline'], display(result, file), process.stdout));
        out.push(...table(['Line', 'Type', 'Property', 'Value', 'Use instead'], ofFile.map((row) => {
            const where = `${row.line}:${row.column}`;
            return [row.kind === 'review' ? paint('yellow', where, process.stdout) : where, ...row.cells];
        }), { max: [8, 18, 22, 28] }));
        out.push('');
    }
    if (out.length > 0) {
        process.stdout.write(`${out.join('\n')}\n`);
    }
    printHumanDiagnostics(result);
    printCheckFooter(result, microFrontends, baselined, showReview);
}

/** O que foi achado e o próximo passo, em frases. Nada aparece quando o projeto está limpo e sem avisos. */
function printCheckFooter(result: CheckResult, microFrontends: readonly MfeIssue[], baselined: number, showReview: boolean): void {
    const { findings, review } = result;
    const reviewCount = review.length + result.aliasHints.length + microFrontends.filter((m) => m.severity !== 'violation').length;
    const lines: string[] = [];
    if (findings.length === 0) {
        lines.push(paint('green', '✔ No hardcoded values found.'));
    } else {
        const files = new Set(findings.map((f) => f.file)).size;
        lines.push(paint('red', `✖ ${count(findings.length, 'hardcoded value')} in ${count(files, 'file')}.`));
        const exact = findings.filter((f) => f.suggestion?.match === 'exact').length;
        if (exact > 0) {
            lines.push(`  ${exact === 1 ? '1 of them already has' : `${exact} of them already have`} a token: run ${paint('cyan', 'tokentidy fix')} to replace ${exact === 1 ? 'it' : 'them'}.`);
        }
        const repeated = new Set(result.repeatedWithoutToken.map((f) => `${f.type}\u0000${normalizeFinding(f)}`)).size;
        if (repeated > 0) {
            lines.push(`  ${count(repeated, 'value repeats', 'values repeat')} without a token: run ${paint('cyan', 'tokentidy generate')} to create ${repeated === 1 ? 'it' : 'them'}.`);
        }
    }
    if (reviewCount > 0 && showReview) {
        lines.push(`  ${count(reviewCount, 'item')} marked "check" ${reviewCount === 1 ? 'is not an error' : 'are not errors'}: take a look and decide.`);
    } else if (reviewCount > 0) {
        lines.push(`  ${count(reviewCount, 'item')} for review: ${paint('cyan', 'tokentidy check --review')}`);
    }
    const collisions = microFrontends.filter((m) => m.rule === 'mfe/root-collision').length;
    if (collisions > 0) {
        lines.push(`  ${count(collisions, 'global token')} ${collisions === 1 ? 'has' : 'have'} different values in different micro-frontends.`);
    }
    if (result.unusedTokens.length > 0) {
        const names = result.unusedTokens.slice(0, 5).map((t) => printable(t.name)).join(', ');
        lines.push(`  ${count(result.unusedTokens.length, 'token is', 'tokens are')} defined but never used: ${names}${result.unusedTokens.length > 5 ? ', …' : ''}.`);
    }
    const hidden = [
        ...(baselined > 0 ? [`${baselined} in the baseline`] : []),
        ...(result.ignored > 0 ? [`${result.ignored} ignored by comment`] : []),
    ];
    if (hidden.length > 0) {
        lines.push(paint('gray', `  Not shown: ${hidden.join(', ')}.`));
    }
    console.error(lines.join('\n'));
}
