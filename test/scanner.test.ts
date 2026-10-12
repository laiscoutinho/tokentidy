import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { scanDirectory, isSupportedExtension } from '../src/scanner.ts';

const fixture = path.join(import.meta.dirname, 'fixtures', 'projeto-basico');

test('conta arquivos por extensão, inclusive em subpastas', async () => {
    const result = await scanDirectory(fixture);

    assert.equal(result.total, 4);
    assert.equal(result.byExtension['.scss'], 1);
    assert.equal(result.byExtension['.jsx'], 1);
    assert.equal(result.byExtension['.css'], 1);
    assert.equal(result.byExtension['.html'], 1);
    assert.equal(result.byExtension['.tsx'], 0);
});

test('ignora node_modules, dist e extensões não suportadas', async () => {
    const result = await scanDirectory(fixture);

    assert.ok(result.files.every((file) => !file.includes('node_modules') && !file.startsWith('dist')));
    assert.ok(!result.files.includes('notas.txt'));
});

test('lança erro para diretório inexistente', async () => {
    await assert.rejects(() => scanDirectory('/caminho/que/nao/existe'), /Diretório não encontrado/);
});

test('lança erro quando o caminho é um arquivo', async () => {
    await assert.rejects(() => scanDirectory(import.meta.filename), /Não é um diretório/);
});

test('isSupportedExtension reconhece só as extensões analisadas', () => {
    assert.equal(isSupportedExtension('.tsx'), true);
    assert.equal(isSupportedExtension('.txt'), false);
});
