// O arquivo que o `fix` escreve tem que compilar com os compiladores de verdade: `var()` em função de build quebraria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import less from 'less';
import * as sass from 'sass';

import { fixScope } from '../../src/fix/apply.ts';
import { generateTokens } from '../../src/generate/generate.ts';
import { buildDtcgTree } from '../../src/generate/output/dtcg-tree.ts';
import { renderOutput } from '../../src/generate/output/render-files.ts';
import { writeOutput } from '../../src/generate/output/write-files.ts';
import { analyzePaths } from '../../src/analysis/analyze.ts';
import { collectFiles } from '../../src/project/scope.ts';
import { tempDir } from '../helpers.ts';

const SCSS = `.a { color: #4f46e5; padding: 16px; margin: 8px 16px; }
.b { color: darken(#4f46e5, 10%); width: 16px * 2; }
@media (min-width: 768px) { .c { padding: 16px; } }
.d { margin: 8px; }
`;
const LESS = `.a { color: #4f46e5; padding: 16px; margin: 8px 16px; }
.b { color: darken(#4f46e5, 10%); width: 16px * 2; }
@media (min-width: 768px) { .c { padding: 16px; } }
.d { margin: 8px; }
`;

async function fixProject(file: string, content: string): Promise<{ dir: string; fixed: string }> {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    await mkdir(path.join(dir, 'src'));
    await writeFile(path.join(dir, 'src', file), content);
    const analysis = await analyzePaths([dir], { root: dir });
    const outDir = path.join(dir, 'design-tokens');
    const generation = generateTokens(analysis.findings, { minOccurrences: 2, gridBase: 4, semanticTokens: false, mode: 'new', definitions: analysis.definitions, references: analysis.references });
    const options = { outDir, mode: 'new' as const, styleLanguages: analysis.styleLanguages, splitThreshold: 40 };
    await writeOutput(renderOutput(buildDtcgTree(generation, undefined), options), options);
    await fixScope(await collectFiles([dir], dir), { tokensDir: outDir });
    return { dir, fixed: await readFile(path.join(dir, 'src', file), 'utf8') };
}

test('fixed SCSS compiles with sass', async () => {
    const { dir, fixed } = await fixProject('a.scss', SCSS);
    try {
        assert.match(fixed, /var\(--/);
        assert.ok(!/darken\(var/.test(fixed));
        const { css } = sass.compile(path.join(dir, 'src/a.scss'), { logger: sass.Logger.silent });
        assert.match(css, /\.a/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('fixed Less compiles with less', async () => {
    const { dir, fixed } = await fixProject('a.less', LESS);
    try {
        assert.match(fixed, /var\(--/);
        assert.ok(!/darken\(var/.test(fixed));
        const { css } = await less.render(fixed, { filename: path.join(dir, 'src/a.less') });
        assert.match(css, /\.a/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

// O teste só vale se o erro que ele evita existir de verdade
test('a build-time function around var() really fails to compile', () => {
    assert.throws(() => sass.compileString('.a { color: darken(var(--x), 10%); }', { logger: sass.Logger.silent }));
});
