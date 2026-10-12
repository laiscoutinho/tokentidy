// Testes de ponta a ponta: rodam a CLI como processo, como um CI ou hook faria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cli = path.join(import.meta.dirname, '..', 'src', 'cli.ts');
const fixture = path.join(import.meta.dirname, 'fixtures', 'projeto-basico');

function run(...args: string[]) {
    return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('check imprime uma linha por extensão, separada por tab, e sai com 0', () => {
    const { stdout, stderr, status } = run('check', fixture);

    assert.equal(status, 0);
    assert.equal(stderr, '');
    const lines = stdout.trim().split('\n');
    assert.ok(lines.includes('.scss\t1'));
    assert.equal(lines.at(-1), 'total\t4');
});

test('check --json imprime só JSON válido no stdout', () => {
    const { stdout, status } = run('check', fixture, '--json');

    assert.equal(status, 0);
    const data = JSON.parse(stdout);
    assert.equal(data.total, 4);
    assert.equal(data.byExtension['.jsx'], 1);
});

test('erro vai para o stderr e sai com código 1', () => {
    const { stdout, stderr, status } = run('check', '/caminho/que/nao/existe');

    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /Diretório não encontrado/);
});

test('check não mostra o banner', () => {
    const { stdout } = run('check', fixture);

    assert.doesNotMatch(stdout, /_____/);
});
