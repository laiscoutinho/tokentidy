// Como `fix --approximate` mostra e pergunta: cada grupo, com o que muda, o que continua valendo e o que foi bloqueado.
import { colorInfo } from '../values/color-info.ts';
import { deltaEOK } from '../check/near.ts';
import type { ApproximateAnswer, ApproximateGroup } from '../fix/approximate.ts';
import type { Finding } from '../types.ts';
import { formatNumber, lengthInPx, normalizeFinding } from '../values/normalize.ts';
import { printable } from './print.ts';

function delta(group: ApproximateGroup, finding: Finding): string {
    const from = normalizeFinding(finding);
    if (group.type === 'color') {
        const [a, b] = [colorInfo(from), colorInfo(group.to)];
        return a && b ? `ΔE ${deltaEOK(a.oklch, b.oklch).toFixed(3)}` : '';
    }
    const [a, b] = [lengthInPx(from), lengthInPx(group.to)];
    if (a === undefined || b === undefined) {
        return '';
    }
    const change = b - a;
    return `${change >= 0 ? '+' : ''}${formatNumber(change)}px`;
}

/** O bloco de um grupo, no formato que a pessoa autoriza. */
export function groupLines(group: ApproximateGroup, where: (finding: Finding) => string): string[] {
    const values = group.from.map((value) => `${printable(value.key)} ×${value.findings.length}`).join(', ');
    const lines = [`${printable(group.label)}: ${values} → ${printable(group.token)} (${printable(group.to)})`];
    for (const { finding } of group.changes) {
        lines.push(`  ${where(finding)}\t${printable(finding.property)}: ${printable(finding.value)} → ${printable(group.token)}\t${delta(group, finding)}`);
    }
    if (group.kept.length > 0) {
        lines.push(`  kept: ${group.kept.join(', ')}`);
    }
    for (const { finding, reason } of group.blocked) {
        lines.push(`  ${where(finding)}\tblocked: ${printable(reason)}`);
    }
    return lines;
}

/** Pergunta no stderr: o stdout continua livre para dados. */
export async function createPrompt(where: (finding: Finding) => string): Promise<{ decide: (group: ApproximateGroup) => Promise<ApproximateAnswer>; close: () => void }> {
    const { createInterface } = await import('node:readline/promises');
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    return {
        close: () => prompt.close(),
        decide: async (group) => {
            console.error(groupLines(group, where).join('\n'));
            for (;;) {
                const answer = (await prompt.question('Apply? [y]es [n]o [a]ll in this group [q]uit ')).trim().toLowerCase();
                // A resposta vale para o grupo inteiro: `y` e `a` dão no mesmo
                if (answer === 'y' || answer === 'yes' || answer === 'a' || answer === 'all') {
                    return 'yes';
                }
                if (answer === 'n' || answer === 'no') {
                    return 'no';
                }
                if (answer === 'q' || answer === 'quit') {
                    return 'quit';
                }
            }
        },
    };
}
