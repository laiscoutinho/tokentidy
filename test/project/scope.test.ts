import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../../src/analysis/analyze.ts';
import { ScopeError, collectFiles, findProjectRoot, isInside } from '../../src/project/scope.ts';
import { tempDir } from '../helpers.ts';

/** Projeto temporário com os arquivos dados (caminho → conteúdo). */
async function project(files: Record<string, string>): Promise<string> {
    const dir = await tempDir();
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), content);
    }
    return dir;
}

test('the project root is the nearest folder with package.json, tokentidy.config.json or .git', async () => {
    const dir = await project({ 'package.json': '{}', 'src/ui/Card.css': '.a { color: red; }' });
    try {
        assert.equal(await findProjectRoot([path.join(dir, 'src', 'ui', 'Card.css')]), dir);
        assert.equal(await findProjectRoot([path.join(dir, 'src', 'ui'), path.join(dir, 'src')]), dir);
        await assert.rejects(findProjectRoot([path.join(dir, 'missing')]), (error: Error) => error instanceof ScopeError && /Path not found/.test(error.message));
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('isInside compares resolved paths without being fooled by prefixes', () => {
    assert.equal(isInside('/a/b/c', '/a/b'), true);
    assert.equal(isInside('/a/b', '/a/b'), true);
    assert.equal(isInside('/a/bc', '/a/b'), false);
    assert.equal(isInside('/a', '/a/b'), false);
});

test('folders keep the default exclusions; a file given explicitly is analyzed anyway', async () => {
    const dir = await project({
        'package.json': '{}',
        'src/Button.css': '.a { color: red; }',
        'src/Button.test.tsx': 'x',
        'src/.storybook/preview.css': '.a { color: red; }',
        'src/node_modules/lib/x.css': '.a { color: red; }',
        'src/App.vue': '<template></template>',
        'src/vendor.min.css': '.a{color:red}',
        'src/tokens.tokens.json': '{}',
        'docs/readme.md': '# docs',
    });
    try {
        const scope = await collectFiles([path.join(dir, 'src'), path.join(dir, 'src', 'Button.test.tsx'), path.join(dir, 'docs')], dir);

        assert.deepEqual(scope.files, ['src/Button.css', 'src/Button.test.tsx']);
        assert.deepEqual(scope.tokenFiles, ['src/tokens.tokens.json']);
        assert.deepEqual(scope.skipped, [
            { file: 'src/App.vue', reason: 'unsupported' },
            { file: 'src/vendor.min.css', reason: 'minified' },
        ]);
        assert.deepEqual(scope.unmatched, [path.join(dir, 'docs')]);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('ignore globs from the config skip files, and includeMinified brings minified files back', async () => {
    const dir = await project({
        'legacy/old.css': '.a { color: red; }',
        'src/a.generated.css': '.a { color: red; }',
        'src/b.css': '.a { color: red; }',
        'src/vendor.min.css': '.a { color: red; }',
    });
    try {
        const scope = await collectFiles([dir], dir, { ignore: ['legacy/**', '**/*.generated.css'], includeMinified: true });

        assert.deepEqual(scope.files, ['src/b.css', 'src/vendor.min.css']);
        assert.deepEqual(scope.skipped.map((s) => `${s.file} ${s.reason}`), ['legacy/old.css ignored', 'src/a.generated.css ignored']);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('a symlinked folder is not followed (no loop, no file outside the project)', async () => {
    const dir = await project({ 'src/a.css': '.a { color: red; }' });
    try {
        await symlink(dir, path.join(dir, 'src', 'loop'), 'dir');
        const scope = await collectFiles([dir], dir);
        assert.deepEqual(scope.files, ['src/a.css']);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('a bundle with a normal name is detected as minified by its content', async () => {
    const bundle = `${'.a{color:red}'.repeat(20)}\n`;
    const dir = await project({ 'vendor.css': bundle, 'app.css': '.a { color: red; }\n' });
    try {
        const result = await analyzePaths([dir], { root: dir });
        assert.deepEqual(result.skipped, [{ file: 'vendor.css', reason: 'minified' }]);
        assert.deepEqual(result.findings.map((f) => f.file), ['app.css']);
        assert.equal(result.filesAnalyzed, 1);

        const included = await analyzePaths([dir], { root: dir, includeMinified: true });
        assert.equal(included.findings.filter((f) => f.file === 'vendor.css').length, 20);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('.pcss and .postcss are read as CSS', async () => {
    const dir = await project({ 'a.pcss': '.a { color: red; }', 'b.postcss': '.b { margin: 8px; }' });
    try {
        const result = await analyzePaths([dir], { root: dir });
        assert.deepEqual(result.findings.map((f) => `${f.file} ${f.host} ${f.value}`), ['a.pcss css red', 'b.postcss css 8px']);
        assert.deepEqual(result.styleLanguages, ['css']);
    } finally {
        await rm(dir, { recursive: true });
    }
});
