// Saída para pessoas: tabela alinhada, frases sem sigla e nada que precise da documentação para entender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { count, skipReasonText, table, typeLabel } from '../../src/cli/human.ts';
import { CLI_ENTRY, tempDir } from '../helpers.ts';

test('table: aligned columns, long cells cut with …, the last column wraps by words', () => {
    const lines = table(['A', 'B', 'Why'], [['short', 'a-very-long-value', 'one two three four five six seven eight nine ten']], { width: 60, max: [10, 8], indent: 2 });
    assert.deepEqual(lines, [
        '  A       B          Why',
        '  short   a-very-…   one two three four five six seven eight',
        '                     nine ten',
    ]);
});

test('words for people: counts, types and skip reasons', () => {
    assert.equal(count(1, 'value'), '1 value');
    assert.equal(count(2, 'value'), '2 values');
    assert.equal(count(2, 'value repeats', 'values repeat'), '2 values repeat');
    assert.equal(typeLabel('font-size'), 'font size');
    assert.equal(typeLabel(undefined), 'value');
    assert.deepEqual(['minified', 'too-large', 'binary', 'symlink', 'unreadable', 'unsupported', 'parse-timeout'].map(skipReasonText), [
        'minified file', 'file too large', 'not a text file', 'symbolic link', 'could not be read', 'file type not supported', 'parse timeout',
    ]);
});

async function withProject<T>(files: Record<string, string>, run: (dir: string) => Promise<T>): Promise<T> {
    const dir = await tempDir();
    try {
        for (const [name, content] of Object.entries({ 'package.json': '{}\n', ...files })) {
            await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
            await writeFile(path.join(dir, name), content);
        }
        return await run(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const cli = (dir: string, ...args: string[]) => spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd: dir, input: '', env: { ...process.env, NO_COLOR: '1' } });

test('check --format table: one table per file, the suggestion in words, and what to do next', () => withProject({
    'tokens.css': ':root { --brand: #4f46e5; }\n.t { color: var(--brand); }\n',
    'a.css': '.a { color: #4f46e5; padding: 10px; }\n.b { padding: 10px; }\n.c { padding: 10px; }\n',
    'b.css': '.x { border-radius: 3px; } /* tokentidy-ignore-line radius/hardcoded -- legacy */\n',
}, async (dir) => {
    const { stdout, stderr, status } = cli(dir, 'check', '.', '--format', 'table');
    assert.equal(status, 1);
    assert.match(stdout, /^a\.css\n {2}Line +Type +Property +Value +Use instead\n {2}1:13 +color +color +#4f46e5 +--brand\n {2}1:31 +spacing +padding +10px +—\n/);
    assert.doesNotMatch(stdout, /color\/hardcoded|b\.css/);
    assert.match(stderr, /^✖ 4 hardcoded values in 1 file\.$/m);
    assert.match(stderr, /^ {2}1 of them already has a token: run tokentidy fix to replace it\.$/m);
    assert.match(stderr, /^ {2}Not shown: 1 ignored by comment\.$/m);
}));

test('check --format table hides review items behind --review, and they never fail the check', () => withProject({ 'a.css': '.a { width: 300px; }\n' }, async (dir) => {
    const hidden = cli(dir, 'check', '.', '--format', 'table');
    assert.equal(hidden.status, 0);
    assert.equal(hidden.stdout, '');
    assert.match(hidden.stderr, /^✔ No hardcoded values found\.\n {2}1 item for review: tokentidy check --review\n$/);

    const shown = cli(dir, 'check', '.', '--format', 'table', '--review');
    assert.equal(shown.status, 0);
    assert.match(shown.stdout, /1:13 +check size +width +300px/);
    assert.match(shown.stderr, /1 item marked "check" is not an error/);
}));

test('check --format table shows one row per declaration; --json keeps one item per value, with its declaration', () => withProject({
    'a.css': '.a { padding: 4px 8px 4px 8px; border: 1px solid #cccccc; }\n',
}, async (dir) => {
    const { stdout } = cli(dir, 'check', '.', '--format', 'table');
    assert.match(stdout, /1:15 +spacing +padding +4px 8px 4px 8px +—\n/);
    assert.match(stdout, /1:40 +border width, col… +border +1px #cccccc +—\n/);
    assert.equal(stdout.match(/^ {2}1:/gm)?.length, 2);

    const findings = JSON.parse(cli(dir, 'check', '.', '--json').stdout).findings;
    assert.deepEqual(findings.map((f: { value: string; declaration: number }) => `${f.declaration} ${f.value}`), ['0 4px', '0 8px', '0 4px', '0 8px', '1 1px', '1 #cccccc']);
}));

test('check --format table on a clean project says so in one line', () => withProject({ 'a.css': '.a { display: block; }\n' }, async (dir) => {
    const { stdout, stderr, status } = cli(dir, 'check', '.', '--format', 'table');
    assert.equal(status, 0);
    assert.equal(stdout, '');
    assert.equal(stderr, '✔ No hardcoded values found.\n');
}));

test('check --summary --format table counts by type in words', () => withProject({ 'a.css': '.a { color: #111111; font-size: 13px; }\n' }, async (dir) => {
    const { stdout } = cli(dir, 'check', '.', '--summary', '--format', 'table');
    assert.match(stdout, /Type +Hardcoded values +Uses through a token/);
    assert.match(stdout, /font size +1/);
}));

test('generate tells only where the tokens are; with nothing repeated, it says why nothing was created', () => withProject({ 'a.css': '.a { color: #111111; }\n' }, async (dir) => {
    const { stdout, stderr, status } = cli(dir, 'generate', '.');
    assert.equal(status, 0);
    assert.equal(stdout, '');
    assert.equal(stderr, 'No value is used 3 or more times without a token, so no token was created.\n');
}));

test('generate says how many values already have a token', () => withProject({ 'a.css': ':root { --brand: #111111; }\n.a { color: #111111; }\n' }, async (dir) => {
    const { stderr, status } = cli(dir, 'generate', '.');
    assert.equal(status, 0);
    assert.match(stderr, /1 value already has a token, so no new one was made for it\./);
}));
