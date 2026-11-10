/** `validate`: confere arquivos DTCG e resolvers. Nunca escreve nada. */

import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { isInside, ScopeError } from '../project/scope.ts';
import { isResolverFileName, isTokenFileName, listFiles } from '../project/scanner.ts';
import { MAX_NESTING, nestingOf, referenceProblems } from './references.ts';
import type { TokenDocument, ValidationProblem } from './references.ts';
import { resolverContexts, resolverLayers } from './resolver-check.ts';
import type { ResolverSource } from './resolver-check.ts';
import { loadSchemaCheck } from './schema-check.ts';
import type { SchemaCheck } from './schema-check.ts';

export type { ValidationProblem } from './references.ts';

export interface ValidationResult {
    root: string;
    /** Arquivos conferidos, relativos à raiz: os encontrados e os citados por um resolver. */
    files: string[];
    problems: ValidationProblem[];
}

export interface ValidateOptions {
    root: string;
    ignore?: readonly string[];
}

const toPosix = (file: string) => file.split(path.sep).join('/');

/** Arquivos de tokens e resolvers dos caminhos pedidos. Arquivo citado por nome entra, mesmo com outro nome. */
export async function discoverTokenFiles(paths: readonly string[], options: ValidateOptions): Promise<string[]> {
    const { root, ignore = [] } = options;
    const found = new Set<string>();
    for (const given of paths) {
        const absolute = path.resolve(given);
        const info = await stat(absolute).catch(() => undefined);
        if (!info) {
            throw new ScopeError(`Path not found: ${given}`);
        }
        if (info.isFile()) {
            found.add(toPosix(path.relative(root, absolute)));
            continue;
        }
        for await (const relative of listFiles(absolute)) {
            const name = path.basename(relative);
            const file = toPosix(path.relative(root, path.join(absolute, relative)));
            if ((isTokenFileName(name) || isResolverFileName(name)) && !ignore.some((pattern) => path.matchesGlob(file, pattern))) {
                found.add(file);
            }
        }
    }
    return [...found].sort();
}

class Validation {
    readonly problems: ValidationProblem[] = [];
    readonly checked = new Set<string>();
    readonly #root: string;
    readonly #loaded = new Map<string, TokenDocument | undefined>();
    readonly #format: SchemaCheck;

    constructor(root: string, format: SchemaCheck) {
        this.#root = root;
        this.#format = format;
    }

    /** JSON de um arquivo, ou `undefined` com o problema já anotado. */
    async parse(file: string): Promise<unknown> {
        this.checked.add(file);
        let json: unknown;
        try {
            json = JSON.parse(await readFile(path.join(this.#root, file), 'utf8'));
        } catch (error) {
            this.problems.push({ file, path: '/', rule: 'json/invalid', message: (error as Error).message });
            return undefined;
        }
        if (nestingOf(json) > MAX_NESTING) {
            this.problems.push({ file, path: '/', rule: 'json/too-deep', message: `nested more than ${MAX_NESTING} levels` });
            return undefined;
        }
        return json;
    }

    /** Documento de tokens conferido pelo schema, uma vez só por arquivo. */
    async tokenDocument(file: string): Promise<TokenDocument | undefined> {
        if (this.#loaded.has(file)) {
            return this.#loaded.get(file);
        }
        const json = await this.parse(file);
        let document: TokenDocument | undefined;
        if (json !== undefined) {
            const problems = this.#format(json, file);
            this.problems.push(...problems);
            // Com a estrutura errada, as regras de referência só repetiriam o erro
            document = problems.length === 0 ? { file, json } : undefined;
        }
        this.#loaded.set(file, document);
        return document;
    }

    /** O arquivo citado por `$ref`, se existir e ficar dentro do projeto (seguindo links simbólicos). */
    async cited(source: ResolverSource, resolverFile: string): Promise<TokenDocument | undefined> {
        if (source.document) {
            return source.document;
        }
        const [relative = ''] = source.ref!.split('#');
        const absolute = path.resolve(this.#root, path.dirname(resolverFile), relative);
        const real = await realpath(absolute).catch(() => undefined);
        const fail = (rule: string, message: string) => {
            this.problems.push({ file: resolverFile, path: `${source.pointer}/$ref`, rule, message });
            return undefined;
        };
        if (!real) {
            return fail('resolver/missing-source', `${source.ref} does not exist`);
        }
        if (!isInside(real, await realpath(this.#root))) {
            return fail('resolver/outside-root', `${source.ref} is outside the project`);
        }
        return this.tokenDocument(toPosix(path.relative(this.#root, absolute)));
    }
}

export async function validateTokenFiles(files: readonly string[], root: string): Promise<ValidationResult> {
    const validation = new Validation(root, await loadSchemaCheck('format.json'));
    const resolvers = files.filter((file) => isResolverFileName(path.basename(file)));
    const consumed = new Set<string>();

    if (resolvers.length > 0) {
        const check = await loadSchemaCheck('resolver.json');
        for (const file of resolvers) {
            const json = await validation.parse(file);
            if (json === undefined) {
                continue;
            }
            const invalid = check(json, file);
            validation.problems.push(...invalid);
            if (invalid.length > 0) {
                continue;
            }
            const { layers, problems } = resolverLayers(json as Record<string, unknown>, file);
            validation.problems.push(...problems);
            for (const { label, sources } of resolverContexts(layers)) {
                const documents: TokenDocument[] = [];
                for (const source of sources) {
                    const document = await validation.cited(source, file);
                    if (document) {
                        documents.push(document);
                        consumed.add(document.file);
                    }
                }
                const context = label ? ` (with ${label})` : '';
                validation.problems.push(...referenceProblems(documents).map((p) => ({ ...p, message: `${p.message}${context}` })));
            }
        }
    }

    // Os arquivos soltos são lidos juntos; os de um resolver já foram lidos em cada contexto
    const loose: TokenDocument[] = [];
    for (const file of files.filter((f) => !resolvers.includes(f))) {
        const document = await validation.tokenDocument(file);
        if (document && !consumed.has(file)) {
            loose.push(document);
        }
    }
    validation.problems.push(...referenceProblems(loose));

    // Um mesmo alias quebrado aparece em vários contextos: uma linha por lugar e regra
    const unique = new Map(validation.problems.map((p) => [`${p.file}\0${p.path}\0${p.rule}`, p]));
    const problems = [...unique.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { root, files: [...validation.checked].sort(), problems };
}
