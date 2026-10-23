// Segurança da saída: texto do usuário no terminal e escrita em disco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, readdir, readFile, rm, stat, symlink } from 'node:fs/promises';
import path from 'node:path';

import { oneLine, printable } from '../src/cli/print.ts';
import { OutsideRootError, assertInsideRoot, writeFileAtomic } from '../src/fs-safe.ts';
import { tempDir } from './helpers.ts';

test('printable escapes terminal controls and bidi marks, and keeps normal text', () => {
    assert.equal(printable('\u001b]8;;http://evil\u001b\\click'), '\\u001b]8;;http://evil\\u001b\\click');
    assert.equal(printable('a\u202eb\u2066c'), 'a\\u202eb\\u2066c');
    assert.equal(printable('\u009b31m'), '\\u009b31m');
    assert.equal(printable('Inter, "Noto Sans" — #fff 🎨'), 'Inter, "Noto Sans" — #fff 🎨');
    assert.equal(oneLine('Inter,\n\t  sans-serif'), 'Inter, sans-serif');
});

test('writeFileAtomic creates folders, replaces the file and leaves no temporary file', async () => {
    const dir = await tempDir();
    try {
        const file = path.join(dir, 'out', 'tokens.css');
        await writeFileAtomic(file, 'first');
        await writeFileAtomic(file, 'second');

        assert.equal(await readFile(file, 'utf8'), 'second');
        assert.deepEqual(await readdir(path.join(dir, 'out')), ['tokens.css']);
    } finally {
        await rm(dir, { recursive: true });
    }
});

test('the output folder must stay inside the project, also through symlinks', async () => {
    const dir = await tempDir();
    const outside = await tempDir();
    try {
        await mkdir(path.join(dir, 'project'));
        const root = path.join(dir, 'project');
        await symlink(outside, path.join(root, 'escape'), 'dir');

        await assertInsideRoot(path.join(root, 'design-tokens', 'nested'), root);
        await assert.rejects(assertInsideRoot(path.join(root, '..', 'elsewhere'), root), OutsideRootError);
        await assert.rejects(assertInsideRoot(path.join(root, 'escape', 'tokens'), root), /must be inside the project/);
    } finally {
        await rm(dir, { recursive: true });
        await rm(outside, { recursive: true });
    }
});

test('writeFileAtomic keeps the permissions of the file it replaces', { skip: process.platform === 'win32' }, async () => {
    const dir = await tempDir();
    try {
        const file = path.join(dir, 'run.sh');
        await writeFileAtomic(file, 'first');
        await chmod(file, 0o755);
        await writeFileAtomic(file, 'second');

        assert.equal((await stat(file)).mode & 0o777, 0o755);
    } finally {
        await rm(dir, { recursive: true });
    }
});
