// Fixtures de expectativa: cada linha diz que regras espera (`expect: color/hardcoded, spacing/hardcoded`
// ou `expect: none`). Linha sem marcação não pode ter achado. O teste mostra falsos positivos e falsos
// negativos por regra, para a precisão ser medida e não só "passou/falhou".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../src/analyze.ts';

const project = path.join(import.meta.dirname, 'fixtures', 'expect');
const EXPECT = /expect:\s*([\w/,\s-]+?)\s*(?:\*\/|$)/;

/** Regras esperadas em cada linha (1-based) de um arquivo. */
function expectations(source: string): Map<number, Set<string>> {
    const expected = new Map<number, Set<string>>();
    source.split('\n').forEach((text, index) => {
        const match = EXPECT.exec(text);
        if (match) {
            const rules = match[1]!.split(',').map((rule) => rule.trim()).filter((rule) => rule !== 'none');
            expected.set(index + 1, new Set(rules));
        }
    });
    return expected;
}

test('expectation fixtures: no false positives and no false negatives', async () => {
    const result = await analyzePaths([project], { root: project });
    const found = new Map<string, Set<string>>();
    for (const item of [...result.findings, ...result.review]) {
        const key = `${item.file}:${item.line}`;
        found.set(key, (found.get(key) ?? new Set()).add(item.rule));
    }

    const falsePositives: string[] = [];
    const falseNegatives: string[] = [];
    const files = new Set([...result.findings, ...result.review].map((item) => item.file));
    for (const file of ['src/edge.css', 'src/breakpoints.scss', 'src/App.jsx']) {
        files.add(file);
    }
    for (const file of files) {
        const expected = expectations(await readFile(path.join(project, file), 'utf8'));
        const lines = new Set([...expected.keys(), ...[...found.keys()].filter((k) => k.startsWith(`${file}:`)).map((k) => Number(k.slice(file.length + 1)))]);
        for (const line of lines) {
            const want = expected.get(line) ?? new Set<string>();
            const got = found.get(`${file}:${line}`) ?? new Set<string>();
            falsePositives.push(...[...got].filter((rule) => !want.has(rule)).map((rule) => `${file}:${line} ${rule}`));
            falseNegatives.push(...[...want].filter((rule) => !got.has(rule)).map((rule) => `${file}:${line} ${rule}`));
        }
    }

    assert.deepEqual({ falsePositives, falseNegatives }, { falsePositives: [], falseNegatives: [] });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.ignored, 3);
});
