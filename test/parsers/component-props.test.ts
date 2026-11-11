// Props de componente com valor de CSS (`<Flex gap="1rem">`): reportadas, nunca trocadas, com a lista configurável.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../../src/analysis/analyze.ts';
import { fixScope } from '../../src/fix/apply.ts';
import { ConfigError, validateConfig } from '../../src/project/config.ts';
import { collectFiles } from '../../src/project/scope.ts';
import { tempDir } from '../helpers.ts';

const SOURCE = `import { Flex, UI } from './ui';
export const A = (p) => (
	<Flex gap="1rem" padding={ p.big ? '24px' : '16px' } size="small" className="variant">
		<UI.Box color="#3858e9" marginTop={ 2 } justify="space-between" />
		<div gap="8px" color="#ff0000" />
	</Flex>
);
`;

async function project(files: Record<string, string>): Promise<string> {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), content);
    }
    return dir;
}

test('component props with a CSS value are reported at their position; numbers, words and HTML attributes are not', async () => {
    const dir = await project({ 'src/a.tsx': SOURCE });
    try {
        const result = await analyzePaths([dir], { root: dir });
        const items = [...result.findings, ...result.review];
        assert.deepEqual(items.map((f) => `${f.property} ${f.value} ${f.host}`), [
            'gap 1rem component-prop', 'padding 24px component-prop', 'padding 16px component-prop', 'color #3858e9 component-prop',
        ]);
        for (const item of items) {
            assert.equal(SOURCE.slice(item.offset, item.endOffset), item.value);
        }
        // A lista da configuração substitui a padrão
        const only = await analyzePaths([dir], { root: dir, componentProps: ['justify', 'color'] });
        assert.deepEqual(only.findings.map((f) => f.value), ['#3858e9']);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('fix leaves component props alone, with the reason', async () => {
    const dir = await project({ 'tokens/tokens.css': ':root { --space-4: 1rem; --color-primary: #3858e9; }\n', 'src/a.tsx': SOURCE });
    try {
        const result = await fixScope(await collectFiles([dir], dir), { tokensDir: path.join(dir, 'design-tokens'), dryRun: true });
        assert.equal(result.files.length, 0);
        assert.deepEqual([...new Set(result.skipped.map((s) => s.reason))], ['component-prop']);
        assert.match(result.skipped[0]!.message, /gap prop belongs to the component/);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('componentProps in the config must be a list of prop names', () => {
    assert.deepEqual(validateConfig({ componentProps: ['gap', 'spacing'] }, 'c').componentProps, ['gap', 'spacing']);
    assert.throws(() => validateConfig({ componentProps: 'gap' }, 'c'), ConfigError);
    assert.throws(() => validateConfig({ componentProps: ['margin-top'] }, 'c'), ConfigError);
});
