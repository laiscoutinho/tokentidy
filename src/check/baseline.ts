/**
 * Baseline: fotografia das violações já existentes, para o CI cobrar só as novas.
 * Conta por arquivo, regra, propriedade e valor normalizado, sem linhas: um `git mv` de bloco ou uma linha
 * nova no topo do arquivo não invalida a fotografia.
 */

import { readFile } from 'node:fs/promises';

import type { AnalysisWarning, Finding } from '../types.ts';
import { UsageError } from '../cli/errors.ts';
import { normalizeFinding } from '../values/normalize.ts';

export const BASELINE_VERSION = 1;

export interface BaselineEntry {
    file: string;
    rule: string;
    property: string;
    value: string;
    count: number;
}

export interface Baseline {
    version: typeof BASELINE_VERSION;
    entries: BaselineEntry[];
}

const keyOf = (e: Pick<BaselineEntry, 'file' | 'rule' | 'property' | 'value'>) => JSON.stringify([e.file, e.rule, e.property, e.value]);

function entryOf(finding: Finding): Omit<BaselineEntry, 'count'> {
    return { file: finding.file, rule: finding.rule, property: finding.property, value: normalizeFinding(finding) };
}

export function createBaseline(findings: readonly Finding[]): Baseline {
    const entries = new Map<string, BaselineEntry>();
    for (const finding of findings) {
        const entry = entryOf(finding);
        const key = keyOf(entry);
        const existing = entries.get(key);
        if (existing) {
            existing.count++;
        } else {
            entries.set(key, { ...entry, count: 1 });
        }
    }
    // Ordem estável: o arquivo entra no git e o diff tem que mostrar só o que mudou
    return { version: BASELINE_VERSION, entries: [...entries.values()].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1)) };
}

export async function readBaseline(file: string): Promise<Baseline> {
    let text: string;
    try {
        text = await readFile(file, 'utf8');
    } catch {
        throw new UsageError(`Baseline file not found: ${file}`);
    }
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch (error) {
        throw new UsageError(`Invalid JSON in ${file}: ${(error as Error).message}`);
    }
    if (!isBaseline(json)) {
        throw new UsageError(`${file} is not a tokentidy baseline (expected version ${BASELINE_VERSION}); create one with check --print-baseline`);
    }
    return json;
}

function isBaseline(json: unknown): json is Baseline {
    if (typeof json !== 'object' || json === null) {
        return false;
    }
    const { version, entries } = json as Partial<Baseline>;
    return version === BASELINE_VERSION && Array.isArray(entries) && entries.every((e) => typeof e === 'object' && e !== null
        && typeof e.file === 'string' && typeof e.rule === 'string' && typeof e.property === 'string' && typeof e.value === 'string'
        && Number.isInteger(e.count) && e.count > 0);
}

export interface BaselineOutcome {
    /** Violações que a fotografia não cobre. */
    findings: Finding[];
    /** Quantas a fotografia cobriu. */
    baselined: number;
    /** Arquivos com valores na fotografia que não existem mais: dá para encolher a fotografia. */
    stale: AnalysisWarning[];
}

/** Cada entrada cobre `count` achados; o que passar disso é novo. */
export function applyBaseline(findings: readonly Finding[], baseline: Baseline, options: { partial: boolean }): BaselineOutcome {
    const remaining = new Map(baseline.entries.map((e) => [keyOf(e), { ...e }]));
    let baselined = 0;
    const kept = findings.filter((finding) => {
        const entry = remaining.get(keyOf(entryOf(finding)));
        if (entry && entry.count > 0) {
            entry.count--;
            baselined++;
            return false;
        }
        return true;
    });

    // Em execução parcial, entrada de arquivo fora do escopo não diz nada
    const leftover = options.partial ? [] : [...remaining.values()].filter((e) => e.count > 0);
    const stale = [...Map.groupBy(leftover, (e) => e.file)].map(([file, entries]) => {
        const count = entries.reduce((sum, e) => sum + e.count, 0);
        return {
            file, line: 1, column: 1, rule: 'baseline/stale',
            message: `${count} baselined ${count === 1 ? 'value is' : 'values are'} no longer here; refresh with check --print-baseline`,
        };
    });
    return { findings: kept, baselined, stale };
}
