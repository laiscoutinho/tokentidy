/** O que o `fix` precisa saber de um arquivo JS/TS para importar o módulo de tokens sem quebrar nada. */

import { parse } from '@babel/parser';
import type * as t from '@babel/types';

import { pluginsFor, walkTree } from '../parsers/script.ts';
import { moduleId } from './module-id.ts';

export interface ExistingImport {
    /** Nome exportado → nome local. */
    names: Map<string, string>;
    /** Fim do último nome importado: onde entram os novos. */
    end: number;
}

export interface ScriptFacts {
    /** Só um módulo aceita `import`. */
    isModule: boolean;
    /** Identificadores do arquivo. Vale qualquer uso, não só declaração: em dúvida, importa com outro nome. */
    names: Set<string>;
    /** Depois dos imports e diretivas; se não houver nenhum, início do arquivo. */
    insertAt: number;
    /** O import entra numa linha depois de `insertAt` (senão, antes do que já está lá). */
    afterLine: boolean;
    imports: Map<string, ExistingImport>;
}

export function scriptFacts(source: string, file: string): ScriptFacts | undefined {
    let parsed: t.File;
    try {
        parsed = parse(source, { sourceType: 'unambiguous', plugins: pluginsFor(file), errorRecovery: true });
    } catch {
        return undefined;
    }
    const { program } = parsed;
    const names = new Set<string>();
    const notVariables = new Set<t.Node>();
    walkTree(program, (node) => {
        // O pai vem antes dos filhos: `a.color` e `{ color: 1 }` não são a variável `color`
        if ((node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') && !node.computed) {
            notVariables.add(node.property);
        } else if (node.type === 'ObjectProperty' && !node.computed && !node.shorthand) {
            notVariables.add(node.key);
        } else if (node.type === 'Identifier' && !notVariables.has(node)) {
            names.add(node.name);
        }
    });

    const imports = new Map<string, ExistingImport>();
    let insertAt = program.interpreter?.end ?? 0;
    let afterLine = program.interpreter != null;
    for (const directive of program.directives) {
        insertAt = directive.end ?? insertAt;
        afterLine = true;
    }
    for (const statement of program.body) {
        if (statement.type !== 'ImportDeclaration') {
            continue;
        }
        insertAt = statement.end ?? insertAt;
        afterLine = true;
        const named = statement.specifiers.filter((s): s is t.ImportSpecifier => s.type === 'ImportSpecifier');
        if (named.length > 0 && statement.importKind !== 'type') {
            imports.set(moduleId(statement.source.value), {
                names: new Map(named.map((s) => [s.imported.type === 'Identifier' ? s.imported.name : s.imported.value, s.local.name])),
                end: named.at(-1)!.end!,
            });
        }
    }
    return { isModule: program.sourceType === 'module' || /\.[cm]?tsx?$/.test(file), names, insertAt, afterLine, imports };
}
