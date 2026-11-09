// `check` com o índice de tokens: sugestões, avisos de uso de tokens, tokens sem uso e baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CLI_ENTRY, tempDir } from '../helpers.ts';
import { editDistance } from '../../src/analysis/token-health.ts';
import { deltaEOK } from '../../src/check/near.ts';

async function project(files: Record<string, string>): Promise<string> {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), content);
    }
    return dir;
}

function cli(cwd: string, ...args: string[]) {
    return spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd });
}

function json(cwd: string, ...args: string[]) {
    return JSON.parse(cli(cwd, 'check', '--json', ...args).stdout);
}

const SPACING = ':root { --spacing-4: 16px; --brand: #4f46e5; }\n.a { padding: var(--spacing-4); color: var(--brand); }\n';

test('check names the exact token, as a sixth column and in the JSON, and writes nothing', async (t) => {
    const dir = await project({ 'tokens.css': SPACING, 'a.css': '.b { margin: 16px; color: #4f46e5; font-size: 13px; }\n' });
    t.after(() => rm(dir, { recursive: true }));
    const before = (await readdir(dir)).sort();
    const { stdout, status } = cli(dir, 'check');
    assert.equal(status, 1);
    const lines = stdout.trim().split('\n').map((l) => l.split('\t'));
    assert.deepEqual(lines.map((l) => [l[3], l[5]]), [['margin', '--spacing-4'], ['color', '--brand'], ['font-size', undefined]]);
    assert.deepEqual(json(dir).findings[0].suggestion, { token: '--spacing-4', match: 'exact' });
    assert.deepEqual((await readdir(dir)).sort(), before);
    assert.equal(await readFile(path.join(dir, 'a.css'), 'utf8'), '.b { margin: 16px; color: #4f46e5; font-size: 13px; }\n');
});

test('check suggests only what fix would write in that file', async (t) => {
    const dir = await project({
        '_vars.scss': '$gap: 16px;\n',
        'use.scss': '@use "vars" as *;\n.a { padding: $gap; margin: 16px; }\n',
        'plain.css': '.b { margin: 16px; }\n',
        'other.scss': '.c { margin: 16px; }\n',
    });
    t.after(() => rm(dir, { recursive: true }));
    const bySuggestion = new Map(json(dir).findings.map((f: { file: string; suggestion?: unknown }) => [f.file, f.suggestion]));
    assert.deepEqual(bySuggestion.get('use.scss'), { token: '$gap', match: 'exact' });
    assert.equal(bySuggestion.get('plain.css'), undefined);
    assert.equal(bySuggestion.get('other.scss'), undefined);
});

test('two tokens with the same value and the same use are a tie: check lists both, fix leaves it', async (t) => {
    const dir = await project({
        'tokens.css': ':root { --a-gap: 16px; --b-gap: 16px; }\n.x { padding: var(--a-gap); margin: var(--b-gap); }\n',
        'a.css': '.b { margin: 16px; }\n',
    });
    t.after(() => rm(dir, { recursive: true }));
    assert.match(cli(dir, 'check').stdout, /\t--a-gap \(or --b-gap\)\n$/);
    const fixed = JSON.parse(cli(dir, 'fix', '--dry-run', '--json').stdout);
    assert.equal(fixed.files.length, 0);
    assert.equal(fixed.skippedValues[0].reason, 'ambiguous-token');
    assert.deepEqual(fixed.skippedValues[0].alternatives, ['--a-gap', '--b-gap']);
});

test('fix explains the choice: where the token is, why, and what lost', async (t) => {
    const dir = await project({
        'tokens.css': ':root { --a-gap: 16px; --b-gap: 16px; }\n.x { padding: var(--a-gap); margin: var(--a-gap); gap: var(--b-gap); }\n',
        'a.css': '.b { margin: 16px; }\n',
    });
    t.after(() => rm(dir, { recursive: true }));
    const [replacement] = JSON.parse(cli(dir, 'fix', '--dry-run', '--json').stdout).files[0].replacements;
    assert.equal(replacement.token, '--a-gap');
    assert.equal(replacement.reason, 'most-used');
    assert.deepEqual(replacement.definedAt, { file: 'tokens.css', line: 1 });
    assert.deepEqual(replacement.alternatives, ['--b-gap']);
});

