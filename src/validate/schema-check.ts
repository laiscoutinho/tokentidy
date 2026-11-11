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
    const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
    const validate: ValidateFunction = ajv.compile(schema);
    const ofType = (type: string) => (schemaFile === 'format.json' ? ajv.getSchema(`${VALUE_SCHEMA}${type}.json`) : undefined);
    return (json, file) => (validate(json) ? [] : problemsOf(validChildren(byTokenType(validate.errors ?? [], json, ofType), json), file));
}

const VALUE_SCHEMA = 'https://www.designtokens.org/schemas/2025.10/format/values/';

/** Erros da conferência pelo tipo do token: um ramo só, então propriedade faltando é problema mesmo com outro mais fundo. */
const ofOwnType = new WeakSet<ErrorObject>();

const unescape = (segment: string) => segment.replaceAll('~1', '/').replaceAll('~0', '~');

function nodeAt(json: unknown, pointer: string): unknown {
    let node = json;
    for (const segment of pointer.split('/').slice(1)) {
        node = (node as Record<string, unknown> | undefined)?.[unescape(segment)];
    }
    return node;
}

/**
 * Num grupo (sem `$value`), filho com nome válido sempre pode existir: "não permitido" ali é o ramo de token
 * recusando os filhos porque outro filho tem problema (`10.4` faz o `10`, o `11` e o `12` "não permitidos").
 */
function validChildren(errors: readonly ErrorObject[], json: unknown): ErrorObject[] {
    // Dentro de um `$value`, objeto sem `$ref` não tentou ser referência (`{ "$ref": "#/..." }`): os erros desse ramo são ruído
    const refBranch = new Set(errors.filter((e) => e.keyword === 'required' && e.instancePath.includes('/$value')
        && (e.params as { missingProperty?: string }).missingProperty === '$ref').map((e) => e.instancePath));
    return errors.filter((error) => {
        if (refBranch.has(error.instancePath) && (error.keyword === 'additionalProperties' || error.keyword === 'required')) {
            const missing = (error.params as { missingProperty?: string }).missingProperty;
            if (error.keyword === 'additionalProperties' || missing === '$ref') {
                return false;
            }
        }
        const name = (error.params as { additionalProperty?: string }).additionalProperty;
        if (error.keyword !== 'additionalProperties' || name === undefined || name.startsWith('$') || /[.{}]/.test(name)) {
            return true;
        }
        const parent = nodeAt(json, error.instancePath);
        return typeof parent !== 'object' || parent === null || '$value' in parent;
    });
}

/**
 * Sem `$type` no próprio token, o schema confere o `$value` contra todos os tipos, e cada um reclama de um jeito.
 * O tipo do token (dele ou herdado do grupo) diz qual ramo é o certo: o `$value` é conferido de novo só contra
 * o schema desse tipo, e os erros dos outros tipos saem. Referência (`{a.b}`) e tipo desconhecido ficam como estavam.
 */
function byTokenType(errors: readonly ErrorObject[], json: unknown, ofType: (type: string) => ValidateFunction | undefined): ErrorObject[] {
    const tokens = new Set(errors.flatMap((error) => {
        const at = error.instancePath.indexOf('/$value');
        return at < 0 ? [] : [error.instancePath.slice(0, at)];
    }));
    let result = [...errors];
    for (const token of tokens) {
        let node: unknown = json;
        let type: unknown;
        for (const segment of ['', ...token.split('/').slice(1)]) {
            node = segment === '' ? node : (node as Record<string, unknown> | undefined)?.[unescape(segment)];
            type = (node as Record<string, unknown> | undefined)?.['$type'] ?? type;
        }
        const value = (node as Record<string, unknown> | undefined)?.['$value'];
        const validate = typeof type === 'string' ? ofType(type) : undefined;
        if (!validate || (typeof value === 'string' && value.startsWith('{'))) {
            continue;
        }
        const inside = `${token}/$value`;
        result = result.filter((error) => error.instancePath !== token && error.instancePath !== inside && !error.instancePath.startsWith(`${inside}/`)
            && !(error.keyword === 'additionalProperties' && error.instancePath === token));
        if (!validate(value)) {
            for (const error of validate.errors ?? []) {
                const moved = { ...error, instancePath: `${inside}${error.instancePath}` };
                ofOwnType.add(moved);
                result.push(moved);
            }
        }
    }
    return result;
}

