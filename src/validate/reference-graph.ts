/** O grafo das referências: herança por `$extends` e ciclos de alias, sem recursão (o arquivo pode ser fundo demais de propósito). */

import type { ValidationProblem } from './references.ts';

export interface Reference {
    target: string;
    /** Propriedade dentro do token apontado (`#/shadow/md/$value/color`). */
    field?: string;
    pointer: string;
    /** O alias é o valor inteiro do token: o tipo vem dele quando o token não declara. */
    whole: boolean;
    expected?: string;
}

export interface TokenNode {
    name: string;
    pointer: string;
    file: string;
    type?: string;
    references: Reference[];
}

export interface GroupNode {
    name: string;
    pointer: string;
    file: string;
    extends?: string;
}

/** Nada no formato pede mais que isto; acima, é arquivo malformado ou tentativa de estourar a pilha. */
export const MAX_NESTING = 64;

/** Acrescenta os tokens herdados por `$extends`, que também podem ser alvo de alias. */
export function expandExtends(tokens: TokenNode[], groups: readonly GroupNode[], problems: ValidationProblem[]): void {
    const byName = new Map(groups.map((g) => [g.name, g]));
    const done = new Set<GroupNode>();
    const expand = (group: GroupNode, visiting: GroupNode[]): void => {
        if (done.has(group) || group.extends === undefined) {
            return;
        }
        const target = byName.get(group.extends);
        if (!target) {
            problems.push({ file: group.file, path: joinPointer(group.pointer, '$extends'), rule: 'reference/broken', message: `{${group.extends}} is not a group` });
            done.add(group);
            return;
        }
        if (visiting.includes(target) || target === group) {
            const names = [...visiting, group, target].map((g) => g.name || '(root)');
            problems.push({ file: group.file, path: joinPointer(group.pointer, '$extends'), rule: 'reference/cycle', message: `$extends cycle: ${names.join(' → ')}` });
            done.add(group);
            return;
        }
        if (visiting.length >= MAX_NESTING) {
            problems.push({ file: group.file, path: joinPointer(group.pointer, '$extends'), rule: 'reference/too-deep', message: `$extends chain longer than ${MAX_NESTING}` });
            done.add(group);
            return;
        }
        expand(target, [...visiting, group]);
        done.add(group);
        const prefix = target.name === '' ? '' : `${target.name}.`;
        const own = new Set(tokens.map((t) => t.name));
        for (const token of tokens.filter((t) => t.name.startsWith(prefix) && t.file === target.file)) {
            const name = group.name === '' ? token.name.slice(prefix.length) : `${group.name}.${token.name.slice(prefix.length)}`;
            if (!own.has(name)) {
                // Herdado: as referências já foram contadas no original
                tokens.push({ ...token, name, references: [] });
                own.add(name);
            }
        }
    };
    for (const group of groups) {
        expand(group, []);
    }
}

export const joinPointer = (pointer: string, key: string) => (pointer === '/' ? `/${key}` : `${pointer}/${key}`);

/** Busca em profundidade sem recursão: um arquivo com uma cadeia enorme não pode derrubar o processo. */
export function findCycles(
    tokens: readonly TokenNode[],
    edges: ReadonlyMap<TokenNode, { reference: Reference; target: TokenNode }[]>,
    problems: ValidationProblem[],
): Set<TokenNode> {
    const inCycle = new Set<TokenNode>();
    const state = new Map<TokenNode, 'open' | 'closed'>();
    for (const start of tokens) {
        if (state.has(start)) {
            continue;
        }
        state.set(start, 'open');
        const trail = [start];
        const stack = [{ node: start, next: 0 }];
        while (stack.length > 0) {
            const top = stack.at(-1)!;
            const edge = edges.get(top.node)![top.next++];
            if (!edge) {
                state.set(top.node, 'closed');
                stack.pop();
                trail.pop();
                continue;
            }
            const seen = state.get(edge.target);
            if (seen === 'open') {
                const cycle = trail.slice(trail.indexOf(edge.target));
                cycle.forEach((node) => inCycle.add(node));
                problems.push({
                    file: top.node.file, path: edge.reference.pointer, rule: 'reference/cycle',
                    message: `alias cycle: ${[...cycle, edge.target].map((node) => node.name).join(' → ')}`,
                });
            } else if (seen === undefined) {
                state.set(edge.target, 'open');
                trail.push(edge.target);
                stack.push({ node: edge.target, next: 0 });
            }
        }
    }
    return inCycle;
}