test('a near value names the token and the distance, and fix does not touch it', async (t) => {
    const dir = await project({ 'tokens.css': SPACING, 'a.css': '.b { margin: 15px; color: #4f46e6; }\n' });
    t.after(() => rm(dir, { recursive: true }));
    const [margin, color] = json(dir).findings;
    assert.deepEqual(margin.suggestion, { token: '--spacing-4', match: 'near', distance: 1 });
    assert.equal(color.suggestion.token, '--brand');
    assert.equal(color.suggestion.match, 'near');
    assert.ok(color.suggestion.distance > 0 && color.suggestion.distance <= 0.02);
    assert.match(cli(dir, 'check').stdout, /\t--spacing-4 \(\+1px\)\n/);
    assert.match(cli(dir, 'check').stdout, /\t--brand \(ΔE /);
    assert.equal(JSON.parse(cli(dir, 'fix', '--dry-run', '--json').stdout).files.length, 0);
});

test('near stays quiet when the value is on the grid, too far, or between two tokens', async (t) => {
    const dir = await project({
        'tokens.css': ':root { --s3: 12px; --s4: 16px; }\n.a { padding: var(--s3); margin: var(--s4); }\n',
        'a.css': '.b { margin: 8px; padding: 14px; gap: 6px; color: #fff; }\n',
    });
    t.after(() => rm(dir, { recursive: true }));
    assert.deepEqual(json(dir).findings.map((f: { suggestion?: unknown }) => f.suggestion), [undefined, undefined, undefined, undefined]);
});

test('a generated tree older than the code is reported, and only then', async (t) => {
    const tree = '{"spacing":{"4":{"$type":"dimension","$value":{"value":16,"unit":"px"}}}}';
    const dir = await project({
        'design-tokens/tokens.tokens.json': tree,
        'design-tokens/tokens.css': ':root { --spacing-4: 16px; }\n',
        'a.css': '.b { margin: 16px; padding: 10px; gap: 10px; }\n',
    });
    t.after(() => rm(dir, { recursive: true }));
    const { stderr } = cli(dir, 'check');
    assert.match(stderr, /1 repeated value has no token yet; run tokentidy generate --extend/);
    assert.equal(json(dir).repeatedWithoutToken.length, 2);

    const fresh = await project({ 'a.css': '.b { padding: 10px; gap: 10px; }\n' });
    t.after(() => rm(fresh, { recursive: true }));
    assert.doesNotMatch(cli(fresh, 'check').stderr, /repeated/);
});

test('token/unknown only speaks with a single close name', async (t) => {
    const dir = await project({
        'tokens.css': ':root { --color-primary: #000; --spacing-4: 4px; --spacing-6: 6px; --abc: 1px; }\n',
        'a.css': '.a { color: var(--color-primry); margin: var(--spacing-5); gap: var(--abd); padding: var(--totally-other); }\n.l { --local: 3px; padding: var(--local); }\n',
    });
    t.after(() => rm(dir, { recursive: true }));
    const unknown = json(dir).warnings.filter((w: { rule: string }) => w.rule === 'token/unknown');
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0].message, '--color-primry is not defined; did you mean --color-primary?');
    assert.deepEqual([unknown[0].line, unknown[0].column], [1, 17]);
    assert.equal(cli(dir, 'check', 'a.css').status, 1);
});

test('a deprecated DTCG token warns where it is used and fix never picks it', async (t) => {
    const dir = await project({
        'tokens.tokens.json': JSON.stringify({ color: { $deprecated: 'use color.new', old: { $type: 'color', $value: '#123456' }, kept: { $type: 'color', $value: '#654321', $deprecated: false } } }),
        'tokens.css': ':root { --color-old: #123456; --color-kept: #654321; }\n',
        'a.css': '.a { color: var(--color-old); background: var(--color-kept); }\n.b { color: #123456; }\n',
    });
    t.after(() => rm(dir, { recursive: true }));
    const warnings = json(dir).warnings.filter((w: { rule: string }) => w.rule === 'token/deprecated');
    assert.deepEqual(warnings.map((w: { message: string }) => w.message), ['--color-old is deprecated: use color.new']);
    assert.equal(JSON.parse(cli(dir, 'fix', '--dry-run', '--json').stdout).files.length, 0);
});

