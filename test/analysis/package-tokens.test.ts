// Tokens de pacotes: o design system instalado vira sugestão, e nada do CSS dele vira achado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CLI_ENTRY, tempDir } from '../helpers.ts';

async function project(files: Record<string, string>): Promise<string> {
    const dir = await tempDir();
    for (const [name, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
        await writeFile(path.join(dir, name), content);
    }
    return dir;
}

const cli = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd });

const DS = {
    'package.json': '{"name":"app"}',
    'node_modules/@acme/ds/package.json': '{"name":"@acme/ds","sass":"scss/index.scss"}',
    'node_modules/@acme/ds/scss/index.scss': '@forward "tokens";\n.ds-button { color: #abcdef; }\n',
    'node_modules/@acme/ds/scss/_tokens.scss': '$brand: #4f46e5;\n',
    'node_modules/@acme/ds/scss/vars.css': ':root { --ds-danger: #dc2626; }\n',
};

test('a token imported from node_modules shows up as a suggestion', async () => {
    const dir = await project({ ...DS, 'src/a.scss': '@use "@acme/ds" as *;\n.a { color: #4f46e5; }\n' });
    try {
        const { stdout, status } = cli(dir, 'check', '.');
        assert.equal(status, 1);
        assert.equal(stdout, 'src/a.scss:2:13\tviolation\tcolor/hardcoded\tcolor\t#4f46e5\t$brand\n');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('the CSS of the package is not the code of the project', async () => {
    const dir = await project({ ...DS, 'src/a.scss': '@use "@acme/ds" as *;\n.a { margin: 0; }\n' });
    try {
        const { stdout, stderr, status } = cli(dir, 'check', '.');
        assert.equal(status, 0, stdout + stderr);
        assert.equal(stdout, '');
        assert.doesNotMatch(stderr, /never used/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('fix writes a package variable only where it is visible without a namespace', async () => {
    const dir = await project({
        ...DS,
        'src/plain.scss': '@use "@acme/ds" as *;\n.a { color: #4f46e5; }\n',
        'src/named.scss': '@use "@acme/ds";\n.a { color: #4f46e5; }\n',
    });
    try {
        cli(dir, 'fix', '.');
        assert.match(await readFile(path.join(dir, 'src/plain.scss'), 'utf8'), /color: \$brand;/);
        assert.match(await readFile(path.join(dir, 'src/named.scss'), 'utf8'), /color: #4f46e5;/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('a tilde import and a hoisted package are found; custom properties come along', async () => {
    const dir = await project({ ...DS, 'apps/web/package.json': '{"name":"web"}', 'apps/web/a.scss': '@import "~@acme/ds/scss/vars.css";\n.a { color: #dc2626; }\n' });
    try {
        const { stdout } = cli(path.join(dir, 'apps/web'), 'check', '.');
        assert.match(stdout, /\t#dc2626\t--ds-danger\n$/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('a local file with the same name wins over the package', async () => {
    const dir = await project({ ...DS, 'src/@acme/ds.scss': '$local: #111111;\n', 'src/a.scss': '@use "@acme/ds" as *;\n.a { color: #4f46e5; }\n' });
    try {
        assert.equal(cli(dir, 'check', 'src/a.scss').stdout, 'src/a.scss:2:13\tviolation\tcolor/hardcoded\tcolor\t#4f46e5\n');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('a package entry cannot walk out of the package, and cycles end', async () => {
    const dir = await project({
        'package.json': '{"name":"app"}',
        'secret.scss': '$secret: #4f46e5;\n',
        'node_modules/evil/package.json': '{"name":"evil","sass":"../../secret.scss"}',
        'node_modules/loop/package.json': '{"name":"loop","sass":"a.scss"}',
        'node_modules/loop/a.scss': '@import "b";\n$a: #010203;\n',
        'node_modules/loop/b.scss': '@import "a";\n@import "../evil/index";\n',
        'src/a.scss': '@use "evil" as *;\n@use "loop" as *;\n.a { color: #4f46e5; border-color: #010203; }\n',
    });
    try {
        const { stdout } = cli(dir, 'check', 'src/a.scss');
        assert.match(stdout, /\t#4f46e5\n/);
        assert.match(stdout, /\t#010203\t\$a\n/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
