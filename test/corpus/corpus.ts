/**
 * Regressão em projetos reais (dev set): cada repositório fica fixo num commit, e o resultado do
 * `check --json` é comparado com o registrado em `expected.json`. Uma mudança de parser ou de regra
 * que mexe nos números aparece aqui com o repositório e a regra, em vez de passar despercebida.
 *
 *   node test/corpus/corpus.ts            compara (sai com 1 se algo mudou)
 *   node test/corpus/corpus.ts --update   grava os números atuais como esperados
 *
 * Os repositórios são baixados em `.corpus/` (só o commit fixado, sem histórico). Com
 * `TOKENTIDY_CORPUS_SOURCE=<pasta>`, um clone local em `<pasta>/<id>` é usado como origem.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Repo {
    id: string;
    url: string;
    commit: string;
}

/** O que é comparado em cada repositório. Contagens exatas; o tempo só precisa caber no orçamento. */
export interface Counts {
    filesAnalyzed: number;
    findings: Record<string, number>;
    review: Record<string, number>;
    hosts: Record<string, number>;
    types: Record<string, number>;
    /** Parte do que foi encontrado que ficou para revisão: deve cair a cada versão. */
    reviewShare: number;
    skipped: Record<string, number>;
    errors: number;
}

interface Expected extends Counts {
    /** Orçamento de tempo do `check`: o triplo do medido, nunca menos de 3 s (máquinas de CI variam). */
    budgetMs: number;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cacheDir = path.join(root, '.corpus');
const repos = JSON.parse(readFileSync(path.join(here, 'repos.json'), 'utf8')) as Repo[];
const expectedFile = path.join(here, 'expected.json');

/** Baixa só o commit fixado; um checkout já no commit certo é reaproveitado. */
function checkout(repo: Repo): string {
    const dir = path.join(cacheDir, repo.id);
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (existsSync(path.join(dir, '.git')) && git('rev-parse', 'HEAD') === repo.commit) {
        return dir;
    }
    mkdirSync(dir, { recursive: true });
    if (!existsSync(path.join(dir, '.git'))) {
        git('init', '--quiet');
    }
    const local = process.env['TOKENTIDY_CORPUS_SOURCE'] ? path.join(process.env['TOKENTIDY_CORPUS_SOURCE'], repo.id) : undefined;
    git('fetch', '--quiet', '--depth', '1', local && existsSync(local) ? local : repo.url, repo.commit);
    git('checkout', '--quiet', '--force', repo.commit);
    git('clean', '--quiet', '-fdx');
    return dir;
}

const tally = (items: readonly Record<string, unknown>[], key: string) => {
    const counts: Record<string, number> = {};
    for (const item of items) {
        const value = String(item[key]);
        counts[value] = (counts[value] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
};

/** Roda o `check` como a pessoa roda (o binário), e resume o JSON. */
export function measure(dir: string): { counts: Counts; ms: number } {
    const start = performance.now();
    let output: string;
    try {
        output = execFileSync(process.execPath, [path.join(root, 'src/cli.ts'), 'check', dir, '--json'], { encoding: 'utf8', maxBuffer: 1 << 30 });
    } catch (error) {
        // Exit 1 é o normal com valores fixos no código
        output = (error as { stdout?: string }).stdout ?? '';
        if (!output) {
            throw error;
        }
    }
    const ms = Math.round(performance.now() - start);
    type Items = Record<string, unknown>[];
    const json = JSON.parse(output) as { filesAnalyzed: number; findings: Items; review: Items; skipped: Items; errors: Items };
    const { findings, review } = json;
    return {
        ms,
        counts: {
            filesAnalyzed: json.filesAnalyzed,
            findings: tally(findings, 'rule'),
            review: tally(review, 'rule'),
            hosts: tally(findings, 'host'),
            types: tally(findings, 'type'),
            reviewShare: Math.round((review.length / Math.max(findings.length + review.length, 1)) * 1000) / 1000,
            skipped: tally(json.skipped, 'reason'),
            errors: json.errors.length,
        },
    };
}

/** Diferenças legíveis: `findings.color/hardcoded: 120 → 118`. */
export function differences(expected: Counts, actual: Counts): string[] {
    const lines: string[] = [];
    for (const key of Object.keys(actual) as (keyof Counts)[]) {
        const want = expected[key];
        const got = actual[key];
        if (typeof got === 'number') {
            if (want !== got) {
                lines.push(`${key}: ${String(want)} → ${got}`);
            }
            continue;
        }
        const wanted = (want ?? {}) as Record<string, number>;
        for (const name of [...new Set([...Object.keys(wanted), ...Object.keys(got)])].sort()) {
            if (wanted[name] !== got[name]) {
                lines.push(`${key}.${name}: ${wanted[name] ?? 0} → ${got[name] ?? 0}`);
            }
        }
    }
    return lines;
}

function main(): void {
    const update = process.argv.includes('--update');
    const expected = existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) as Record<string, Expected> : {};
    const next: Record<string, Expected> = {};
    let failed = false;
    for (const repo of repos) {
        const { counts, ms } = measure(checkout(repo));
        const total = Object.values(counts.findings).reduce((a, b) => a + b, 0);
        console.log(`${repo.id}: ${total} values, ${counts.filesAnalyzed} files, ${ms} ms`);
        next[repo.id] = { ...counts, budgetMs: Math.max(ms * 3, 3000) };
        if (update) {
            continue;
        }
        const before = expected[repo.id];
        if (!before) {
            console.log(`  not in expected.json: run with --update`);
            failed = true;
            continue;
        }
        const lines = differences(before, counts);
        if (ms > before.budgetMs) {
            lines.push(`time: ${ms} ms, budget ${before.budgetMs} ms`);
        }
        for (const line of lines) {
            console.log(`  ${line}`);
        }
        failed ||= lines.length > 0;
    }
    if (update) {
        writeFileSync(expectedFile, `${JSON.stringify(next, null, 2)}\n`);
        console.log(`Wrote ${path.relative(root, expectedFile)}`);
    } else if (failed) {
        console.log('\nThe corpus changed. If the change is intended, run: npm run test:corpus -- --update');
        process.exitCode = 1;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
