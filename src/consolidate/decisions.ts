/**
 * `tokentidy.decisions.json`: as respostas dadas no prompt. Vai para o repositório, para o time inteiro partilhar:
 * o que alguém recusou não é perguntado de novo.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ConfigError } from '../project/config.ts';
import { writeFileAtomic } from '../safe-write.ts';

export const DECISIONS_FILE = 'tokentidy.decisions.json';

export type Decision = 'accepted' | 'rejected';

export async function loadDecisions(root: string): Promise<Map<string, Decision>> {
    const file = path.join(root, DECISIONS_FILE);
    const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    });
    if (text === undefined) {
        return new Map();
    }
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        throw new ConfigError(`Invalid JSON in ${file}: ${(error as Error).message}`);
    }
    const decisions = (raw as { decisions?: unknown } | null)?.decisions;
    if (typeof decisions !== 'object' || decisions === null || Array.isArray(decisions)
        || Object.values(decisions).some((value) => value !== 'accepted' && value !== 'rejected')) {
        throw new ConfigError(`${file}: expected { "version": 1, "decisions": { "<group>": "accepted" | "rejected" } }`);
    }
    return new Map(Object.entries(decisions as Record<string, Decision>));
}

/** Ordenado: o arquivo é versionado e o diff precisa mostrar só o que mudou. */
export async function saveDecisions(root: string, decisions: ReadonlyMap<string, Decision>): Promise<void> {
    const sorted = [...decisions].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    await writeFileAtomic(path.join(root, DECISIONS_FILE), `${JSON.stringify({ version: 1, decisions: Object.fromEntries(sorted) }, null, 2)}\n`);
}
