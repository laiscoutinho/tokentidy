// Custom properties locais com valor literal: estado de componente e `--_privada` são valores soltos; tema e arquivo de tokens não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../../src/analysis/analyze.ts';
import { tempDir } from '../helpers.ts';

async function analyze(files: Record<string, string>) {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), content);
    }
    try {
        return await analyzePaths([dir], { root: dir });
    } finally {
        await rm(dir, { recursive: true });
    }
}

test('a custom property set in a component state block is a hardcoded value, with the one in the rule', async () => {
    const result = await analyze({
        'src/select.module.scss': `.input {
	--_select-padding: 12px;
	font-family: inherit;
	&:where(.is-small) {
		--_select-padding: 8px;
	}
	&.is-dense {
		--select-gap: 4px;
	}
	padding-left: var(--_select-padding);
	gap: var(--select-gap);
}
`,
    });
    assert.deepEqual(result.findings.map((f) => `${f.line} ${f.property} ${f.value} ${f.type}`), [
        '2 --_select-padding 12px spacing', '5 --_select-padding 8px spacing', '8 --select-gap 4px spacing',
    ]);
    assert.ok(!result.definitions.some((d) => d.name === '--_select-padding'));
});

test('theme blocks and token files stay token sources', async () => {
    const result = await analyze({
        'src/theme.scss': '.theme-dark { --color-bg: #000000; .compact { --space-2: 4px; } }\n.card { background: var(--color-bg); padding: var(--space-2); }\n',
        'src/design-tokens.css': ':root { --_base: 4px; --space-1: var(--_base); }\n:root[data-density="compact"] { --space-1: 2px; }\n',
        'src/app.css': '.a { margin: var(--space-1); }\n',
    });
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.tokenFiles, ['src/design-tokens.css']);
    assert.ok(result.definitions.some((d) => d.name === '--color-bg'));
    assert.ok(result.definitions.some((d) => d.name === '--_base'));
});
