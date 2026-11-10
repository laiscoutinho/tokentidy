// `validate`: arquivos inválidos têm que apontar o caminho JSON do problema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CLI_ENTRY, copyFixture, tempDir } from '../helpers.ts';
import { discoverTokenFiles, validateTokenFiles } from '../../src/validate/validate.ts';
import { ScopeError } from '../../src/project/scope.ts';

const red = { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' };
const space = { value: 8, unit: 'px' };

async function validate(files: Record<string, unknown>) {
    const dir = await tempDir();
    try {
        for (const [name, content] of Object.entries(files)) {
            await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
            await writeFile(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
        }
        const found = await discoverTokenFiles([dir], { root: dir });
        return await validateTokenFiles(found, dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const summary = (result: Awaited<ReturnType<typeof validate>>) => result.problems.map((p) => `${p.file} ${p.path} ${p.rule}`);

test('a valid file has no problems', async () => {
    const result = await validate({
        'a.tokens.json': { color: { $type: 'color', red: { $value: red }, danger: { $value: '{color.red}' } } },
    });
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.files, ['a.tokens.json']);
});

test('a value of the wrong shape fails at its JSON path', async () => {
    const result = await validate({ 'a.tokens.json': { color: { red: { $type: 'color', $value: '#ff0000' } } } });
    assert.ok(result.problems.length > 0);
    assert.ok(result.problems.every((p) => p.rule === 'schema/invalid' && p.path.startsWith('/color/red')), JSON.stringify(result.problems));
});

test('a file that is not JSON is reported, and the others are still read', async () => {
    const result = await validate({ 'a.tokens.json': '{ nope', 'b.tokens.json': { x: { $type: 'dimension', $value: space } } });
    assert.deepEqual(summary(result), ['a.tokens.json / json/invalid']);
    assert.equal(result.files.length, 2);
});

test('an absurdly nested file is refused without overflowing the stack', async () => {
    const result = await validate({ 'a.tokens.json': `${'{"a":'.repeat(20000)}1${'}'.repeat(20000)}` });
    assert.deepEqual(summary(result), ['a.tokens.json / json/too-deep']);
});

test('a broken alias points at the token', async () => {
    const result = await validate({ 'a.tokens.json': { a: { $type: 'color', $value: '{color.nope}' } } });
    assert.deepEqual(summary(result), ['a.tokens.json /a/$value reference/broken']);
});

test('an alias finds its target in another file', async () => {
    const result = await validate({
        'a.tokens.json': { a: { $value: '{b.red}' } },
        'b.tokens.json': { b: { red: { $type: 'color', $value: red } } },
    });
    assert.deepEqual(result.problems, []);
});

test('a cycle of aliases is reported', async () => {
    const result = await validate({
        'a.tokens.json': { a: { $type: 'color', $value: '{b}' }, b: { $type: 'color', $value: '{a}' } },
    });
    assert.ok(summary(result).some((line) => line.includes('reference/cycle')), JSON.stringify(result.problems));
});

test('an alias of another type is a mismatch', async () => {
    const result = await validate({
        'a.tokens.json': { space: { $type: 'dimension', $value: space }, a: { $type: 'color', $value: '{space}' } },
    });
    assert.deepEqual(summary(result), ['a.tokens.json /a/$value reference/type-mismatch']);
});

test('a token with no type anywhere is reported', async () => {
    const result = await validate({ 'a.tokens.json': { a: { $value: 12 } } });
    assert.deepEqual(summary(result), ['a.tokens.json /a token/no-type']);
});

test('$extends reaches the tokens of the other group, and a broken or circular one is reported', async () => {
    const ok = await validate({
        'a.tokens.json': { base: { $type: 'color', red: { $value: red } }, theme: { $extends: '{base}' }, b: { $type: 'color', $value: '{theme.red}' } },
    });
    assert.deepEqual(ok.problems, []);

    const broken = await validate({ 'a.tokens.json': { theme: { $extends: '{nope}' } } });
    assert.deepEqual(summary(broken), ['a.tokens.json /theme/$extends reference/broken']);

    const circular = await validate({ 'a.tokens.json': { a: { $extends: '{b}' }, b: { $extends: '{a}' } } });
    assert.ok(summary(circular).some((line) => line.includes('reference/cycle')), JSON.stringify(circular.problems));
});

test('a name like __proto__ is a plain token name', async () => {
    const result = await validate({ 'a.tokens.json': '{"__proto__": {"$type": "color", "$value": "{constructor}"}}' });
    assert.deepEqual(summary(result), ['a.tokens.json /__proto__/$value reference/broken']);
});

const resolver = (extra: object) => ({
    version: '2025.10',
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    sets: { base: { sources: [{ $ref: 'base.tokens.json' }] } },
    modifiers: { theme: { default: 'light', contexts: { light: [{ $ref: 'light.tokens.json' }], dark: [{ $ref: 'dark.tokens.json' }] } } },
    ...extra,
});
const base = { color: { $type: 'color', red: { $value: red } } };
const mode = { bg: { $type: 'color', $value: '{color.red}' } };

test('a resolver and its sources are valid together', async () => {
    const result = await validate({ 'a.resolver.json': resolver({}), 'base.tokens.json': base, 'light.tokens.json': mode, 'dark.tokens.json': mode });
    assert.deepEqual(result.problems, []);
    assert.equal(result.files.length, 4);
});

test('an alias broken in only one theme says which theme', async () => {
    const result = await validate({
        'a.resolver.json': resolver({}),
        'base.tokens.json': base,
        'light.tokens.json': mode,
        'dark.tokens.json': { bg: { $type: 'color', $value: '{color.nope}' } },
    });
    assert.deepEqual(summary(result), ['dark.tokens.json /bg/$value reference/broken']);
    assert.match(result.problems[0]!.message, /theme=dark/);
});

test('a resolver of the wrong version fails at /version', async () => {
    const result = await validate({ 'a.resolver.json': resolver({ version: '2025-10-01' }), 'base.tokens.json': base, 'light.tokens.json': mode, 'dark.tokens.json': mode });
    assert.deepEqual(summary(result), ['a.resolver.json /version schema/invalid']);
});

test('a resolver pointing at a missing file, set or context reports where', async () => {
    const missingFile = await validate({ 'a.resolver.json': resolver({ modifiers: undefined, resolutionOrder: [{ $ref: '#/sets/base' }] }) });
    assert.deepEqual(summary(missingFile), ['a.resolver.json /sets/base/sources/0/$ref resolver/missing-source']);

    const missingSet = await validate({ 'a.resolver.json': resolver({ resolutionOrder: [{ $ref: '#/sets/nope' }] }) });
    assert.deepEqual(summary(missingSet), ['a.resolver.json /resolutionOrder/0/$ref reference/broken']);

    const wrongDefault = await validate({
        'a.resolver.json': resolver({ modifiers: { theme: { default: 'nope', contexts: { light: [{ $ref: 'light.tokens.json' }], dark: [{ $ref: 'light.tokens.json' }] } } } }),
        'base.tokens.json': base,
        'light.tokens.json': mode,
    });
    assert.deepEqual(summary(wrongDefault), ['a.resolver.json /modifiers/theme/default resolver/unknown-default']);
});

test('a resolver cannot read a file outside the project, even through a symlink', async () => {
    const dir = await tempDir();
    const outside = await tempDir();
    try {
        await writeFile(path.join(outside, 'x.tokens.json'), JSON.stringify(base));
        await symlink(path.join(outside, 'x.tokens.json'), path.join(dir, 'link.tokens.json'));
        const file = 'a.resolver.json';
        await writeFile(path.join(dir, file), JSON.stringify(resolver({
            modifiers: undefined,
            resolutionOrder: [{ $ref: '#/sets/base' }],
            sets: { base: { sources: [{ $ref: 'link.tokens.json' }] } },
        })));
        const result = await validateTokenFiles([file], dir);
        assert.deepEqual(summary(result), ['a.resolver.json /sets/base/sources/0/$ref resolver/outside-root']);
    } finally {
        await rm(dir, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
    }
});

test('discovery honours ignore globs, takes named files and fails on a missing path', async () => {
    const dir = await tempDir();
    try {
        await writeFile(path.join(dir, 'a.tokens.json'), '{}');
        await writeFile(path.join(dir, 'b.tokens.json'), '{}');
        await writeFile(path.join(dir, 'other.json'), '{}');
        assert.deepEqual(await discoverTokenFiles([dir], { root: dir, ignore: ['b.*'] }), ['a.tokens.json']);
        assert.deepEqual(await discoverTokenFiles([path.join(dir, 'other.json')], { root: dir }), ['other.json']);
        await assert.rejects(discoverTokenFiles([path.join(dir, 'nope')], { root: dir }), ScopeError);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('the CLI: exit 1 with path on stdout, pure --json, exit 0 on what generate wrote', async () => {
    const dir = await copyFixture('generate-project');
    const cli = (...args: string[]) => spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd: dir });
    try {
        assert.equal(cli('generate', '.', '--new').status, 0);
        const clean = cli('validate', 'design-tokens');
        assert.equal(clean.status, 0, clean.stdout + clean.stderr);
        assert.match(clean.stderr, /^1 file checked; 0 problems\n$/);

        await writeFile(path.join(dir, 'bad.tokens.json'), JSON.stringify({ a: { $type: 'color', $value: '{nope}' } }));
        const bad = cli('validate', 'bad.tokens.json');
        assert.equal(bad.status, 1);
        assert.equal(bad.stdout, 'bad.tokens.json\terror\treference/broken\t/a/$value\t{nope} does not exist\n');

        const json = JSON.parse(cli('validate', 'bad.tokens.json', '--json').stdout) as { schemaVersion: number; problems: { path: string }[] };
        assert.equal(json.schemaVersion, 1);
        assert.equal(json.problems[0]!.path, '/a/$value');

        assert.equal(cli('validate', 'missing.tokens.json').status, 2);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
