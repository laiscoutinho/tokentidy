// `#fff`, `#FFFFFF`, `white` e `rgb(255 255 255)` são o mesmo valor: um token só, escrito sempre por extenso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { normalizeValue } from '../../src/values/normalize.ts';
import { CLI_ENTRY, tempDir } from '../helpers.ts';

const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd });

test('short hex keeps its alpha when written out', () => {
    assert.equal(normalizeValue('color', '#fff8'), '#ffffff88');
    assert.equal(normalizeValue('color', '#FFF'), '#ffffff');
    assert.equal(normalizeValue('color', 'rgb(255 255 255)'), '#ffffff');
});

test('every spelling of white becomes one token, written #ffffff in every format, and fix replaces each one', async () => {
    const dir = await tempDir();
    try {
        await writeFile(path.join(dir, 'package.json'), '{"name":"app","devDependencies":{"typescript":"5"}}');
        await mkdir(path.join(dir, 'src'));
        const css = '.a { color: #fff; }\n.b { color: #FFFFFF; }\n.c { color: white; }\n.d { color: rgb(255 255 255); }\n.e { color: #ffffff; }\n';
        await writeFile(path.join(dir, 'src/a.css'), css);

        const generated = run(dir, 'generate', '--dtcg', '--scss', '--less', '--ts', '--json');
        assert.equal(generated.status, 0, generated.stderr);
        const out = path.join(dir, 'design-tokens');
        const files = {
            css: await readFile(path.join(out, 'tokens.css'), 'utf8'),
            dtcg: await readFile(path.join(out, 'tokens.tokens.json'), 'utf8'),
            scss: await readFile(path.join(out, '_tokens.scss'), 'utf8'),
            less: await readFile(path.join(out, '_tokens.less'), 'utf8'),
            ts: await readFile(path.join(out, 'tokens.ts'), 'utf8'),
        };
        // O valor escrito é sempre o hex longo; o DTCG só guarda as outras grafias em `spellings`
        for (const [format, text] of Object.entries(files)) {
            assert.match(text, /#ffffff/, format);
            if (format !== 'dtcg') {
                assert.doesNotMatch(text, /#fff\b|#FFFFFF|rgb\(|: white|'white'/, format);
            }
        }
        const dtcg = JSON.parse(files.dtcg).color.white;
        assert.equal(dtcg.$value.hex, '#ffffff');
        assert.equal(dtcg.$extensions['dev.tokentidy'].css, '#ffffff');
        assert.equal(files.css.match(/--color-[\w-]+:/g)?.length, 1);

        const fixed = run(dir, 'fix');
        assert.equal(fixed.status, 0, fixed.stderr);
        const result = await readFile(path.join(dir, 'src/a.css'), 'utf8');
        assert.equal(result.match(/var\(--color-white\)/g)?.length, 5, result);
    } finally {
        await rm(dir, { recursive: true });
    }
});
