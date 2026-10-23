// Utilitários dos testes: caminhos compartilhados e pastas temporárias.
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';

/** Pasta dos projetos de exemplo usados nos testes. */
export const FIXTURES = path.join(import.meta.dirname, 'fixtures');

/** Entrada da CLI no código-fonte, para rodar o comando como processo. */
export const CLI_ENTRY = path.join(import.meta.dirname, '..', 'src', 'cli.ts');

/** Pasta temporária dentro de `test/.tmp/` (ignorada pelo git). Quem chama apaga depois. */
export async function tempDir(): Promise<string> {
    const base = path.join(import.meta.dirname, '.tmp');
    await mkdir(base, { recursive: true });
    return mkdtemp(path.join(base, 'run-'));
}

/** Cópia de uma fixture numa pasta temporária, para testes que geram arquivos dentro do projeto. */
export async function copyFixture(name: string): Promise<string> {
    const dir = await tempDir();
    await cp(path.join(FIXTURES, name), dir, { recursive: true });
    return dir;
}
