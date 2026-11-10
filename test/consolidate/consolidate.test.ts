// Consolidação: valor fora da grade é inconsistência, valor na grade é decisão. E nada muda sem guarda e autorização.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { CLI_ENTRY, tempDir } from '../helpers.ts';
import { analyzeDirectory } from '../../src/analysis/analyze.ts';
import { checkChanges } from '../../src/coherence/guards.ts';
import { buildModel } from '../../src/coherence/model.ts';
import { findConsolidations, guardConsolidations } from '../../src/consolidate/consolidate.ts';
import { DECISIONS_FILE, loadDecisions } from '../../src/consolidate/decisions.ts';
import { fixScope } from '../../src/fix/apply.ts';
import { collectFiles } from '../../src/project/scope.ts';
import type { ApproximateGroup, ApproximateOptions } from '../../src/fix/approximate.ts';

const OPTIONS = { gridBase: 4, colorTolerance: 0.02 };

async function withProject<T>(files: Record<string, string>, run: (dir: string) => Promise<T>): Promise<T> {
    const dir = await tempDir();
    try {
        // O package.json marca a raiz: sem ele a CLI subiria até a raiz deste repositório
        for (const [name, content] of Object.entries({ 'package.json': '{}\n', ...files })) {
            await writeFile(path.join(dir, name), content);
        }
        return await run(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

async function groupsOf(css: string, options: Partial<typeof OPTIONS> = {}) {
    return withProject({ 'a.css': css }, async (dir) => {
        const analysis = await analyzeDirectory(dir);
        return guardConsolidations(findConsolidations(analysis.findings, { ...OPTIONS, ...options }), analysis, { ...OPTIONS, ...options });
    });
}

const summary = (groups: Awaited<ReturnType<typeof groupsOf>>) => groups.map((g) => [g.from.map((v) => v.key).join(','), g.to]);

test('off-grid values join the on-grid value of the same role', async () => {
    const groups = await groupsOf('.card { padding: 15px; }\n.card-footer { padding: 16px; }\n.tile { padding: 17px; }\n');
    assert.deepEqual(summary(groups), [['15px,17px', '16px']]);
});

test('each group reports only the relations its own changes kept, as if it ran alone', async () => {
    const css = [
        'body { background: #ffffff; color: #111827; }',
        '.card { padding: 15px 24px; color: #111827; }',
        '.panel { padding: 16px 24px; color: #111828; }',
        '.note { color: #111827; }',
        '',
    ].join('\n');
    await withProject({ 'a.css': css }, async (dir) => {
        const analysis = await analyzeDirectory(dir);
        const groups = guardConsolidations(findConsolidations(analysis.findings, OPTIONS), analysis, OPTIONS);
        const model = buildModel(analysis);
        assert.ok(groups.length >= 2);
        for (const group of groups) {
            const alone = group.changes.length > 0 ? checkChanges(model, group.changes, OPTIONS).kept : [];
            assert.deepEqual(group.kept, alone, group.id);
        }
        assert.ok(groups.some((g) => g.kept.includes('contrast') && !g.kept.includes('inset shape')));
    });
});

test('two on-grid values are never merged', async () => {
    assert.deepEqual(await groupsOf('.card { padding: 12px; }\n.tile { padding: 16px; }\n'), []);
});

test('a role does not borrow a step from another component', async () => {
    const groups = await groupsOf('.card { padding: 15px; }\n.card-x { padding: 12px; }\n.btn { padding: 16px; }\n');
    assert.deepEqual(summary(groups), [['15px', '12px']], 'o 16px do botão não conta para o card');
});

test('a tie goes to the value used more in that role', async () => {
    const groups = await groupsOf('.card { padding: 14px; }\n.card-a { padding: 12px; }\n.card-b { padding: 12px; }\n.card-c { padding: 16px; }\n');
    assert.deepEqual(summary(groups), [['14px', '12px']]);
});

test('a tie with equal use goes to the coarser grid', async () => {
    assert.deepEqual(summary(await groupsOf('.card { padding: 14px; }\n')), [['14px', '16px']]);
});

test('values below the grid and pill radii stay as they are', async () => {
    assert.deepEqual(await groupsOf('.a { padding: 2px; }\n.b { border-radius: 9999px; }\n'), []);
});

test('rem values stay in rem', async () => {
    assert.deepEqual(summary(await groupsOf('.card { padding: 0.95rem; }\n.card-a { padding: 1rem; }\n')), [['0.95rem', '1rem']]);
});

test('a color joins the most used color within tolerance and chains do not form', async () => {
    const groups = await groupsOf('.a { color: #4f46e5; }\n.b { color: #4f46e5; }\n.c { color: #4f46e6; }\n.d { color: #ff0000; }\n');
    assert.deepEqual(summary(groups), [['#4f46e6', '#4f46e5']]);
});

test('a majority in rem brings equivalent px font sizes along', async () => {
    const groups = await groupsOf('.a { font-size: 1rem; }\n.b { font-size: 1.5rem; }\n.c { font-size: 16px; }\n');
    assert.deepEqual(summary(groups), [['16px', '1rem']]);
});

test('.btn:hover is never merged with .btn', async () => {
    const [group] = await groupsOf('.btn { color: #4f46e5; }\n.btn:hover { color: #4f46e6; }\n');
    assert.equal(group!.changes.length, 0);
    assert.match(group!.blocked[0]!.reason, /merges \.btn:hover with \.btn/);
});

function cli(dir: string, ...args: string[]) {
    return spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd: dir, input: '' });
}

const CARDS = { 'a.css': '.card { padding: 15px; }\n.card-footer { padding: 16px; }\n.tile { padding: 17px; }\n' };

test('generate turns 15/16/17px on cards into one token', () => withProject(CARDS, async (dir) => {
    const result = cli(dir, 'generate', '.', '--json', '--dry-run');
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    const spacing = output.tokens.filter((t: { type: string }) => t.type === 'spacing');
    assert.equal(spacing.length, 1);
    assert.equal(spacing[0].key, '16px');
    assert.equal(spacing[0].count, 3);
    assert.deepEqual(spacing[0].spellings, ['16px']);
}));

test('generate does not consolidate what guards block', () => withProject({ 'a.css': '.btn { color: #4f46e5; }\n.x { color: #4f46e5; }\n.btn:hover { color: #4f46e6; }\n.y { color: #4f46e6; }\n' }, async (dir) => {
    const output = JSON.parse(cli(dir, 'generate', '.', '--json', '--dry-run').stdout);
    const hover = output.tokens.filter((t: { type: string }) => t.type === 'color').map((t: { key: string }) => t.key);
    assert.ok(hover.includes('#4f46e5'));
    assert.equal(output.consolidated[0].blocked.length, 1);
}));

const TOKENS = ':root { --space-m: 16px; }\n.used { padding: var(--space-m); }\n';
const USES = { 'tokens.css': TOKENS, 'a.css': '.card { padding: 15px; }\n.card-b { padding: 16px; }\n' };

async function fixed(dir: string, approximate: Omit<ApproximateOptions, 'gridBase' | 'colorTolerance'>, dryRun = false) {
    const scope = await collectFiles([dir], dir);
    return fixScope(scope, { tokensDir: path.join(dir, 'design-tokens'), dryRun, approximate: { ...OPTIONS, ...approximate } });
}

test('--approximate needs an answer outside a terminal and names the flags', () => withProject(USES, async (dir) => {
    const result = cli(dir, 'fix', '.', '--approximate');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--yes/);
    assert.match(result.stderr, /--no-input/);
    assert.equal(await readFile(path.join(dir, 'a.css'), 'utf8'), USES['a.css']);
}));

