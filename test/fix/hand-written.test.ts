// `fix` com tokens escritos à mão: sem `generate`, sem DTCG obrigatório; o nome diz o tipo do token sem uso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../../src/analysis/analyze.ts';
import { generateTokens } from '../../src/generate/generate.ts';
import { fixScope } from '../../src/fix/apply.ts';
import { collectFiles } from '../../src/project/scope.ts';
import { CLI_ENTRY, tempDir } from '../helpers.ts';

const TOKENS_CSS = `:root {
  --color-primary: #4f46e5;
  --space-4: 16px;
  --space-2: 8px;
  --radius-md: 8px;
  --font-size-base: 16px;
}
`;

const APP_CSS = `.card { color: #4f46e5; padding: 16px; gap: 8px; border-radius: 8px; font-size: 16px; }
.btn { background: #4f46e5; margin: 16px; }
`;

const DTCG = {
    color: { primary: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.31, 0.275, 0.898], hex: '#4f46e5' } } },
    space: { 4: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
    radius: { md: { $type: 'dimension', $value: { value: 8, unit: 'px' } } },
};

async function project(files: Record<string, string>): Promise<string> {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), content);
    }
    return dir;
}

async function fix(dir: string, tokens = 'design-tokens', paths = [dir]) {
    const scope = await collectFiles(paths, dir);
    return fixScope(scope, { tokensDir: path.join(dir, tokens), dryRun: true });
}

const run = (dir: string, ...args: string[]) => spawnSync(process.execPath, [CLI_ENTRY, 'fix', ...args], { encoding: 'utf8', cwd: dir });

