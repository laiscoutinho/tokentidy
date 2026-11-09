/**
 * Segue uma expressão até os objetos que ela representa: `style={card}`, `style={styles.card}`, `a ? b : c`.
 * A análise de escopo do `@babel/traverse` é carregada só quando um arquivo precisa dela.
 * Só segue `const` (ou variável nunca reatribuída): outra atribuição tornaria o valor incerto.
 */

import { createRequire } from 'node:module';
import type { Binding } from '@babel/traverse';
import type * as t from '@babel/types';

const require = createRequire(import.meta.url);

/** Profundidade máxima: `a = b`, `b = c`… (ciclos e cadeias longas param aqui). */
const MAX_DEPTH = 8;

export interface ImportedStyle {
    source: string;
    /** Nome exportado (`default` para import padrão). */
    name: string;
    /** Caminho dentro do objeto: `styles.card` → `['card']`. */
    path: string[];
}

export interface Followed {
    objects: t.ObjectExpression[];
    imports: ImportedStyle[];
}

export class ObjectFlow {
    readonly #file: t.File;
    #bindings: Map<t.Node, Binding | undefined> | undefined;

    constructor(file: t.File) {
        this.#file = file;
    }

    follow(node: t.Expression, path: readonly string[] = [], depth = 0): Followed {
        const found: Followed = { objects: [], imports: [] };
        if (depth > MAX_DEPTH) {
            return found;
        }
        const add = (more: Followed) => {
            found.objects.push(...more.objects);
            found.imports.push(...more.imports);
        };
        switch (node.type) {
            case 'TSAsExpression':
            case 'TSSatisfiesExpression':
            case 'TSNonNullExpression':
            case 'ParenthesizedExpression':
                return this.follow(node.expression as t.Expression, path, depth + 1);
            case 'ObjectExpression': {
                const [head, ...rest] = path;
                if (head === undefined) {
                    found.objects.push(node);
                    return found;
                }
                for (const prop of node.properties) {
                    if (prop.type === 'ObjectProperty' && !prop.computed && keyName(prop.key) === head) {
                        add(this.follow(prop.value as t.Expression, rest, depth + 1));
                    }
                }
                return found;
            }
            case 'Identifier':
                add(this.#followIdentifier(node, path, depth));
                return found;
            case 'MemberExpression': {
                const name = memberName(node);
                if (name !== undefined) {
                    add(this.follow(node.object as t.Expression, [name, ...path], depth + 1));
                }
                return found;
            }
            case 'ConditionalExpression':
                add(this.follow(node.consequent, path, depth + 1));
                add(this.follow(node.alternate, path, depth + 1));
                return found;
            case 'LogicalExpression':
                if (node.operator !== '&&') {
                    add(this.follow(node.left, path, depth + 1));
                }
                add(this.follow(node.right, path, depth + 1));
                return found;
            default:
                return found;
        }
    }

    /** O que o arquivo exporta com este nome, no nível de cima. */
    exported(name: string): t.Expression | undefined {
        for (const statement of this.#file.program.body) {
            if (statement.type === 'ExportDefaultDeclaration' && name === 'default') {
                return statement.declaration as t.Expression;
            }
            if (statement.type !== 'ExportNamedDeclaration' || statement.source) {
                continue;
            }
            if (statement.declaration?.type === 'VariableDeclaration') {
                for (const declarator of statement.declaration.declarations) {
                    if (declarator.id.type === 'Identifier' && declarator.id.name === name && declarator.init) {
                        return declarator.init;
                    }
                }
            }
            for (const specifier of statement.specifiers) {
                if (specifier.type === 'ExportSpecifier' && keyName(specifier.exported) === name) {
                    return specifier.local;
                }
            }
        }
        return undefined;
    }

    #followIdentifier(node: t.Identifier, path: readonly string[], depth: number): Followed {
        const binding = this.#bindingOf(node);
        if (!binding?.constant) {
            return { objects: [], imports: [] };
        }
        const declared = binding.path.node as t.Node;
        const parent = binding.path.parent as t.Node;
        switch (declared.type) {
            case 'VariableDeclarator':
                return declared.id.type === 'Identifier' && declared.init ? this.follow(declared.init, path, depth + 1) : { objects: [], imports: [] };
            case 'ImportSpecifier':
                return imported(parent, keyName(declared.imported), path);
            case 'ImportDefaultSpecifier':
                return imported(parent, 'default', path);
            case 'ImportNamespaceSpecifier': {
                const [head, ...rest] = path;
                return head === undefined ? { objects: [], imports: [] } : imported(parent, head, rest);
            }
            default:
                return { objects: [], imports: [] };
        }
    }

    #bindingOf(node: t.Identifier): Binding | undefined {
        this.#bindings ??= this.#collectBindings();
        return this.#bindings.get(node);
    }

    #collectBindings(): Map<t.Node, Binding | undefined> {
        const bindings = new Map<t.Node, Binding | undefined>();
        const { default: traverse } = require('@babel/traverse') as typeof import('@babel/traverse');
        try {
            traverse(this.#file, {
                Identifier(path) {
                    bindings.set(path.node, path.scope.getBinding(path.node.name));
                },
            });
        } catch {
            // Código que o Babel aceita em modo tolerante mas o escopo recusa (declaração duplicada): segue sem os nomes restantes
        }
        return bindings;
    }
}

function imported(declaration: t.Node, name: string | undefined, path: readonly string[]): Followed {
    return declaration.type === 'ImportDeclaration' && name !== undefined
        ? { objects: [], imports: [{ source: declaration.source.value, name, path: [...path] }] }
        : { objects: [], imports: [] };
}

function keyName(key: t.Node): string | undefined {
    return key.type === 'Identifier' ? key.name : key.type === 'StringLiteral' ? key.value : undefined;
}

export function memberName(node: t.MemberExpression): string | undefined {
    if (!node.computed && node.property.type === 'Identifier') {
        return node.property.name;
    }
    return node.computed && node.property.type === 'StringLiteral' ? node.property.value : undefined;
}
