// CSS num template sem tag: só quando é uma folha de estilo de verdade, nas posições do arquivo, e o `fix` não troca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../../src/analysis/analyze.ts';
import { fixScope } from '../../src/fix/apply.ts';
import { looksLikeStylesheet } from '../../src/parsers/js/css-strings.ts';
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

async function analyze(source: string, file = 'src/a.jsx') {
    const dir = await project({ [file]: source });
    try {
        const result = await analyzePaths([dir], { root: dir });
        assert.deepEqual(result.errors, []);
        return [...result.findings, ...result.review];
    } finally {
        await rm(dir, { recursive: true });
    }
}

const REVISIONS = `const REVISION_DIFF_STYLES = \`
	.is-revision-added {
		outline: 3px solid #00a32a;
		outline-offset: 2px;
	}
	.is-revision-removed { text-decoration-color: \${ removed }; color: #d63638; }
\`;
export function Diff() { return useStyleOverride( { css: REVISION_DIFF_STYLES } ); }
`;

const PREVIEW = `function markup() {
	let markup = '<div class="message"></div>';
	markup += \`
		<style>
			.editor-post-preview-button__interstitial-message svg { stroke: #555d66; }
		</style>
	\`;
	return markup;
}
`;

test('an untagged template that is a stylesheet is read, at the positions in the file', async () => {
    const items = await analyze(REVISIONS);
    const values = items.map((f) => `${f.property} ${f.value} ${f.host}`).sort();
    assert.deepEqual(values, ['color #d63638 css-string', 'outline #00a32a css-string', 'outline 3px css-string']);
    for (const item of items) {
        assert.equal(REVISIONS.slice(item.offset, item.endOffset), item.value);
    }
});

test('only the <style> sections of HTML built in JavaScript are read', async () => {
    const items = await analyze(PREVIEW);
    assert.deepEqual(items.map((f) => `${f.property} ${f.value}`), ['stroke #555d66']);
    assert.equal(PREVIEW.slice(items[0]!.offset, items[0]!.endOffset), '#555d66');
});

test('templates that are not stylesheets are not read', async () => {
    const source = `
const query = gql\`query Card { card { color } }\`;
const plain = \`Hello {name}: your color is #ff0000\`;
const graph = \`query Card { card { id title } }\`;
const code = \`function a() { return { color: '#ff0000' }; }\`;
const html = \`<div style="x">{ color: #ff0000 }</div>\`;
const decls = \`color: #ff0000; padding: 8px;\`;
const unknown = \`.a { foo-bar: #ff0000; }\`;
export const A = () => <div className={\`a \${plain}\`}>{query}{graph}{code}{html}{decls}{unknown}</div>;
`;
    assert.deepEqual(await analyze(source), []);
    assert.equal(looksLikeStylesheet('.a { color: #fff; }'), true);
    assert.equal(looksLikeStylesheet('@media (min-width: 600px) { .a { padding: 8px; } }'), true);
    assert.equal(looksLikeStylesheet('.a { color: #fff; } stray'), false);
});

test('tagged templates and Angular styles are read once, as before', async () => {
    const styled = await analyze("import styled from 'styled-components';\nexport const A = styled.div`color: #111111;`;\n");
    assert.deepEqual(styled.map((f) => `${f.value} ${f.host}`), ['#111111 css-in-js']);
    const angular = await analyze("@Component({ selector: 'a', styles: [`.a { color: #222222; }`], template: `<p></p>` })\nexport class A {}\n", 'src/a.component.ts');
    assert.deepEqual(angular.map((f) => f.value), ['#222222']);
});

test('fix reports CSS built as a string and leaves it as it is', async () => {
    const dir = await project({ 'tokens/tokens.css': ':root { --color-success: #00a32a; }\n', 'src/a.jsx': REVISIONS, 'src/b.css': '.a { color: #00a32a; }\n' });
    try {
        const result = await fixScope(await collectFiles([dir], dir), { tokensDir: path.join(dir, 'design-tokens'), dryRun: true });
        assert.deepEqual(result.files.map((f) => f.file), ['src/b.css']);
        const skipped = result.skipped.filter((s) => s.finding.file === 'src/a.jsx');
        assert.deepEqual(skipped.map((s) => s.reason), ['css-string']);
        assert.match(skipped[0]!.message, /iframe or another window/);
    } finally {
        await rm(dir, { recursive: true });
    }
});
