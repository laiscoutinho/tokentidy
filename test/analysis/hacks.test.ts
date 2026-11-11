// Truques de CSS vão para revisão com o motivo: não viram token nem achado com sugestão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzePaths } from '../../src/analysis/analyze.ts';
import { HACK_MESSAGES } from '../../src/analysis/hacks.ts';
import { generateTokens } from '../../src/generate/generate.ts';
import { tempDir } from '../helpers.ts';

const STYLES = `
@media (prefers-reduced-motion: reduce) { .a { animation-duration: 1ms; transition-duration: 0.01ms; } }
.separator { padding-top: 0.1px; padding-bottom: 0.1px; }
.offscreen { margin-left: -9999em; height: 9999px; }
.pill { border-radius: 9999px; }
.tabs::before { width: 1px; height: 100%; }
.screen-reader-text {
  border: 0; clip-path: inset(50%); height: 1px; margin: -1px;
  overflow: hidden; padding: 0; position: absolute; width: 1px;
}
.card { padding: 1px 8px; transition-duration: 200ms; width: 1px; }
.card::after { border-width: 1px; }
`;

async function analyze(files: Record<string, string>) {
    const dir = await tempDir();
    try {
        await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
        for (const [file, content] of Object.entries(files)) {
            await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
            await writeFile(path.join(dir, file), content);
        }
        return await analyzePaths([dir], { root: dir });
    } finally {
        await rm(dir, { recursive: true });
    }
}

test('CSS tricks go to review with the reason, and real values stay findings', async () => {
    const result = await analyze({ 'src/a.scss': STYLES });
    const hacks = result.review.filter((r) => r.rule === 'value/hack').map((r) => `${r.selector} ${r.property} ${r.value} | ${r.message}`);
    assert.deepEqual(hacks.sort(), [
        `.a animation-duration 1ms | ${HACK_MESSAGES.instant}`,
        `.a transition-duration 0.01ms | ${HACK_MESSAGES.instant}`,
        `.offscreen height 9999px | ${HACK_MESSAGES.extreme}`,
        `.offscreen margin-left -9999em | ${HACK_MESSAGES.extreme}`,
        `.screen-reader-text height 1px | ${HACK_MESSAGES.visuallyHidden}`,
        `.screen-reader-text margin -1px | ${HACK_MESSAGES.visuallyHidden}`,
        `.screen-reader-text width 1px | ${HACK_MESSAGES.visuallyHidden}`,
        `.separator padding-bottom 0.1px | ${HACK_MESSAGES.subPixel}`,
        `.separator padding-top 0.1px | ${HACK_MESSAGES.subPixel}`,
        `.tabs::before width 1px | ${HACK_MESSAGES.hairline}`,
    ].sort());
    // Pílula é decisão de design (`radius-full`), e 1px fora desses padrões é um valor comum
    const findings = result.findings.map((f) => `${f.selector} ${f.property} ${f.value}`);
    for (const kept of ['.pill border-radius 9999px', '.card padding 1px', '.card transition-duration 200ms', '.card::after border-width 1px']) {
        assert.ok(findings.includes(kept), kept);
    }
    assert.ok(!result.findings.some((f) => ['1ms', '0.01ms', '0.1px', '-9999em', '9999px'].includes(f.value) && f.property !== 'border-radius'));
});

test('no token is generated from a trick', async () => {
    const result = await analyze({ 'src/a.scss': STYLES, 'src/b.scss': STYLES });
    const generated = generateTokens(result.findings, { minOccurrences: 2, gridBase: 4, semanticTokens: false, mode: 'new' });
    const values = generated.tokens.map((t) => t.value);
    for (const hack of ['1ms', '0.01ms', '0.1px', '-9999em']) {
        assert.ok(!values.includes(hack), hack);
    }
});
