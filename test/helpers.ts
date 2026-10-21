// Utilitários dos testes que escrevem em disco.
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

/** Pasta temporária dentro de `test/.tmp/` (ignorada pelo git). Quem chama apaga depois. */
export async function tempDir(): Promise<string> {
    const base = path.join(import.meta.dirname, '.tmp');
    await mkdir(base, { recursive: true });
    return mkdtemp(path.join(base, 'run-'));
}

/** Cópia de uma fixture numa pasta temporária, para testes que geram arquivos dentro do projeto. */
export async function copyFixture(name: string): Promise<string> {
    const dir = await tempDir();
    await cp(path.join(import.meta.dirname, 'fixtures', name), dir, { recursive: true });
    return dir;
}
