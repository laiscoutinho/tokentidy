/**
 * Estrutura dos arquivos pelo schema publicado pelo DTCG (`schemas/`, cópia exata da versão 2025.10).
 * Escrever as regras à mão seria manter uma segunda especificação, que envelhece sozinha.
 */

import { readFile } from 'node:fs/promises';

import type { ErrorObject, ValidateFunction } from 'ajv';

import type { ValidationProblem } from './references.ts';

const SCHEMA_DIR = new URL('../../schemas/', import.meta.url);

export type SchemaCheck = (json: unknown, file: string) => ValidationProblem[];

/** Cada schema no seu Ajv: os dois embutem os mesmos `$id`, que não podem ser registrados duas vezes. */
export async function loadSchemaCheck(schemaFile: 'format.json' | 'resolver.json'): Promise<SchemaCheck> {
    const { Ajv } = await import('ajv');
    const schema = JSON.parse(await readFile(new URL(schemaFile, SCHEMA_DIR), 'utf8')) as object;
    // `strict: false`: o schema oficial usa palavras que o modo estrito recusa. `logger: false`: o Ajv avisa no console
    // sobre `format` desconhecido, e a saída da CLI é contrato. Sem `ajv-formats`, `format` não é conferido.
    const validate: ValidateFunction = new Ajv({ allErrors: true, strict: false, logger: false }).compile(schema);
    return (json, file) => (validate(json) ? [] : problemsOf(validate.errors ?? [], file));
}

/** Quanto menor, mais a mensagem diz o que está errado (os ramos de `oneOf` são ruído). */
function usefulness(error: ErrorObject): number {
    switch (error.keyword) {
        case 'oneOf':
        case 'anyOf':
        case 'if':
        case 'not':
            return 3;
        case 'additionalProperties':
            return 2;
        case 'pattern':
            return 1;
        default:
            return 0;
    }
}

function pathOf(error: ErrorObject): string {
    const extra = error.params as { additionalProperty?: string };
    const property = error.keyword === 'additionalProperties' && extra.additionalProperty !== undefined
        ? `/${extra.additionalProperty.replaceAll('~', '~0').replaceAll('/', '~1')}`
        : '';
    return `${error.instancePath}${property}` || '/';
}

function messageOf(error: ErrorObject): string {
    const params = error.params as { allowedValues?: unknown[] };
    if (error.keyword === 'additionalProperties') {
        return 'this property is not allowed here';
    }
    if (error.keyword === 'enum' && params.allowedValues) {
        return `must be one of: ${params.allowedValues.join(', ')}`;
    }
    return error.message ?? 'invalid';
}

/**
 * `oneOf` (grupo ou token, valor ou referência) devolve um erro por ramo. Fica o mais profundo de cada
 * ponto do arquivo: é onde o ramo certo falhou, e o caminho aponta para o problema, não para o token inteiro.
 */
function problemsOf(errors: readonly ErrorObject[], file: string): ValidationProblem[] {
    const paths = new Set(errors.map(pathOf));
    const isAncestor = (candidate: string) => [...paths].some((other) => other !== candidate && other.startsWith(`${candidate === '/' ? '' : candidate}/`));
    const best = new Map<string, ErrorObject>();
    for (const error of errors) {
        const at = pathOf(error);
        if (isAncestor(at)) {
            continue;
        }
        const current = best.get(at);
        if (!current || usefulness(error) < usefulness(current)) {
            best.set(at, error);
        }
    }
    return [...best].map(([at, error]) => ({ file, path: at, rule: 'schema/invalid', message: messageOf(error) }));
}
