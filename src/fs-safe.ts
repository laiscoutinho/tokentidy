// Escrita segura: nada é escrito fora do projeto e nenhum arquivo fica pela metade.

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isInside } from './scope.ts';

/** Saída que escaparia do projeto (por `..` ou link simbólico): erro de uso, nada é escrito. */
export class OutsideRootError extends Error {}

/**
 * Confere que `target` fica dentro de `root` depois de resolver links simbólicos.
 * `target` pode ainda não existir: resolve a parte que existe e junta o resto.
 */
export async function assertInsideRoot(target: string, root: string): Promise<void> {
    const realRoot = await realpath(root);
    const absolute = path.resolve(target);
    let existing = absolute;
    const rest: string[] = [];
    for (;;) {
        try {
            existing = await realpath(existing);
            break;
        } catch {
            const parent = path.dirname(existing);
            if (parent === existing) {
                break;
            }
            rest.unshift(path.basename(existing));
            existing = parent;
        }
    }
    if (!isInside(path.join(existing, ...rest), realRoot)) {
        throw new OutsideRootError(`Output folder must be inside the project (${root}): ${target}`);
    }
}

// No Windows, antivírus e indexador seguram o arquivo por instantes: `rename` falha com EPERM/EBUSY e resolve sozinho
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRIES = 5;

/**
 * Escreve em um arquivo temporário na mesma pasta e troca de nome: quem lê o arquivo vê o antigo ou o novo,
 * nunca metade (o `rename` na mesma pasta é atômico). Mesmo algoritmo do `write-file-atomic`, sem a dependência.
 * Ao substituir um arquivo, mantém as permissões dele (como o `write-file-atomic` faz).
 */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const mode = (await stat(file).catch(() => undefined))?.mode;
    const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
    // `wx`: falha se o temporário já existir, em vez de seguir um link deixado ali
    await writeFile(temp, content, { flag: 'wx' });
    try {
        if (mode !== undefined) {
            // O `mode` do writeFile passa pela umask; o chmod aplica as permissões exatas
            await chmod(temp, mode & 0o7777);
        }
        for (let attempt = 0; ; attempt++) {
            try {
                await rename(temp, file);
                return;
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code ?? '';
                if (!RETRY_CODES.has(code) || attempt >= RETRIES) {
                    throw error;
                }
                await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
            }
        }
    } catch (error) {
        await rm(temp, { force: true });
        throw error;
    }
}
