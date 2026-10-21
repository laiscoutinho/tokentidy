// Configuração: `tokentidy.config.json` na raiz do projeto analisado (ou `--config caminho`).
// Ordem de prioridade: opção da linha de comando > arquivo de configuração > padrão.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const CONFIG_FILE = 'tokentidy.config.json';

export interface Config {
    /**
     * Quantas vezes um valor precisa aparecer (no mesmo tipo de token) para virar token.
     * Valor usado uma vez só não é decisão de design repetida: virar token só aumentaria a lista.
     */
    minOccurrences: number;
    /** Grade de espaçamento em px (4 = escala 4, 8, 12, 16...). Valores fora da grade viram sugestão. */
    gridBase: number;
    /** Fonte raiz em px, para comparar `rem` com `px`. Sem ela, usa a do projeto (`html { font-size }`) ou 16. */
    rootFontSize?: number;
    /** Pasta onde os tokens são gerados, relativa ao projeto. */
    output: string;
    /** A partir de quantos tokens o CSS é dividido em um arquivo por categoria. */
    splitThreshold: number;
    /** Gera aliases semânticos (`color.text.danger` → `color.red.600`) quando o uso é inequívoco. */
    semanticTokens: boolean;
}

export const DEFAULT_CONFIG: Readonly<Config> = {
    minOccurrences: 2,
    gridBase: 4,
    output: 'design-tokens',
    splitThreshold: 60,
    semanticTokens: true,
};

/** Erro de configuração: a CLI mostra a mensagem e sai com código 2 (erro de uso). */
export class ConfigError extends Error {}

/**
 * Lê a configuração do projeto. `file` explícito precisa existir;
 * sem ele, procura `tokentidy.config.json` na raiz e usa os padrões se não houver.
 */
export async function loadConfig(root: string, file?: string): Promise<{ config: Config; file?: string }> {
    const configPath = file ? path.resolve(file) : path.join(root, CONFIG_FILE);
    if (!existsSync(configPath)) {
        if (file) {
            throw new ConfigError(`Config file not found: ${file}`);
        }
        return { config: { ...DEFAULT_CONFIG } };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(await readFile(configPath, 'utf8'));
    } catch (error) {
        throw new ConfigError(`Invalid JSON in ${configPath}: ${(error as Error).message}`);
    }
    return { config: validateConfig(raw, configPath), file: configPath };
}

/** Confere cada campo: configuração errada falha alto, em vez de ser ignorada em silêncio. */
export function validateConfig(raw: unknown, source: string): Config {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new ConfigError(`${source}: expected a JSON object`);
    }
    const config: Config = { ...DEFAULT_CONFIG };
    for (const [key, value] of Object.entries(raw)) {
        switch (key) {
            case '$schema':
                break;
            case 'minOccurrences':
                config.minOccurrences = integerAtLeast(value, 2, `${source}: minOccurrences`);
                break;
            case 'gridBase':
                config.gridBase = integerAtLeast(value, 1, `${source}: gridBase`);
                break;
            case 'splitThreshold':
                config.splitThreshold = integerAtLeast(value, 1, `${source}: splitThreshold`);
                break;
            case 'rootFontSize':
                if (typeof value !== 'number' || !(value > 0)) {
                    throw new ConfigError(`${source}: rootFontSize must be a positive number (px)`);
                }
                config.rootFontSize = value;
                break;
            case 'output':
                if (typeof value !== 'string' || value.trim() === '' || path.isAbsolute(value)) {
                    throw new ConfigError(`${source}: output must be a folder path relative to the project`);
                }
                config.output = value;
                break;
            case 'semanticTokens':
                if (typeof value !== 'boolean') {
                    throw new ConfigError(`${source}: semanticTokens must be true or false`);
                }
                config.semanticTokens = value;
                break;
            default:
                throw new ConfigError(`${source}: unknown option "${key}"`);
        }
    }
    return config;
}

/**
 * Inteiro com mínimo. `minOccurrences` começa em 2: com 1, todo valor usado uma vez viraria token,
 * e o objetivo é achar decisões de design que se repetem.
 */
export function integerAtLeast(value: unknown, min: number, label: string): number {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isInteger(number) || number < min) {
        throw new ConfigError(`${label} must be an integer >= ${min}`);
    }
    return number;
}
