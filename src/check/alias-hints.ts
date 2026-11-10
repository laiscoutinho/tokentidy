/**
 * Primitivo usado onde já existe um alias semântico: `.error { color: var(--color-red-500) }` com
 * `color.text.danger → {color.red.500}`. É a mesma regra de papel inequívoco que cria os aliases.
 * Só sugestão: nunca falha o CI, e o `fix` não mexe em referências existentes.
 */

import path from 'node:path';

import type { AnalysisResult } from '../analysis/analyze.ts';
import { readDtcgTree, treeTokensOf } from '../generate/output/dtcg-tree.ts';
import { semanticPath } from '../generate/semantic.ts';
import { isInside } from '../project/scope.ts';
import { bareName } from '../token-lookup.ts';

export interface AliasHint {
    file: string;
    line: number;
    column: number;
    property: string;
    /** Token usado hoje, como está escrito. */
    token: string;
    /** Alias para o papel, na mesma forma (`--color-text-danger`). */
    alias: string;
}

const ALIAS_VALUE = /^(?:var\((--[\w-]+)\)|\{([^{}]+)\}|\$([\w-]+)|@([\w-]+))$/;

/** Alias (sem prefixo) → primitivo (sem prefixo), dos tokens gerados e dos escritos à mão. */
async function aliasTargets(analysis: AnalysisResult, tokensDir: string): Promise<Map<string, string>> {
    const targets = new Map<string, string>();
    const tree = await readDtcgTree(tokensDir).catch(() => undefined);
    for (const token of tree ? treeTokensOf(tree) : []) {
        if (token.target) {
            targets.set(token.path.join('-'), token.target.join('-'));
        }
    }
    for (const definition of analysis.definitions) {
        const match = ALIAS_VALUE.exec(definition.value.trim());
        const target = match?.slice(1).find((group) => group !== undefined);
        if (target !== undefined) {
            targets.set(bareName(definition.name), bareName(target));
        }
    }
    return targets;
}

export async function aliasHints(analysis: AnalysisResult, tokensDir: string): Promise<AliasHint[]> {
    const targets = await aliasTargets(analysis, tokensDir);
    if (targets.size === 0) {
        return [];
    }
    return analysis.references.flatMap((reference): AliasHint[] => {
        const route = semanticPath(reference.property, reference.selector);
        if (!route || isInside(path.join(analysis.root, reference.file), tokensDir)) {
            return [];
        }
        const alias = route.join('-');
        if (targets.get(alias) !== bareName(reference.name)) {
            return [];
        }
        const prefix = /^(--|\$|@)/.exec(reference.name)?.[0] ?? '';
        const { file, line, column, property, name } = reference;
        return [{ file, line, column, property, token: name, alias: `${prefix}${alias}` }];
    });
}