/**
 * Quanto menor, mais a mensagem diz o que está errado (os ramos de `oneOf` são ruído).
 * `type` vem depois de `pattern`: no `hex: "#fff"`, o ramo de texto é o certo e falhou no padrão;
 * "must be object" é de outro ramo, que nem chegou a olhar o valor.
 */
function usefulness(error: ErrorObject): number {
    switch (error.keyword) {
        case 'oneOf':
        case 'anyOf':
        case 'if':
        case 'not':
            return 3;
        case 'additionalProperties':
        case 'type':
            return 2;
        case 'required':
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
        const name = (error.params as { additionalProperty?: string }).additionalProperty ?? '';
        // Nome de token ou grupo com `.`, `{` ou `}` quebraria as referências (`{font-size.10.4}`)
        return /[.{}]/.test(name) && !name.startsWith('$') ? 'token and group names cannot contain ".", "{" or "}"' : 'this property is not allowed here';
    }
    if (error.keyword === 'enum' && params.allowedValues) {
        return `must be one of: ${params.allowedValues.join(', ')}`;
    }
    return error.message ?? 'invalid';
}

/**
 * `oneOf` (grupo ou token, valor ou referência) devolve um erro por ramo. Fica o ramo mais próximo:
 * - de cada ponto do arquivo, só o erro mais profundo: é onde o ramo certo falhou;
 * - "propriedade não permitida" num objeto em que outro ramo entrou e falhou mais fundo é desse outro ramo
 *   (o ramo de token recusando os filhos de um grupo, o de `dimension` recusando o `colorSpace` de uma cor).
 * Sem isso, um `#fff` num grupo de 100 cores virava 100 problemas em cascata.
 */
function problemsOf(errors: readonly ErrorObject[], file: string): ValidationProblem[] {
    const paths = new Set(errors.map(pathOf));
    const under = (prefix: string) => `${prefix === '/' ? '' : prefix}/`;
    const isAncestor = (candidate: string) => [...paths].some((other) => other !== candidate && other.startsWith(under(candidate)));
    // Onde algum ramo entrou: o erro está dentro de um filho, e não no próprio objeto
    const entered = errors.filter((error) => error.keyword !== 'additionalProperties').map((error) => error.instancePath);
    const otherBranchWentDeeper = (error: ErrorObject) => error.keyword === 'additionalProperties'
        && entered.some((at) => at.startsWith(under(error.instancePath)) && !at.startsWith(under(pathOf(error))) && at !== pathOf(error));
    const best = new Map<string, ErrorObject>();
    for (const error of errors) {
        const at = pathOf(error);
        const ownMissing = error.keyword === 'required' && ofOwnType.has(error);
        if ((isAncestor(at) && !ownMissing) || otherBranchWentDeeper(error)) {
            continue;
        }
        const current = best.get(at);
        if (!current || usefulness(error) < usefulness(current)) {
            best.set(at, error);
        }
    }
    // Várias propriedades obrigatórias faltando no mesmo ponto: um problema só, com todas
    const missing = Map.groupBy(errors.filter((error) => error.keyword === 'required' && best.get(pathOf(error))?.keyword === 'required'), pathOf);
    return [...best].map(([at, error]) => {
        const names = [...new Set((missing.get(at) ?? []).map((e) => (e.params as { missingProperty: string }).missingProperty))];
        const message = names.length > 1 ? `missing required properties: ${names.join(', ')}` : messageOf(error);
        return { file, path: at, rule: 'schema/invalid', message };
    });
}