test('unused hand-written size tokens are used by their name, not only colors', async () => {
    const dir = await project({ 'tokens/tokens.css': TOKENS_CSS, 'src/app.css': APP_CSS });
    try {
        const result = await fix(dir);
        const tokens = result.files.flatMap((f) => f.replacements.map((r) => `${r.finding.property}=${r.token}`));
        assert.deepEqual(tokens, [
            'color=--color-primary', 'padding=--space-4', 'gap=--space-2', 'border-radius=--radius-md', 'font-size=--font-size-base',
            'background=--color-primary', 'margin=--space-4',
        ]);
        assert.equal(result.after.findings.length, 0);
        assert.ok(result.files[0]!.replacements.every((r) => r.source === 'project' && r.uncompiledFrom === undefined));
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('pointing --tokens at the hand-written folder keeps its tokens', async () => {
    const dir = await project({ 'tokens/tokens.css': TOKENS_CSS, 'src/app.css': APP_CSS });
    try {
        const result = await fix(dir, 'tokens');
        assert.equal(result.files[0]?.replacements.length, 7);
        assert.ok(result.tokens > 0);
        // Escopo parcial: a pasta de tokens fora dele continua sendo lida
        const partial = await fix(dir, 'tokens', [path.join(dir, 'src')]);
        assert.equal(partial.files[0]?.replacements.length, 7);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('a name that declares a type wins over where the token is used', async () => {
    // `--space-4` usado (por engano) como `font-size`: o nome é a decisão da equipe, o uso errado não a muda
    const dir = await project({
        'tokens/tokens.css': ':root { --space-4: 16px; }\n',
        'src/app.css': '.a { font-size: var(--space-4); }\n.b { padding: 16px; }\n.c { font-size: 16px; }\n',
    });
    try {
        const result = await fix(dir);
        const replaced = result.files.flatMap((f) => f.replacements.map((r) => r.finding.property));
        assert.deepEqual(replaced, ['padding']);
        assert.deepEqual(result.skipped.map((s) => s.reason), ['token-family-mismatch']);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('a name with no type and an ambiguous value is still not used', async () => {
    const dir = await project({ 'tokens/tokens.css': ':root { --base: 16px; --size-4: 16px; }\n', 'src/app.css': '.a { padding: 16px; }\n' });
    try {
        const result = await fix(dir);
        assert.equal(result.files.length, 0);
        assert.equal(result.withoutToken.length, 1);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('hand-written SCSS variables are used by their name where they are loaded', async () => {
    const dir = await project({
        'src/_tokens.scss': '$space-4: 16px;\n$radius-md: 8px;\n',
        'src/app.scss': "@use 'tokens' as *;\n.a { padding: 16px; border-radius: 8px; margin: 16px * 2; }\n",
    });
    try {
        const result = await fix(dir);
        const texts = result.files.flatMap((f) => f.replacements.map((r) => r.text));
        // A conta (`16px * 2`) é feita no build: ali só `$space-4` funciona
        assert.deepEqual(texts, ['$space-4', '$radius-md', '$space-4']);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('a hand-written DTCG file is a token source, with the Style Dictionary name and a warning', async () => {
    const dir = await project({ 'tokens/design.tokens.json': JSON.stringify(DTCG), 'src/app.css': APP_CSS });
    try {
        const result = await fix(dir);
        const replacements = result.files.flatMap((f) => f.replacements);
        assert.deepEqual(replacements.map((r) => r.text), [
            'var(--color-primary)', 'var(--space-4)', 'var(--radius-md)', 'var(--color-primary)', 'var(--space-4)',
        ]);
        assert.ok(replacements.every((r) => r.uncompiledFrom === 'tokens/design.tokens.json'));

        const cli = run(dir, '--dry-run');
        assert.doesNotMatch(cli.stderr, /No tokens found/);
        assert.match(cli.stderr, /Tokens from tokens\/design\.tokens\.json are used as var\(\) but no CSS defines them yet/);
        const json = JSON.parse(run(dir, '--dry-run', '--json').stdout);
        assert.equal(json.files[0].replacements[0].uncompiledFrom, 'tokens/design.tokens.json');
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('a DTCG file compiled to CSS is one token, with no warning', async () => {
    const dir = await project({
        'tokens/design.tokens.json': JSON.stringify(DTCG),
        'tokens/tokens.css': ':root { --color-primary: #4f46e5; --space-4: 16px; --radius-md: 8px; }\n',
        'src/app.css': APP_CSS,
    });
    try {
        const result = await fix(dir);
        const replacements = result.files.flatMap((f) => f.replacements);
        assert.equal(replacements.length, 5);
        assert.ok(replacements.every((r) => r.uncompiledFrom === undefined && r.alternatives === undefined));
        assert.ok(replacements.every((r) => r.definedAt?.file === 'tokens/tokens.css'));
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('--tokens reads DTCG files without the .tokens suffix in that folder', async () => {
    const dir = await project({
        'tokens/tokens.json': JSON.stringify(DTCG),
        'tokens/notes.json': '{"title":"not tokens"}',
        'src/app.css': APP_CSS,
    });
    try {
        const result = await fix(dir, 'tokens');
        assert.equal(result.files[0]?.replacements.length, 5);
        assert.ok(result.files[0]!.replacements.every((r) => r.uncompiledFrom === 'tokens/tokens.json'));
        // Sem `--tokens`, um `.json` qualquer do projeto não é lido como token
        const without = await fix(dir);
        assert.equal(without.files.length, 0);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('generate reuses an unused hand-written size token instead of creating a duplicate', async () => {
    const dir = await project({ 'tokens/tokens.css': TOKENS_CSS, 'src/app.css': APP_CSS });
    try {
        const analysis = await analyzePaths([dir], { root: dir });
        const generation = generateTokens(analysis.findings, {
            minOccurrences: 2, gridBase: 4, semanticTokens: true, mode: 'extend', definitions: analysis.definitions, references: analysis.references,
        });
        assert.ok(generation.reused.some((r) => r.definition.name === '--space-4' && r.type === 'spacing'));
        assert.ok(!generation.tokens.some((t) => t.type === 'spacing' && t.key === '16px'));
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('values used once are listed as below the threshold, in text and JSON', async () => {
    const dir = await project({ 'tokens/tokens.css': ':root { --space-4: 16px; }\n', 'src/app.css': '.a { padding: 16px; color: #ffffff; }\n' });
    try {
        const result = await fix(dir);
        assert.deepEqual(result.belowThreshold.map((f) => f.value), ['#ffffff']);
        const cli = run(dir, '--dry-run');
        assert.match(cli.stderr, /^src\/app\.css:1:28\tno-token\tused fewer than 2 times\t#ffffff$/m);
        assert.match(cli.stderr, /1 without a token \(1 used fewer than 2 times\)/);
        const json = JSON.parse(run(dir, '--dry-run', '--json').stdout);
        assert.equal(json.belowThreshold[0].value, '#ffffff');
        assert.equal(await readFile(path.join(dir, 'src/app.css'), 'utf8'), '.a { padding: 16px; color: #ffffff; }\n');
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('generate lists each value used once and each semantic alias', async () => {
    const dir = await project({
        'src/app.css': '.btn-excluir { color: #dc2626; }\n.btn-excluir .icon { color: #dc2626; }\n.alert { color: #dc2626; padding: 16px; border-radius: 3px; }\n.b { padding: 16px; }\n',
    });
    try {
        const { stderr, status } = spawnSync(process.execPath, [CLI_ENTRY, 'generate', '--dry-run'], { encoding: 'utf8', cwd: dir });
        assert.equal(status, 0);
        assert.match(stderr, /^1 value used fewer than 2 times was not turned into tokens:$/m);
        assert.match(stderr, /^ {2}radius\t3px\tsrc\/app\.css:3:56 \(1 use\)$/m);
        assert.match(stderr, /^1 semantic alias names the role of a value:$/m);
        assert.match(stderr, /^ {2}color\.text\.danger -> color\.red\.600\t\(2 uses\)$/m);
    } finally {
        await rm(dir, { recursive: true });
    }
});
