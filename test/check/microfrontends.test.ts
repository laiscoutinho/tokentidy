// Micro-frontends: cada app passa sozinho; o problema só aparece quando se olha os dois juntos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { CLI_ENTRY, tempDir } from '../helpers.ts';
import { detectProjects } from '../../src/check/microfrontends.ts';

async function withProject<T>(files: Record<string, string>, run: (dir: string) => Promise<T>): Promise<T> {
    const dir = await tempDir();
    try {
        for (const [name, content] of Object.entries(files)) {
            await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
            await writeFile(path.join(dir, name), content);
        }
        return await run(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const cli = (dir: string, ...args: string[]) => spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd: dir, input: '' });

const MANIFEST = (name: string, version = '^2.0.0') => JSON.stringify({ name, dependencies: { '@acme/design-tokens': version } }, null, 2);

const TWO_APPS = {
    'package.json': JSON.stringify({ name: 'root', workspaces: ['apps/*'] }),
    'apps/shell/package.json': MANIFEST('shell', '^2.0.0'),
    'apps/checkout/package.json': MANIFEST('checkout', '^3.1.0'),
    'apps/shell/src/a.css': ':root { --color-primary: #4f46e5; --same: 16px; }\n.card { padding: 16px; }\n.card-b { padding: 16px; }\n',
    'apps/checkout/src/a.css': ':root { --color-primary: #e11d48; --same: 1rem; }\n.card { padding: 12px; }\n.card-b { padding: 12px; }\n',
};

const issuesOf = (dir: string, ...args: string[]) => JSON.parse(cli(dir, 'check', ...args, '--json').stdout).microFrontends;

test('workspaces, angular.json and given folders are detected', () => withProject({
    ...TWO_APPS,
    'angular.json': '{}',
}, async (dir) => {
    assert.deepEqual((await detectProjects([dir], dir)).map((p) => p.dir), ['apps/checkout', 'apps/shell']);
    assert.deepEqual((await detectProjects([path.join(dir, 'apps/shell'), path.join(dir, 'apps/checkout')], dir)).map((p) => p.name), ['checkout', 'shell']);
}));

test('angular.json projects count; application at the root does not', () => withProject({
    'package.json': '{}',
    'angular.json': JSON.stringify({ projects: { main: { root: '' }, one: { root: 'projects/one' }, two: { root: 'projects/two/' } } }),
}, async (dir) => {
    assert.deepEqual((await detectProjects([dir], dir)).map((p) => p.name), ['one', 'two']);
}));

test('one project is not a micro-frontend setup', () => withProject({ 'package.json': '{}', 'a.css': ':root { --a: 1px; }\n' }, async (dir) => {
    assert.deepEqual(await detectProjects([dir], dir), []);
    assert.equal(issuesOf(dir, '.'), undefined);
}));

test('two micro-frontends report the collision and the drift', () => withProject(TWO_APPS, async (dir) => {
    const result = cli(dir, 'check', '.');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /apps\/shell\/src\/a\.css:1:\d+\tviolation\tmfe\/root-collision\t--color-primary\t#4f46e5\tsame global token, different values: /);
    assert.match(result.stdout, /review\tmfe\/drift\t\.card padding\t16px\tsame role, different values: /);
    assert.match(result.stderr, /2 micro-frontends: 2 global token collisions, 2 role drifts, 2 design-system version mismatches/);

    const { projects, issues } = issuesOf(dir, '.');
    assert.equal(projects.length, 2);
    assert.ok(!issues.some((i: { property: string }) => i.property === '--same'), '16px e 1rem são o mesmo valor');
    const versions = issues.filter((i: { rule: string }) => i.rule === 'mfe/version-mismatch');
    assert.deepEqual(versions.map((v: { value: string }) => v.value).sort(), ['^2.0.0', '^3.1.0']);
    assert.equal(versions[0].severity, 'review');
    assert.match(versions[0].file, /package\.json$/);
}));

test('a collision alone fails the check; drift and versions alone do not', () => withProject({
    'package.json': JSON.stringify({ workspaces: { packages: ['apps/*'] } }),
    'apps/a/package.json': MANIFEST('a', '1'),
    'apps/b/package.json': MANIFEST('b', '2'),
    'apps/a/x.css': '.card { padding: var(--p); }\n:root { --p: 16px; }\n',
    'apps/b/x.css': '.card { padding: var(--q); }\n:root { --q: 12px; }\n',
}, async (dir) => {
    const result = cli(dir, 'check', '.', '--json');
    assert.equal(result.status, 0, result.stdout);
    const rules = JSON.parse(result.stdout).microFrontends.issues.map((i: { rule: string }) => i.rule);
    assert.ok(rules.includes('mfe/drift'), 'valor por trás do token também deriva');
    assert.ok(!rules.includes('mfe/root-collision'));
}));

test('a token redefined under a class is not a :root collision', () => withProject({
    'package.json': JSON.stringify({ workspaces: ['apps/*'] }),
    'apps/a/package.json': '{"name":"a"}',
    'apps/b/package.json': '{"name":"b"}',
    'apps/a/x.css': ':root { --c: #111111; }\n',
    'apps/b/x.css': '.promo { --c: #eeeeee; }\n',
}, async (dir) => {
    assert.deepEqual(issuesOf(dir, '.').issues, []);
}));

test('github annotations include micro-frontend issues', () => withProject(TWO_APPS, async (dir) => {
    const { stdout } = cli(dir, 'check', '.', '--format', 'github');
    assert.match(stdout, /::error file=apps\/shell\/src\/a\.css,line=1.*mfe\/root-collision/);
    assert.match(stdout, /::notice file=apps\/shell\/package\.json.*mfe\/version-mismatch/);
}));

const SHARED = {
    'package.json': JSON.stringify({ workspaces: ['apps/*'] }),
    'apps/a/package.json': '{"name":"a"}',
    'apps/b/package.json': '{"name":"b"}',
    'apps/a/x.css': '.a { color: #4f46e5; }\n.b { color: #16a34a; }\n.c { color: #16a34a; }\n',
    'apps/b/x.css': '.a { color: #4f46e5; }\n',
};

test('generate --shared splits by how many micro-frontends use a value', () => withProject(SHARED, async (dir) => {
    const result = cli(dir, 'generate', '.', '--shared', 'packages/tokens', '--json');
    assert.equal(result.status, 0, result.stderr);
    const targets = new Map(JSON.parse(result.stdout).targets.map((t: { name: string; tokens: { key: string }[] }) => [t.name, t.tokens.map((token) => token.key)]));
    assert.deepEqual(targets.get('shared'), ['#4f46e5']);
    assert.deepEqual(targets.get('a'), ['#16a34a']);
    assert.deepEqual(targets.get('b'), []);
    assert.match(await readFile(path.join(dir, 'packages/tokens/tokens.tokens.json'), 'utf8'), /4f46e5|0\.3/);
    assert.ok(await readFile(path.join(dir, 'apps/a/design-tokens/tokens.tokens.json'), 'utf8'));
}));

test('generate --shared dry run writes nothing', () => withProject(SHARED, async (dir) => {
    assert.equal(cli(dir, 'generate', '.', '--shared', 'packages/tokens', '--dry-run').status, 0);
    await assert.rejects(readFile(path.join(dir, 'packages/tokens/tokens.tokens.json')));
}));

test('generate --shared needs two micro-frontends and stays inside the root', () => withProject({ 'package.json': '{}', 'a.css': '.a { color: #111111; }\n' }, async (dir) => {
    const single = cli(dir, 'generate', '.', '--shared', 'packages/tokens');
    assert.equal(single.status, 2);
    assert.match(single.stderr, /two or more micro-frontends/);
    assert.notEqual(cli(dir, 'generate', '.', '--shared', '../outside').status, 0);
}));