test('a fallback that disagrees with its token warns; equal, themed or variable fallbacks do not', async (t) => {
    const dir = await project({
        'tokens.css': ':root { --gap: 16px; --bg: #fff; --other: var(--gap); }\n.dark { --bg: #000; }\n',
        'a.css': [
            '.a { margin: var(--gap, 12px); }',
            '.b { margin: var(--gap, 1rem); }',
            '.c { color: var(--bg, #000); }',
            '.d { margin: var(--gap, var(--x)); }',
            '.e { margin: var(--other, 2px); }',
            '.f { margin: var(--missing, 3px); }',
        ].join('\n'),
    });
    t.after(() => rm(dir, { recursive: true }));
    const warnings = json(dir).warnings.filter((w: { rule: string }) => w.rule === 'token/fallback-mismatch');
    assert.deepEqual(warnings.map((w: { line: number; message: string }) => [w.line, w.message]), [[1, 'fallback 12px differs from --gap (16px, tokens.css:1)']]);
});

test('unused custom properties are counted on a whole run, never on part of it', async (t) => {
    const dir = await project({
        'tokens.css': ':root { --used: 1px; --chained: 2px; --via: var(--chained); --lonely: 3px; }\n',
        'sub/a.css': '.a { margin: var(--used); padding: var(--via); }\n',
    });
    t.after(() => rm(dir, { recursive: true }));
    const whole = cli(dir, 'check');
    assert.equal(whole.status, 0);
    assert.match(whole.stderr, /1 custom property is never used/);
    assert.deepEqual(json(dir).unusedTokens.map((u: { name: string }) => u.name), ['--lonely']);
    assert.deepEqual(json(dir, 'sub').unusedTokens, []);
});

test('the baseline hides what exists, fails on what is new and survives moved lines', async (t) => {
    const dir = await project({ 'a.css': '.a { margin: 13px; color: #123456; }\n.b { margin: 13px; }\n' });
    t.after(() => rm(dir, { recursive: true }));
    const printed = cli(dir, 'check', '--print-baseline');
    assert.equal(printed.status, 0);
    const baseline = JSON.parse(printed.stdout);
    assert.equal(baseline.version, 1);
    assert.deepEqual(baseline.entries.map((e: { value: string; count: number }) => [e.value, e.count]), [['#123456', 1], ['13px', 2]]);
    await writeFile(path.join(dir, 'b.json'), printed.stdout);

    const clean = cli(dir, 'check', '--baseline', 'b.json');
    assert.equal(clean.status, 0);
    assert.match(clean.stderr, /3 in the baseline/);
    assert.equal(json(dir, '--baseline', 'b.json').baselined, 3);

    // Mesmos valores em outras linhas, mais um igual: só o terceiro `13px` é novo
    await writeFile(path.join(dir, 'a.css'), '/* novo */\n\n.b { margin: 13px; }\n.a { margin: 13px; color: #123456; }\n.c { margin: 13px; }\n');
    const added = cli(dir, 'check', '--baseline', 'b.json');
    assert.equal(added.status, 1);
    assert.equal(added.stdout.trim().split('\n').length, 1);
});

test('a baseline entry that no longer exists warns, except on a partial run', async (t) => {
    const dir = await project({ 'sub/a.css': '.a { margin: 13px; }\n', 'gone.css': '.a { margin: 13px; }\n' });
    t.after(() => rm(dir, { recursive: true }));
    await writeFile(path.join(dir, 'b.json'), cli(dir, 'check', '--print-baseline').stdout);
    await rm(path.join(dir, 'gone.css'));
    assert.match(cli(dir, 'check', '--baseline', 'b.json').stderr, /gone\.css:1:1\twarning\tbaseline\/stale\t1 baselined value is no longer here/);
    assert.doesNotMatch(cli(dir, 'check', 'sub', '--baseline', 'b.json').stderr, /stale/);
});