test('--yes applies what passes the guards', () => withProject(USES, async (dir) => {
    const result = cli(dir, 'fix', '.', '--approximate', '--yes');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(path.join(dir, 'a.css'), 'utf8'), '.card { padding: var(--space-m); }\n.card-b { padding: var(--space-m); }\n');
}));

test('a color close to a token goes to the token, even when the loose color is used more', () => withProject({
    'tokens.css': ':root { --brand: #4f46e5; }\n',
    'a.css': '.card { color: #4f46e6; }\n.note { color: #4f46e6; }\n.btn { background: #4f46e5; }\n.btn:hover { background: #4f46e6; }\n',
}, async (dir) => {
    const result = cli(dir, 'fix', '.', '--approximate', '--yes');
    // Exit 1: o :hover bloqueado continua solto
    assert.equal(result.status, 1, result.stderr);
    // O :hover continua diferente da base: a guarda de estados distintos bloqueia só ele
    assert.equal(await readFile(path.join(dir, 'a.css'), 'utf8'),
        '.card { color: var(--brand); }\n.note { color: var(--brand); }\n.btn { background: var(--brand); }\n.btn:hover { background: #4f46e6; }\n');
    assert.doesNotMatch(result.stderr, /or fix --approximate/);
}));

test('--no-input only lists', () => withProject(USES, async (dir) => {
    // Exit 1: o 15px continua no código, e isso é uma violação
    const result = cli(dir, 'fix', '.', '--approximate', '--no-input', '--dry-run');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /15px ×1 → var\(--space-m\) \(16px\)/);
    assert.match(result.stdout, /\+1px/);
    assert.equal(cli(dir, 'fix', '.', '--approximate', '--no-input').status, 1);
    assert.match(await readFile(path.join(dir, 'a.css'), 'utf8'), /padding: 15px/);
}));

test('--yes without --approximate is a usage error', () => withProject(USES, async (dir) => {
    assert.equal(cli(dir, 'fix', '.', '--yes').status, 2);
}));

test('a rejected group is not asked again, not even by --yes', () => withProject(USES, async (dir) => {
    const asked: ApproximateGroup[] = [];
    const reject = async (group: ApproximateGroup) => {
        asked.push(group);
        return 'no' as const;
    };
    const first = await fixed(dir, { mode: 'ask', decide: reject });
    assert.equal(asked.length, 1);
    assert.equal(first.approximate![0]!.status, 'rejected');
    assert.equal((await loadDecisions(dir)).size, 1);
    assert.ok(await readFile(path.join(dir, DECISIONS_FILE), 'utf8'));

    await fixed(dir, { mode: 'ask', decide: reject });
    assert.equal(asked.length, 1);

    assert.equal(cli(dir, 'fix', '.', '--approximate', '--yes').status, 1);
    assert.match(await readFile(path.join(dir, 'a.css'), 'utf8'), /padding: 15px/);
}));

test('an accepted group is applied and remembered; a dry run writes no answer', () => withProject(USES, async (dir) => {
    await fixed(dir, { mode: 'ask', decide: async () => 'yes' }, true);
    assert.equal((await loadDecisions(dir)).size, 0);
    await fixed(dir, { mode: 'ask', decide: async () => 'yes' });
    assert.equal((await loadDecisions(dir)).size, 1);
    assert.match(await readFile(path.join(dir, 'a.css'), 'utf8'), /\.card \{ padding: var\(--space-m\)/);
}));

test('a broken decisions file is reported', () => withProject({ ...USES, [DECISIONS_FILE]: '{"decisions":{"a":"maybe"}}' }, async (dir) => {
    await assert.rejects(loadDecisions(dir), /expected/);
    assert.equal(cli(dir, 'fix', '.', '--approximate', '--yes').status, 2);
}));
