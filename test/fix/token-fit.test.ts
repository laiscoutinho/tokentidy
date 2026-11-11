// O `fix` só troca pelo token certo: sinal, família do nome, papel da cor e tokens de teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import less from 'less';
import * as sass from 'sass';

import { fixScope } from '../../src/fix/apply.ts';
import { propertyAffinity, propertyRole, roleFit, tokenRoles } from '../../src/fix/token-fit.ts';
import { collectFiles } from '../../src/project/scope.ts';
import { tempDir } from '../helpers.ts';

async function project(files: Record<string, string>): Promise<string> {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), content);
    }
    return dir;
}

async function fix(dir: string, dryRun = true) {
    return fixScope(await collectFiles([dir], dir), { tokensDir: path.join(dir, 'design-tokens'), dryRun });
}

const pairs = (result: Awaited<ReturnType<typeof fix>>) =>
    result.files.flatMap((f) => f.replacements.map((r) => `${r.finding.property}:${r.finding.value}=${r.text}`));

async function withProject(files: Record<string, string>, body: (dir: string) => Promise<void>): Promise<void> {
    const dir = await project(files);
    try {
        await body(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

test('a negative value keeps its sign in CSS', () => withProject({
    'src/tokens.css': ':root { --space-5: 20px; }\n',
    'src/a.css': '.a { margin: -20px; top: calc(100% - 20px); }\n.b { margin-left: -20px; }\n',
}, async (dir) => {
    const result = await fix(dir);
    assert.deepEqual(pairs(result).filter((p) => p.startsWith('margin')), [
        'margin:-20px=calc(-1 * var(--space-5))', 'margin-left:-20px=calc(-1 * var(--space-5))',
    ]);
}));

test('a negative value keeps its sign in SCSS and Less, and the result compiles', () => withProject({
    'src/_vars.scss': '$spacing-20: 16px;\n',
    'src/a.scss': "@use 'vars' as *;\n.a { margin: 0 -16px; padding: 16px; }\n.b { margin-top: -16px * 2; }\n",
    'src/vars.less': '@space-4: 16px;\n',
    'src/b.less': "@import 'vars.less';\n.a { margin: 0 -16px; padding: 16px; }\n",
}, async (dir) => {
    await fix(dir, false);
    const scss = await readFile(path.join(dir, 'src/a.scss'), 'utf8');
    assert.match(scss, /margin: 0 \(-\$spacing-20\);/);
    assert.match(scss, /margin-top: -\$spacing-20 \* 2;/);
    const { css } = sass.compile(path.join(dir, 'src/a.scss'), { logger: sass.Logger.silent });
    assert.match(css, /margin: 0 -16px;/);
    assert.match(css, /margin-top: -32px;/);
    const lessSource = await readFile(path.join(dir, 'src/b.less'), 'utf8');
    assert.match(lessSource, /margin: 0 \(-@space-4\);/);
    const out = await less.render(lessSource, { filename: path.join(dir, 'src/b.less') });
    assert.match(out.css, /margin: 0 -16px;/);
}));

test('a negative number in JavaScript becomes a calc string', () => withProject({
    'src/tokens.css': ':root { --space-2: 2px; --space-4: 16px; }\n',
    'src/a.tsx': "export const A = () => <div style={{ margin: -2, marginTop: '-16px' }} />;\n",
}, async (dir) => {
    assert.deepEqual(pairs(await fix(dir)), ["margin:-2='calc(-1 * var(--space-2))'", 'margin-top:-16px=calc(-1 * var(--space-4))']);
}));

test('border-width and line-height tokens are not used for margin, and size tokens not for padding', () => withProject({
    'src/tokens.css': ':root { --border-width-xs: 1px; --line-height-sm: 20px; --dimension-size-sm: 24px; }\n',
    'src/use.css': '.u { width: var(--dimension-size-sm); height: var(--dimension-size-sm); margin: var(--dimension-size-sm); border-width: var(--border-width-xs); margin-top: var(--border-width-xs); }\n',
    'src/a.css': '.a { margin: 1px; padding: 20px; padding-top: 24px; border-width: 1px; line-height: 20px; }\n',
}, async (dir) => {
    const result = await fix(dir);
    const replaced = result.files.flatMap((f) => f.replacements).filter((r) => r.finding.file === 'src/a.css');
    assert.deepEqual(replaced.map((r) => `${r.finding.property}=${r.token}`), ['border-width=--border-width-xs', 'line-height=--line-height-sm']);
    const family = result.skipped.filter((s) => s.reason === 'token-family-mismatch');
    assert.deepEqual(family.map((s) => s.finding.property).sort(), ['margin', 'padding-top']);
    assert.match(family.find((s) => s.finding.property === 'margin')!.message, /--border-width-xs has this value but its name says border-width, not spacing/);
}));

test('padding prefers a padding token over a more used gap token', () => withProject({
    'src/tokens.css': ':root { --dimension-gap-md: 12px; --dimension-padding-md: 12px; }\n',
    'src/use.css': '.u { gap: var(--dimension-gap-md); row-gap: var(--dimension-gap-md); padding: var(--dimension-padding-md); }\n',
    'src/a.css': '.a { padding: 12px; gap: 12px; margin: 12px; }\n',
}, async (dir) => {
    const result = await fix(dir);
    const replacements = result.files.flatMap((f) => f.replacements).filter((r) => r.finding.file === 'src/a.css');
    assert.deepEqual(replacements.map((r) => `${r.finding.property}=${r.token}:${r.reason}`), [
        'padding=--dimension-padding-md:name-matches-property', 'gap=--dimension-gap-md:most-used',
        // `margin`: os dois nomes são de outra propriedade de espaçamento; fica o mais usado
        'margin=--dimension-gap-md:most-used',
    ]);
}));

test('a color is not given a token of another role', () => withProject({
    'src/tokens.css': ':root { --color-bg-surface: #fff; --color-fg-content: #1e1e1e; --gray-900: #1e1e1e; --color-stroke-focus: #3858e9; }\n',
    'src/a.css': '.a { color: #fff; background: #fff; border-color: #1e1e1e; color: #1e1e1e; outline-color: #3858e9; fill: #3858e9; }\n',
}, async (dir) => {
    const result = await fix(dir);
    assert.deepEqual(pairs(result), [
        'background:#fff=var(--color-bg-surface)', 'border-color:#1e1e1e=var(--gray-900)', 'color:#1e1e1e=var(--color-fg-content)',
        'outline-color:#3858e9=var(--color-stroke-focus)',
    ]);
    const role = result.skipped.filter((s) => s.reason === 'token-role-mismatch');
    assert.deepEqual(role.map((s) => s.finding.property), ['color', 'fill']);
    assert.deepEqual(role[0]!.alternatives, ['--color-bg-surface']);
}));

test('tokens defined in tests, fixtures and stories are never used', () => withProject({
    'tools/stylelint/test/fixtures/theme.css': ':root { --my-custom-color: #ff0000; }\n',
    'src/a.scss': '.a { color: #ff0000; }\n',
}, async (dir) => {
    // Por padrão a pasta de fixtures nem é lida; trazida de volta pelo `ignore`, o token dela ainda não serve
    assert.equal((await fix(dir)).withoutToken.length, 1);
    const scope = await collectFiles([dir], dir, { ignore: ['!**/fixtures/**'] });
    const result = await fixScope(scope, { tokensDir: path.join(dir, 'design-tokens'), dryRun: true });
    assert.equal(result.files.length, 0);
    assert.deepEqual(result.skipped.map((s) => s.reason), ['test-token']);
    assert.match(result.skipped[0]!.message, /--my-custom-color .*tools\/stylelint\/test\/fixtures\/theme\.css:1/);
}));

test('color roles and property affinity come from name segments', () => {
    assert.deepEqual([...tokenRoles('--wpds-color-bg-surface-neutral')], ['bg']);
    assert.deepEqual([...tokenRoles('$gray-900')], []);
    assert.equal(propertyRole('fill'), 'fg');
    assert.equal(propertyRole('background-color'), 'bg');
    assert.equal(propertyRole('box-shadow'), 'stroke');
    assert.equal(propertyRole('--x'), undefined);
    assert.equal(roleFit('color', '--color-text'), 0);
    assert.equal(roleFit('color', '$white'), 1);
    assert.equal(roleFit('color', '--surface'), 2);
    assert.equal(propertyAffinity('padding-left', '--padding-md'), 0);
    assert.equal(propertyAffinity('column-gap', '--gutter'), 0);
    assert.equal(propertyAffinity('padding', '--space-4'), 1);
    assert.equal(propertyAffinity('padding', '--gap-md'), 2);
    assert.equal(propertyAffinity('width', '--gap-md'), 1);
});

test('a size token used in margins stays a size when its family is used for sizes', () => withProject({
    'src/tokens.css': ':root { --dimension-size-5xs: 4px; --dimension-size-sm: 24px; --size-1: 4px; }\n',
    'src/use.css': '.u { margin: var(--dimension-size-5xs); width: var(--dimension-size-sm); height: var(--dimension-size-sm); padding: var(--size-1); }\n',
    'src/a.css': '.a { margin-left: 4px; }\n',
}, async (dir) => {
    // `--dimension-size-*` vai para tamanhos (2 de 3 usos); `--size-*` (Open Props) é espaçamento
    const result = await fix(dir);
    assert.deepEqual(result.files.flatMap((f) => f.replacements).filter((r) => r.finding.file === 'src/a.css').map((r) => r.token), ['--size-1']);
}));