test('a bad baseline is a usage error, and the two baseline flags do not combine', async (t) => {
    const dir = await project({ 'a.css': '.a { margin: 13px; }\n', 'bad.json': '{"version":9,"entries":[]}', 'broken.json': '{' });
    t.after(() => rm(dir, { recursive: true }));
    for (const args of [['--baseline', 'nope.json'], ['--baseline', 'bad.json'], ['--baseline', 'broken.json'], ['--baseline', 'bad.json', '--print-baseline']]) {
        const { status, stdout } = cli(dir, 'check', ...args);
        assert.equal(status, 2, args.join(' '));
        assert.equal(stdout, '');
    }
});

test('distance helpers', () => {
    assert.equal(editDistance('kitten', 'sitting'), 3);
    assert.equal(editDistance('', 'ab'), 2);
    assert.equal(deltaEOK([0.5, 0, Number.NaN], [0.5, 0, 120]), 0);
});

test('--summary: per type, hardcoded values and uses of a token; the exit code does not change', async () => {
    const dir = await project({ 'a.css': `${SPACING}.b { padding: 8px; color: #111111; border: 1px solid var(--brand); margin: var(--typo); }\n` });
    const result = cli(dir, 'check', '--summary');
    assert.equal(result.status, 1);
    assert.deepEqual(result.stdout.trim().split('\n'), ['border-width\t1\t0', 'color\t1\t2', 'spacing\t1\t1']);
    assert.deepEqual(json(dir, '--summary').summary.map((s: { type: string }) => s.type), ['border-width', 'color', 'spacing']);
});

test('--summary needs the whole project, and ignores the baseline', async () => {
    const dir = await project({ 'src/a.css': '.a { color: #111111; }\n' });
    assert.equal(cli(dir, 'check', 'src', '--summary').status, 2);
    await writeFile(path.join(dir, 'b.json'), cli(dir, 'check', '--print-baseline').stdout);
    assert.equal(cli(dir, 'check', '--summary', '--baseline', 'b.json').stdout, 'color\t1\t0\n');
});

test('--format github: annotations with the file position, and escaped text', async () => {
    const dir = await project({ 'a,b.css': '.a { color: #111111; }\n.b { width: 13px; }\n', 'bad.css': '.x {' });
    const result = cli(dir, 'check', '--format', 'github');
    const lines = result.stdout.trim().split('\n');
    assert.equal(result.status, 1);
    assert.ok(lines.some((line) => line.startsWith('::error file=a%2Cb.css,line=1,col=13,title=color/hardcoded::')), lines.join('\n'));
    assert.ok(lines.some((line) => line.startsWith('::notice file=a%2Cb.css,line=2,')), lines.join('\n'));
    assert.ok(lines.some((line) => line.startsWith('::error file=bad.css,') && line.includes('title=syntax-error')), lines.join('\n'));
});

test('--format: unknown formats and incompatible flags are usage errors', async () => {
    const dir = await project({ 'a.css': '.a { color: #111111; }\n' });
    assert.equal(cli(dir, 'check', '--format', 'xml').status, 2);
    assert.equal(cli(dir, 'check', '--format', 'github', '--json').status, 2);
    assert.equal(cli(dir, 'check', '--format', 'github', '--summary').status, 2);
    assert.equal(cli(dir, 'check', '--summary', '--print-baseline').status, 2);
});

test('--json carries the schema version in check, fix and generate', async () => {
    const dir = await project({ 'a.css': '.a { color: #111111; }\n.b { color: #111111; }\n' });
    assert.equal(json(dir).schemaVersion, 1);
    assert.equal(JSON.parse(cli(dir, 'generate', '--json', '--dry-run').stdout).schemaVersion, 1);
    assert.equal(JSON.parse(cli(dir, 'fix', '--json', '--dry-run').stdout).schemaVersion, 1);
});
